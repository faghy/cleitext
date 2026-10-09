/**
 * Identity and sites (milestone M1): host resolution, CSRF, login, rate
 * limiting, invitations, password reset, members and profile.
 */
import { auditLog, withSiteContext, type DatabaseClient } from '@cleitext/db';
import { eq } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  tokenFromMail,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let mail: MailService;
let acme: SeededSite;
let other: SeededSite;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  mail = app.get(MailService);
  acme = await seedSite(owner, 'acme', { aliases: ['www.acme.test'] });
  other = await seedSite(owner, 'other');
  await seedSite(owner, 'secure', { forceHttps: true });
  await seedUser(owner, {
    email: 'admin@acme.test',
    password: PASSWORD,
    site: acme,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'author@acme.test',
    password: PASSWORD,
    site: acme,
    role: 'author',
  });
  await seedUser(owner, { email: 'root@cleitext.test', password: PASSWORD, superAdmin: true });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('site resolution', () => {
  it('answers 404 to unknown hosts', async () => {
    const res = await new TestClient(app, 'unknown.test').get('/api/v1/auth/csrf');
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('redirects pages on aliases to the primary domain, but serves the API', async () => {
    const alias = new TestClient(app, 'www.acme.test');
    const page = await alias.get('/admin/');
    expect(page.statusCode).toBe(301);
    expect(page.headers.location).toBe('http://acme.test/admin/');
    expect((await alias.get('/api/v1/auth/csrf')).statusCode).toBe(200);
  });

  it('forces HTTPS when the domain requires it', async () => {
    const res = await new TestClient(app, 'secure.test').get('/api/v1/auth/csrf');
    expect(res.statusCode).toBe(308);
    expect(res.headers.location).toBe('https://secure.test/api/v1/auth/csrf');
  });

  it('keeps health probes independent from the host', async () => {
    const res = await new TestClient(app, 'unknown.test').get('/health/live');
    expect(res.statusCode).toBe(200);
  });
});

describe('CSRF protection', () => {
  it('rejects state-changing requests without a token', async () => {
    const client = new TestClient(app, acme.host);
    const res = await client.request(
      'POST',
      '/api/v1/auth/login',
      { email: 'admin@acme.test', password: PASSWORD },
      { csrf: false },
    );
    expect(res.statusCode).toBe(403);
  });

  it('rejects cross-origin requests even with a token', async () => {
    const client = new TestClient(app, acme.host);
    const res = await client.request(
      'POST',
      '/api/v1/auth/login',
      { email: 'admin@acme.test', password: PASSWORD },
      { origin: 'https://evil.example' },
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('login', () => {
  it('signs in, exposes the profile and signs out', async () => {
    const client = new TestClient(app, acme.host, '10.0.0.1');
    const login = await client.login('ADMIN@acme.test', PASSWORD);
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({
      user: { email: 'admin@acme.test', isSuperAdmin: false },
      site: { id: acme.id },
      role: { slug: 'administrator' },
    });
    expect(login.json().capabilities).toContain('manage_users');
    expect(login.json().capabilities).not.toContain('manage_sites');

    const cookie = login.cookies.find((c) => c.name === 'cleitext_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.expires).toBeUndefined(); // no "remember me": browser-session cookie

    expect((await client.get('/api/v1/auth/me')).statusCode).toBe(200);
    expect((await client.post('/api/v1/auth/logout')).statusCode).toBe(204);
    expect((await client.get('/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('sets a persistent cookie with "remember me"', async () => {
    const client = new TestClient(app, acme.host, '10.0.0.2');
    const login = await client.login('admin@acme.test', PASSWORD, true);
    const cookie = login.cookies.find((c) => c.name === 'cleitext_session');
    expect(cookie?.expires).toBeInstanceOf(Date);
  });

  it('answers the same way for a wrong password and an unknown email', async () => {
    const client = new TestClient(app, acme.host, '10.0.0.3');
    const wrong = await client.login('admin@acme.test', 'not the password');
    const unknown = await client.login('ghost@acme.test', 'not the password');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().detail).toBe(unknown.json().detail);
  });

  it('refuses users who are not members of the site', async () => {
    const client = new TestClient(app, other.host, '10.0.0.4');
    expect((await client.login('admin@acme.test', PASSWORD)).statusCode).toBe(401);
  });

  it('lets super admins in on every site with every capability', async () => {
    const client = new TestClient(app, other.host, '10.0.0.5');
    const login = await client.login('root@cleitext.test', PASSWORD);
    expect(login.statusCode).toBe(200);
    expect(login.json().user.isSuperAdmin).toBe(true);
    expect(login.json().role).toBeNull();
    expect(login.json().capabilities).toContain('manage_sites');
    const siteIds = login.json().sites.map((s: { id: string }) => s.id);
    expect(siteIds).toEqual(expect.arrayContaining([acme.id, other.id]));
  });
});

describe('login rate limiting (RF-USR-09)', () => {
  it('locks the account after 5 failures, even with the right password', async () => {
    const email = 'locked@acme.test';
    await seedUser(owner, { email, password: PASSWORD, site: acme, role: 'subscriber' });
    const client = new TestClient(app, acme.host, '10.0.1.1');
    for (let i = 0; i < 5; i++) {
      expect((await client.login(email, `wrong-${i}`)).statusCode).toBe(401);
    }
    const locked = await client.login(email, PASSWORD);
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);

    // Other accounts from another address are not affected.
    const other = new TestClient(app, acme.host, '10.0.1.2');
    expect((await other.login('admin@acme.test', PASSWORD)).statusCode).toBe(200);
  });

  it('records failed attempts in the audit log', async () => {
    const failures = await withSiteContext(owner.db, acme.id, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.action, 'user.login.failed')),
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]?.ip).toBeTruthy();
  });
});

describe('invitations (M1 acceptance)', () => {
  it('an Administrator invites an Editor, who signs in and sees only permitted sections', async () => {
    const admin = new TestClient(app, acme.host, '10.0.2.1');
    await admin.login('admin@acme.test', PASSWORD);

    const invite = await admin.post('/api/v1/users/invite', {
      email: 'Eddie@Acme.test',
      displayName: 'Eddie',
      role: 'editor',
    });
    expect(invite.statusCode).toBe(201);
    expect(invite.json()).toMatchObject({
      email: 'eddie@acme.test',
      status: 'invited',
      role: { slug: 'editor' },
    });

    const token = tokenFromMail(mail.outbox, 'eddie@acme.test');
    const guest = new TestClient(app, acme.host, '10.0.2.2');
    const info = await guest.get(`/api/v1/auth/invitation?token=${token}`);
    expect(info.json()).toEqual({
      email: 'eddie@acme.test',
      displayName: 'Eddie',
      siteName: 'Site acme',
    });

    const accepted = await guest.post('/api/v1/auth/invitation/accept', {
      token,
      password: 'a brand new password',
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().role).toEqual({ slug: 'editor', name: 'Editor' });
    const caps: string[] = accepted.json().capabilities;
    expect(caps).toContain('manage_menus');
    expect(caps).not.toContain('manage_users');
    expect(caps).not.toContain('manage_settings');

    // The editor cannot manage users...
    expect((await guest.get('/api/v1/users')).statusCode).toBe(403);
    // ...and the link cannot be reused.
    const again = await new TestClient(app, acme.host, '10.0.2.3').post(
      '/api/v1/auth/invitation/accept',
      { token, password: 'another password!!' },
    );
    expect(again.statusCode).toBe(410);

    // The administrator now sees an active member.
    const members = (await admin.get('/api/v1/users')).json();
    expect(members.find((m: { email: string }) => m.email === 'eddie@acme.test')).toMatchObject({
      status: 'active',
      role: { slug: 'editor' },
    });

    // The editor can sign in normally.
    const later = new TestClient(app, acme.host, '10.0.2.4');
    expect((await later.login('eddie@acme.test', 'a brand new password')).statusCode).toBe(200);
  });

  it('does not accept an invitation on another site', async () => {
    const admin = new TestClient(app, acme.host, '10.0.2.5');
    await admin.login('admin@acme.test', PASSWORD);
    await admin.post('/api/v1/users/invite', {
      email: 'wanda@x.test',
      displayName: 'Wanda',
      role: 'author',
    });
    const token = tokenFromMail(mail.outbox, 'wanda@x.test');
    const elsewhere = new TestClient(app, other.host, '10.0.2.6');
    const res = await elsewhere.post('/api/v1/auth/invitation/accept', {
      token,
      password: 'long enough password',
    });
    expect(res.statusCode).toBe(410);
  });

  it('refuses invitations from users without the capabilities', async () => {
    const author = new TestClient(app, acme.host, '10.0.2.7');
    await author.login('author@acme.test', PASSWORD);
    const res = await author.post('/api/v1/users/invite', {
      email: 'nope@acme.test',
      displayName: 'Nope',
      role: 'subscriber',
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates an account with a password directly, like WordPress', async () => {
    const admin = new TestClient(app, acme.host, '10.0.2.9');
    await admin.login('admin@acme.test', PASSWORD);
    const before = mail.outbox.length;
    const created = await admin.post('/api/v1/users/invite', {
      email: 'dana@acme.test',
      displayName: 'Dana',
      role: 'administrator',
      password: 'a password chosen by the admin',
      sendEmail: false,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: 'active', role: { slug: 'administrator' } });
    expect(mail.outbox.length).toBe(before);
    const dana = new TestClient(app, acme.host, '10.0.2.10');
    expect((await dana.login('dana@acme.test', 'a password chosen by the admin')).statusCode).toBe(
      200,
    );
    expect((await dana.get('/api/v1/users')).statusCode).toBe(200);

    // With the email: a notice without the password.
    await admin.post('/api/v1/users/invite', {
      email: 'gus@acme.test',
      displayName: 'Gus',
      role: 'author',
      password: 'another admin chosen one',
    });
    const notice = mail.outbox.at(-1)!;
    expect(notice).toMatchObject({ to: 'gus@acme.test', subject: 'Your account on Site acme' });
    expect(notice.text).not.toContain('another admin chosen one');

    // Short passwords are refused.
    const weak = await admin.post('/api/v1/users/invite', {
      email: 'weak@acme.test',
      displayName: 'Weak',
      role: 'author',
      password: 'short',
    });
    expect(weak.statusCode).toBe(400);
  });

  it('never sets the password of an existing account', async () => {
    // A super admin adds an existing person to another site.
    const admin = new TestClient(app, other.host, '10.0.2.11');
    await admin.login('root@cleitext.test', PASSWORD);
    const added = await admin.post('/api/v1/users/invite', {
      email: 'dana@acme.test',
      displayName: 'Dana',
      role: 'editor',
      password: 'trying to take over dana',
    });
    expect(added.statusCode).toBe(201);
    const thief = new TestClient(app, other.host, '10.0.2.12');
    expect((await thief.login('dana@acme.test', 'trying to take over dana')).statusCode).toBe(401);
  });

  it('validates the payload with readable errors', async () => {
    const admin = new TestClient(app, acme.host, '10.0.2.8');
    await admin.login('admin@acme.test', PASSWORD);
    const res = await admin.post('/api/v1/users/invite', { email: 'not-an-email', role: 'editor' });
    expect(res.statusCode).toBe(400);
    const paths = res.json().errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'displayName']));
  });
});

describe('members', () => {
  it('changes roles and removes members, but not oneself', async () => {
    const admin = new TestClient(app, acme.host, '10.0.3.1');
    const me = (await admin.login('admin@acme.test', PASSWORD)).json();
    const targetId = await seedUser(owner, {
      email: 'member@acme.test',
      password: PASSWORD,
      site: acme,
      role: 'subscriber',
    });

    const promoted = await admin.request('PATCH', `/api/v1/users/${targetId}`, { role: 'author' });
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json().role.slug).toBe('author');

    const self = await admin.request('PATCH', `/api/v1/users/${me.user.id}`, {
      role: 'subscriber',
    });
    expect(self.statusCode).toBe(403);

    expect((await admin.request('DELETE', `/api/v1/users/${targetId}`)).statusCode).toBe(204);
    const members = (await admin.get('/api/v1/users')).json();
    expect(members.some((m: { id: string }) => m.id === targetId)).toBe(false);
  });
});

describe('password reset (RF-USR-02)', () => {
  it('resets the password with a single-use link and signs out other sessions', async () => {
    const email = 'forgetful@acme.test';
    await seedUser(owner, { email, password: PASSWORD, site: acme, role: 'author' });
    const session = new TestClient(app, acme.host, '10.0.4.1');
    await session.login(email, PASSWORD);

    const guest = new TestClient(app, acme.host, '10.0.4.2');
    expect((await guest.post('/api/v1/auth/password/forgot', { email })).statusCode).toBe(202);
    const token = tokenFromMail(mail.outbox, email);
    expect(mail.outbox.at(-1)?.text).toContain(`http://${acme.host}/admin/reset-password?token=`);

    const reset = await guest.post('/api/v1/auth/password/reset', {
      token,
      password: 'my new long password',
    });
    expect(reset.statusCode).toBe(204);
    expect((await session.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await guest.login(email, PASSWORD)).statusCode).toBe(401);
    expect((await guest.login(email, 'my new long password')).statusCode).toBe(200);

    const reuse = await guest.post('/api/v1/auth/password/reset', {
      token,
      password: 'yet another password',
    });
    expect(reuse.statusCode).toBe(410);
  });

  it('does not reveal whether an email is registered', async () => {
    const before = mail.outbox.length;
    const res = await new TestClient(app, acme.host, '10.0.4.3').post(
      '/api/v1/auth/password/forgot',
      {
        email: 'nobody@acme.test',
      },
    );
    expect(res.statusCode).toBe(202);
    expect(mail.outbox.length).toBe(before);
  });

  it('enforces the password policy', async () => {
    const res = await new TestClient(app, acme.host, '10.0.4.4').post(
      '/api/v1/auth/password/reset',
      {
        token: 'x'.repeat(43),
        password: 'short',
      },
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('profile (RF-USR-07)', () => {
  it('updates the profile, lists sessions and revokes the others on password change', async () => {
    const email = 'profile@acme.test';
    await seedUser(owner, { email, password: PASSWORD, site: acme, role: 'contributor' });
    const laptop = new TestClient(app, acme.host, '10.0.5.1');
    const phone = new TestClient(app, acme.host, '10.0.5.2');
    await laptop.login(email, PASSWORD);
    await phone.login(email, PASSWORD);

    const updated = await laptop.request('PATCH', '/api/v1/profile', {
      displayName: 'Pat',
      locale: 'it',
    });
    expect(updated.json()).toMatchObject({ displayName: 'Pat', locale: 'it' });

    const sessions = (await laptop.get('/api/v1/profile/sessions')).json();
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const wrong = await laptop.post('/api/v1/profile/password', {
      currentPassword: 'nope',
      newPassword: 'a different password',
    });
    expect(wrong.statusCode).toBe(400);
    const changed = await laptop.post('/api/v1/profile/password', {
      currentPassword: PASSWORD,
      newPassword: 'a different password',
    });
    expect(changed.statusCode).toBe(204);
    expect((await laptop.get('/api/v1/auth/me')).statusCode).toBe(200);
    expect((await phone.get('/api/v1/auth/me')).statusCode).toBe(401);
  });
});
