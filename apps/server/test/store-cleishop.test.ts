/**
 * Licenses sold by the site's own Cleishop (Store 1.5, Cleishop 1.22): a paid
 * order makes the license and emails the key, the renewal link carries the
 * license to the order line and adds a year once, a refund revokes it.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const SHOP = '/api/v1/ext/shop';
const STORE = '/api/v1/ext/store';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let host: string;
let theme: string;
let renewal: string;

async function install(slug: string, pluginsPath: string, appRole: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, { source, pluginsPath, appRole });
}

async function product(title: string, data: Record<string, unknown>) {
  const { id } = (await admin.post('/api/v1/entries', { type: 'product', title })).json() as {
    id: string;
  };
  const saved = await admin.request('PUT', `${SHOP}/products/${id}`, { product: data });
  expect(saved.statusCode, saved.body).toBe(200);
  expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
  return id;
}

const billing = {
  email: 'Anna@Example.test',
  'billing.firstName': 'Anna',
  'billing.lastName': 'Rossi',
  'billing.address1': 'Via Roma 1',
  'billing.city': 'Varazze',
  'billing.postcode': '17019',
  'billing.province': 'Savona',
  'billing.country': 'IT',
  'billing.phone': '019 123456',
  payment: 'bacs',
  terms: '1',
};

/** Buys through a link (as the renewal email's), pays by bank transfer: the order id. */
async function buy(link: string, ip: string): Promise<string> {
  const anna = new TestClient(app, host, ip);
  const added = await anna.request('GET', link);
  expect(added.statusCode, added.body).toBe(303);
  const placed = await anna.postForm('/checkout', billing);
  expect(placed.statusCode, placed.body).toBe(303);
  const list = (await admin.get(`${SHOP}/orders`)).json();
  return list.items[0].id as string;
}

const setStatus = async (id: string, status: string) => {
  const done = await admin.request('PATCH', `${SHOP}/orders/${id}/status`, { status });
  expect(done.statusCode, done.body).toBe(200);
};

const licensesOf = async (email: string) =>
  (await admin.get(`${STORE}/admin/licenses?q=${encodeURIComponent(email)}`)).json() as {
    id: string;
    status: string;
    seats: number;
    updatesUntil: string;
    source: string;
  }[];

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const appRole = new URL(inject('appUrl')).username;
  for (const slug of ['shop', 'store']) await install(slug, pluginsPath, appRole);
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'store-cleishop');
  host = site.host;
  await seedUser(owner, {
    email: 'admin@store-cleishop.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, host, '10.97.0.1');
  await admin.login('admin@store-cleishop.test', PASSWORD);
  for (const slug of ['shop', 'store'])
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
    termsUrl: 'http://store-cleishop.test/terms',
  });
  const payments = await admin.request('PUT', `${SHOP}/payments`, {
    bacs: {
      enabled: true,
      accounts: [{ accountName: 'Molinari', iban: 'IT60X0542811101000000123456' }],
    },
  });
  expect(payments.statusCode, payments.body).toBe(200);
  theme = await product('Vivid', { sku: 'VIVID-1', regularPrice: '59', virtual: true });
  renewal = await product('Vivid renewal', { sku: 'VIVID-R', regularPrice: '29', virtual: true });
  const made = await admin.request('PUT', `${STORE}/admin/products/vivid`, {
    name: 'Vivid',
    updatesMonths: 12,
    renewUrl: `https://${host}/cart/add?product=${renewal}`,
  });
  expect(made.statusCode, made.body).toBe(200);
  for (const v of [
    { provider: 'cleishop', variantId: theme, productSlug: 'vivid', seats: 1, kind: 'new' },
    { provider: 'cleishop', variantId: renewal, productSlug: 'vivid', seats: 0, kind: 'renewal' },
  ])
    expect((await admin.request('PUT', `${STORE}/admin/variants`, v)).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('licenses sold with Cleishop', () => {
  let licenseId: string;
  let until: number;

  it('wait for the bank transfer, then make the license and email the key', async () => {
    const id = await buy(`/cart/add?product=${theme}`, '10.97.0.2');
    expect(await licensesOf('anna@example.test')).toEqual([]);
    const outbox = app.get(MailService).outbox;
    const before = outbox.length;
    await setStatus(id, 'processing');
    const [license] = await licensesOf('anna@example.test');
    expect(license).toMatchObject({ status: 'active', seats: 1, source: 'cleishop' });
    licenseId = license!.id;
    until = Date.parse(license!.updatesUntil);
    expect(
      outbox.slice(before).some((m) => m.to === 'anna@example.test' && /[A-Z0-9]{5}-/.test(m.text)),
    ).toBe(true);
    // Completed later: still one license.
    await setStatus(id, 'completed');
    expect(await licensesOf('anna@example.test')).toHaveLength(1);
  });

  it('renew the license the link names, once', async () => {
    const id = await buy(`/cart/add?product=${renewal}&ref=${licenseId}`, '10.97.0.3');
    const line = (await admin.get(`${SHOP}/orders/${id}`)).json().items[0];
    expect(line.ref).toBe(licenseId);
    await setStatus(id, 'processing');
    await setStatus(id, 'completed');
    const [license] = await licensesOf('anna@example.test');
    const added = Date.parse(license!.updatesUntil) - until;
    expect(added).toBeGreaterThan(360 * 86_400_000);
    expect(added).toBeLessThan(370 * 86_400_000);
  });

  it('revoke the license of a refunded order', async () => {
    const id = await buy(`/cart/add?product=${theme}`, '10.97.0.4');
    await setStatus(id, 'processing');
    expect(
      (await licensesOf('anna@example.test')).filter((l) => l.status === 'active'),
    ).toHaveLength(2);
    await setStatus(id, 'refunded');
    const statuses = (await licensesOf('anna@example.test')).map((l) => l.status).sort();
    expect(statuses).toEqual(['active', 'revoked']);
  });
});
