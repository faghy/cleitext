/**
 * Services between plugins (plugin API 1.73): a plugin offers functions
 * (`ctx.services.provide`), others use them where it is active (`use`, `all`),
 * each call isolated as the provider's and its error passed to the caller.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;

async function fixture(slug: string, server: string, permissions: string[] = []) {
  const dir = join(await mkdtemp(join(tmpdir(), `${slug}-`)), slug);
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'cleitext.plugin.json'),
    JSON.stringify({
      slug,
      name: `${slug} (fixture)`,
      version: '1.0.0',
      apiVersion: '^1.73',
      license: 'GPL-2.0-or-later',
      server: 'dist/server.js',
      permissions,
    }),
  );
  await writeFile(join(dir, 'dist', 'server.js'), server);
  return dir;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const appRole = new URL(inject('appUrl')).username;
  const install = async (dir: string) =>
    installPlugin(owner.db, { source: dir, pluginsPath, appRole });
  await install(
    await fixture(
      'store-fx',
      `export default { setup(ctx) {
  ctx.services.provide('store-fx', {
    double(siteId, n) { return { siteId, value: n * 2 }; },
    fail() { throw new Error('out of stock'); },
  });
  ctx.services.provide('store-fx.extras', { label() { return 'from store'; } });
} };`,
    ),
  );
  await install(
    await fixture(
      'extra-fx',
      `export default { setup(ctx) {
  ctx.services.provide('store-fx.extras', { label() { return 'from extra'; } });
} };`,
    ),
  );
  await install(
    await fixture(
      'client-fx',
      `export default { setup(ctx) {
  ctx.routes.api({ method: 'POST', path: '/run', capability: 'manage_settings', async handler(request) {
    const store = await ctx.services.use(request.siteId, 'store-fx');
    if (!store) return { body: { store: null } };
    const doubled = await store.double(request.siteId, 21);
    let failed = '';
    try { await store.fail(request.siteId); } catch (e) { failed = e.message; }
    let wrongSite = '';
    try { await store.double('00000000-0000-4000-8000-000000000000', 1); } catch (e) { wrongSite = e.message; }
    const extras = await Promise.all((await ctx.services.all(request.siteId, 'store-fx.extras'))
      .map(async (o) => o.plugin + ':' + (await o.service.label(request.siteId))));
    return { body: { doubled, failed, wrongSite, extras: extras.sort() } };
  } });
} };`,
      ['routes:admin'],
    ),
  );
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'plugin-services');
  await seedUser(owner, {
    email: 'admin@services.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.41.0.1');
  await admin.login('admin@services.test', PASSWORD);
  for (const slug of ['client-fx', 'store-fx', 'extra-fx']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`, {})).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('services between plugins (plugin API 1.73)', () => {
  it('calls another plugin’s functions and every offer of an extension point', async () => {
    const result = (await admin.post('/api/v1/ext/client-fx/run', {})).json();
    expect(result.doubled.value).toBe(42);
    expect(result.failed).toContain('out of stock');
    expect(result.wrongSite).toContain('the site it was given for');
    expect(result.extras).toEqual(['extra-fx:from extra', 'store-fx:from store']);
  });

  it('gives nothing where the providing plugin is not active', async () => {
    await admin.post('/api/v1/plugins/store-fx/deactivate', {});
    expect((await admin.post('/api/v1/ext/client-fx/run', {})).json()).toEqual({ store: null });
    await admin.post('/api/v1/plugins/store-fx/activate', {});
  });
});
