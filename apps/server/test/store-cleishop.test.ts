/**
 * Licenses sold by the site's own Cleishop (Store 1.5, Cleishop 1.22): a paid
 * order makes the license and emails the key, the renewal link carries the
 * license to the order line and adds a year once, a refund revokes it.
 * Store 1.6: a license made by hand is linked to its Cleishop order (made by
 * the store, named by id or by number) without a new key or an email.
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
    filter: (file) => !file.includes('node_modules') && !file.includes('.build-lock'),
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
  // Licenses are digital: supplied now, without the withdrawal (Cleishop 1.25).
  digitalConsent: '1',
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

  it('renew it also when the product sold new is bought again for it (1.6.1)', async () => {
    const [before] = await licensesOf('anna@example.test');
    const id = await buy(`/cart/add?product=${theme}&ref=${licenseId}`, '10.97.0.13');
    await setStatus(id, 'processing');
    await setStatus(id, 'completed');
    const after = await licensesOf('anna@example.test');
    // No second license: the same one, a year longer.
    expect(after).toHaveLength(1);
    const added = Date.parse(after[0]!.updatesUntil) - Date.parse(before!.updatesUntil);
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

describe('licenses given free with a 100% coupon (Cleishop 1.26)', () => {
  it('make the license of a free order at once, without a way to pay', async () => {
    const coupon = await admin.post(`${SHOP}/coupons`, {
      code: 'FIRSTYEAR',
      kind: 'percent',
      amount: '100',
    });
    expect(coupon.statusCode, coupon.body).toBe(201);
    const dario = new TestClient(app, host, '10.97.0.20');
    await dario.request('GET', `/cart/add?product=${theme}`);
    await dario.postForm('/cart/coupon', { code: 'firstyear' });
    const outbox = app.get(MailService).outbox;
    const before = outbox.length;
    const placed = await dario.postForm('/checkout', {
      ...billing,
      email: 'dario@example.test',
      'billing.firstName': 'Dario',
      payment: '',
    });
    expect(placed.statusCode, placed.body).toBe(303);
    const list = (await admin.get(`${SHOP}/orders`)).json();
    const order = (await admin.get(`${SHOP}/orders/${list.items[0].id}`)).json().order;
    expect(order).toMatchObject({ status: 'completed', total: '0.00', paymentMethod: 'free' });
    const [license] = await licensesOf('dario@example.test');
    expect(license).toMatchObject({ status: 'active', seats: 1, source: 'cleishop' });
    expect(
      outbox
        .slice(before)
        .some((m) => m.to === 'dario@example.test' && /[A-Z0-9]{5}-/.test(m.text)),
    ).toBe(true);
  });
});

describe('licenses made by hand, linked to their Cleishop order (Store 1.6)', () => {
  const outbox = () => app.get(MailService).outbox;
  const keyMails = (from: number) =>
    outbox()
      .slice(from)
      .filter((m) => /License key: /.test(m.text));

  async function manual(email: string) {
    const made = await admin.request('POST', `${STORE}/admin/licenses`, {
      productSlug: 'vivid',
      email,
      seats: 1,
      listPriceCents: 5900,
    });
    expect(made.statusCode, made.body).toBe(200);
    return made.json().id as string;
  }
  const link = (id: string, body: unknown) =>
    admin.request('POST', `${STORE}/admin/licenses/${id}/cleishop-order`, body);
  const licenses = async (email: string) =>
    (await admin.get(`${STORE}/admin/licenses?q=${encodeURIComponent(email)}`)).json() as {
      id: string;
      source: string;
      orderRef: string | null;
      status: string;
      links: { status: string; orderNumber: number; orderId: string }[];
    }[];

  it('makes the order in Cleishop from the license: no new key, no email, no hook', async () => {
    const id = await manual('bea@example.test');
    const before = outbox().length;
    const done = await link(id, {
      create: { firstName: 'Bea', lastName: 'Verdi', vatNumber: '01234567890', date: '2026-11-17' },
    });
    expect(done.statusCode, done.body).toBe(200);
    const orderId = done.json().link.orderId as string;
    expect(outbox().length).toBe(before);
    const order = (await admin.get(`${SHOP}/orders/${orderId}`)).json();
    expect(order.order).toMatchObject({ status: 'completed', email: 'bea@example.test' });
    expect(order.order.total).toBe('59.00');
    const [license] = await licenses('bea@example.test');
    expect(license).toMatchObject({ id, source: 'cleishop', status: 'active' });
    expect(license!.orderRef).toBe(`${orderId}:${order.items[0].id}`);
    expect(license!.links).toMatchObject([{ status: 'linked', orderId }]);
    // Again: the same order, the same link.
    const again = await link(id, { create: { date: '2026-11-17' } });
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().link.orderId).toBe(orderId);
    // Later status changes find the license there: no second one, no key.
    await setStatus(orderId, 'processing');
    await setStatus(orderId, 'completed');
    expect(await licenses('bea@example.test')).toHaveLength(1);
    expect(keyMails(before)).toEqual([]);
  });

  it('links an order of the checkout by the address of its page, before it is paid', async () => {
    const id = await manual('anna@example.test');
    const orderId = await buy(`/cart/add?product=${theme}`, '10.97.0.5');
    const before = outbox().length;
    const done = await link(id, {
      order: `https://${host}/admin/p/shop/orders?order=${orderId}`,
    });
    expect(done.statusCode, done.body).toBe(200);
    const count = (await licenses('anna@example.test')).length;
    await setStatus(orderId, 'processing');
    await setStatus(orderId, 'completed');
    expect(await licenses('anna@example.test')).toHaveLength(count);
    expect(keyMails(before)).toEqual([]);
    expect((await licenses('anna@example.test')).find((l) => l.id === id)?.source).toBe('cleishop');
  });

  it('waits for an order named by its number, then links it when it is paid', async () => {
    const id = await manual('anna@example.test');
    const orderId = await buy(`/cart/add?product=${theme}`, '10.97.0.6');
    const number = (await admin.get(`${SHOP}/orders/${orderId}`)).json().order.number as number;
    const done = await link(id, { order: `#${number}` });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json().link).toMatchObject({ status: 'pending', orderNumber: number });
    const count = (await licenses('anna@example.test')).length;
    const before = outbox().length;
    await setStatus(orderId, 'processing');
    const after = await licenses('anna@example.test');
    expect(after).toHaveLength(count);
    expect(after.find((l) => l.id === id)).toMatchObject({
      source: 'cleishop',
      links: [{ status: 'linked', orderNumber: number, orderId }],
    });
    expect(keyMails(before)).toEqual([]);
    // Refunded: the linked license is revoked, as one sold by the shop.
    await setStatus(orderId, 'refunded');
    expect((await licenses('anna@example.test')).find((l) => l.id === id)?.status).toBe('revoked');
  });

  it('refuses an order that already made its license', async () => {
    const orderId = await buy(`/cart/add?product=${theme}`, '10.97.0.7');
    await setStatus(orderId, 'processing');
    const id = await manual('anna@example.test');
    const done = await link(id, { order: orderId });
    expect(done.statusCode).toBe(409);
    expect((await licenses('anna@example.test')).find((l) => l.id === id)?.source).toBe('manual');
  });
});
