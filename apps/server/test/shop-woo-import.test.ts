/**
 * WooCommerce Import (Cleishop add-on): customers become accounts without a
 * password with their addresses, orders arrive as they were and linked to
 * them; importing again adds nothing; failed orders can be left out.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { users, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const EXT = '/api/v1/ext/shop-woo-import';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;

async function install(slug: string, pluginsPath: string, appRole: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, { source, pluginsPath, appRole });
}

const address = (city: string) => ({
  first_name: 'Jane',
  last_name: 'Doe',
  address_1: '276 5th Ave',
  city,
  postcode: '10001',
  state: 'NY',
  country: 'US',
  phone: '555',
});
const customers = [
  {
    id: 11,
    email: 'jane@woo.test',
    displayName: 'Jane Doe',
    orders: 1,
    paidOrders: 1,
    locale: 'en_US',
    billing: address('New York'),
  },
  { id: 12, email: 'bot@woo.test', displayName: 'Bot', orders: 1, paidOrders: 0 },
  { id: 13, email: 'never@woo.test', displayName: 'Never', orders: 0 },
];
const order = (id: number, status: string, customerId: number) => ({
  id,
  number: String(36000 + id),
  status,
  currency: 'USD',
  createdAt: '2025-02-01T10:00:00+00:00',
  customerId,
  email: 'jane@woo.test',
  billing: address('New York'),
  totals: { subtotal: '40.00', shipping: '0.00', tax: '3.55', total: '43.55' },
  items: [
    { type: 'line_item', name: 'Cologne', sku: 'COL-1', quantity: 1, total: '40.00', tax: '3.55' },
  ],
  notes: [{ content: 'Order placed', author: 'WooCommerce' }],
});
const orders = [order(1, 'completed', 11), order(2, 'failed', 12), order(3, 'processing', 0)];

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const appRole = new URL(inject('appUrl')).username;
  await install('shop', pluginsPath, appRole);
  await install('shop-woo-import', pluginsPath, appRole);
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'shop-woo-import');
  await seedUser(owner, {
    email: 'admin@woo-import.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.94.0.1');
  await admin.login('admin@woo-import.test', PASSWORD);
  for (const slug of ['shop', 'shop-woo-import']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`, {})).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('WooCommerce Import', () => {
  it('creates the customers chosen, without passwords or emails, with their addresses', async () => {
    const outbox = app.get(MailService).outbox.length;
    const dry = (
      await admin.post(`${EXT}/customers`, { customers, which: 'orders', dryRun: true })
    ).json();
    expect(dry).toEqual({ chosen: 2, new: 2, left: 1 });
    const done = (await admin.post(`${EXT}/customers`, { customers, which: 'paid' })).json();
    expect(done).toMatchObject({ chosen: 1, imported: 1, already: 0 });
    const [jane] = await owner.db.select().from(users).where(eq(users.email, 'jane@woo.test'));
    expect(jane?.passwordHash).toBeNull();
    expect(app.get(MailService).outbox.length).toBe(outbox);
    const again = (await admin.post(`${EXT}/customers`, { customers, which: 'paid' })).json();
    expect(again).toMatchObject({ imported: 0, already: 1 });
  });

  it('imports the orders as they were, linked to their customers, once', async () => {
    const outbox = app.get(MailService).outbox.length;
    const done = (await admin.post(`${EXT}/orders`, { orders, skipFailed: true })).json();
    expect(done).toMatchObject({ chosen: 2, imported: 2, already: 0 });
    expect(app.get(MailService).outbox.length).toBe(outbox);
    const list = (await admin.get('/api/v1/ext/shop/orders')).json();
    const numbers = list.items.map((o: { number: number }) => o.number).sort();
    expect(numbers).toEqual([36001, 36003]);
    const again = (await admin.post(`${EXT}/orders`, { orders, skipFailed: true })).json();
    expect(again).toMatchObject({ imported: 0, already: 2 });
    const state = (await admin.get(`${EXT}/state`)).json();
    expect(state).toMatchObject({ shop: true, customers: 1, orders: 2 });
  });

  it('links the lines of orders already imported to products created later', async () => {
    const { id } = (
      await admin.post('/api/v1/entries', { type: 'product', title: 'Cologne' })
    ).json();
    const saved = await admin.request('PUT', `/api/v1/ext/shop/products/${id}`, {
      product: { sku: 'COL-1', regularPrice: '40.00' },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const done = await admin.post(`${EXT}/relink`, { orders });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json()).toEqual({ chosen: 3, imported: 2, orders: 2, linked: 2, missing: 0 });
    const list = (await admin.get('/api/v1/ext/shop/orders')).json();
    const detail = (await admin.get(`/api/v1/ext/shop/orders/${list.items[0].id}`)).json();
    expect(detail.items[0].productId).toBe(id);
    // Again: nothing left to link.
    expect((await admin.post(`${EXT}/relink`, { orders })).json()).toMatchObject({ linked: 0 });
  });
});
