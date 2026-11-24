/**
 * Internal and external installations (Store 1.6): reports of sites on our
 * own domains and servers are internal, by the editable list of the Store's
 * settings; the others external. Shown with a filter, and marked by hand.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const STORE = '/api/v1/ext/store';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let host: string;

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'store-src-')), 'store');
  await cp(join(pluginsRoot, 'store'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules') && !file.includes('.build-lock'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'store-internal');
  host = site.host;
  await seedUser(owner, {
    email: 'admin@store-internal.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, host, '10.96.0.1');
  await admin.login('admin@store-internal.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/store/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

/** A site reports from a server (its address). */
async function report(origin: string, installId: string, ip: string) {
  const response = await app.inject({
    method: 'POST',
    url: `${STORE}/v1/report`,
    headers: { host },
    remoteAddress: ip,
    payload: { installId, origin, core: '0.115.0', theme: null, plugins: [], themes: [] },
  });
  expect(response.statusCode, response.body).toBe(204);
}

type Row = {
  origin: string;
  internal: boolean;
  internalReason: string | null;
  manual: boolean | null;
  serverIp: string | null;
};
const installs = async (scope = '') =>
  (await admin.get(`${STORE}/admin/installs${scope ? `?scope=${scope}` : ''}`)).json() as Row[];
const kinds = (rows: Row[]) =>
  Object.fromEntries(rows.map((r) => [r.origin, [r.internal, r.internalReason]]));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('internal and external installations', () => {
  it('classifies with the default list: our domains and their installations', async () => {
    await report('https://staging.2clic.it', A, '10.96.1.1');
    await report('https://client-on-our-server.com', A, '10.96.1.1');
    await report('https://www.sitoup.it', B, '10.96.2.1');
    await report('https://customer.example.com', C, '10.96.3.1');
    const rows = await installs();
    expect(kinds(rows)).toEqual({
      'https://staging.2clic.it': [true, 'origin'],
      'https://client-on-our-server.com': [true, 'installation'],
      'https://www.sitoup.it': [true, 'origin'],
      'https://customer.example.com': [false, null],
    });
    expect(rows.find((r) => r.origin === 'https://customer.example.com')?.serverIp).toBe(
      '10.96.3.1',
    );
  });

  it('filters internal and external installations', async () => {
    expect((await installs('internal')).map((r) => r.origin).sort()).toEqual([
      'https://client-on-our-server.com',
      'https://staging.2clic.it',
      'https://www.sitoup.it',
    ]);
    expect((await installs('external')).map((r) => r.origin)).toEqual([
      'https://customer.example.com',
    ]);
  });

  it('follows an edited list, with server addresses', async () => {
    const saved = await admin.request('PATCH', '/api/v1/plugins/store/settings', {
      internal_hosts: '*.2clic.it\n10.96.3.0/24',
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(kinds(await installs())).toEqual({
      'https://staging.2clic.it': [true, 'origin'],
      'https://client-on-our-server.com': [true, 'installation'],
      'https://www.sitoup.it': [false, null],
      'https://customer.example.com': [true, 'address'],
    });
  });

  it('marks a site by hand, kept across its reports, and back to the list', async () => {
    const mark = (origin: string, internal: boolean | null) =>
      admin.request('PUT', `${STORE}/admin/installs/internal`, { origin, internal });
    expect((await mark('https://customer.example.com', false)).statusCode).toBe(200);
    await report('https://customer.example.com', C, '10.96.3.1');
    let row = (await installs()).find((r) => r.origin === 'https://customer.example.com');
    expect(row).toMatchObject({ internal: false, internalReason: 'manual', manual: false });
    expect((await mark('https://customer.example.com', null)).statusCode).toBe(200);
    row = (await installs()).find((r) => r.origin === 'https://customer.example.com');
    expect(row).toMatchObject({ internal: true, internalReason: 'address', manual: null });
    expect((await mark('https://unknown.example.com', true)).statusCode).toBe(404);
  });

  it('shows the sites of a license as internal or external', async () => {
    const product = await admin.request('PUT', `${STORE}/admin/products/vivid`, {
      name: 'Vivid',
      updatesMonths: 12,
    });
    expect(product.statusCode, product.body).toBe(200);
    const made = await admin.request('POST', `${STORE}/admin/licenses`, {
      productSlug: 'vivid',
      email: 'eva@example.com',
      seats: 0,
    });
    const key = made.json().key as string;
    for (const siteOrigin of ['https://staging.2clic.it', 'https://shop.elsewhere.com']) {
      const activated = await app.inject({
        method: 'POST',
        url: `${STORE}/v1/activate`,
        headers: { host },
        remoteAddress: '10.96.9.9',
        payload: { key, slug: 'vivid', siteOrigin },
      });
      expect(activated.statusCode, activated.body).toBe(200);
    }
    const [license] = (await admin.get(`${STORE}/admin/licenses?q=eva@example.com`)).json();
    expect(license.sites).toEqual({ internal: 1, external: 1 });
    const sites = (await admin.get(`${STORE}/admin/licenses/${license.id}/activations`)).json();
    expect(
      Object.fromEntries(
        sites.map((s: { siteOrigin: string; internal: boolean }) => [s.siteOrigin, s.internal]),
      ),
    ).toEqual({ 'https://staging.2clic.it': true, 'https://shop.elsewhere.com': false });
  });
});
