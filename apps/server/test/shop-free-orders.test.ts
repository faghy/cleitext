/**
 * Cleishop 1.26: free orders. A 100% coupon (with free shipping when
 * something ships) makes the total 0: the checkout asks for no way to pay,
 * places the order without any provider, paid at once (completed for virtual
 * products, processing otherwise), and keeps the customer's details.
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
let ebook: string;
let mug: string;
const rate: Record<string, string> = {};

const ext = (path: string) => `/api/v1/ext/shop${path}`;

async function product(title: string, data: Record<string, unknown>) {
  const { id } = (await admin.post('/api/v1/entries', { type: 'product', title })).json() as {
    id: string;
  };
  const saved = await admin.request('PUT', ext(`/products/${id}`), { product: data });
  expect(saved.statusCode, saved.body).toBe(200);
  expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
  return id;
}

const billing = (email: string, extra: Record<string, string> = {}) => ({
  email,
  'billing.firstName': 'Anna',
  'billing.lastName': 'Rossi',
  'billing.address1': 'Via Roma 1',
  'billing.city': 'Varazze',
  'billing.postcode': '17019',
  'billing.province': 'Savona',
  'billing.country': 'IT',
  'billing.phone': '019 123456',
  terms: '1',
  ...extra,
});

const latestOrder = async () => {
  const list = (await admin.get(ext('/orders'))).json();
  return (await admin.get(ext(`/orders/${list.items[0].id}`))).json();
};

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'shop-src-')), 'shop');
  await cp(join(pluginsRoot, 'shop'), source, {
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
  site = await seedSite(owner, 'shop-free');
  await seedUser(owner, {
    email: 'admin@shop-free.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'bea@shop-free.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
  });
  admin = new TestClient(app, site.host, '10.94.0.1');
  await admin.login('admin@shop-free.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
  expect(
    (
      await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
        termsUrl: 'http://shop-free.test/terms',
        notifyEmail: 'orders@shop-free.test',
      })
    ).statusCode,
  ).toBe(200);
  const payments = await admin.request('PUT', ext('/payments'), {
    bacs: {
      enabled: true,
      accounts: [{ accountName: 'Bottega Srl', iban: 'IT60X0542811101000000123456' }],
    },
    cod: { enabled: true, fee: '3' },
  });
  expect(payments.statusCode, payments.body).toBe(200);
  const shipping = await admin.request('PUT', ext('/shipping'), {
    zones: [
      {
        name: 'Italy',
        regions: [{ country: 'IT' }],
        methods: [
          { title: 'Courier', settings: { kind: 'flat', cost: '7' } },
          { title: 'Free shipping', settings: { kind: 'free', requires: 'coupon' } },
        ],
      },
    ],
  });
  expect(shipping.statusCode, shipping.body).toBe(200);
  for (const m of shipping.json().zones[0].methods) rate[m.title] = m.id;
  for (const coupon of [
    { code: 'FIRSTYEAR', kind: 'percent', amount: '100' },
    { code: 'ALLFREE', kind: 'percent', amount: '100', freeShipping: true },
  ])
    expect((await admin.post(ext('/coupons'), coupon)).statusCode).toBe(201);
  ebook = await product('E-book', { sku: 'EBOOK', regularPrice: '59', virtual: true });
  mug = await product('Mug', { sku: 'MUG', regularPrice: '12', manageStock: true, stock: 5 });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('free orders', () => {
  const visitor = (ip: string) => new TestClient(app, site.host, ip);

  it('place a 100%-coupon order of digital products without a way to pay, completed', async () => {
    const anna = visitor('10.94.0.2');
    await anna.postForm('/cart/add', { product: ebook, quantity: '1' });
    await anna.postForm('/cart/coupon', { code: 'firstyear' });
    const page = await anna.get('/checkout');
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain('name="payment"');
    expect(page.body).toContain('No payment needed for this order.');

    const outbox = app.get(MailService).outbox;
    const before = outbox.length;
    const placed = await anna.postForm(
      '/checkout',
      billing('Anna@Example.test', { digitalConsent: '1' }),
    );
    expect(placed.statusCode, placed.body).toBe(303);
    const location = String(placed.headers.location);
    expect(location).toMatch(/^\/order-received\/\d+\?key=order_/);

    const detail = await latestOrder();
    expect(detail.order).toMatchObject({
      status: 'completed',
      total: '0.00',
      paymentMethod: 'free',
      paymentTitle: 'No payment needed',
      email: 'anna@example.test',
      coupons: [{ code: 'firstyear', discount: '59.00' }],
    });
    expect(detail.order.paidAt).toBeTruthy();
    expect(detail.order.billing).toMatchObject({ firstName: 'Anna', lastName: 'Rossi' });

    // The shop hears of it, the customer gets the completed email, no bank details.
    const sent = outbox.slice(before);
    expect(sent.find((m) => m.to === 'orders@shop-free.test')?.subject).toMatch(/New order #/);
    const toAnna = sent.find((m) => m.to === 'anna@example.test');
    expect(toAnna?.subject).toContain('is complete');
    expect(toAnna?.html).not.toContain('IT60');

    const received = await anna.get(location);
    expect(received.statusCode).toBe(200);
    expect(received.body).toContain('Thank you: we received your order.');
    expect(received.body).toContain('No payment needed');
    expect(received.body).not.toContain('IT60');
    expect(received.body).not.toContain('Pay now');
    expect((await anna.get('/cart')).body).toContain('Your cart is empty.');

    // The customer is in Cleishop → Customers.
    const customers = (await admin.get(ext('/customers?q=anna'))).json();
    expect(customers.items[0]).toMatchObject({ email: 'anna@example.test', orders: 1 });
  });

  it('place a physical order with free shipping as processing, with the account kept', async () => {
    const bea = visitor('10.94.0.3');
    await bea.login('bea@shop-free.test', PASSWORD);
    await bea.postForm('/cart/add', { product: mug, quantity: '2' });
    await bea.postForm('/cart/coupon', { code: 'allfree' });
    const page = await bea.get('/checkout');
    expect(page.body).toMatch(/Free shipping:\s*<strong>Free<\/strong>/);
    // The courier still costs something: a way to pay until free shipping is chosen.
    const chosen = await bea.postForm('/checkout', {
      ...billing('bea@shop-free.test', { rate: rate['Free shipping']! }),
      refresh: '1',
    });
    expect(chosen.statusCode).toBe(200);
    expect(chosen.body).not.toContain('name="payment"');
    expect(chosen.body).toContain('No payment needed for this order.');
    // Even with cash on delivery picked, nothing to pay: no surcharge.
    const placed = await bea.postForm(
      '/checkout',
      billing('bea@shop-free.test', { rate: rate['Free shipping']!, payment: 'cod' }),
    );
    expect(placed.statusCode, placed.body).toBe(303);
    const detail = await latestOrder();
    expect(detail.order).toMatchObject({
      status: 'processing',
      total: '0.00',
      paymentMethod: 'free',
      shippingMethod: 'Free shipping',
    });
    expect(detail.order.paidAt).toBeTruthy();
    expect(detail.order.customerId).toBeTruthy();
    expect(detail.items.map((i: { kind: string }) => i.kind)).toEqual(['product', 'shipping']);
    expect((await admin.get(ext(`/products/${mug}`))).json()).toMatchObject({ stock: 3 });
    const customers = (await admin.get(ext('/customers?q=bea'))).json();
    expect(customers.items[0]).toMatchObject({ email: 'bea@shop-free.test', registered: true });
  });

  it('still ask for a way to pay when shipping costs something', async () => {
    const carla = visitor('10.94.0.4');
    await carla.postForm('/cart/add', { product: mug, quantity: '1' });
    await carla.postForm('/cart/coupon', { code: 'firstyear' });
    const page = await carla.get('/checkout');
    expect(page.body).toContain('name="payment"');
    const refused = await carla.postForm(
      '/checkout',
      billing('carla@shop-free.test', { rate: rate.Courier! }),
    );
    expect(refused.statusCode).toBe(422);
    expect(refused.body).toContain('Choose a way to pay.');
    const placed = await carla.postForm(
      '/checkout',
      billing('carla@shop-free.test', { rate: rate.Courier!, payment: 'bacs' }),
    );
    expect(placed.statusCode).toBe(303);
    expect((await latestOrder()).order).toMatchObject({
      status: 'on-hold',
      paymentMethod: 'bacs',
      total: '7.00',
    });
  });
});
