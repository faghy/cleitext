/**
 * One-time sign-in links of a hosting panel (`cleitext login-link`): the
 * `panel_login` token and GET /api/v1/auth/one-time.
 */
import {
  auditLog,
  hashUserToken,
  issueUserToken,
  userTokens,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentStep, totpCode } from '../src/auth/totp.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let other: SeededSite;
let adminId: string;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'panel');
  other = await seedSite(owner, 'panel-other');
  adminId = await seedUser(owner, {
    email: 'admin@panel.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const link = (userId: string, siteId: string, ttlMs = 60_000) =>
  issueUserToken(owner.db, { kind: 'panel_login', userId, ttlMs, meta: { siteId } });

describe('panel sign-in links', () => {
  it('signs in once, without cache, and records it', async () => {
    const { token } = await link(adminId, site.id);
    // Stored hashed, like every other token.
    const [stored] = await owner.db
      .select()
      .from(userTokens)
      .where(eq(userTokens.tokenHash, hashUserToken(token)));
    expect(stored).toMatchObject({ kind: 'panel_login', userId: adminId });

    const browser = new TestClient(app, site.host, '10.40.0.1');
    const res = await browser.get(`/api/v1/auth/one-time?token=${token}`);
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/cl-admin/');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(browser.hasCookie('cleitext_session')).toBe(true);
    const me = await browser.get('/api/v1/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('admin@panel.test');

    const entries = await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.userId, adminId), eq(auditLog.action, 'auth.login_panel'))),
    );
    expect(entries).toHaveLength(1);

    // Single use.
    const again = await new TestClient(app, site.host, '10.40.0.1').get(
      `/api/v1/auth/one-time?token=${token}`,
    );
    expect(again.statusCode).toBe(410);
    expect(again.headers['cache-control']).toBe('no-store');
    expect(again.cookies.find((c) => c.name === 'cleitext_session')).toBeUndefined();
  });

  it('refuses an expired link', async () => {
    const { token } = await link(adminId, site.id, -1000);
    const res = await new TestClient(app, site.host, '10.40.0.2').get(
      `/api/v1/auth/one-time?token=${token}`,
    );
    expect(res.statusCode).toBe(410);
  });

  it('works only on the site it was issued for', async () => {
    const { token } = await link(adminId, site.id);
    const wrong = await new TestClient(app, other.host, '10.40.0.3').get(
      `/api/v1/auth/one-time?token=${token}`,
    );
    expect(wrong.statusCode).toBe(410);
    // A link for the other site, for a user who is not a member there.
    const { token: elsewhere } = await link(adminId, other.id);
    const notMember = await new TestClient(app, other.host, '10.40.0.3').get(
      `/api/v1/auth/one-time?token=${elsewhere}`,
    );
    expect(notMember.statusCode).toBe(410);
  });

  it('refuses a suspended user', async () => {
    const userId = await seedUser(owner, {
      email: 'gone@panel.test',
      password: PASSWORD,
      site,
      role: 'editor',
    });
    const { token } = await link(userId, site.id);
    await owner.db.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
    const browser = new TestClient(app, site.host, '10.40.0.4');
    const res = await browser.get(`/api/v1/auth/one-time?token=${token}`);
    expect(res.statusCode).toBe(410);
    expect(browser.hasCookie('cleitext_session')).toBe(false);
  });

  it('is a trusted sign-in: two-factor authentication is not asked', async () => {
    await seedUser(owner, { email: 'tf@panel.test', password: PASSWORD, site, role: 'editor' });
    const user = new TestClient(app, site.host, '10.40.0.5');
    await user.login('tf@panel.test', PASSWORD);
    const { secret } = (await user.post('/api/v1/profile/2fa/setup')).json();
    const enabled = await user.post('/api/v1/profile/2fa/enable', {
      code: totpCode(secret, currentStep()),
    });
    expect(enabled.statusCode).toBe(200);
    const [row] = await owner.db.select().from(users).where(eq(users.email, 'tf@panel.test'));

    const { token } = await link(row!.id, site.id);
    const browser = new TestClient(app, site.host, '10.40.0.6');
    expect((await browser.get(`/api/v1/auth/one-time?token=${token}`)).statusCode).toBe(303);
    expect((await browser.get('/api/v1/auth/me')).json().user.email).toBe('tf@panel.test');
  });

  it('locks an address after many wrong links', async () => {
    const browser = new TestClient(app, site.host, '10.40.0.7');
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await browser.get(`/api/v1/auth/one-time?token=wrong-${i}`)).statusCode;
    }
    expect(last).toBe(429);
    // Even a good link waits.
    const { token } = await link(adminId, site.id);
    expect((await browser.get(`/api/v1/auth/one-time?token=${token}`)).statusCode).toBe(429);
  });
});
