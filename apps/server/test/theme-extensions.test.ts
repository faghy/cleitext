/**
 * Plugins that extend a theme's options (`ctx.themes.extend`, plugin API
 * 1.32): settings, sections, zone items and areas shown in Customize and
 * given to the theme only while the plugin is active on the site.
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
const PLUGIN = 'extend-fixture';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let visitor: TestClient;

/** A theme with a header builder that prints its settings' values. */
async function themesFolder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await mkdir(join(dir, 'base', 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'base', 'theme.json'),
    JSON.stringify({ slug: 'base', name: 'Base', version: '1.0.0' }),
  );
  await writeFile(
    join(dir, 'base', 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) {
  const s = sdk.useThemeSettings();
  return h('html', null, h('head', null, h('title', null, head.title)),
    h('body', null, h('p', { id: 'motto' }, 'motto=' + s.motto), h('p', { id: 'badge' }, 'badge=' + (s.badge ?? 'none')),
      children, h(sdk.BlockArea, { name: 'topbar' })));
}
function Index() { return h('main', null, 'index'); }
export default sdk.defineTheme({ slug: 'base', name: 'Base', version: '1.0.0', menuLocations: {}, templates: { index: Index }, Layout, css: '',
  settingsSections: [{ id: 'header', label: 'Header' }],
  settings: [
    { name: 'motto', type: 'text', label: 'Motto', default: 'Theme motto' },
    { name: 'header', type: 'zones', label: 'Header', section: 'header', devices: ['desktop'],
      rows: [{ name: 'main', label: 'Main', zones: [{ name: 'left' }, { name: 'right' }] }],
      items: [{ name: 'logo', label: 'Logo' }] },
  ] });
`,
  );
  return dir;
}

/** A "Pro" add-on of the theme, written as plugin:build would leave it. */
async function pluginSource(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'extend-src-')), PLUGIN);
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'cleitext.plugin.json'),
    JSON.stringify({
      slug: PLUGIN,
      name: 'Base Pro (test fixture)',
      version: '1.0.0',
      apiVersion: '^1.32',
      license: 'GPL-2.0-or-later',
      server: 'dist/server.js',
      permissions: ['theme:hooks'],
    }),
  );
  await writeFile(
    join(dir, 'dist', 'server.js'),
    `export default { setup(ctx) {
  ctx.themes.extend('base', {
    settingsSections: [{ id: 'pro-badge', label: 'Badge', parent: 'header' }],
    settings: [
      { name: 'badge', type: 'text', label: 'Badge', section: 'pro-badge', maxLength: 20, default: 'Pro default' },
      { name: 'motto', type: 'text', label: 'Clashing motto', default: 'Plugin motto' },
    ],
    zoneItems: { header: [{ name: 'pro-button', label: 'Button', section: 'pro-badge' }], missing: [{ name: 'x', label: 'X' }] },
    presets: [{ id: 'pro-dark', label: 'Dark', values: { badge: 'Dark' } }],
    areas: { topbar: 'Top bar' },
    areaDefaults: { topbar: { schema: 1, blocks: [{ id: 't', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Pro top bar' }] }] } },
  });
} };
`,
  );
  return dir;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await installPlugin(owner.db, {
    source: await pluginSource(),
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath, env: { THEMES_PATH: await themesFolder() } });
  const site = await seedSite(owner, 'theme-extensions');
  await seedUser(owner, {
    email: 'admin@theme-extensions.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.37.0.1');
  visitor = new TestClient(app, site.host, '10.37.0.2');
  await admin.login('admin@theme-extensions.test', PASSWORD);
  expect((await admin.post('/api/v1/themes/base/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

interface ActiveTheme {
  theme: {
    settings: { name: string; label: string; items?: { name: string }[] }[];
    settingsSections: { id: string; parent?: string }[];
    presets: { id: string }[];
    areas: Record<string, string>;
  };
  values: Record<string, unknown>;
}

const activeTheme = async () => (await admin.get('/api/v1/themes/active')).json() as ActiveTheme;

describe('plugins extending a theme', () => {
  it('add nothing while the plugin is inactive', async () => {
    const { theme, values } = await activeTheme();
    expect(theme.settings.map((f) => f.name)).toEqual(['motto', 'header']);
    expect(theme.settingsSections.map((s) => s.id)).toEqual(['header']);
    expect(theme.settings[1]!.items!.map((i) => i.name)).toEqual(['logo']);
    expect(values).not.toHaveProperty('badge');
    expect((await visitor.get('/')).body).toContain('badge=none');
  });

  it('add settings, sections, zone items, presets and areas when it is active', async () => {
    expect((await admin.post(`/api/v1/plugins/${PLUGIN}/activate`)).statusCode).toBeLessThan(300);
    const { theme, values } = await activeTheme();
    // The clashing "motto" is ignored: the theme's own stays.
    expect(theme.settings.map((f) => f.name)).toEqual(['motto', 'header', 'badge']);
    expect(theme.settings[0]!.label).toBe('Motto');
    expect(theme.settingsSections).toEqual([
      { id: 'header', label: 'Header' },
      { id: 'pro-badge', label: 'Badge', parent: 'header' },
    ]);
    expect(theme.settings[1]!.items!.map((i) => i.name)).toEqual(['logo', 'pro-button']);
    expect(theme.presets.map((p) => p.id)).toEqual(['pro-dark']);
    expect(theme.areas).toEqual({ topbar: 'Top bar' });
    expect(values).toMatchObject({ motto: 'Theme motto', badge: 'Pro default' });

    const home = (await visitor.get('/')).body;
    expect(home).toContain('badge=Pro default');
    expect(home).toContain('Pro top bar');
    // The zones field accepts the plugin's element.
    const saved = await admin.request('PUT', '/api/v1/themes/active/settings', {
      values: { header: { desktop: { main: { left: ['logo'], right: ['pro-button'] } } } },
    });
    expect(saved.statusCode).toBe(200);
  });

  it('validate and render the values of the added settings', async () => {
    const bad = await admin.request('PUT', '/api/v1/themes/active/settings', {
      values: { badge: 'x'.repeat(30) },
    });
    expect(bad.statusCode).toBe(400);
    const saved = await admin.request('PUT', '/api/v1/themes/active/settings', {
      values: { motto: 'Hello', badge: 'Gold' },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ motto: 'Hello', badge: 'Gold' });
    expect((await visitor.get('/')).body).toContain('badge=Gold');
    const area = await admin.get('/api/v1/themes/active/areas/topbar?locale=en');
    expect(JSON.stringify(area.json())).toContain('Pro top bar');
  });

  it('hide the fields and values when the plugin is deactivated, and keep the values', async () => {
    expect((await admin.post(`/api/v1/plugins/${PLUGIN}/deactivate`)).statusCode).toBeLessThan(300);
    const { theme, values } = await activeTheme();
    expect(theme.settings.map((f) => f.name)).toEqual(['motto', 'header']);
    expect(theme.areas).toEqual({});
    expect(values).not.toHaveProperty('badge');
    const home = (await visitor.get('/')).body;
    expect(home).toContain('badge=none');
    expect(home).toContain('motto=Hello');
    expect(home).not.toContain('Pro top bar');
    expect((await admin.get('/api/v1/themes/active/areas/topbar?locale=en')).statusCode).toBe(404);

    // Saving the theme's settings meanwhile keeps the plugin's value.
    await admin.request('PUT', '/api/v1/themes/active/settings', { values: { motto: 'Again' } });
    await admin.post(`/api/v1/plugins/${PLUGIN}/activate`);
    expect((await activeTheme()).values).toMatchObject({ motto: 'Again', badge: 'Gold' });
    expect((await visitor.get('/')).body).toContain('badge=Gold');
  });
});
