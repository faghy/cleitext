/** API tokens (RF-USR-08): scopes, owner permissions, expiry, revocation. */
import { apiTokens, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let admin: TestClient;
let author: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'tokens');
  await seedUser(owner, {
    email: 'admin@tokens.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'author@tokens.test', password: PASSWORD, site, role: 'author' });
  admin = new TestClient(app, site.host, '10.32.0.1');
  author = new TestClient(app, site.host, '10.32.0.2');
  await admin.login('admin@tokens.test', PASSWORD);
  await author.login('author@tokens.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

/** A request with only the bearer token: no cookie, no CSRF header. */
function bearer(token: string, method: 'GET' | 'POST' | 'DELETE', url: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { host: site.host, authorization: `Bearer ${token}` },
    ...(body ? { payload: body } : {}),
  });
}

async function create(client: TestClient, body: object) {
  const res = await client.post('/api/v1/tokens', body);
  expect(res.statusCode).toBe(201);
  return res.json() as { token: string; view: { id: string; prefix: string } };
}

describe('API tokens', () => {
  it('act as their owner, within the scopes', async () => {
    const { token, view } = await create(author, {
      name: 'Script',
      scopes: ['read'],
      expiresInDays: 30,
    });
    expect(token).toMatch(/^ctx_/);
    expect(token.startsWith(view.prefix)).toBe(true);

    const me = await bearer(token, 'GET', '/api/v1/auth/me');
    expect(me.json().user.email).toBe('author@tokens.test');
    expect((await bearer(token, 'GET', '/api/v1/entries?type=article')).statusCode).toBe(200);
    // Read-only: no writes, even with the owner's permissions.
    expect(
      (await bearer(token, 'POST', '/api/v1/entries', { type: 'article', title: 'x' })).statusCode,
    ).toBe(403);
    // Never accounts or tokens.
    expect((await bearer(token, 'GET', '/api/v1/tokens')).statusCode).toBe(403);
    expect((await bearer(token, 'GET', '/api/v1/profile/sessions')).statusCode).toBe(403);
  });

  it('write without CSRF, but never beyond the owner', async () => {
    const { token } = await create(author, {
      name: 'Writer',
      scopes: ['read', 'write'],
      expiresInDays: null,
    });
    const created = await bearer(token, 'POST', '/api/v1/entries', {
      type: 'article',
      title: 'From a script',
    });
    expect(created.statusCode).toBe(201);
    // Authors cannot manage settings: neither can their tokens.
    expect((await bearer(token, 'GET', '/api/v1/settings/core')).statusCode).toBe(403);
  });

  it('stop working when expired, revoked or wrong', async () => {
    const { token, view } = await create(author, {
      name: 'Short',
      scopes: ['read'],
      expiresInDays: 1,
    });
    // api_tokens has FORCE row level security: the owner works inside the site too.
    await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .update(apiTokens)
        .set({ expiresAt: sql`now() - interval '1 minute'` })
        .where(eq(apiTokens.id, view.id)),
    );
    expect((await bearer(token, 'GET', '/api/v1/auth/me')).statusCode).toBe(401);
    expect((await bearer('ctx_nope', 'GET', '/api/v1/auth/me')).statusCode).toBe(401);

    const other = await create(author, { name: 'Gone', scopes: ['read'], expiresInDays: null });
    expect((await author.request('DELETE', `/api/v1/tokens/${other.view.id}`)).statusCode).toBe(
      204,
    );
    expect((await bearer(other.token, 'GET', '/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('are listed and managed by administrators', async () => {
    const own = (await author.get('/api/v1/tokens')).json();
    expect(own.every((t: { owner: { displayName: string } }) => t.owner)).toBe(true);
    expect((await author.get('/api/v1/tokens?all=1')).statusCode).toBe(403);
    const all = (await admin.get('/api/v1/tokens?all=1')).json();
    expect(all.length).toBeGreaterThanOrEqual(own.length);
    // An administrator revokes the author's token…
    expect((await admin.request('DELETE', `/api/v1/tokens/${own[0].id}`)).statusCode).toBe(204);
    // …and an author cannot revoke the administrator's.
    const adminToken = await create(admin, { name: 'Admin', scopes: ['read'], expiresInDays: 7 });
    expect(
      (await author.request('DELETE', `/api/v1/tokens/${adminToken.view.id}`)).statusCode,
    ).toBe(404);
    // Tokens for other members need manage_users.
    const members = (await admin.get('/api/v1/users')).json();
    const authorId = members.find((m: { email: string }) => m.email === 'author@tokens.test').id;
    expect(
      (
        await author.post('/api/v1/tokens', {
          name: 'x',
          scopes: ['read'],
          expiresInDays: 1,
          userId: members[0].id === authorId ? members[1].id : members[0].id,
        })
      ).statusCode,
    ).toBe(403);
    const forAuthor = await create(admin, {
      name: 'For the author',
      scopes: ['read'],
      expiresInDays: 1,
      userId: authorId,
    });
    expect((await bearer(forAuthor.token, 'GET', '/api/v1/auth/me')).json().user.email).toBe(
      'author@tokens.test',
    );
  });
});
