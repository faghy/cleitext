/**
 * Cleishop 1.7: the cart for page builders and scripts. The visitor's cart
 * as JSON (never cached), quantities changed and items removed with the cart
 * page's rules (same-origin only), and the cart and checkout blocks that
 * fill themselves from those routes on cached pages.
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
let mug: string;
let print: string;
let shirt: string;

const ext = (path: string) => `/api/v1/ext/shop${path}`;
let address = 0;
const visitor = () => new TestClient(app, site.host, `10.95.0.${++address}`);

async function product(
  title: string,
  data: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  const { id } = (await admin.post('/api/v1/entries', { type: 'product', title })).json() as {
    id: string;
  };
  const saved = await admin.request('PUT', ext(`/products/${id}`), { product: data, ...extra });
  expect(saved.statusCode).toBe(200);
  expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
  return id;
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
  site = await seedSite(owner, 'shop-cart-api');
  await seedUser(owner, {
    email: 'admin@shop-cart-api.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.95.1.1');
  await admin.login('admin@shop-cart-api.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
  const payments = await admin.request('PUT', ext('/payments'), {
    bacs: {
      enabled: true,
      accounts: [{ accountName: 'Bottega Srl', iban: 'IT60 X054 2811 1010 0000 0123 456' }],
    },
  });
  expect(payments.statusCode).toBe(200);

  mug = await product('Mug', { sku: 'MUG', regularPrice: '12.50', manageStock: true, stock: 3 });
  print = await product('Signed print', { regularPrice: '80', soldIndividually: true });
  const colour = (
    await admin.post(ext('/attributes'), {
      name: 'Colour',
      values: [{ name: 'Red' }, { name: 'Blue' }],
    })
  ).json().id as string;
  shirt = await product(
    'T-shirt',
    { kind: 'variable' },
    {
      attributes: [{ attributeId: colour, values: ['red', 'blue'], variation: true }],
      variations: [
        { attributes: { colour: 'red' }, sku: 'TS-R', regularPrice: '20' },
        { attributes: { colour: 'blue' }, sku: 'TS-B', regularPrice: '22' },
      ],
    },
  );
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('the cart as JSON', () => {
  it('is empty for a new visitor, and never cached', async () => {
    const res = await visitor().get('/cart/data');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.json()).toMatchObject({
      items: [],
      count: 0,
      currency: 'EUR',
      totals: { subtotal: 0, total: 0 },
      cartUrl: '/cart',
      checkoutUrl: '/checkout',
    });
    expect(res.json().html).toBeUndefined();
  });

  it('lists the items with their prices, pictures, links and totals', async () => {
    const anna = visitor();
    await anna.postForm('/cart/add', { product: mug, quantity: '2' });
    await anna.postForm('/cart/add', { product: shirt, attribute_colour: 'blue' });
    const cart = (await anna.get('/cart/data')).json();
    expect(cart.count).toBe(3);
    const mugSlug = (await admin.get(`/api/v1/entries/${mug}`)).json().slug;
    expect(cart.items[0]).toMatchObject({
      key: `${mug}:`,
      productId: mug,
      variationId: null,
      title: 'Mug',
      quantity: 2,
      price: 12.5,
      total: 25,
      url: expect.stringContaining(mugSlug),
      formatted: { price: '€12.50', total: '€25.00' },
    });
    expect(cart.items[1]).toMatchObject({
      productId: shirt,
      variationId: expect.any(String),
      attributes: [{ name: 'Colour', value: 'Blue' }],
      price: 22,
    });
    expect(cart.totals).toMatchObject({ subtotal: 47, total: 47 });
    // With the cart page's markup, for the cart block.
    const withHtml = (await anna.get('/cart/data?html=1')).json();
    expect(withHtml.html).toContain('<form method="post" action="/cart/update">');
    expect(withHtml.html).toContain('Mug');
  });
});

describe('changing the cart', () => {
  it('sets a quantity, with the stock and the cart page’s rules', async () => {
    const bea = visitor();
    await bea.postForm('/cart/add', { product: mug, quantity: '1' });
    await bea.postForm('/cart/add', { product: print });
    const more = await bea.request('POST', '/cart/item', { key: `${mug}:`, quantity: 2 });
    expect(more.statusCode).toBe(200);
    expect(more.headers['cache-control']).toContain('no-store');
    expect(more.json().items.find((i: { productId: string }) => i.productId === mug).quantity).toBe(
      2,
    );
    // No more than the stock.
    const tooMany = await bea.request('POST', '/cart/item', { key: `${mug}:`, quantity: 50 });
    expect(tooMany.json().items[0].quantity).toBe(3);
    // Sold individually: one only.
    const prints = await bea.request('POST', '/cart/item', { key: `${print}:`, quantity: 4 });
    const line = prints.json().items.find((i: { productId: string }) => i.productId === print);
    expect(line).toMatchObject({ quantity: 1, soldIndividually: true });
    // Form bodies too; 0 removes the item.
    const zero = await bea.postForm('/cart/item', { key: `${print}:`, quantity: '0' });
    expect(zero.statusCode).toBe(200);
    expect(zero.json().items.map((i: { productId: string }) => i.productId)).toEqual([mug]);
    // What the cart page shows.
    expect((await bea.get('/cart')).body).toContain('value="3"');
  });

  it('removes an item', async () => {
    const carlo = visitor();
    await carlo.postForm('/cart/add', { product: mug, quantity: '1' });
    await carlo.postForm('/cart/add', { product: print });
    const removed = await carlo.request('POST', '/cart/item/remove', { key: `${mug}:` });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ count: 1, items: [{ productId: print }] });
    expect((await carlo.get('/cart/count')).json()).toMatchObject({ count: 1 });
  });

  it('refuses unknown items, bad quantities and other sites', async () => {
    const dino = visitor();
    expect(
      (await dino.request('POST', '/cart/item', { key: `${mug}:`, quantity: 1 })).statusCode,
    ).toBe(404);
    await dino.postForm('/cart/add', { product: mug, quantity: '1' });
    expect((await dino.request('POST', '/cart/item/remove', { key: 'nothing:' })).statusCode).toBe(
      404,
    );
    expect(
      (await dino.request('POST', '/cart/item', { key: `${mug}:`, quantity: 'lots' })).statusCode,
    ).toBe(400);
    // Another site's page cannot change the cart (same rule as the cart page's forms).
    const forged = await dino.request(
      'POST',
      '/cart/item/remove',
      { key: `${mug}:` },
      { origin: 'http://evil.test' },
    );
    expect(forged.statusCode).toBe(403);
    expect((await dino.get('/cart/data')).json().count).toBe(1);
  });
});

describe('the cart and checkout blocks', () => {
  const block = (type: string) => ({
    id: `b${Math.random().toString(36).slice(2, 8)}`,
    type,
    v: 1,
    attrs: {},
  });

  it('fill a cached page with the visitor’s cart and checkout', async () => {
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Basket',
      document: { schema: 1, blocks: [block('shop/cart'), block('shop/checkout')] },
    });
    expect(created.statusCode).toBe(201);
    await admin.post(`/api/v1/entries/${created.json().id}/publish`);
    const page = await visitor().get('/basket');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('data-shop-embed="/cart/data"');
    expect(page.body).toContain('data-shop-embed="/checkout/data"');
    // Without scripts, links to the pages.
    expect(page.body).toContain('<a href="/cart">');
    const script = /<script src="(\/shop-assets\/embed-[a-z0-9]+\.js)"/.exec(page.body)?.[1];
    expect(script).toBeTruthy();
    const js = await visitor().get(script!);
    expect(js.headers['content-type']).toContain('javascript');
    expect(js.body).toContain('data-shop-embed');
  });

  it('give the checkout’s markup, or the cart’s when it is empty', async () => {
    const eva = visitor();
    const empty = await eva.get('/checkout/data');
    expect(empty.headers['cache-control']).toContain('no-store');
    expect(empty.json()).toMatchObject({ empty: true, cartUrl: '/cart', checkoutUrl: '/checkout' });
    expect(empty.json().html).toContain('Your cart is empty.');
    await eva.postForm('/cart/add', { product: mug, quantity: '1' });
    const full = (await eva.get('/checkout/data')).json();
    expect(full.empty).toBe(false);
    expect(full.html).toContain('<form method="post" action="/checkout" novalidate>');
    expect(full.html).toContain('Place order');
  });
});

describe('add-to-cart links (Cleishop 1.8)', () => {
  it('add a simple product and go to the cart, never cached nor indexed', async () => {
    const fede = visitor();
    const res = await fede.request('GET', `/cart/add?product=${mug}&quantity=2`);
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/cart?added=Mug');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect((await fede.get('/cart/data')).json()).toMatchObject({
      count: 2,
      items: [{ productId: mug }],
    });
    // Back to the product, with WooCommerce's parameter on the cart page.
    const back = await fede.request('GET', `/cart?add-to-cart=${print}&to=product`);
    expect(back.statusCode).toBe(303);
    const printSlug = (await admin.get(`/api/v1/entries/${print}`)).json().slug;
    expect(back.headers.location).toContain(printSlug);
    expect((await fede.get('/cart/count')).json().count).toBe(3);
  });

  it('apply the stock and the quantity cap; products with options go to their page', async () => {
    const gino = visitor();
    // 3 in stock: 10 asked (the cap), 3 added.
    await gino.request('GET', `/cart/add?product=${mug}&quantity=50`);
    expect((await gino.get('/cart/data')).json().items[0].quantity).toBe(3);
    const options = await gino.request('GET', `/cart/add?product=${shirt}`);
    expect(options.statusCode).toBe(303);
    const shirtSlug = (await admin.get(`/api/v1/entries/${shirt}`)).json().slug;
    expect(options.headers.location).toContain(shirtSlug);
    expect((await gino.get('/cart/count')).json().count).toBe(3);
    const unknown = await gino.request(
      'GET',
      '/cart/add?product=00000000-0000-4000-8000-000000000000',
    );
    expect(unknown.headers.location).toMatch(/^\/cart\?error=/);
  });

  it('add nothing from another site’s picture or script, or for a bot', async () => {
    const inject = (headers: Record<string, string>, ip: string) =>
      app.inject({
        method: 'GET',
        url: `/cart/add?product=${mug}`,
        remoteAddress: ip,
        headers: { host: site.host, ...headers },
      });
    const refused: Record<string, string>[] = [
      { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' },
      { 'sec-purpose': 'prefetch' },
      { 'user-agent': 'Googlebot/2.1' },
    ];
    for (const [i, headers] of refused.entries()) {
      const res = await inject(headers, `10.95.2.${i + 1}`);
      expect(res.statusCode).toBe(303);
      expect(res.cookies).toHaveLength(0);
    }
  });

  it('are limited for each visitor', async () => {
    const hugo = visitor();
    const codes: number[] = [];
    for (let i = 0; i < 31; i++)
      codes.push((await hugo.request('GET', `/cart/add?product=${print}`)).statusCode);
    expect(codes.slice(0, 30).every((c) => c === 303)).toBe(true);
    expect(codes[30]).toBe(429);
  });
});
