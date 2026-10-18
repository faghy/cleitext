/**
 * Administrators edit members' accounts (RF-USR-12): name, email, profile
 * and password, only for accounts of their site alone.
 */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'violet lantern across seven hills';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let mail: MailService;
let admin: TestClient;
let editor: TestClient;
let root: TestClient;
const ids: Record<string, string> = {};

const account = (id: string, body: unknown, client = admin) =>
  client.request('PATCH', `/api/v1/users/${id}/account`, body);

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  mail = app.get(MailService);
  site = await seedSite(owner, 'accounts');
  const other = await seedSite(owner, 'accounts-other');
  ids.admin = await seedUser(owner, {
    email: 'admin@accounts.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  ids.editor = await seedUser(owner, {
    email: 'editor@accounts.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  ids.author = await seedUser(owner, {
    email: 'author@accounts.test',
    password: PASSWORD,
    site,
    role: 'author',
  });
  ids.colleague = await seedUser(owner, {
    email: 'colleague@accounts.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  // Also on another site: their account is not this site's to change.
  ids.shared = await seedUser(owner, {
    email: 'shared@accounts.test',
    password: PASSWORD,
    site,
    role: 'author',
  });
  await seedUser(owner, { email: 'shared-other@accounts.test', password: PASSWORD });
  const { siteMembers, roles, withContext } = await import('@cleitext/db');
  const { and, eq, isNull } = await import('drizzle-orm');
  const [authorRole] = await owner.db
    .select()
    .from(roles)
    .where(and(isNull(roles.siteId), eq(roles.slug, 'author')));
  await withContext(owner.db, { siteId: other.id }, (tx) =>
    tx
      .insert(siteMembers)
      .values({ siteId: other.id, userId: ids.shared!, roleId: authorRole!.id }),
  );
  ids.root = await seedUser(owner, {
    email: 'root@accounts.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
    superAdmin: true,
  });
  admin = new TestClient(app, site.host, '10.71.0.1');
  editor = new TestClient(app, site.host, '10.71.0.2');
  root = new TestClient(app, site.host, '10.71.0.3');
  await admin.login('admin@accounts.test', PASSWORD);
  await editor.login('editor@accounts.test', PASSWORD);
  await root.login('root@accounts.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('member accounts', () => {
  it('shows an account and whether it can be changed here', async () => {
    const res = await admin.get(`/api/v1/users/${ids.editor}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      email: 'editor@accounts.test',
      role: { slug: 'editor' },
      hasPassword: true,
      twoFactor: false,
      locked: null,
    });
    const lock = async (id: string) => (await admin.get(`/api/v1/users/${id}`)).json().locked;
    expect(await lock(ids.admin!)).toBe('self');
    expect(await lock(ids.shared!)).toBe('shared');
    expect(await lock(ids.root!)).toBe('super_admin');
    expect(await lock(ids.colleague!)).toBe(null);
    expect((await editor.get(`/api/v1/users/${ids.author}`)).statusCode).toBe(403);
  });

  it('changes name, email, profile and password, signing the person out and telling them', async () => {
    const person = new TestClient(app, site.host, '10.71.0.4');
    await person.login('editor@accounts.test', PASSWORD);
    const sent = mail.outbox.length;

    const res = await account(ids.editor!, {
      displayName: 'Eda Editor',
      email: 'eda@accounts.test',
      bio: 'Edits the news.',
      website: 'https://eda.example',
      slug: 'eda',
      password: NEW_PASSWORD,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      displayName: 'Eda Editor',
      email: 'eda@accounts.test',
      bio: 'Edits the news.',
      website: 'https://eda.example',
      slug: 'eda',
    });

    // The old session is gone; the new email and password work, the old ones not.
    expect((await person.get('/api/v1/auth/me')).statusCode).toBe(401);
    const again = new TestClient(app, site.host, '10.71.0.5');
    expect(
      (
        await again.request('POST', '/api/v1/auth/login', {
          email: 'editor@accounts.test',
          password: PASSWORD,
        })
      ).statusCode,
    ).toBe(401);
    expect((await again.login('eda@accounts.test', NEW_PASSWORD)).statusCode).toBe(200);

    // Both addresses hear about it, without the password.
    const notices = mail.outbox.slice(sent);
    expect(notices.map((m) => m.to).sort()).toEqual(['eda@accounts.test', 'editor@accounts.test']);
    expect(notices[0]!.text).toContain('changed your email address (now eda@accounts.test)');
    expect(notices[0]!.text).toContain('and your password');
    expect(notices[0]!.text).not.toContain(NEW_PASSWORD);

    const log = (await admin.get('/api/v1/audit?limit=5')).json();
    expect(JSON.stringify(log)).toContain('member.password.changed');
  });

  it('sets a password without email, and refuses taken addresses and weak passwords', async () => {
    const sent = mail.outbox.length;
    expect((await account(ids.author!, { password: NEW_PASSWORD, notify: false })).statusCode).toBe(
      200,
    );
    expect(mail.outbox.length).toBe(sent);
    expect((await account(ids.author!, { email: 'colleague@accounts.test' })).statusCode).toBe(409);
    expect((await account(ids.author!, { password: 'short' })).statusCode).toBe(400);
    expect((await account(ids.author!, { password: '123qweasdzxc' })).statusCode).toBe(400);
  });

  it('keeps out accounts that are not the site’s alone, and their own', async () => {
    expect((await account(ids.shared!, { displayName: 'Hijacked' })).statusCode).toBe(403);
    expect((await account(ids.root!, { password: NEW_PASSWORD })).statusCode).toBe(403);
    expect((await account(ids.admin!, { password: NEW_PASSWORD })).statusCode).toBe(403);
    // The editor signs in again: their password was changed above.
    await editor.login('eda@accounts.test', NEW_PASSWORD);
    expect((await account(ids.author!, { displayName: 'X' }, editor)).statusCode).toBe(403);
    // A super admin may.
    const res = await account(ids.shared!, { displayName: 'Shared Author' }, root);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().displayName).toBe('Shared Author');
  });
});
