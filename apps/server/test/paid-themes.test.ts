/**
 * Paid themes in the catalog (RF-CAT-03): the demo installed without a
 * license and tried with Live Preview, a key activated per site, downloads
 * through short-lived addresses, "Renew to update", and themes that keep
 * working whatever the license server says. The license server is a fake.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { settings, withSiteContext, type DatabaseClient } from '@cleitext/db';
import { and, eq } from 'drizzle-orm';
import { LICENSE_KEY_ALPHABET, licenseKeyCheck } from '@cleitext/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { strToU8, zipSync } from 'fflate';
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
const keys = generateKeyPairSync('ed25519');

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let other: SeededSite;
let root: TestClient;
let admin: TestClient;
let otherAdmin: TestClient;
let server: Server;
let base: string;

const files = new Map<string, Buffer>();

function newKey(): string {
  const body = [...randomBytes(24)].map((b) => LICENSE_KEY_ALPHABET[b % 32]).join('');
  return body + licenseKeyCheck(body);
}

/** The fake license server's state. */
const license = {
  key: newKey(),
  seats: 1,
  updatesUntil: '2026-12-31T00:00:00.000Z',
  activations: new Map<string, string>(),
  demo: true,
  calls: [] as { action: string; body: Record<string, unknown> }[],
};
/** Release dates of the versions, as the license server knows them. */
const released: Record<string, string> = {
  '1.0.0': '2026-10-01T00:00:00Z',
  '1.1.0': '2027-02-01T00:00:00Z',
};

function themeZip(version: string) {
  return Buffer.from(
    zipSync({
      'vivid/theme.json': strToU8(
        JSON.stringify({
          slug: 'vivid',
          name: 'Vivid',
          version,
          paid: { licenseServer: `${base}/v1`, purchaseUrl: 'https://shop.test/vivid' },
        }),
      ),
      'vivid/dist/index.js': strToU8(
        `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
export default sdk.defineTheme({ slug: 'vivid', name: 'Vivid', version: '${version}', menuLocations: {},
  templates: { index: () => h('main', null, 'vivid-theme ${version}') }, Layout: ({ children }) => h('html', null, h('body', null, children)), css: '' });`,
      ),
    }),
  );
}

function item(version: string) {
  const zip = themeZip(version);
  files.set(`/packages/vivid-${version}.zip`, zip);
  return {
    type: 'theme',
    slug: 'vivid',
    name: 'Vivid',
    summary: { en: 'A paid theme.' },
    version,
    license: 'GPL-2.0-or-later',
    author: 'Tests',
    download: `${base}/v1/download/vivid/${version}`,
    sha256: createHash('sha256').update(zip).digest('hex'),
    size: zip.length,
    updatedAt: released[version],
    paid: {
      price: { amount: 59, currency: 'EUR', per: 'site' },
      updatesMonths: 12,
      purchaseUrl: 'https://shop.test/vivid',
      licenseServer: `${base}/v1`,
    },
  };
}

function publish(items: unknown[]) {
  const body = Buffer.from(
    JSON.stringify({ schema: 1, generatedAt: '2026-10-11T00:00:00Z', items }),
  );
  files.set('/catalog.json', body);
  files.set('/catalog.json.sig', Buffer.from(sign(null, body, keys.privateKey).toString('base64')));
}

