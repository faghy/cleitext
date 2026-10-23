/**
 * As in WordPress: on an installation with one site its administrators install
 * plugins and themes (manage_plugins); with several sites only super admins do.
 */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityService } from '../src/auth/identity.service.js';
import { DATABASE } from '../src/database/database.module.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let editor: TestClient;

beforeAll(async () => {
  owner = ownerDatabase();
  app = await startTestApp();
  const site = await seedSite(owner, 'single-site-admins');
  await seedUser(owner, {
    email: 'admin@single.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@single.test', password: PASSWORD, site, role: 'editor' });
  admin = new TestClient(app, site.host, '10.37.0.1');
  editor = new TestClient(app, site.host, '10.37.0.2');
  await admin.login('admin@single.test', PASSWORD);
  await editor.login('editor@single.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const caps = async (client: TestClient) =>
  (client === admin
    ? await admin.get('/api/v1/auth/me')
    : await editor.get('/api/v1/auth/me')
  ).json().capabilities as string[];
const pretend = (single: boolean) => {
  (app.get(IdentityService) as unknown as { single: { value: boolean; at: number } }).single = {
    value: single,
    at: Date.now(),
  };
};

describe('installing plugins and themes', () => {
  it('is for super admins only when the installation has several sites', async () => {
    pretend(false);
    expect(await caps(admin)).not.toContain('manage_plugins');
    expect((await admin.get('/api/v1/updates')).statusCode).toBe(403);
  });

  it('is also for the administrators of an installation with one site', async () => {
    pretend(true);
    expect(await caps(admin)).toContain('manage_plugins');
    expect((await admin.get('/api/v1/updates')).statusCode).toBe(200);
    // Not for the other roles.
    expect(await caps(editor)).not.toContain('manage_plugins');
  });

  it('counts every site, although the application role sees only its own', async () => {
    const identity = app.get(IdentityService) as unknown as {
      single: null;
      singleSite(): Promise<boolean>;
    };
    identity.single = null;
    const rows = await owner.db.execute<{ n: number }>(sql`select count(*)::int as n from sites`);
    expect(await identity.singleSite()).toBe(Number(rows[0]!.n) === 1);
    // Through the application role, outside any site: every site, not none.
    const appDb = app.get<DatabaseClient>(DATABASE);
    const [count] = await appDb.db.execute<{ n: number }>(
      sql`select cleitext_app_site_count() as n`,
    );
    expect(count!.n).toBe(Number(rows[0]!.n));
    expect(count!.n).toBeGreaterThan(0);
  });
});
