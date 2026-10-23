/** Plugins → Add New and Themes → Add New: the signed catalog (RF-PLG-07/09). */
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { allowed, AutoUpdatesService } from '../src/updates/auto-updates.service.js';
import { UpdatesService } from '../src/updates/updates.service.js';
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
let root: TestClient;
let admin: TestClient;
let server: Server;
let base: string;

const keys = generateKeyPairSync('ed25519');
const otherKeys = generateKeyPairSync('ed25519');
/** What the fake catalog serves, by path. */
const files = new Map<string, Buffer>();

function pluginZip(
  version: string,
  apiVersion = '^1.0',
  slug = 'tiny',
  requires?: Record<string, string>,
) {
  return Buffer.from(
    zipSync({
      [`${slug}/cleitext.plugin.json`]: strToU8(
        JSON.stringify({
          slug,
          name: slug === 'tiny' ? 'Tiny' : 'Add-on',
          version,
          apiVersion,
          license: 'GPL-2.0-or-later',
          permissions: [],
          ...(requires ? { requires: { plugins: requires } } : {}),
        }),
      ),
    }),
  );
}

/** The code says `codeVersion` (themes left it behind): theme.json is what counts. */
function themeZip(version: string, codeVersion = version) {
  return Buffer.from(
    zipSync({
      'sparkle/theme.json': strToU8(JSON.stringify({ slug: 'sparkle', name: 'Sparkle', version })),
      'sparkle/dist/index.js': strToU8(
        `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
export default sdk.defineTheme({ slug: 'sparkle', name: 'Sparkle', version: '${codeVersion}', menuLocations: {},
  templates: { index: () => h('main', null, 'sparkle') }, Layout: ({ children }) => h('html', null, h('body', null, children)), css: '' });`,
      ),
    }),
  );
}

function item(type: 'plugin' | 'theme', slug: string, version: string, zip: Buffer, extra = {}) {
  const name = `${slug}-${version}.zip`;
  files.set(`/${name}`, zip);
  return {
    type,
    slug,
    name: ({ tiny: 'Tiny', addon: 'Add-on' } as Record<string, string>)[slug] ?? 'Sparkle',
    summary: { en: `The ${slug} ${type}.`, it: `Il ${type} ${slug}.` },
    tags: [],
    icon: null,
    screenshots: [],
    version,
    license: 'GPL-2.0-or-later',
    author: 'Tests',
    download: `${base}/${name}`,
    sha256: createHash('sha256').update(zip).digest('hex'),
    size: zip.length,
    updatedAt: '2026-10-11T00:00:00Z',
    ...extra,
  };
}

/** Publishes a catalog, signed with the trusted key unless told otherwise. */
function publish(items: unknown[], signer = keys.privateKey) {
  const body = Buffer.from(
    JSON.stringify({ schema: 1, generatedAt: '2026-10-11T00:00:00Z', items }),
  );
  files.set('/catalog.json', body);
  files.set('/catalog.json.sig', Buffer.from(sign(null, body, signer).toString('base64')));
}

const catalog = async (refresh = true) =>
  (await root.get(`/api/v1/catalog${refresh ? '?refresh=1' : ''}`)).json();

