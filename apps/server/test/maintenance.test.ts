/**
 * Maintenance mode from the admin (RF-SIT-06) and the `render.maintenance`
 * filter (plugin API 1.35), with the official Maintenance plugin: visitors
 * get the plugin's page with a 503, signed-in users still see the site.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let editor: TestClient;
let visitor: TestClient;

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

async function eventually(check: () => Promise<boolean>, timeoutMs = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('maintenance', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'maintenance');
  await seedUser(owner, {
    email: 'admin@maintenance.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'editor@maintenance.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  admin = new TestClient(app, site.host, '10.61.0.1');
  await admin.login('admin@maintenance.test', PASSWORD);
  editor = new TestClient(app, site.host, '10.61.0.2');
  await editor.login('editor@maintenance.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.61.0.3');
  const created = (
    await admin.post('/api/v1/entries', { type: 'article', title: 'Open for business' })
  ).json();
  await admin.post(`/api/v1/entries/${created.id}/publish`);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('maintenance switch in the admin', () => {
  it('needs the right to manage the settings', async () => {
    expect((await visitor.get('/api/v1/settings/maintenance')).statusCode).toBe(401);
    expect((await editor.get('/api/v1/settings/maintenance')).statusCode).toBe(403);
    const put = await editor.request('PUT', '/api/v1/settings/maintenance', { enabled: true });
    expect(put.statusCode).toBe(403);
    expect((await editor.get('/api/v1/settings/maintenance/preview')).statusCode).toBe(403);
    const bad = await admin.request('PUT', '/api/v1/settings/maintenance', { enabled: 'yes' });
    expect(bad.statusCode).toBe(400);
    expect((await admin.get('/api/v1/settings/maintenance')).json()).toEqual({ enabled: false });
  });

  it('turns maintenance mode on and off, with the theme’s page without plugins', async () => {
    expect((await visitor.get('/')).statusCode).toBe(200);
    const on = await admin.request('PUT', '/api/v1/settings/maintenance', { enabled: true });
    expect(on.statusCode, on.body).toBe(200);
    expect(on.json()).toEqual({ enabled: true });
    expect((await admin.get('/api/v1/settings/maintenance')).json()).toEqual({ enabled: true });
    await eventually(async () => (await visitor.get('/')).statusCode === 503);
    const down = await visitor.get('/');
    expect(down.headers['retry-after']).toBe('3600');
    expect(down.body).not.toContain('Open for business');
    // Signed-in users still see the site.
    const home = await admin.get('/');
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('Open for business');
    const log = (await admin.get('/api/v1/audit?action=site.maintenance.on')).json() as {
      items: unknown[];
    };
    expect(log.items.length).toBe(1);

    const off = await admin.request('PUT', '/api/v1/settings/maintenance', { enabled: false });
    expect(off.json()).toEqual({ enabled: false });
    await eventually(async () => (await visitor.get('/')).statusCode === 200);
  });
});

describe('Maintenance plugin', () => {
  it('serves its page to visitors with a 503, Retry-After and noindex', async () => {
    const activated = await admin.post('/api/v1/plugins/maintenance/activate');
    expect(activated.statusCode, activated.body).toBe(200);
    // The theme's logo (Aurora's `logo` setting) is given to the plugin.
    const png = await sharp({
      create: { width: 120, height: 40, channels: 3, background: '#0f4c81' },
    })
      .png()
      .toBuffer();
    const logo = (await admin.upload('/api/v1/media', 'logo.png', png, 'image/png')).json();
    const theme = await admin.request('PUT', '/api/v1/themes/active/settings', {
      values: { logo: logo.id },
    });
    expect(theme.statusCode, theme.body).toBe(200);

    const returnAt = new Date(Date.now() + 2 * 3600_000).toISOString();
    expect((await editor.request('PUT', '/api/v1/ext/maintenance/config', {})).statusCode).toBe(
      403,
    );
    const saved = await admin.request('PUT', '/api/v1/ext/maintenance/config', {
      mode: 'maintenance',
      texts: { en: { title: 'New kitchen <soon>', message: 'We are painting.' } },
      returnAt,
      email: 'hello@bistro.example',
      colors: { background: '#101010', text: '#fafafa', accent: '#ff6600' },
      showLogo: true,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ returnAt, email: 'hello@bistro.example' });

    await admin.request('PUT', '/api/v1/settings/maintenance', { enabled: true });
    await eventually(async () => (await visitor.get('/')).statusCode === 503);
    const page = await visitor.get('/some/page');
    expect(page.statusCode).toBe(503);
    expect(page.headers['x-robots-tag']).toBe('noindex');
    expect(page.headers['cache-control']).toBe('private, no-cache');
    expect(page.headers['x-cache']).toBe('BYPASS');
    expect(page.headers['content-security-policy']).toContain("object-src 'none'");
    const retry = Number(page.headers['retry-after']);
    expect(retry).toBeGreaterThan(7000);
    expect(retry).toBeLessThanOrEqual(7200);
    expect(page.body).toContain('<html lang="en">');
    expect(page.body).toContain('<h1>New kitchen &lt;soon&gt;</h1>');
    expect(page.body).toContain('We are painting.');
    expect(page.body).toContain('href="mailto:hello@bistro.example"');
    expect(page.body).toContain(`src="http://${site.host}/media/`);
    expect(page.body).toContain('Made with Cleitext');
    expect(page.body).not.toContain('Open for business');

    // Signed-in users still see the site.
    const home = await admin.get('/');
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('Open for business');

    // The preview in the admin: the same page, sandboxed.
    const preview = await admin.get('/api/v1/settings/maintenance/preview?locale=en');
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toContain('text/html');
    expect(preview.headers['content-security-policy']).toContain('sandbox');
    expect(preview.body).toContain('<h1>New kitchen &lt;soon&gt;</h1>');
    expect(preview.body).toContain(`<base href="http://${site.host}/">`);
  });

  it('leaves the page to the theme once deactivated, and stops with the switch', async () => {
    await admin.post('/api/v1/plugins/maintenance/deactivate');
    await eventually(async () => !(await visitor.get('/')).body.includes('Made with Cleitext'));
    const down = await visitor.get('/');
    expect(down.statusCode).toBe(503);
    expect(down.headers['retry-after']).toBe('3600');

    await admin.request('PUT', '/api/v1/settings/maintenance', { enabled: false });
    await eventually(async () => (await visitor.get('/')).statusCode === 200);
  });
});
