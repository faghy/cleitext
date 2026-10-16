/**
 * The Shop plugin, milestone 4: shipping zones and methods, tax rates,
 * coupons and cash on delivery, from the admin's API to the order.
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
let book: string;
let mug: string;
let ebook: string;
const rate: Record<string, string> = {};

const ext = (path: string) => `/api/v1/ext/shop${path}`;
const decoded = (location: unknown) => decodeURIComponent(String(location).replace(/\+/g, ' '));

async function product(title: string, data: Record<string, unknown>) {
  const { id } = (await admin.post('/api/v1/entries', { type: 'product', title })).json() as {
    id: string;
  };
  const saved = await admin.request('PUT', ext(`/products/${id}`), { product: data });
  expect(saved.statusCode).toBe(200);
  expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
  return id;
}

const billing = (email: string, changes: Record<string, string> = {}) => ({
  email,
  'billing.firstName': 'Anna',
  'billing.lastName': 'Rossi',
  'billing.address1': 'Via Roma 1',
  'billing.city': 'Varazze',
  'billing.postcode': '17019',
  'billing.province': 'SV',
  'billing.country': 'IT',
  'billing.phone': '019 123456',
  payment: 'cod',
  ...changes,
});

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'shop-src-')), 'shop');
  await cp(join(pluginsRoot, 'shop'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'shop-rules');
  await seedUser(owner, {
    email: 'rules-admin@shop-rules.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.93.0.1');
  await admin.login('rules-admin@shop-rules.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
  expect(
    (
      await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
        notifyEmail: 'orders@shop-rules.test',
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await admin.request('PUT', ext('/payments'), {
        order: ['cod', 'bacs'],
        bacs: { enabled: false },
        cod: { enabled: true, fee: '4,90', description: 'Pay the courier.', virtual: true },
      })
    ).statusCode,
  ).toBe(200);

  book = await product('Book', {
    sku: 'BOOK',
    regularPrice: '20',
    taxClass: 'super-reduced',
    weight: 0.5,
  });
  mug = await product('Mug', { sku: 'MUG', regularPrice: '12', weight: 0.4 });
  ebook = await product('E-book', { sku: 'EBOOK', regularPrice: '5', virtual: true });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('rules in the admin', () => {
  it('saves shipping zones and methods, and tells which an address gets', async () => {
    const saved = await admin.request('PUT', ext('/shipping'), {
      zones: [
        {
          name: 'Islands',
          regions: [
            { country: 'IT', province: 'CA' },
            { country: 'IT', province: 'PA' },
          ],
          methods: [{ title: 'Courier (islands)', settings: { kind: 'flat', cost: '12' } }],
        },
        {
          name: 'Italy',
          regions: [{ country: 'IT' }],
          methods: [
            { title: 'Courier', settings: { kind: 'flat', cost: '7' } },
            {
              title: 'Free shipping',
              settings: { kind: 'free', requires: 'either', minAmount: '50' },
            },
            {
              title: 'Pickup',
              taxable: false,
              settings: { kind: 'pickup', address: 'Via Po 3, Varazze' },
            },
          ],
        },
      ],
      rest: [
        {
          title: 'International',
          settings: {
            kind: 'weight',
            bands: [
              { upTo: 2, cost: '20' },
              { upTo: 10, cost: '35' },
            ],
          },
        },
      ],
    });
    expect(saved.statusCode).toBe(200);
    const body = saved.json();
    expect(body.zones.map((z: { name: string }) => z.name)).toEqual(['Islands', 'Italy']);
    for (const m of [...body.zones[1].methods, ...body.rest]) rate[m.title] = m.id;

    const bad = await admin.request('PUT', ext('/shipping'), {
      zones: [
        {
          name: 'X',
          regions: [],
          methods: [{ title: 'Y', settings: { kind: 'flat', cost: '3 +* 2' } }],
        },
      ],
    });
    expect(bad.statusCode).toBe(400);

    const palermo = (
      await admin.post(ext('/shipping/preview'), {
        country: 'IT',
        province: 'pa',
        postcode: '90100',
      })
    ).json();
    expect(palermo.zone.name).toBe('Islands');
    const milan = (
      await admin.post(ext('/shipping/preview'), { country: 'IT', province: 'MI', contents: 60 })
    ).json();
    expect(milan.rates.map((r: { title: string }) => r.title)).toEqual([
      'Courier',
      'Free shipping',
      'Pickup',
    ]);
    const paris = (
      await admin.post(ext('/shipping/preview'), { country: 'FR', weight: 12 })
    ).json();
    expect(paris).toEqual({ zone: null, rates: [] });
  });

  it('saves tax rates, switched on', async () => {
    const saved = await admin.request('PUT', ext('/taxes'), {
      enabled: true,
      rates: [
        { country: 'IT', taxClass: '', rate: 22, name: 'IVA 22%' },
        { country: 'IT', taxClass: 'super-reduced', rate: 4, name: 'IVA 4%' },
        { country: 'FR', taxClass: '', rate: 20, name: 'TVA' },
      ],
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().enabled).toBe(true);
    const italy = (await admin.post(ext('/taxes/preview'), { country: 'IT' })).json();
    expect(italy.rates).toEqual({ '': 22, 'super-reduced': 4 });
  });

  it('keeps coupons with unique codes', async () => {
    const welcome = await admin.post(ext('/coupons'), {
      code: 'WELCOME10',
      kind: 'percent',
      amount: '10',
      usageLimitPerUser: 1,
    });
    expect(welcome.statusCode).toBe(201);
    expect(welcome.json()).toMatchObject({ code: 'welcome10', usageCount: 0, enabled: true });
    const again = await admin.post(ext('/coupons'), { code: 'welcome10', amount: '5' });
    expect(again.statusCode).toBe(400);
    expect(again.json().errors[0].path).toBe('code');
    await admin.post(ext('/coupons'), {
      code: 'BIG',
      kind: 'fixed_cart',
      amount: '15',
      minSpend: '100',
    });
    await admin.post(ext('/coupons'), {
      code: 'SHIPFREE',
      kind: 'fixed_cart',
      amount: '0',
      freeShipping: true,
    });
    const off = await admin.post(ext('/coupons'), { code: 'OLD', amount: '50', enabled: false });
    expect(off.json().enabled).toBe(false);
    const list = (await admin.get(ext('/coupons?q=e'))).json();
    expect(list.items.map((c: { code: string }) => c.code).sort()).toEqual([
      'shipfree',
      'welcome10',
    ]);
  });
});

describe('buying with the rules', () => {
  const visitor = () => new TestClient(app, site.host, '10.93.0.9');
  let anna: TestClient;

  it('applies coupons in the cart, and says why one does not', async () => {
    anna = visitor();
    await anna.postForm('/cart/add', { product: book, quantity: '1' });
    await anna.postForm('/cart/add', { product: mug, quantity: '2' });
    const applied = await anna.postForm('/cart/coupon', { code: 'Welcome10' });
    expect(applied.headers.location).toBe('/cart?coupon=welcome10');
    const cart = await anna.get('/cart');
    expect(cart.body).toContain('Coupon: welcome10');
    expect(cart.body).toContain('−€4.40');
    expect(cart.body).toContain('€39.60');
    expect(cart.body).toContain('Calculated at checkout');

    for (const [code, message] of [
      ['nope', 'Coupon “nope” does not exist.'],
      ['big', 'Coupon “big” needs a larger order.'],
      ['old', 'Coupon “old” does not exist.'],
      ['welcome10', 'Coupon “welcome10” is already applied.'],
    ]) {
      const refused = await anna.postForm('/cart/coupon', { code: code! });
      expect(decoded(refused.headers.location)).toContain(message);
    }
  });

  it('offers the rates of the address and adds the cash-on-delivery fee', async () => {
    const page = await anna.get('/checkout');
    expect(page.body).toMatch(/Courier:\s*<strong>€7\.00<\/strong>/);
    expect(page.body).toContain('Via Po 3, Varazze');
    expect(page.body).not.toContain('Free shipping');
    expect(page.body).toContain('Surcharge: €4.90.');

    // The islands have their own courier.
    const islands = await anna.postForm('/checkout', {
      ...billing('anna@example.test', { 'billing.province': 'CA' }),
      refresh: '1',
    });
    expect(islands.statusCode).toBe(200);
    expect(islands.body).toContain('Courier (islands)');
    // A rate of another zone is chosen again.
    const wrong = await anna.postForm('/checkout', {
      ...billing('anna@example.test', { 'billing.province': 'CA' }),
      rate: rate.Courier!,
    });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.body).toContain('Please choose how to ship your order.');
  });

  it('places the order with its discount, shipping, fee and taxes', async () => {
    const placed = await anna.postForm('/checkout', {
      ...billing('anna@example.test'),
      rate: rate.Courier!,
    });
    expect(placed.statusCode).toBe(303);
    const list = (await admin.get(ext('/orders'))).json();
    const detail = (await admin.get(ext(`/orders/${list.items[0].id}`))).json();
    // 44 − 4.40 + 7 shipping + 4.90 cash on delivery, taxes included.
    expect(detail.order).toMatchObject({
      status: 'processing',
      total: '51.50',
      paymentMethod: 'cod',
      shippingMethod: 'Courier',
      coupons: [{ code: 'welcome10', discount: '4.40' }],
    });
    // Book at 4% (18.00 → 0.69), mugs at 22% (21.60 → 3.90), shipping 1.26, fee 0.88.
    expect(detail.order.taxes).toEqual([
      { rate: 22, amount: '6.04' },
      { rate: 4, amount: '0.69' },
    ]);
    const bookLine = detail.items.find((i: { name: string }) => i.name === 'Book');
    expect(bookLine).toMatchObject({ subtotal: '19.23', total: '17.31', tax: '0.69' });
    expect(detail.items.map((i: { kind: string; name: string }) => `${i.kind}:${i.name}`)).toEqual([
      'product:Book',
      'product:Mug',
      'shipping:Courier',
      'fee:Cash on delivery',
    ]);
    const mail = app.get(MailService).outbox.find((m) => m.to === 'anna@example.test');
    expect(mail?.subject).toContain('is being processed');
    expect(mail?.text).toContain('Coupon: welcome10: −€4.40');

    const coupons = (await admin.get(ext('/coupons?q=welcome'))).json();
    expect(coupons.items[0].usageCount).toBe(1);
    const uses = (await admin.get(ext(`/coupons/${coupons.items[0].id}/uses`))).json();
    expect(uses.items[0]).toMatchObject({ number: 1, email: 'anna@example.test' });
  });

  it('keeps the limit per customer, by email', async () => {
    const again = visitor();
    await again.postForm('/cart/add', { product: mug, quantity: '1' });
    await again.postForm('/cart/coupon', { code: 'welcome10' });
    const refused = await again.postForm('/checkout', {
      ...billing('ANNA@example.test'),
      rate: rate.Pickup!,
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.body).toContain('You have already used coupon “welcome10”.');
  });

  it('gives free shipping with a coupon, nothing to ship for virtual products', async () => {
    const bruno = visitor();
    await bruno.postForm('/cart/add', { product: mug, quantity: '1' });
    await bruno.postForm('/cart/coupon', { code: 'shipfree' });
    const page = await bruno.get('/checkout');
    expect(page.body).toMatch(/Free shipping:\s*<strong>Free<\/strong>/);

    const carla = visitor();
    await carla.postForm('/cart/add', { product: ebook, quantity: '1' });
    const digital = await carla.get('/checkout');
    expect(digital.body).not.toContain('name="rate"');
    const placed = await carla.postForm(
      '/checkout',
      billing('carla@example.test', { payment: 'cod' }),
    );
    expect(placed.statusCode).toBe(303);
  });

  it('offers cash on delivery only with the shipping methods chosen for it', async () => {
    await admin.request('PUT', ext('/payments'), {
      cod: { enabled: true, fee: '4.90', shippingMethods: [rate.Pickup!] },
      bacs: { enabled: true, accounts: [{ iban: 'IT60X0542811101000000123456' }] },
    });
    const eva = visitor();
    await eva.postForm('/cart/add', { product: mug, quantity: '1' });
    const courier = await eva.postForm('/checkout', {
      ...billing('eva@example.test'),
      rate: rate.Courier!,
      refresh: '1',
    });
    expect(courier.body).not.toContain('value="cod"');
    expect(courier.body).toContain('value="bacs"');
    const refused = await eva.postForm('/checkout', {
      ...billing('eva@example.test'),
      rate: rate.Courier!,
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.body).toContain('This way to pay is not available for this order');
    const pickup = await eva.postForm('/checkout', {
      ...billing('eva@example.test'),
      rate: rate.Pickup!,
      refresh: '1',
    });
    expect(pickup.body).toContain('value="cod"');
    await admin.request('PUT', ext('/payments'), {
      cod: { enabled: true, fee: '4.90', virtual: true },
      bacs: { enabled: false },
    });
  });

  it('works out taxes for the country it ships to', async () => {
    const dora = visitor();
    await dora.postForm('/cart/add', { product: mug, quantity: '1' });
    const paris = await dora.postForm('/checkout', {
      ...billing('dora@example.test', {
        'billing.country': 'FR',
        'billing.province': '',
        'billing.postcode': '75001',
        'billing.city': 'Paris',
      }),
      refresh: '1',
    });
    // France is "everywhere else": the international courier, by weight.
    expect(paris.body).toMatch(/International:\s*<strong>€20\.00<\/strong>/);
    // Prices include taxes: the gross stays 12 with French VAT.
    expect(paris.body).toContain('Taxes included (20%)');
    expect(paris.body).toContain('€12.00');
  });
});