/** The license server: activate, status, deactivate, download-token. */
function licenseServer(action: string, body: Record<string, unknown>): [number, unknown] {
  license.calls.push({ action, body });
  const answer = (activation: string) => ({
    activation,
    updatesUntil: license.updatesUntil,
    seats: { used: license.activations.size, total: license.seats },
    renewUrl: 'https://shop.test/renew',
  });
  switch (action) {
    case 'activate': {
      if (body.key !== license.key) return [404, { message: 'Unknown license key.' }];
      const origin = String(body.siteOrigin);
      const known = [...license.activations].find(([, o]) => o === origin)?.[0];
      if (known) return [200, answer(known)];
      if (license.activations.size >= license.seats) {
        return [409, { message: 'All 1 sites of this license are in use.' }];
      }
      const token = randomBytes(24).toString('base64url');
      license.activations.set(token, origin);
      return [200, answer(token)];
    }
    case 'status':
      return license.activations.has(String(body.activation))
        ? [200, { status: 'active', ...answer(String(body.activation)) }]
        : [200, { status: 'unknown', updatesUntil: null, seats: null, renewUrl: null }];
    case 'deactivate':
      license.activations.delete(String(body.activation));
      return [200, { ok: true }];
    case 'download-token': {
      const version = String(body.version);
      if (body.demo) {
        return license.demo
          ? [200, { url: `download/vivid/${version}?t=demo`, updatesUntil: null }]
          : [403, { message: 'No demo for this theme.' }];
      }
      if (!license.activations.has(String(body.activation))) {
        return [403, { message: 'This site is not activated.' }];
      }
      if (released[version]! > license.updatesUntil) {
        return [
          402,
          {
            message: 'Updates for this license ended: renew to update.',
            updatesUntil: license.updatesUntil,
          },
        ];
      }
      return [200, { url: `download/vivid/${version}?t=ok`, updatesUntil: license.updatesUntil }];
    }
  }
  return [404, { message: 'Not found' }];
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const download = /^\/v1\/download\/vivid\/([\d.]+)$/.exec(url.pathname);
    if (download) {
      // Short-lived addresses only: redirected to the package, as to storage.
      if (!url.searchParams.get('t')) return void res.writeHead(403).end();
      return void res.writeHead(302, { location: `/packages/vivid-${download[1]}.zip` }).end();
    }
    if (req.method === 'POST' && url.pathname.startsWith('/v1/')) {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const [status, body] = licenseServer(url.pathname.slice(4), JSON.parse(raw));
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      });
      return;
    }
    const data = files.get(url.pathname);
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
  site = await seedSite(owner, 'paid');
  other = await seedSite(owner, 'paid-other');
  await seedUser(owner, {
    email: 'root@paid.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
    superAdmin: true,
  });
  await seedUser(owner, {
    email: 'admin@paid.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'admin@paid-other.test',
    password: PASSWORD,
    site: other,
    role: 'administrator',
  });
  root = new TestClient(app, site.host, '10.44.0.1');
  await root.login('root@paid.test', PASSWORD);
  admin = new TestClient(app, site.host, '10.44.0.2');
  await admin.login('admin@paid.test', PASSWORD);
  otherAdmin = new TestClient(app, other.host, '10.44.0.3');
  await otherAdmin.login('admin@paid-other.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
  server?.close();
});

const catalogItem = async () =>
  (await root.get('/api/v1/catalog?refresh=1')).json().items[0] as Record<string, unknown>;