beforeAll(async () => {
  server = createServer((req, res) => {
    const data = files.get(req.url ?? '');
    if (!data) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-length': data.length }).end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  app = await startTestApp({
    env: {
      DATABASE_ADMIN_URL: inject('ownerUrl'),
      THEMES_PATH: await mkdtemp(join(tmpdir(), 'cleitext-themes-')),
      CATALOG_URL: `${base}/catalog.json`,
      CATALOG_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    },
  });
  owner = ownerDatabase();
  site = await seedSite(owner, 'catalog');
  await seedUser(owner, {
    email: 'root@catalog.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
    superAdmin: true,
  });
  await seedUser(owner, {
    email: 'admin@catalog.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  root = new TestClient(app, site.host, '10.43.0.1');
  await root.login('root@catalog.test', PASSWORD);
  admin = new TestClient(app, site.host, '10.43.0.2');
  await admin.login('admin@catalog.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
  server?.close();
});

describe('catalog', () => {
  it('lists the items of a signed index, for super admins only', async () => {
    publish([
      item('plugin', 'tiny', '1.0.0', pluginZip('1.0.0')),
      item('theme', 'sparkle', '1.0.0', themeZip('1.0.0'), { requires: '>=0.1.0' }),
    ]);
    const view = await catalog();
    expect(view).toMatchObject({ enabled: true, error: null });
    expect(view.items.map((i: { slug: string }) => i.slug)).toEqual(['tiny', 'sparkle']);
    expect(view.items[0]).toMatchObject({ installed: null, update: false, compatible: true });
    expect((await admin.get('/api/v1/catalog')).statusCode).toBe(403);
  });

  it('refuses an index signed with another key, keeping the last good one', async () => {
    const good = (await catalog()).items.length;
    publish([item('plugin', 'tiny', '6.6.6', pluginZip('6.6.6'))], otherKeys.privateKey);
    const view = await catalog();
    expect(view.error).toContain('signature');
    expect(view.items).toHaveLength(good);
    expect(view.items[0].version).toBe('1.0.0');
  });

  it('installs a plugin and a theme after checking their SHA-256', async () => {
    publish([
      item('plugin', 'tiny', '1.0.0', pluginZip('1.0.0')),
      item('theme', 'sparkle', '1.0.0', themeZip('1.0.0', '0.9.0'), { requires: '>=0.1.0' }),
    ]);
    await catalog();
    const plugin = await root.post('/api/v1/catalog/plugin/tiny/install');
    expect(plugin.statusCode).toBe(200);
    expect(plugin.json()).toMatchObject({ slug: 'tiny', version: '1.0.0' });
    expect((await root.post('/api/v1/catalog/theme/sparkle/install')).statusCode).toBe(200);

    const view = await catalog();
    expect(view.items.map((i: { installed: string | null }) => i.installed)).toEqual([
      '1.0.0',
      '1.0.0',
    ]);
    expect(
      (await root.get('/api/v1/plugins')).json().some((p: { slug: string }) => p.slug === 'tiny'),
    ).toBe(true);
    expect(
      (await root.get('/api/v1/themes')).json().some((t: { slug: string }) => t.slug === 'sparkle'),
    ).toBe(true);
    // Installing again what is up to date is refused.
    expect((await root.post('/api/v1/catalog/plugin/tiny/install')).statusCode).toBe(400);
  });

  it('offers updates and installs them', async () => {
    publish([
      item('plugin', 'tiny', '1.1.0', pluginZip('1.1.0')),
      item('theme', 'sparkle', '1.0.0', themeZip('1.0.0'), { requires: '>=0.1.0' }),
    ]);
    const view = await catalog();
    expect(view.items[0]).toMatchObject({ installed: '1.0.0', version: '1.1.0', update: true });
    expect((await root.post('/api/v1/catalog/plugin/tiny/install')).statusCode).toBe(200);
    expect((await catalog()).items[0]).toMatchObject({ installed: '1.1.0', update: false });
  });

  it('refuses tampered and incompatible packages', async () => {
    const tampered = item('plugin', 'tiny', '1.2.0', pluginZip('1.2.0'));
    files.set('/tiny-1.2.0.zip', pluginZip('1.2.1'));
    publish([
      tampered,
      item('theme', 'sparkle', '2.0.0', themeZip('2.0.0'), { requires: '>=99.0.0' }),
    ]);
    await catalog();
    const bad = await root.post('/api/v1/catalog/plugin/tiny/install');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().detail).toContain('SHA-256');

    const view = await catalog();
    expect(view.items[1]).toMatchObject({ compatible: false, update: true });
    expect((await root.post('/api/v1/catalog/theme/sparkle/install')).statusCode).toBe(400);
    expect((await root.post('/api/v1/catalog/plugin/missing/install')).statusCode).toBe(404);
  });
});

describe('automatic updates', () => {
  const stateFiles = () => {
    const dir = join(app.get(UpdatesService).statusFile, '..');
    return [join(dir, 'auto-updates.json'), join(dir, 'auto-updates.lock')];
  };
  beforeAll(async () => {
    for (const file of stateFiles()) await rm(file, { force: true });
  });
  afterAll(async () => {
    for (const file of stateFiles()) await rm(file, { force: true });
  });

  it('are off until chosen, by super admins only', async () => {
    expect((await root.get('/api/v1/updates/auto')).json()).toMatchObject({
      core: 'off',
      items: [],
    });
    const denied = await admin.request('PUT', '/api/v1/updates/auto', { core: 'all' });
    expect(denied.statusCode).toBe(403);
    expect((await root.request('PUT', '/api/v1/updates/auto', {})).statusCode).toBe(400);
  });

  it('update the chosen plugins and themes that work here, and tell the super admins', async () => {
    const chosen = await root.request('PUT', '/api/v1/updates/auto', {
      item: { type: 'plugin', slug: 'tiny', enabled: true },
    });
    expect(chosen.json()).toMatchObject({ items: [{ type: 'plugin', slug: 'tiny' }] });
    expect(chosen.json().nextRun).toBeTruthy();
    // A newer tiny, and a newer sparkle that nobody chose (and that needs a newer Cleitext).
    publish([
      item('plugin', 'tiny', '1.3.0', pluginZip('1.3.0')),
      item('theme', 'sparkle', '2.0.0', themeZip('2.0.0'), { requires: '>=99.0.0' }),
    ]);
    const outbox = app.get(MailService).outbox;
    const before = outbox.length;
    const results = (await root.post('/api/v1/updates/auto/run')).json();
    expect(results).toMatchObject([
      { type: 'plugin', slug: 'tiny', from: '1.1.0', to: '1.3.0', ok: true },
    ]);
    expect((await catalog()).items[0]).toMatchObject({ installed: '1.3.0', update: false });
    const mail = outbox.slice(before).find((m) => m.to === 'root@catalog.test');
    expect(mail?.subject).toBe('Cleitext: automatic updates done');
    expect(mail?.text).toContain(': 1.1.0 → 1.3.0');
    const view = (await root.get('/api/v1/updates/auto')).json();
    expect(view.log[0]).toMatchObject({ slug: 'tiny', ok: true });
    expect(view.lastRun).toBeTruthy();
    // Nothing new: nothing done, no email.
    const quiet = outbox.length;
    expect((await root.post('/api/v1/updates/auto/run')).json()).toEqual([]);
    expect(outbox.length).toBe(quiet);
    // Turned off again.
    const off = await root.request('PUT', '/api/v1/updates/auto', {
      item: { type: 'plugin', slug: 'tiny', enabled: false },
    });
    expect(off.json().items).toEqual([]);
    expect(app.get(AutoUpdatesService).view().items).toEqual([]);
  });

  it('take core releases by the chosen policy', () => {
    expect(allowed('patch', '0.26.0', '0.26.1')).toBe(true);
    expect(allowed('patch', '0.26.1', '0.27.0')).toBe(false);
    expect(allowed('all', '0.26.1', '0.27.0')).toBe(true);
    expect(allowed('all', '0.26.1', '0.27.0-beta.1')).toBe(false);
    expect(allowed('off', '0.26.0', '0.26.1')).toBe(false);
    expect(allowed('all', '0.27.0', '0.26.1')).toBe(false);
  });
});

describe('required plugins', () => {
  it('are updated from the catalog first, so a site left behind is never stuck', async () => {
    publish([
      item('plugin', 'tiny', '1.5.0', pluginZip('1.5.0')),
      item('plugin', 'addon', '1.0.0', pluginZip('1.0.0', '^1.0', 'addon', { tiny: '^1.5.0' })),
    ]);
    expect((await catalog()).items[0]).toMatchObject({ installed: '1.3.0', update: true });
    const res = await root.post('/api/v1/catalog/plugin/addon/install');
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toContain('Tiny updated from 1.3.0 to 1.5.0 (required by addon).');
    expect((await catalog()).items.map((i: { installed: string }) => i.installed)).toEqual([
      '1.5.0',
      '1.0.0',
    ]);
  });

  it('that the catalog cannot satisfy say what is missing', async () => {
    publish([
      item('plugin', 'tiny', '1.5.0', pluginZip('1.5.0')),
      item('plugin', 'addon', '1.1.0', pluginZip('1.1.0', '^1.0', 'addon', { tiny: '^3.0.0' })),
    ]);
    await catalog();
    const res = await root.post('/api/v1/catalog/plugin/addon/install');
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toContain(
      'Add-on 1.1.0 needs Tiny ^3.0.0 (1.5.0 is installed): update Tiny first, then Add-on.',
    );
    expect(res.json().detail).not.toContain('Error:');
  });
});
