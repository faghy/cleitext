/**
 * Cleishop 1.21: order tracking like WooCommerce's `[woocommerce_order_tracking]`.
 * The order number and the billing email show the order's status and lines;
 * any wrong pair gets the same answer, and each visitor has a few tries.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
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
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let number = '';

const ext = (path: string) => `/api/v1/ext/shop${path}`;

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'shop-src-')), 'shop');
  await cp(join(pluginsRoot, 'shop'), source, {
    recursive: true,
    filter: (f) => !f.includes('node_modules') && !f.includes('.build-lock'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'shop-tracking');
  await seedUser(owner, {
    email: 'admin@shop-tracking.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.97.0.1');
  await admin.login('admin@shop-tracking.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
  await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
    termsUrl: 'http://shop-tracking.test/terms',
  });
  const payments = await admin.request('PUT', ext('/payments'), {
    bacs: {
      enabled: true,
      accounts: [{ accountName: 'Bottega Srl', iban: 'IT60X0542811101000000123456' }],
    },
  });
  expect(payments.statusCode, payments.body).toBe(200);
  const { id } = (
    await admin.post('/api/v1/entries', { type: 'product', title: 'Teapot' })
  ).json() as {
    id: string;
  };
  expect(
    (await admin.request('PUT', ext(`/products/${id}`), { product: { regularPrice: '30' } }))
      .statusCode,
  ).toBe(200);
  expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
  const buyer = new TestClient(app, site.host, '10.97.0.2');
  await buyer.postForm('/cart/add', { product: id, quantity: '2' });
  const placed = await buyer.postForm('/checkout', {
    email: 'Lia@Example.test',
    'billing.firstName': 'Lia',
    'billing.lastName': 'Verdi',
    'billing.address1': 'Via Roma 1',
    'billing.city': 'Varazze',
    'billing.postcode': '17019',
    'billing.province': 'Savona',
    'billing.country': 'IT',
    'billing.phone': '019 123456',
    payment: 'bacs',
    terms: '1',
  });
  expect(placed.statusCode, placed.body).toBe(303);
  number = /\/order-received\/(\d+)\?/.exec(String(placed.headers.location))![1]!;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('order tracking', () => {
  it('asks for the order number and the billing email', async () => {
    const page = await new TestClient(app, site.host, '10.97.0.3').get('/order-tracking');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain(
      '<form class="shop-tracking" method="post" action="/order-tracking">',
    );
    expect(page.body).toContain('name="orderid"');
    expect(page.body).toContain('name="order_email"');
  });

  it('shows the status and the lines for the right pair', async () => {
    const visitor = new TestClient(app, site.host, '10.97.0.4');
    const found = await visitor.postForm('/order-tracking', {
      orderid: `#${number}`,
      order_email: ' lia@example.TEST ',
    });
    expect(found.statusCode, found.body).toBe(200);
    expect(found.headers['cache-control']).toBe('private, no-store');
    expect(found.body).toContain('On hold');
    expect(found.body).toContain('Teapot');
    expect(found.body).toContain('Track another order');
  });

  it('gives the same answer to any wrong pair', async () => {
    const visitor = new TestClient(app, site.host, '10.97.0.5');
    const wrongEmail = await visitor.postForm('/order-tracking', {
      orderid: number,
      order_email: 'someone@example.test',
    });
    const noOrder = await visitor.postForm('/order-tracking', {
      orderid: '987654',
      order_email: 'lia@example.test',
    });
    const garbage = await visitor.postForm('/order-tracking', { orderid: 'x', order_email: '' });
    const strip = (body: string) => body.replace(/value="[^"]*"/g, '');
    expect(wrongEmail.statusCode).toBe(200);
    expect(wrongEmail.body).toContain('Sorry, the order could not be found.');
    expect(wrongEmail.body).not.toContain('Teapot');
    expect(strip(noOrder.body)).toBe(strip(wrongEmail.body));
    expect(strip(garbage.body)).toBe(strip(wrongEmail.body));
  });

  it('limits the tries of one visitor', async () => {
    const visitor = new TestClient(app, site.host, '10.97.0.6');
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push(
        (await visitor.postForm('/order-tracking', { orderid: '1', order_email: 'a@b.test' }))
          .statusCode,
      );
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Others are not affected.
    const other = new TestClient(app, site.host, '10.97.0.7');
    expect(
      (
        await other.postForm('/order-tracking', {
          orderid: number,
          order_email: 'lia@example.test',
        })
      ).body,
    ).toContain('Teapot');
  });

  it('is a block for any page', async () => {
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Track',
      document: {
        schema: 1,
        blocks: [{ id: 'b_track', type: 'shop/order-tracking', v: 1, attrs: {} }],
      },
    });
    expect(created.statusCode, created.body).toBeLessThan(300);
    const { id } = created.json() as { id: string };
    expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
    const page = await new TestClient(app, site.host, '10.97.0.8').get('/track');
    expect(page.statusCode, page.body).toBe(200);
    expect(page.body).toContain('action="/order-tracking"');
    expect(page.body).toContain('name="order_email"');
  });
});
