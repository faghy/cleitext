/**
 * Connection pools under load: a request that holds a connection must never
 * wait for a second one of the same pool, or concurrent requests wait on each
 * other until the pool runs dry and the app hangs. With one connection per
 * pool, every request here would hang at the first nested transaction.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { PageCacheService } from '../src/public/page-cache.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
  unlockMultilingual,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let nesting: string | undefined;

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

beforeAll(async () => {
  // The real behaviour of the pools, not the check that fails on nesting.
  nesting = process.env.CLEITEXT_DB_NESTING;
  delete process.env.CLEITEXT_DB_NESTING;
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('multilingual', pluginsPath);
  await install('seo', pluginsPath);
  app = await startTestApp({ pluginsPath, env: { DATABASE_POOL_MAX: '1' } });
  unlockMultilingual();
  site = await seedSite(owner, 'pool');
  await seedUser(owner, {
    email: 'admin@pool.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.77.0.1');
  await admin.login('admin@pool.test', PASSWORD);
  for (const slug of ['multilingual', 'seo']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
  const added = await admin.post('/api/v1/ext/multilingual/languages', { code: 'it' });
  expect(added.statusCode, added.body).toBe(201);
  const created = (await admin.post('/api/v1/entries', { type: 'page', title: 'Home' })).json();
  expect((await admin.post(`/api/v1/entries/${created.id}/publish`)).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
  if (nesting !== undefined) process.env.CLEITEXT_DB_NESTING = nesting;
});

it('serves concurrent requests with one connection per pool', async () => {
  const visitor = new TestClient(app, site.host, '10.77.0.2');
  for (let round = 0; round < 3; round++) {
    // Cold caches: active plugins, languages and pages are read again.
    await app.get(PageCacheService).invalidate(site.id, ['site'], { sites: true });
    const responses = await Promise.all([
      admin.get('/api/v1/auth/me'),
      admin.get('/api/v1/entries?type=page'),
      visitor.get('/'),
      visitor.get('/home'),
      visitor.get('/it/'),
      visitor.get('/sitemap.xml'),
      admin.get('/api/v1/auth/me'),
      visitor.get('/'),
    ]);
    expect(responses.map((r) => r.statusCode)).not.toContain(500);
    expect(responses[0]!.json().site.locales.map((l: { code: string }) => l.code)).toEqual([
      'en',
      'it',
    ]);
  }
}, 20_000);
