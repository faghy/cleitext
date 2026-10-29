/**
 * Cleishop's reports and customers (1.11): which orders count, refunds,
 * the compared period, days in the site's time zone, and customers merged
 * by email.
 */
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { sites, withContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
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
const mug = randomUUID();
const book = randomUUID();
const annaAccount = randomUUID();
let orderA = '';

const ext = (path: string) => `/api/v1/ext/shop${path}`;
const MARCH = 'period=custom&after=2026-03-01&before=2026-03-31';

interface OrderInput {
  status: string;
  createdAt: string;
  paidAt?: string;
  email: string;
  firstName?: string;
  city?: string;
  country?: string;
  subtotal: number;
  discount?: number;
  shipping?: number;
  shippingTax?: number;
  tax?: number;
  coupon?: string;
  customerId?: string;
  items: { product: string; quantity: number; total: number }[];
}

let number = 0;
/** An order as the checkout leaves it, written straight into the shop's tables. */
async function order(input: OrderInput): Promise<{ id: string; items: string[] }> {
  const id = randomUUID();
  const items = input.items.map(() => randomUUID());
  const discount = input.discount ?? 0;
  const shipping = input.shipping ?? 0;
  const tax = input.tax ?? 0;
  const total = input.subtotal - discount + shipping + tax;
  const address = {
    firstName: input.firstName ?? 'Anna',
    lastName: 'Rossi',
    company: '',
    address1: 'Via Roma 1',
    address2: '',
    city: input.city ?? 'Varazze',
    postcode: '17019',
    province: 'SV',
    country: input.country ?? 'IT',
    phone: '',
  };
  number++;
  await withContext(owner.db, { siteId: site.id }, async (tx) => {
    await tx.execute(sql`INSERT INTO plg_shop.orders (site_id, id, number, key, status, currency,
      prices_include_tax, subtotal, discount_total, shipping_total, shipping_tax, tax_total, total,
      taxes, coupons, email, billing, shipping, customer_id, paid_at, created_at)
      VALUES (${site.id}, ${id}, ${number}, ${`key-${number}`}, ${input.status}, 'EUR', true,
        ${input.subtotal}, ${discount}, ${shipping}, ${input.shippingTax ?? 0}, ${tax}, ${total},
        ${JSON.stringify(tax ? [{ rate: 22, amount: tax.toFixed(2) }] : [])}::jsonb,
        ${JSON.stringify(input.coupon ? [{ code: input.coupon, discount: discount.toFixed(2) }] : [])}::jsonb,
        ${input.email}, ${JSON.stringify(address)}::jsonb, ${JSON.stringify(address)}::jsonb,
        ${input.customerId ?? null}, ${input.paidAt ?? null}, ${input.createdAt})`);
    for (const [index, item] of input.items.entries())
      await tx.execute(sql`INSERT INTO plg_shop.order_items (site_id, id, order_id, position, kind,
        product_id, name, quantity, subtotal, total)
        VALUES (${site.id}, ${items[index]!}, ${id}, ${index}, 'product', ${item.product},
          ${item.product === mug ? 'Mug' : 'Book'}, ${item.quantity}, ${item.total}, ${item.total})`);
  });
  return { id, items };
}

async function refund(
  orderId: string,
  amount: number,
  createdAt: string,
  restocked: { item: string; quantity: number }[] = [],
) {
  await withContext(owner.db, { siteId: site.id }, (tx) =>
    tx.execute(sql`INSERT INTO plg_shop.refunds (site_id, order_id, amount, restocked, created_at)
      VALUES (${site.id}, ${orderId}, ${amount}, ${JSON.stringify(restocked)}::jsonb, ${createdAt})`),
  );
}

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
  site = await seedSite(owner, 'shop-analytics');
  // Days are the site's: 23:30 UTC on 2 March is 3 March in Rome.
  await owner.db.update(sites).set({ timezone: 'Europe/Rome' }).where(eq(sites.id, site.id));
  await seedUser(owner, {
    email: 'analytics-admin@shop-analytics.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.94.0.1');
  await admin.login('analytics-admin@shop-analytics.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);

  await withContext(owner.db, { siteId: site.id }, async (tx) => {
    await tx.execute(sql`INSERT INTO plg_shop.products (site_id, entry_id, title, status, kind,
      sku, manage_stock, stock, stock_status)
      VALUES (${site.id}, ${mug}, 'Mug', 'published', 'simple', 'MUG', true, 1, 'instock'),
        (${site.id}, ${book}, 'Book', 'published', 'simple', 'BOOK', true, 0, 'outofstock')`);
    // Anna has an account; Eve signed up and never ordered.
    await tx.execute(sql`INSERT INTO plg_shop.customers (site_id, user_id, email, created_at)
      VALUES (${site.id}, ${annaAccount}, 'Anna@Example.test', '2025-01-15T10:00:00Z'),
        (${site.id}, ${randomUUID()}, 'eve@example.test', '2026-02-01T10:00:00Z')`);
  });

  // March 2026. A: with a coupon, shipping and taxes; refunded by half on 12 March.
  const a = await order({
    status: 'completed',
    createdAt: '2026-03-02T10:00:00Z',
    paidAt: '2026-03-02T10:05:00Z',
    email: 'anna@example.test',
    subtotal: 100,
    discount: 10,
    shipping: 5,
    shippingTax: 1.1,
    tax: 20.9,
    coupon: 'SAVE10',
    items: [{ product: mug, quantity: 2, total: 90 }],
  });
  orderA = a.id;
  await refund(a.id, 57.95, '2026-03-12T10:00:00Z');
  // B: unpaid (on delivery), placed late at night in UTC: 3 March in Rome.
  await order({
    status: 'processing',
    createdAt: '2026-03-02T23:30:00Z',
    email: 'ANNA@example.test',
    customerId: annaAccount,
    subtotal: 50,
    tax: 11,
    items: [{ product: mug, quantity: 1, total: 50 }],
  });
  await order({
    status: 'on-hold',
    createdAt: '2026-03-10T09:00:00Z',
    email: 'bob@example.test',
    firstName: 'Bob',
    city: 'Lyon',
    country: 'FR',
    subtotal: 30,
    items: [{ product: book, quantity: 3, total: 30 }],
  });
  // G: fully refunded the same day, its book back in stock.
  const g = await order({
    status: 'refunded',
    createdAt: '2026-03-04T10:00:00Z',
    email: 'dora@example.test',
    firstName: 'Dora',
    subtotal: 20,
    items: [{ product: book, quantity: 1, total: 20 }],
  });
  await refund(g.id, 20, '2026-03-04T12:00:00Z', [{ item: g.items[0]!, quantity: 1 }]);
  // Never counted.
  for (const status of ['pending', 'cancelled', 'failed'])
    await order({
      status,
      createdAt: '2026-03-05T10:00:00Z',
      email: 'carl@example.test',
      firstName: 'Carl',
      subtotal: 999,
      items: [{ product: mug, quantity: 9, total: 999 }],
    });
  // A year earlier.
  await order({
    status: 'completed',
    createdAt: '2025-03-03T10:00:00Z',
    email: 'anna@example.test',
    subtotal: 40,
    items: [{ product: mug, quantity: 1, total: 40 }],
  });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('reports', () => {
  it('counts paid orders less refunds, against the same days a year earlier', async () => {
    const res = await admin.get(ext(`/analytics/revenue?${MARCH}&interval=day`));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.range).toEqual({ after: '2026-03-01', before: '2026-03-31' });
    expect(body.previousRange).toEqual({ after: '2025-03-01', before: '2025-03-31' });
    expect(body.current.totals).toMatchObject({
      orders: 4,
      gross: 200,
      coupons: 10,
      // Half of A without its taxes and shipping, and all of G.
      returns: 65,
      net: 125,
      taxes: 21.45,
      shipping: 2.5,
      total: 148.95,
      items: 6,
      discounted: 1,
      aov: 31.25,
    });
    expect(body.previous.totals).toMatchObject({ orders: 1, net: 40, total: 40 });
    expect(body.current.intervals).toHaveLength(31);
    const day = (date: string) =>
      body.current.intervals.find((i: { date: string }) => i.date === date).values;
    expect(day('2026-03-02')).toMatchObject({ orders: 1, total: 115.9 });
    expect(day('2026-03-03')).toMatchObject({ orders: 1, total: 61 });
    expect(day('2026-03-04')).toMatchObject({ orders: 1, total: 0, returns: 20 });
    expect(day('2026-03-05')).toMatchObject({ orders: 0, total: 0 });
    expect(day('2026-03-12')).toMatchObject({ orders: 0, total: -57.95, returns: 45 });
  });

  it('groups by week from Monday and compares with the period before', async () => {
    const res = await admin.get(
      ext(`/analytics/revenue?${MARCH}&interval=week&compare=previous_period`),
    );
    const body = res.json();
    expect(body.previousRange).toEqual({ after: '2026-01-29', before: '2026-02-28' });
    expect(body.previous.totals.orders).toBe(0);
    expect(body.current.intervals.map((i: { date: string }) => i.date)).toEqual([
      '2026-02-23',
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ]);
    expect(body.current.intervals[1].values).toMatchObject({ orders: 3, total: 176.9 });
    expect(body.current.intervals[2].values).toMatchObject({ orders: 1, total: -27.95 });
    const monthly = (await admin.get(ext(`/analytics/revenue?${MARCH}&interval=month`))).json();
    expect(monthly.current.intervals).toEqual([
      { date: '2026-03-01', values: expect.objectContaining({ orders: 4, total: 148.95 }) },
    ]);
  });

  it('lists the orders, products, coupons and taxes of the range', async () => {
    const orders = (await admin.get(ext(`/analytics/orders?${MARCH}`))).json();
    expect(orders.current.totals).toMatchObject({ orders: 4, avgItems: 1.5 });
    expect(orders.rows.map((r: { status: string }) => r.status).sort()).toEqual([
      'completed',
      'on-hold',
      'processing',
      'refunded',
    ]);
    const a = orders.rows.find((r: { id: string }) => r.id === orderA);
    // Anna had ordered the year before.
    expect(a).toMatchObject({ newCustomer: false, coupons: 'SAVE10', net: 45, items: 2 });
    expect(
      orders.rows.find((r: { email: string }) => r.email === 'bob@example.test'),
    ).toMatchObject({ newCustomer: true, customer: 'Bob Rossi' });

    const products = (await admin.get(ext(`/analytics/products?${MARCH}`))).json();
    expect(products.current.totals).toMatchObject({ items: 6, net: 125, orders: 4 });
    const row = (id: string) => products.rows.find((r: { id: string }) => r.id === id);
    expect(row(mug)).toMatchObject({ name: 'Mug', sku: 'MUG', items: 3, net: 95, orders: 2 });
    expect(row(book)).toMatchObject({ items: 3, net: 30, orders: 2, stockStatus: 'outofstock' });

    const coupons = (await admin.get(ext(`/analytics/coupons?${MARCH}`))).json();
    expect(coupons.current.totals).toEqual({ orders: 1, amount: 10 });
    expect(coupons.rows).toMatchObject([{ code: 'SAVE10', orders: 1, amount: 10 }]);

    const taxes = (await admin.get(ext(`/analytics/taxes?${MARCH}`))).json();
    expect(taxes.current.totals).toMatchObject({
      taxes: 21.45,
      shippingTax: 0.55,
      orderTax: 20.9,
      taxed: 2,
    });
    expect(taxes.rows).toMatchObject([{ rate: 22, tax: 21.45, orders: 2 }]);

    const overview = (await admin.get(ext(`/analytics/overview?${MARCH}`))).json();
    expect(overview.rows[0].products[0]).toMatchObject({ id: mug });
    expect(overview.rows[0].customers[0]).toMatchObject({
      email: 'anna@example.test',
      orders: 2,
      spent: 118.95,
    });
  });

  it('tells the stock and what the home needs', async () => {
    const stock = (await admin.get(ext('/analytics/stock'))).json();
    expect(stock.counts).toEqual({ instock: 0, lowstock: 1, outofstock: 1, onbackorder: 0 });
    const home = await admin.get(ext('/home'));
    expect(home.statusCode).toBe(200);
    expect(home.json()).toMatchObject({
      toFulfil: { count: 2 },
      stock: { lowCount: 1, outCount: 1 },
      reviewsPending: 0,
      checklist: { product: true, shipping: false, taxes: false, email: false },
    });
    expect(home.json().chart.current).toHaveLength(30);
  });

  it('sends a test email and remembers it, and hides the first steps', async () => {
    expect((await admin.post(ext('/emails/test'), { locale: 'it' })).statusCode).toBe(400);
    await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
      notifyEmail: 'orders@shop-analytics.test',
    });
    expect((await admin.post(ext('/emails/test'), { locale: 'it' })).statusCode).toBe(200);
    const mail = app
      .get(MailService)
      .outbox.find((m) => m.to.includes('orders@shop-analytics.test'));
    expect(mail?.subject).toContain('email di prova');
    expect((await admin.request('PUT', ext('/home/checklist'), { hidden: true })).statusCode).toBe(
      200,
    );
    expect((await admin.get(ext('/home'))).json()).toMatchObject({
      checklist: { email: true },
      checklistHidden: true,
      canTestEmail: true,
    });
  });

  it('refuses ranges that do not make sense', async () => {
    const res = await admin.get(
      ext('/analytics/revenue?period=custom&after=2026-03-10&before=2026-03-01'),
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('customers', () => {
  it('merges accounts and guests by email', async () => {
    const res = await admin.get(ext('/customers?sort=email&order=asc'));
    expect(res.statusCode).toBe(200);
    const { items, total, countries } = res.json();
    expect(total).toBe(5);
    expect(countries).toEqual(['FR', 'IT']);
    expect(items.map((c: { email: string }) => c.email)).toEqual([
      'anna@example.test',
      'bob@example.test',
      'carl@example.test',
      'dora@example.test',
      'eve@example.test',
    ]);
    expect(items[0]).toMatchObject({
      name: 'Anna Rossi',
      registered: true,
      userId: annaAccount,
      registeredAt: '2025-01-15T10:00:00.000Z',
      lastOrder: '2026-03-02T23:30:00.000Z',
      orders: 3,
      // 115.90 − 57.95 + 61 + 40.
      spent: 158.95,
      aov: 52.98,
      country: 'IT',
      city: 'Varazze',
    });
    expect(items[1]).toMatchObject({ registered: false, orders: 1, spent: 30, city: 'Lyon' });
    // Carl's orders never counted; Eve never ordered.
    expect(items[2]).toMatchObject({ orders: 0, spent: 0 });
    expect(items[4]).toMatchObject({ registered: true, orders: 0, lastOrder: null });
  });

  it('filters and sorts', async () => {
    const guests = (await admin.get(ext('/customers?kind=guest&minOrders=1'))).json();
    expect(guests.items.map((c: { email: string }) => c.email).sort()).toEqual([
      'bob@example.test',
      'dora@example.test',
    ]);
    const found = (await admin.get(ext('/customers?q=lyon'))).json();
    expect(found.items.map((c: { email: string }) => c.email)).toEqual(['bob@example.test']);
    const french = (await admin.get(ext('/customers?country=FR'))).json();
    expect(french.total).toBe(1);
    const bySpend = (await admin.get(ext('/customers?sort=spent&order=desc'))).json();
    expect(bySpend.items[0].email).toBe('anna@example.test');
  });
});
