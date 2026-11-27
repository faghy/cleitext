/**
 * Plugins that take entries off the site and redirect their addresses (plugin
 * API 1.83): `ctx.content.unpublish` (back to draft, as a user) and
 * `ctx.redirects` (the site's redirects, as Settings → Redirects).
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
const SLUG = 'redirects-fixture';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let visitor: TestClient;
let adminId: string;

async function pluginSource(slug: string, permissions: string[]): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'redirects-src-')), slug);
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'cleitext.plugin.json'),
    JSON.stringify({
      slug,
      name: 'Redirects (test fixture)',
      version: '1.0.0',
      apiVersion: '^1.83',
      license: 'GPL-2.0-or-later',
      server: 'dist/server.js',
      permissions,
    }),
  );
  await writeFile(
    join(dir, 'dist', 'server.js'),
    `export default { setup(ctx) {
  ctx.routes.api({ method: 'POST', path: '/run', capability: 'edit_entries', async handler(request) {
    const body = request.body ?? {};
    try {
      if (body.action === 'unpublish')
        return { body: await ctx.content.unpublish(request.siteId, body.id, { userId: body.userId }) };
      if (body.action === 'set') { await ctx.redirects.set(request.siteId, body.redirect); return { body: { ok: true } }; }
      if (body.action === 'get') return { body: { redirect: await ctx.redirects.get(request.siteId, body.from) } };
      if (body.action === 'remove') return { body: { removed: await ctx.redirects.remove(request.siteId, body.from) } };
    } catch (error) {
      return { status: 422, body: { error: String(error && error.message || error) } };
    }
    return { status: 400, body: {} };
  } });
} };
`,
  );
  return dir;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const appRole = new URL(inject('appUrl')).username;
  await installPlugin(owner.db, {
    source: await pluginSource(SLUG, [
      'content:read',
      'content:publish',
      'redirects',
      'routes:admin',
    ]),
    pluginsPath,
    appRole,
  });
  await installPlugin(owner.db, {
    source: await pluginSource('redirects-denied', ['routes:admin']),
    pluginsPath,
    appRole,
  });
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'plugin-redirects');
  adminId = await seedUser(owner, {
    email: 'admin@plugin-redirects.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.41.0.1');
  visitor = new TestClient(app, site.host, '10.41.0.2');
  await admin.login('admin@plugin-redirects.test', PASSWORD);
  for (const slug of [SLUG, 'redirects-denied']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`, {})).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const run = (body: Record<string, unknown>, slug = SLUG) =>
  admin.post(`/api/v1/ext/${slug}/run`, body);

async function publishedPage(title: string) {
  const created = (await admin.post('/api/v1/entries', { type: 'page', title })).json();
  expect((await admin.post(`/api/v1/entries/${created.id}/publish`)).statusCode).toBe(200);
  return created as { id: string; slug: string };
}

describe('redirects and unpublishing by plugins (plugin API 1.83)', () => {
  it('takes an entry back to draft and sends its address to another page', async () => {
    const place = await publishedPage('Sanremo');
    const venue = await publishedPage('Trattoria del porto');
    expect((await visitor.get(`/${venue.slug}`)).statusCode).toBe(200);

    const off = await run({ action: 'unpublish', id: venue.id, userId: adminId });
    expect(off.statusCode, off.body).toBe(200);
    expect(off.json().status).toBe('draft');
    expect((await visitor.get(`/${venue.slug}`)).statusCode).toBe(404);

    const set = await run({
      action: 'set',
      redirect: { from: `/${venue.slug}`, to: `/${place.slug}` },
    });
    expect(set.statusCode, set.body).toBe(200);
    const moved = await visitor.get(`/${venue.slug}`);
    expect(moved.statusCode).toBe(301);
    expect(moved.headers.location).toBe(`/${place.slug}`);

    // The same as Settings → Redirects.
    const listed = (await admin.get('/api/v1/redirects')).json() as { from: string; to: string }[];
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: `/${venue.slug}`, to: `/${place.slug}` }),
      ]),
    );
    expect((await run({ action: 'get', from: `/${venue.slug}` })).json().redirect).toEqual({
      from: `/${venue.slug}`,
      to: `/${place.slug}`,
      status: 301,
    });

    // Replaced from the same path, then removed.
    await run({ action: 'set', redirect: { from: `/${venue.slug}`, to: '/', status: 302 } });
    expect((await visitor.get(`/${venue.slug}`)).statusCode).toBe(302);
    expect((await run({ action: 'remove', from: `/${venue.slug}` })).json()).toEqual({
      removed: true,
    });
    expect((await run({ action: 'remove', from: `/${venue.slug}` })).json()).toEqual({
      removed: false,
    });
    expect((await visitor.get(`/${venue.slug}`)).statusCode).toBe(404);
  });

  it('checks the addresses', async () => {
    for (const redirect of [
      { from: 'no-slash', to: '/x' },
      { from: '//evil.example', to: '/x' },
      { from: '/a', to: 'javascript:alert(1)' },
      { from: '/a', to: '/a' },
      { from: '/a', to: '/b', status: 410 },
    ]) {
      expect((await run({ action: 'set', redirect })).statusCode).toBe(422);
    }
    expect(
      (await run({ action: 'set', redirect: { from: '/a', to: 'https://example.com/b' } }))
        .statusCode,
    ).toBe(200);
  });

  it('needs the permissions', async () => {
    const page = await publishedPage('Kept');
    const denied = await run(
      { action: 'set', redirect: { from: '/x', to: '/y' } },
      'redirects-denied',
    );
    expect(denied.json().error).toMatch(/redirects/);
    const off = await run(
      { action: 'unpublish', id: page.id, userId: adminId },
      'redirects-denied',
    );
    expect(off.json().error).toMatch(/content:publish/);
  });
});
