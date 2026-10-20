/**
 * Plugins that come with a theme (theme.json `plugins`): activated on the
 * site with the theme, deactivated with data kept when another theme is
 * chosen, and a missing one reported without stopping the theme.
 */
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ThemesService } from '../src/themes/themes.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const fixture = fileURLToPath(new URL('./fixtures/events-plugin', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let themesPath: string;
let visitor: TestClient;

async function theme(dir: string, slug: string, plugins?: string[], body = 'children') {
  await mkdir(join(dir, slug, 'dist'), { recursive: true });
  await writeFile(
    join(dir, slug, 'theme.json'),
    JSON.stringify({ slug, name: slug, version: '1.0.0', ...(plugins ? { plugins } : {}) }),
  );
  await writeFile(
    join(dir, slug, 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) { return h('html', null, h('head', null, h('title', null, head.title)), h('body', null, ${body})); }
function Index() { return h('main', null, '${slug}'); }
export default sdk.defineTheme({ slug: '${slug}', name: '${slug}', version: '1.0.0', menuLocations: {}, templates: { index: Index }, Layout, css: '' });
`,
  );
}

beforeAll(async () => {
  owner = ownerDatabase();
  themesPath = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await theme(themesPath, 'builder-theme', ['events']);
  await theme(themesPath, 'lost-theme', ['not-installed']);
  await theme(themesPath, 'other-theme');
  await theme(themesPath, 'growing-theme');
  // Hook points (plugin API 1.33): one the plugin fills, one it leaves empty.
  await theme(
    themesPath,
    'hook-theme',
    undefined,
    "h(sdk.Location, { name: 'hook:test_top' }), h(sdk.Location, { name: 'hook:test_empty' }), h(sdk.Location, { name: 'hook:test_kept' }, h('p', null, 'Kept')), children",
  );
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'events-src-')), 'events');
  await cp(fixture, source, { recursive: true });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath, env: { THEMES_PATH: themesPath } });
  const site = await seedSite(owner, 'theme-plugins');
  await seedUser(owner, {
    email: 'admin@theme-plugins.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.36.0.1');
  visitor = new TestClient(app, site.host, '10.36.0.2');
  await admin.login('admin@theme-plugins.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const active = async () =>
  ((await admin.get('/api/v1/plugins')).json() as { slug: string; active: boolean }[]).find(
    (p) => p.slug === 'events',
  )?.active;

describe('plugins that come with a theme', () => {
  it('are activated with the theme and deactivated when another theme is chosen', async () => {
    expect(await active()).toBe(false);
    const on = await admin.post('/api/v1/themes/builder-theme/activate');
    expect(on.statusCode).toBe(200);
    expect(on.json()).toEqual({ warnings: [] });
    expect(await active()).toBe(true);

    const off = await admin.post('/api/v1/themes/other-theme/activate');
    expect(off.json()).toEqual({ warnings: [] });
    expect(await active()).toBe(false);
  });

  it('stay active when the site used them before the theme', async () => {
    expect((await admin.post('/api/v1/plugins/events/activate')).statusCode).toBeLessThan(300);
    await admin.post('/api/v1/themes/builder-theme/activate');
    await admin.post('/api/v1/themes/other-theme/activate');
    expect(await active()).toBe(true);
    await admin.post('/api/v1/plugins/events/deactivate');
  });

  it('are turned on once when the active theme is updated with them', async () => {
    await admin.post('/api/v1/themes/growing-theme/activate');
    expect(await active()).toBe(false);
    // The update: the theme now comes with the plugin.
    await theme(themesPath, 'growing-theme', ['events']);
    await app.get(ThemesService).reload();
    await admin.get('/api/v1/plugins/admin');
    expect(await active()).toBe(true);
    // Turned off by hand, it stays off.
    await admin.post('/api/v1/plugins/events/deactivate');
    await admin.get('/api/v1/plugins/admin');
    expect(await active()).toBe(false);
    await admin.post('/api/v1/themes/other-theme/activate');
  });

  it('do not stop the theme when one is missing', async () => {
    const result = await admin.post('/api/v1/themes/lost-theme/activate');
    expect(result.statusCode).toBe(200);
    expect(result.json().warnings[0]).toMatch(/not-installed .*not installed/);
  });
});

describe('hook points of a theme', () => {
  it('render nothing unless a plugin fills them', async () => {
    await admin.post('/api/v1/themes/hook-theme/activate');
    const created = (
      await admin.post('/api/v1/entries', {
        type: 'page',
        title: 'Located',
        document: { schema: 1, blocks: [] },
      })
    ).json();
    await admin.post(`/api/v1/entries/${created.id}/publish`);
    // Without the plugin, only the theme's own markup.
    const plain = (await admin.get('/located')).body;
    expect(plain).toContain('<p>Kept</p><main>');
    expect(plain).not.toContain('cx-location');

    await admin.post('/api/v1/plugins/events/activate');
    const html = (await visitor.get('/located')).body;
    expect(html).toContain(
      '<div class="cx-location cx-location-hook-test_top"><p>Hooked visitor</p></div><p>Kept</p><main>',
    );
    expect(html).not.toContain('test_empty');
    // Plugins know when the visitor is signed in (their pages are never cached).
    expect((await admin.get('/located')).body).toContain('<p>Hooked signed in</p>');
    // Elsewhere the hook stays empty.
    expect((await admin.get('/')).body).not.toContain('Hooked');
    await admin.post('/api/v1/plugins/events/deactivate');
    await admin.post('/api/v1/themes/other-theme/activate');
  });
});