/** The page once every process has reloaded the themes (installs notify them). */
async function homeShows(client: TestClient, text: string): Promise<string> {
  let body = '';
  for (let i = 0; i < 50; i++) {
    body = (await client.get('/')).body;
    if (body.includes(text)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return body;
}
const themeView = async (client: TestClient) =>
  (await client.get('/api/v1/themes')).json().find((t: { slug: string }) => t.slug === 'vivid');

describe('paid themes', () => {
  it('lists the price and installs the demo without a license', async () => {
    publish([item('1.0.0')]);
    expect(await catalogItem()).toMatchObject({
      paid: { price: { amount: 59, currency: 'EUR' } },
      siteLicense: null,
      renew: false,
    });
    const installed = await root.post('/api/v1/catalog/theme/vivid/install');
    expect(installed.statusCode).toBe(200);
    expect(license.calls.at(-1)).toMatchObject({
      action: 'download-token',
      body: { demo: true, slug: 'vivid', version: '1.0.0', siteOrigin: `http://${site.host}` },
    });
    expect(await themeView(admin)).toMatchObject({
      version: '1.0.0',
      paid: { purchaseUrl: 'https://shop.test/vivid', license: null },
    });
  });

  it('can be tried with Live Preview, not activated without a license', async () => {
    const preview = await admin.post('/api/v1/themes/vivid/preview', { path: '/' });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain('vivid-theme 1.0.0');
    // The site itself still shows its own theme.
    expect((await admin.get('/')).body).not.toContain('vivid-theme');

    const refused = await admin.post('/api/v1/themes/vivid/activate');
    expect(refused.statusCode).toBe(402);
    expect(refused.json().detail).toContain('license key');
  });

  it('activates a key for the site, then the theme', async () => {
    const malformed = await admin.request('PUT', '/api/v1/licenses/vivid', { key: 'ABCDE-12345' });
    expect(malformed.statusCode).toBe(400);
    expect(license.calls.some((c) => c.action === 'activate')).toBe(false);

    const unknown = await admin.request('PUT', '/api/v1/licenses/vivid', { key: newKey() });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().detail).toBe('Unknown license key.');

    const spaced = license.key.toLowerCase().replace(/(.{5})(?=.)/g, '$1 ');
    const activated = await admin.request('PUT', '/api/v1/licenses/vivid', { key: spaced });
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toMatchObject({
      slug: 'vivid',
      keyHint: license.key.slice(-5),
      updatesUntil: license.updatesUntil,
      seats: { used: 1, total: 1 },
    });
    expect(license.calls.at(-1)?.body).toMatchObject({
      key: license.key,
      siteOrigin: `http://${site.host}`,
      siteId: site.id,
    });
    // Never sent back, never stored in clear.
    const listed = await admin.get('/api/v1/licenses');
    expect(listed.body).not.toContain(license.key);
    const stored = await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .select({ value: settings.value })
        .from(settings)
        .where(and(eq(settings.namespace, 'licenses'), eq(settings.key, 'vivid'))),
    );
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(license.key);

    expect((await admin.post('/api/v1/themes/vivid/activate')).statusCode).toBe(204);
    expect((await admin.get('/')).body).toContain('vivid-theme 1.0.0');
  });

  it('needs a license per site: the other site cannot use this one', async () => {
    expect((await otherAdmin.post('/api/v1/themes/vivid/activate')).statusCode).toBe(402);
    const full = await otherAdmin.request('PUT', '/api/v1/licenses/vivid', { key: license.key });
    expect(full.statusCode).toBe(409);
    expect(full.json().detail).toContain('in use');
  });

  it('asks to renew for updates released after the license, until renewed', async () => {
    publish([item('1.1.0')]);
    expect(await catalogItem()).toMatchObject({ update: true, renew: true });
    const refused = await root.post('/api/v1/catalog/theme/vivid/install');
    expect(refused.statusCode).toBe(402);
    expect(refused.json().detail).toContain('renew');

    license.updatesUntil = '2027-12-31T00:00:00.000Z';
    const refreshed = await admin.post('/api/v1/licenses/vivid/refresh');
    expect(refreshed.json()).toMatchObject({ updatesUntil: license.updatesUntil });
    expect(await catalogItem()).toMatchObject({ update: true, renew: false });
    expect((await root.post('/api/v1/catalog/theme/vivid/install')).statusCode).toBe(200);
    expect(license.calls.at(-1)?.body).toMatchObject({ version: '1.1.0' });
    expect(license.calls.at(-1)?.body).not.toHaveProperty('demo');
    expect(await homeShows(admin, 'vivid-theme 1.1.0')).toContain('vivid-theme 1.1.0');
  });

  it('still checks the SHA-256 of the signed catalog', async () => {
    released['1.2.0'] = '2027-03-01T00:00:00Z';
    const tampered = item('1.2.0');
    files.set('/packages/vivid-1.2.0.zip', themeZip('1.2.1'));
    publish([tampered]);
    await catalogItem();
    const refused = await root.post('/api/v1/catalog/theme/vivid/install');
    expect(refused.statusCode).toBe(400);
    expect(refused.json().detail).toContain('SHA-256');
  });

  it('frees the seat on deactivation; the active theme keeps working', async () => {
    const removed = await admin.delete('/api/v1/licenses/vivid');
    expect(removed.json()).toEqual({ warning: null });
    expect(license.activations.size).toBe(0);
    expect((await themeView(admin)).paid.license).toBeNull();
    expect(await homeShows(admin, 'vivid-theme 1.1.0')).toContain('vivid-theme 1.1.0');
    // The seat can now go to the other site.
    expect(
      (await otherAdmin.request('PUT', '/api/v1/licenses/vivid', { key: license.key })).statusCode,
    ).toBe(200);
    expect((await otherAdmin.post('/api/v1/themes/vivid/activate')).statusCode).toBe(204);
  });

  it('keeps installed themes when the license server is down', async () => {
    server.close();
    server.closeAllConnections();
    const refresh = await otherAdmin.post('/api/v1/licenses/vivid/refresh');
    expect(refresh.statusCode).toBe(503);
    expect(refresh.json().detail).toContain('keep working');
    expect((await otherAdmin.get('/')).body).toContain('vivid-theme 1.1.0');
  });
});
