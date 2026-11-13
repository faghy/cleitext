/**
 * Cleishop's tax service (`shop.taxes`, Cleishop 1.16): an add-on works out
 * the taxes of the cart and the checkout instead of the rates (e.g. AvaTax),
 * the order keeps them by jurisdiction, and when the service cannot answer
 * the checkout refuses the order instead of charging no tax.
 */
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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
const ext = (path: string) => `/api/v1/ext/shop${path}`;
let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let mug: string;

/** A tax service: 8% in New York (two jurisdictions), nothing elsewhere, an error for ZIP 99999. */
const TAXES = `export default { setup(ctx) {
  ctx.services.provide('shop.taxes', {
    async quote(siteId, request) {
      if (request.address.country !== 'US') return null;
      if (request.address.postcode === '99999') throw new Error('We could not find this shipping address.');
      const lines = {};
      let total = 0;
      for (const line of request.lines) { lines[line.key] = Math.round(line.amount * 0.08); total += lines[line.key]; }
      const shipping = request.shipping ? Math.round(request.shipping.amount * 0.08) : 0;
      total += shipping;
      return { lines, shipping, fees: request.fees.map(() => 0), summary: [
        { label: 'NY STATE TAX', rate: 4, amount: Math.round(total / 2) },
        { label: 'NY CITY TAX', rate: 4, amount: total - Math.round(total / 2) },
      ] };
    },
  });
} };`;

async function fixture(slug: string, server: string) {
  const dir = join(await mkdtemp(join(tmpdir(), `${slug}-`)), slug);
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'cleitext.plugin.json'),
    JSON.stringify({
      slug,
      name: `${slug} (fixture)`,
      version: '1.0.0',
      apiVersion: '^1.73',
      license: 'GPL-2.0-or-later',
      server: 'dist/server.js',
      permissions: [],
    }),
  );
  await writeFile(join(dir, 'dist', 'server.js'), server);
  return dir;
}

const billing = {
  email: 'buyer@example.test',
  'billing.firstName': 'Ann',
  'billing.lastName': 'Lee',
  'billing.address1': '276 5th Ave',
  'billing.city': 'New York',
  'billing.postcode': '10001',
  'billing.province': 'NY',
  'billing.country': 'US',
  'billing.phone': '555 123 4567',
  payment: 'bacs',
  terms: '1',
};

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
  await installPlugin(owner.db, { source: await fixture('taxes-fx', TAXES), pluginsPath, appRole });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'shop-taxes');
  await seedUser(owner, {
    email: 'admin@shop-taxes.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.97.0.1');
  await admin.login('admin@shop-taxes.test', PASSWORD);
  for (const slug of ['shop', 'taxes-fx'])
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`, {})).statusCode).toBe(200);
  expect(
    (
      await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
        currency: 'USD',
        baseCountry: 'US',
        pricesIncludeTax: false,
        termsUrl: 'http://shop-taxes.test/terms',
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await admin.request('PUT', ext('/payments'), {
        bacs: {
          enabled: true,
          accounts: [{ accountName: 'Shop Inc', iban: 'IT60 X054 2811 1010 0000 0123 456' }],
        },
      })
    ).statusCode,
  ).toBe(200);
  const { id } = (
    await admin.post('/api/v1/entries', { type: 'product', title: 'Mug' })
  ).json() as { id: string };
  expect(
    (
      await admin.request('PUT', ext(`/products/${id}`), {
        product: { sku: 'MUG', regularPrice: '50.00' },
      })
    ).statusCode,
  ).toBe(200);
  expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
  mug = id;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('a tax service', () => {
  it('works out the cart’s and the order’s taxes, by jurisdiction', async () => {
    const buyer = new TestClient(app, site.host, '10.97.0.2');
    await buyer.postForm('/cart/add', { product: mug, quantity: '2' });
    const cart = await buyer.get('/cart');
    expect(cart.body).toContain('NY STATE TAX');
    expect(cart.body).toContain('$108.00');

    const placed = await buyer.postForm('/checkout', billing);
    expect(placed.statusCode, placed.body.slice(0, 500)).toBe(303);
    const orders = (await admin.get(ext('/orders'))).json().items as { id: string }[];
    const detail = (await admin.get(ext(`/orders/${orders[0]!.id}`))).json();
    expect(detail.order).toMatchObject({ taxTotal: '8.00', total: '108.00' });
    expect(detail.order.taxes).toEqual([
      { rate: 4, amount: '4.00', label: 'NY STATE TAX' },
      { rate: 4, amount: '4.00', label: 'NY CITY TAX' },
    ]);
  });

  it('refuses the order when the service cannot answer, with its message', async () => {
    const buyer = new TestClient(app, site.host, '10.97.0.3');
    await buyer.postForm('/cart/add', { product: mug, quantity: '1' });
    const refused = await buyer.postForm('/checkout', { ...billing, 'billing.postcode': '99999' });
    expect(refused.statusCode).toBe(422);
    expect(refused.body).toContain('We could not find this shipping address.');
    expect((await admin.get(ext('/orders'))).json().items).toHaveLength(1);
  });
});
