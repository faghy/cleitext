/**
 * Cleishop's `shop` service (plugin API 1.73), as its add-ons use it: a
 * customer's addresses, products by SKU, orders imported as they were (no
 * email, no stock, the number customers know), once only.
 */
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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
let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let adminId: string;

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const appRole = new URL(inject('appUrl')).username;
  const source = join(await mkdtemp(join(tmpdir(), 'shop-src-')), 'shop');
  await cp(join(pluginsRoot, 'shop'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, { source, pluginsPath, appRole });
  const client = join(await mkdtemp(join(tmpdir(), 'addon-')), 'addon-fx');
  await mkdir(join(client, 'dist'), { recursive: true });
  await writeFile(
    join(client, 'cleitext.plugin.json'),
    JSON.stringify({
      slug: 'addon-fx',
      name: 'Cleishop add-on (fixture)',
      version: '1.0.0',
      apiVersion: '^1.73',
      license: 'GPL-2.0-or-later',
      server: 'dist/server.js',
      permissions: ['routes:admin'],
    }),
  );
  await writeFile(
    join(client, 'dist', 'server.js'),
    `export default { setup(ctx) {
  ctx.routes.api({ method: 'POST', path: '/call', capability: 'manage_settings', async handler(request) {
    const shop = await ctx.services.use(request.siteId, 'shop');
    if (!shop) return { body: { shop: null } };
    const { fn, args } = request.body;
    try { return { body: { result: await shop[fn](request.siteId, ...args) } }; }
    catch (e) { return { status: 422, body: { error: e.message } }; }
  } });
} };`,
  );
  await installPlugin(owner.db, { source: client, pluginsPath, appRole });
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'shop-services');
  adminId = await seedUser(owner, {
    email: 'admin@shop-services.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.93.0.1');
  await admin.login('admin@shop-services.test', PASSWORD);
  for (const slug of ['shop', 'addon-fx']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`, {})).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const call = (fn: string, ...args: unknown[]) =>
  admin.post('/api/v1/ext/addon-fx/call', { fn, args });

const imported = {
  ref: 'wc:37860',
  number: 37860,
  status: 'completed',
  currency: 'USD',
  locale: 'en',
  email: 'Jane@Example.test',
  billing: { firstName: 'Jane', lastName: 'Doe', city: 'New York', country: 'US', province: 'NY' },
  paymentMethod: 'ppcp-gateway',
  paymentTitle: 'PayPal',
  transactionId: '8AB123',
  totals: { subtotal: '100', shipping: '10', tax: '8.88', total: '118.88' },
  taxes: [{ rate: 8.875, amount: '8.88', label: 'NY STATE TAX' }],
  items: [
    { name: 'Eau de Parfum 100 ml', sku: 'EDP-100', quantity: 2, total: '100', tax: '8.88' },
    { kind: 'shipping', name: 'Flat rate', total: '10' },
  ],
  notes: [{ note: 'Order status changed from Processing to Completed.', author: 'WooCommerce' }],
  refunds: [{ amount: '-5', reason: 'Damaged box' }],
  createdAt: '2025-03-01T10:00:00Z',
  paidAt: '2025-03-01T10:05:00Z',
  meta: { _ppcp_paypal_order_id: '5XY' },
};

describe('the shop service (plugin API 1.73)', () => {
  it('saves a customer’s addresses', async () => {
    const saved = await call('saveCustomer', {
      userId: adminId,
      email: 'admin@shop-services.test',
      billing: { firstName: 'Ada', city: 'Varazze', unknown: 'x' },
    });
    expect(saved.json().result).toEqual({ created: true });
    expect(
      (await call('saveCustomer', { userId: adminId, email: 'a@b.test' })).json().result,
    ).toEqual({ created: false });
  });

  it('imports an order as it was, once, without emails', async () => {
    const outbox = app.get(MailService).outbox.length;
    const first = (await call('importOrder', imported)).json().result;
    expect(first.created).toBe(true);
    const again = (await call('importOrder', imported)).json().result;
    expect(again).toEqual({ id: first.id, created: false });
    expect((await call('orderByRef', 'wc:37860')).json().result).toBe(first.id);
    const detail = (await call('order', first.id)).json().result;
    expect(detail.order).toMatchObject({
      number: 37860,
      status: 'completed',
      currency: 'USD',
      email: 'jane@example.test',
      total: '118.88',
      externalRef: 'wc:37860',
    });
    expect(detail.items.map((i: { name: string }) => i.name)).toEqual([
      'Eau de Parfum 100 ml',
      'Flat rate',
    ]);
    expect(detail.notes).toHaveLength(1);
    expect(detail.refunds[0].amount).toBe('5.00');
    expect(app.get(MailService).outbox.length).toBe(outbox);
    // A number already taken gives the next free one; refused statuses are refused.
    const other = (await call('importOrder', { ...imported, ref: 'wc:2' })).json().result;
    expect((await call('order', other.id)).json().result.order.number).toBe(37861);
    expect(
      (await call('importOrder', { ...imported, ref: 'wc:3', status: 'nope' })).statusCode,
    ).toBe(422);
  });

  it('is not there when Cleishop is not active', async () => {
    await admin.post('/api/v1/plugins/shop/deactivate', {});
    expect((await call('settings')).json()).toEqual({ shop: null });
    await admin.post('/api/v1/plugins/shop/activate', {});
  });
});
