/**
 * The Store plugin as the license server of paid themes (RF-CAT-03), end to
 * end: a shop site runs Store, a customer site buys, activates and installs a
 * theme from the signed catalog through it, over HTTP. GitHub (private
 * releases) is a fake; Lemon Squeezy is played by signed webhooks.
 */
import { createHash, createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { cp, mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
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
const GITHUB_TOKEN = 'ghp_test_token_0123456789';
const LEMON_SECRET = 'lemon-signing-secret';
const keys = generateKeyPairSync('ed25519');

let app: NestFastifyApplication;
let owner: DatabaseClient;
let shop: SeededSite;
let customer: SeededSite;
let shopAdmin: TestClient;
let root: TestClient;
let github: Server;
let gh: string;
let storeUrl: string;
let lastKey = '';

/** Release dates and packages on the fake GitHub. */
const releases: Record<string, { published: string; zip: Buffer }> = {};
const githubCalls: { url: string; auth: string | undefined }[] = [];
let catalogFiles = new Map<string, Buffer>();

function themeZip(version: string) {
  return Buffer.from(
    zipSync({
      'vivid/theme.json': strToU8(
        JSON.stringify({
          slug: 'vivid',
          name: 'Vivid',
          version,
          paid: { licenseServer: storeUrl, purchaseUrl: 'https://shop.test/vivid' },
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

/** A version: built, "uploaded" to the private releases, listed in the signed catalog. */
function release(version: string, published: string) {
  const zip = themeZip(version);
  releases[version] = { published, zip };
  const body = Buffer.from(
    JSON.stringify({
      schema: 1,
      generatedAt: published,
      items: [
        {
          type: 'theme',
          slug: 'vivid',
          name: 'Vivid',
          summary: { en: 'A paid theme.' },
          version,
          license: 'GPL-2.0-or-later',
          author: 'Tests',
          download: `${storeUrl}/download/vivid/${version}`,
          sha256: createHash('sha256').update(zip).digest('hex'),
          size: zip.length,
          updatedAt: published,
          paid: {
            price: { amount: 59, currency: 'EUR', per: 'site' },
            updatesMonths: 12,
            purchaseUrl: 'https://shop.test/vivid',
            licenseServer: storeUrl,
          },
        },
      ],
    }),
  );
  catalogFiles = new Map([
    ['/catalog.json', body],
    ['/catalog.json.sig', Buffer.from(sign(null, body, keys.privateKey).toString('base64'))],
  ]);
}

function fakeGithub(): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    githubCalls.push({ url: url.pathname, auth: req.headers.authorization });
    const file = catalogFiles.get(url.pathname);
    if (file) return void res.writeHead(200).end(file);
    if (
      req.headers.authorization !== `Bearer ${GITHUB_TOKEN}` &&
      !url.pathname.startsWith('/s3/')
    ) {
      return void res.writeHead(401).end();
    }
    const tag = /^\/repos\/acme\/private-themes\/releases\/tags\/theme-vivid-([\d.]+)$/.exec(
      url.pathname,
    );
    if (tag) {
      const r = releases[tag[1]!];
      if (!r) return void res.writeHead(404).end();
      return void res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          published_at: r.published,
          assets: [{ name: `cleitext-theme-vivid-${tag[1]}.zip`, url: `${gh}/assets/${tag[1]}` }],
        }),
      );
    }
    const asset = /^\/assets\/([\d.]+)$/.exec(url.pathname);
    if (asset && req.headers.accept === 'application/octet-stream') {
      return void res.writeHead(302, { location: `${gh}/s3/${asset[1]}?signed=1` }).end();
    }
    const s3 = /^\/s3\/([\d.]+)$/.exec(url.pathname);
    if (s3 && releases[s3[1]!]) return void res.writeHead(200).end(releases[s3[1]!]!.zip);
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** A call from another server: no Origin, no session. */
async function call(method: 'GET' | 'POST', path: string, body?: unknown, headers = {}) {
  const res = await fetch(`${storeUrl}${path}`, {
    method,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // not JSON
  }
  return { status: res.status, json, headers: res.headers };
}

function lemon(event: string, data: Record<string, unknown>, custom: Record<string, unknown> = {}) {
  const raw = JSON.stringify({
    meta: { event_name: event, custom_data: custom },
    data: { type: 'orders', ...data },
  });
  return call('POST', '/webhooks/lemonsqueezy', raw, {
    'x-signature': createHmac('sha256', LEMON_SECRET).update(raw).digest('hex'),
  });
}

const paidOrder = (id: string, variant: number, email = 'buyer@example.com') => ({
  id,
  attributes: {
    status: 'paid',
    user_email: email,
    user_name: 'Ada Buyer',
    first_order_item: { variant_id: variant, quantity: 1 },
  },
});

function mailedKey(): string {
  const mail = app.get(MailService).outbox.at(-1)!;
  const key = /License key: ([0-9A-Z-]{29})/.exec(mail.text)?.[1];
  expect(key).toBeTruthy();
  return key!;
}

beforeAll(async () => {
  github = await fakeGithub();
  gh = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;

  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'store-src-')), 'store');
  await cp(join(pluginsRoot, 'store'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });

  app = await startTestApp({
    pluginsPath,
    env: {
      DATABASE_ADMIN_URL: inject('ownerUrl'),
      THEMES_PATH: await mkdtemp(join(tmpdir(), 'cleitext-themes-')),
      CATALOG_URL: `${gh}/catalog.json`,
      CATALOG_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    },
  });
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  storeUrl = `http://127.0.0.1:${port}/api/v1/ext/store/v1`;

  // The shop answers on 127.0.0.1, as cleitext.com would on its domain.
  shop = await seedSite(owner, 'shop', { aliases: ['127.0.0.1'] });
  customer = await seedSite(owner, 'customer');
  await seedUser(owner, {
    email: 'admin@shop.test',
    password: PASSWORD,
    site: shop,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'root@customer.test',
    password: PASSWORD,
    site: customer,
    role: 'administrator',
    superAdmin: true,
  });
  shopAdmin = new TestClient(app, shop.host, '10.90.0.1');
  await shopAdmin.login('admin@shop.test', PASSWORD);
  root = new TestClient(app, customer.host, '10.90.0.2');
  await root.login('root@customer.test', PASSWORD);
  expect((await shopAdmin.post('/api/v1/plugins/store/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
  github?.close();
});

const ext = (path: string) => `/api/v1/ext/store${path}`;

describe('Store', () => {
  it('is set up from its admin page', async () => {
    const settings = await shopAdmin.request('PATCH', '/api/v1/plugins/store/settings', {
      github_repo: 'acme/private-themes',
      github_api: gh,
    });
    expect(settings.statusCode, settings.body).toBe(200);
    for (const [name, value] of [
      ['githubToken', GITHUB_TOKEN],
      ['lemonSqueezySecret', LEMON_SECRET],
    ]) {
      expect(
        (await shopAdmin.request('PUT', ext(`/admin/secrets/${name}`), { value })).statusCode,
      ).toBe(200);
    }
    const product = await shopAdmin.request('PUT', ext('/admin/products/vivid'), {
      name: 'Vivid',
      updatesMonths: 12,
      demo: true,
      renewUrl: 'https://shop.test/checkout/renew',
    });
    expect(product.statusCode, product.body).toBe(200);
    for (const v of [
      { variantId: '101', productSlug: 'vivid', seats: 1, kind: 'new' },
      { variantId: '105', productSlug: 'vivid', seats: 5, kind: 'new' },
      { variantId: '201', productSlug: 'vivid', seats: 0, kind: 'renewal' },
    ]) {
      expect((await shopAdmin.request('PUT', ext('/admin/variants'), v)).statusCode).toBe(200);
    }
    const overview = (await shopAdmin.get(ext('/admin/overview'))).json();
    expect(overview).toMatchObject({
      repo: 'acme/private-themes',
      secrets: { githubToken: true, lemonSqueezySecret: true },
    });
    expect(overview.variants).toHaveLength(3);
    // Secrets are never sent back.
    expect(JSON.stringify(overview)).not.toContain(GITHUB_TOKEN);
  });

  it('gives the demo to a site without a license, through the catalog', async () => {
    release('1.0.0', new Date(Date.now() - 86_400_000).toISOString());
    const view = (await root.get('/api/v1/catalog?refresh=1')).json();
    expect(view.error).toBeNull();
    const installed = await root.post('/api/v1/catalog/theme/vivid/install');
    expect(installed.statusCode, installed.body).toBe(200);
    // The package came from the private release, with the token.
    expect(
      githubCalls.some((c) => c.url === '/assets/1.0.0' && c.auth === `Bearer ${GITHUB_TOKEN}`),
    ).toBe(true);
    expect((await root.post('/api/v1/themes/vivid/activate')).statusCode).toBe(402);
    const downloads = (await shopAdmin.get(ext('/admin/overview'))).json().downloads;
    expect(downloads[0]).toMatchObject({ productSlug: 'vivid', version: '1.0.0', licenseId: null });
  });

  it('refuses webhooks that are not signed by Lemon Squeezy', async () => {
    const raw = JSON.stringify({
      meta: { event_name: 'order_created' },
      data: paidOrder('1', 101),
    });
    expect((await call('POST', '/webhooks/lemonsqueezy', raw)).status).toBe(401);
    expect(
      (await call('POST', '/webhooks/lemonsqueezy', raw, { 'x-signature': 'ab'.repeat(32) }))
        .status,
    ).toBe(401);
  });

  it('sells a license: the key is emailed once, even when the webhook comes twice', async () => {
    const outbox = app.get(MailService).outbox;
    const before = outbox.length;
    const sold = await lemon('order_created', paidOrder('9001', 101));
    expect(sold.status).toBe(200);
    expect(sold.json.license).toBeTruthy();
    lastKey = mailedKey();
    expect(outbox.at(-1)).toMatchObject({ to: 'buyer@example.com' });
    expect((await lemon('order_created', paidOrder('9001', 101))).json).toMatchObject({
      duplicate: true,
    });
    expect(outbox.length).toBe(before + 1);
    // Variants of other products are acknowledged and ignored.
    expect((await lemon('order_created', paidOrder('9002', 999))).json).toMatchObject({
      ignored: true,
    });
  });

  it('activates the key on the customer site; its seat is taken', async () => {
    const activated = await root.request('PUT', '/api/v1/licenses/vivid', { key: lastKey });
    expect(activated.statusCode, activated.body).toBe(200);
    expect(activated.json()).toMatchObject({
      seats: { used: 1, total: 1 },
      renewUrl: expect.stringContaining('checkout%5Bcustom%5D%5Blicense%5D='),
    });
    expect((await root.post('/api/v1/themes/vivid/activate')).statusCode).toBe(200);

    // Another site cannot use the same key.
    const elsewhere = await call('POST', '/activate', {
      key: lastKey,
      slug: 'vivid',
      siteOrigin: 'https://other.example',
    });
    expect(elsewhere.status).toBe(409);
    // The same site again keeps its seat.
    const again = await root.request('PUT', '/api/v1/licenses/vivid', { key: lastKey });
    expect(again.json().seats).toEqual({ used: 1, total: 1 });
    // Wrong theme, unknown and malformed keys.
    expect(
      (
        await call('POST', '/activate', {
          key: lastKey,
          slug: 'other',
          siteOrigin: 'https://x.example',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('POST', '/activate', {
          key: 'nope',
          slug: 'vivid',
          siteOrigin: 'https://x.example',
        })
      ).status,
    ).toBe(400);
  });

  it('sends updates covered by the license, and asks to renew after', async () => {
    release('1.1.0', new Date(Date.now() - 3_600_000).toISOString());
    expect((await root.get('/api/v1/catalog?refresh=1')).json().items[0]).toMatchObject({
      update: true,
      renew: false,
    });
    expect((await root.post('/api/v1/catalog/theme/vivid/install')).statusCode).toBe(200);

    // A version released after the year of updates.
    release('2.0.0', new Date(Date.now() + 400 * 86_400_000).toISOString());
    expect((await root.get('/api/v1/catalog?refresh=1')).json().items[0]).toMatchObject({
      renew: true,
    });
    const refused = await root.post('/api/v1/catalog/theme/vivid/install');
    expect(refused.statusCode).toBe(402);
    expect(refused.json().detail).toContain('renew');

    // The renewal checkout carries the license id: a year more from the end.
    const license = (await shopAdmin.get(ext(`/admin/licenses?q=${lastKey.slice(-5)}`))).json()[0];
    const renewed = await lemon('order_created', paidOrder('9003', 201), { license: license.id });
    expect(renewed.json).toMatchObject({ renewed: true });
    const refreshed = (await root.post('/api/v1/licenses/vivid/refresh')).json();
    expect(Date.parse(refreshed.updatesUntil)).toBeGreaterThan(Date.now() + 700 * 86_400_000);
    expect((await root.post('/api/v1/catalog/theme/vivid/install')).statusCode).toBe(200);
  });

  it('only serves signed, fresh download addresses', async () => {
    expect((await call('GET', '/download/vivid/2.0.0')).status).toBe(403);
    expect(
      (await call('GET', '/download/vivid/2.0.0?ref=demo&exp=9999999999&sig=forged')).status,
    ).toBe(403);
    const demo = await call('POST', '/download-token', {
      demo: true,
      slug: 'vivid',
      version: '2.0.0',
      siteOrigin: 'https://try.example',
    });
    expect(demo.status).toBe(200);
    const url = new URL(String(demo.json.url), `${storeUrl}/`);
    const download = await fetch(url, { redirect: 'manual' });
    expect(download.status).toBe(302);
    expect(download.headers.get('location')).toContain('/s3/2.0.0');
    // Another version with the same signature is refused.
    const other = await fetch(url.href.replace('/2.0.0?', '/1.0.0?'), { redirect: 'manual' });
    expect(other.status).toBe(403);
  });

  it('revokes the license on refund; the site keeps the theme', async () => {
    expect((await lemon('order_refunded', { id: '9001', attributes: {} })).json).toMatchObject({
      revoked: 1,
    });
    const refresh = await root.post('/api/v1/licenses/vivid/refresh');
    expect(refresh.statusCode).toBe(400);
    expect(refresh.json().detail).toContain('revoked');
    expect((await root.get('/api/v1/licenses')).json()).toEqual([]);
    const page = (await root.get('/')).body;
    expect(page).toContain('vivid-theme 2.0.0');
  });

  it('makes licenses by hand, for any number of sites', async () => {
    const made = await shopAdmin.post(ext('/admin/licenses'), {
      productSlug: 'vivid',
      email: 'friend@example.com',
      seats: 0,
      send: false,
    });
    expect(made.statusCode, made.body).toBe(200);
    const { key, id } = made.json();
    for (const origin of ['https://a.example', 'https://b.example', 'https://c.example']) {
      expect(
        (await call('POST', '/activate', { key, slug: 'vivid', siteOrigin: origin })).status,
      ).toBe(200);
    }
    const sites = (await shopAdmin.get(ext(`/admin/licenses/${id}/activations`))).json();
    expect(sites).toHaveLength(3);
    // Freeing a seat from the admin: the site's token stops working.
    expect(
      (await shopAdmin.post(ext(`/admin/activations/${sites[0].id}/deactivate`))).statusCode,
    ).toBe(200);
    const listed = (await shopAdmin.get(ext('/admin/licenses?q=friend'))).json();
    expect(listed[0], JSON.stringify(listed)).toMatchObject({ used: 2, seats: 0 });
    expect(listed[0]).not.toHaveProperty('keyHash');
  });

  it('keeps the reports of the sites: plugins and themes by version and site', async () => {
    const report = {
      installId: '0b6f2a8e-3c1d-4e5f-8a9b-0c1d2e3f4a5b',
      origin: 'https://customer.example.com',
      core: '0.37.0',
      theme: { slug: 'vivid', version: '1.0.0' },
      plugins: [{ slug: 'seo', version: '1.3.0', active: true }],
      themes: [{ slug: 'vivid', version: '1.0.0' }],
    };
    expect((await call('POST', '/report', report)).status).toBe(204);
    expect((await call('POST', '/report', { ...report, core: '0.37.1' })).status).toBe(204);
    expect((await call('POST', '/report', { origin: 'https://x.test' })).status).toBe(400);
    // Development and test addresses are taken and dropped.
    expect(
      (await call('POST', '/report', { ...report, origin: 'http://site-3.test' })).status,
    ).toBe(204);
    const rows = (await shopAdmin.get(ext('/admin/installs'))).json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      origin: 'https://customer.example.com',
      coreVersion: '0.37.1',
      themeSlug: 'vivid',
      plugins: [{ slug: 'seo', version: '1.3.0', active: true }],
    });
    expect((await root.get(ext('/admin/installs'))).statusCode).toBe(404);
  });

  it('publishes free files: immutable versions, a manifest of the highest, the bytes as uploaded', async () => {
    // Public addresses of the shop, on its own host name.
    const get = (url: string) =>
      app.inject({ method: 'GET', url, headers: { host: shop.host }, remoteAddress: '10.90.0.7' });
    const toolkit = await shopAdmin.request('PUT', ext('/admin/products/cleitext-toolkit'), {
      name: 'Cleitext Toolkit',
      updatesMonths: 12,
      demo: false,
    });
    expect(toolkit.statusCode, toolkit.body).toBe(200);
    const pack = (version: string) =>
      Buffer.from(
        zipSync({ 'meta.xml': strToU8(`<module><version>${version}</version></module>`) }),
      );
    const upload = (version: string, name: string, data: Buffer) =>
      shopAdmin.upload(
        ext(`/admin/products/cleitext-toolkit/files?version=${encodeURIComponent(version)}`),
        name,
        data,
        'application/zip',
      );
    const v6 = pack('0.6.0');
    const first = await upload('0.6.0-1', 'cleitext-toolkit-0.6.0-1.zip', v6);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      sha256: createHash('sha256').update(v6).digest('hex'),
      size: v6.length,
    });
    // An older version uploaded later does not become the latest.
    expect(
      (await upload('0.5.1-1', 'cleitext-toolkit-0.5.1-1.zip', pack('0.5.1'))).statusCode,
    ).toBe(200);
    // Published files never change.
    expect((await upload('0.6.0-1', 'other-name.zip', pack('x'))).statusCode).toBe(409);
    expect((await upload('0.6.1-1', 'cleitext-toolkit-0.6.0-1.zip', pack('x'))).statusCode).toBe(
      409,
    );
    expect(
      (await upload('0.7.0-1', 'evil.zip', Buffer.from('<?php system($_GET[1]); ?>'.padEnd(64))))
        .statusCode,
    ).toBe(400);
    expect((await upload('latest', 'a.zip', pack('x'))).statusCode).toBe(400);
    expect(
      (
        await shopAdmin.upload(
          ext('/admin/products/unknown/files?version=1.0.0'),
          'a.zip',
          pack('x'),
        )
      ).statusCode,
    ).toBe(400);

    const manifest = await get('/downloads/cleitext-toolkit/latest.json');
    expect(manifest.statusCode, manifest.body).toBe(200);
    expect(manifest.headers['cache-control']).toBe('public, max-age=300');
    const latest = manifest.json() as Record<string, unknown>;
    expect(latest).toMatchObject({
      slug: 'cleitext-toolkit',
      name: 'Cleitext Toolkit',
      version: '0.6.0-1',
      file: 'cleitext-toolkit-0.6.0-1.zip',
      size: v6.length,
      sha256: createHash('sha256').update(v6).digest('hex'),
    });
    expect(typeof latest.publishedAt).toBe('string');
    // The site's own address (here the shop's primary host).
    expect(latest.url).toMatch(
      /^https?:\/\/[^/]+\/downloads\/cleitext-toolkit\/cleitext-toolkit-0\.6\.0-1\.zip$/,
    );
    const fileUrl = '/downloads/cleitext-toolkit/cleitext-toolkit-0.6.0-1.zip';

    const file = await get(fileUrl);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/zip');
    expect(file.headers['content-disposition']).toContain('cleitext-toolkit-0.6.0-1.zip');
    expect(createHash('sha256').update(file.rawPayload).digest('hex')).toBe(latest.sha256);
    expect((await get('/downloads/cleitext-toolkit/nope.zip')).statusCode).toBe(404);
    expect((await get('/downloads/vivid/latest.json')).statusCode).toBe(404);

    const listed = (await shopAdmin.get(ext('/admin/files'))).json() as Record<string, unknown>[];
    expect(listed).toHaveLength(2);
    expect(listed.find((f) => f.version === '0.6.0-1')).toMatchObject({ downloads: 1 });
    expect(JSON.stringify(listed)).not.toContain('"data"');

    // Deleted: the previous version becomes the latest.
    const removed = await shopAdmin.request(
      'DELETE',
      ext('/admin/products/cleitext-toolkit/files/0.6.0-1'),
    );
    expect(removed.statusCode).toBe(200);
    const after = (await get('/downloads/cleitext-toolkit/latest.json')).json() as Record<
      string,
      unknown
    >;
    expect(after.version).toBe('0.5.1-1');
    expect((await get(fileUrl)).statusCode).toBe(404);
    expect((await root.get(ext('/admin/files'))).statusCode).toBe(404);
  });

  it('keeps anonymous server reports of the Toolkit, and forgets a server on request', async () => {
    const server = createHash('sha256').update('a server').digest('hex');
    const report = {
      product: 'cleitext-toolkit',
      server,
      version: '0.6.0',
      panel: 'plesk',
      panelVersion: '18.0.81',
      installations: 2,
      domain: 'should-not-be-kept.example',
    };
    expect((await call('POST', '/server-report', report)).status).toBe(204);
    expect((await call('POST', '/server-report', { ...report, installations: 5 })).status).toBe(
      204,
    );
    expect(
      (await call('POST', '/server-report', { ...report, server: 'b'.repeat(64) })).status,
    ).toBe(204);
    expect((await call('POST', '/server-report', { ...report, server: 'x' })).status).toBe(400);
    expect((await call('POST', '/server-report', { ...report, product: 'nothing' })).status).toBe(
      400,
    );
    const rows = (await shopAdmin.get(ext('/admin/server-reports'))).json() as Record<
      string,
      unknown
    >[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.serverHash === server)).toMatchObject({
      productSlug: 'cleitext-toolkit',
      productVersion: '0.6.0',
      panel: 'plesk',
      panelVersion: '18.0.81',
      installations: 5,
    });
    expect(JSON.stringify(rows)).not.toContain('should-not-be-kept');
    expect(
      (await call('POST', '/server-report', { product: 'cleitext-toolkit', server, forget: true }))
        .status,
    ).toBe(204);
    const left = (await shopAdmin.get(ext('/admin/server-reports'))).json() as unknown[];
    expect(left).toHaveLength(1);
    expect((await root.get(ext('/admin/server-reports'))).statusCode).toBe(404);
    const visitor = new TestClient(app, shop.host, '10.90.0.9');
    expect((await visitor.get(ext('/admin/server-reports'))).statusCode).toBe(401);
  });

  it('keeps the admin API for store managers only', async () => {
    expect((await root.get(ext('/admin/overview'))).statusCode).toBe(404);
    const visitor = new TestClient(app, shop.host, '10.90.0.9');
    expect((await visitor.get(ext('/admin/overview'))).statusCode).toBe(401);
  });
});
