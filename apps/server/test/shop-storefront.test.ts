/**
 * The Shop plugin, milestone 5: the storefront. The shop page and the
 * archives of categories and brands with filters (cached, for search
 * engines), product pages with breadcrumbs, structured data and related
 * products, the cart link, and the customer's account: orders, addresses,
 * a cart that follows them.
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
const ids: Record<string, string> = {};
const terms: Record<string, { id: string; slug: string }> = {};

const ext = (path: string) => `/api/v1/ext/shop${path}`;
const names = (body: string) =>
  [...body.matchAll(/class="shop-card__title">\s*<a href="[^"]+">([^<]+)<\/a/g)].map((m) => m[1]);

async function term(taxonomy: string, name: string, parentId?: string) {
  const res = await admin.post(`/api/v1/taxonomies/${taxonomy}/terms`, {
    name,
    ...(parentId ? { parentId } : {}),
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; slug: string };
}

async function product(
  title: string,
  assigned: { category?: string; brand?: string },
  data: Record<string, unknown>,
) {
  const { id } = (await admin.post('/api/v1/entries', { type: 'product', title })).json() as {
    id: string;
  };
  await admin.request('PATCH', `/api/v1/entries/${id}`, {
    terms: {
      'product-category': assigned.category ? [assigned.category] : [],
      brand: assigned.brand ? [assigned.brand] : [],
    },
  });
  expect((await admin.request('PUT', ext(`/products/${id}`), { product: data })).statusCode).toBe(
    200,
  );
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
  site = await seedSite(owner, 'shop-front');
  await seedUser(owner, {
    email: 'front-admin@shop-front.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'gina@shop-front.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
  });
  await seedUser(owner, {
    email: 'ugo@shop-front.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
  });
  admin = new TestClient(app, site.host, '10.94.0.1');
  await admin.login('front-admin@shop-front.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);

  terms.home = await term('product-category', 'Home');
  terms.lamps = await term('product-category', 'Lamps', terms.home.id);
  terms.garden = await term('product-category', 'Garden');
  terms.lumo = await term('brand', 'Lumo');
  terms.verde = await term('brand', 'Verde');
  ids.desk = await product(
    'Desk lamp',
    { category: terms.lamps.id, brand: terms.lumo.id },
    { sku: 'LAMP-1', regularPrice: '40', salePrice: '30', gtin: '4006381333931' },
  );
  ids.floor = await product(
    'Floor lamp',
    { category: terms.lamps.id, brand: terms.lumo.id },
    { sku: 'LAMP-2', regularPrice: '120' },
  );
  ids.pot = await product(
    'Clay pot',
    { category: terms.garden.id, brand: terms.verde.id },
    { sku: 'POT', regularPrice: '15', manageStock: true, stock: 0 },
  );
  await admin.request('PUT', ext(`/products/${ids.floor}`), {
    product: { upsellIds: [ids.desk] },
  });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('the catalog', () => {
  const visitor = () => new TestClient(app, site.host, '10.94.0.9');

  it('lists the shop with filters and counts, cached and indexed', async () => {
    const shop = await visitor().get('/shop');
    expect(shop.statusCode).toBe(200);
    expect(shop.headers['x-cache']).toBe('MISS');
    expect(names(shop.body).sort()).toEqual(['Clay pot', 'Desk lamp', 'Floor lamp']);
    expect(shop.body).not.toMatch(/<meta name="robots" content="noindex/);
    expect(shop.body).toContain('"@type":"BreadcrumbList"');
    expect(shop.body).toMatch(/<del>€40\.00<\/del><ins>€30\.00<\/ins>/);
    expect(shop.body).toContain('Lumo <span class="shop-count">(2)</span>');
    // The top categories with their products, subcategories included.
    expect(shop.body).toMatch(
      /href="\/product-category\/home">Home <span class="shop-count">\(2\)/,
    );
    expect((await visitor().get('/shop')).headers['x-cache']).toBe('HIT');

    const filtered = (path: string) =>
      visitor()
        .get(path)
        .then((r) => names(r.body));
    expect(await filtered('/shop?brand=verde')).toEqual(['Clay pot']);
    expect((await filtered('/shop?brand=verde&brand=lumo')).length).toBe(3);
    expect(await filtered('/shop?min_price=20&max_price=50')).toEqual(['Desk lamp']);
    expect(await filtered('/shop?on_sale=1')).toEqual(['Desk lamp']);
    expect((await filtered('/shop?in_stock=1')).sort()).toEqual(['Desk lamp', 'Floor lamp']);
    expect(await filtered('/shop?orderby=price')).toEqual(['Clay pot', 'Desk lamp', 'Floor lamp']);
    expect(await filtered('/shop?orderby=price-desc')).toEqual([
      'Floor lamp',
      'Desk lamp',
      'Clay pot',
    ]);
    // Filtered pages are not for search engines.
    expect((await visitor().get('/shop?brand=verde')).body).toMatch(
      /<meta name="robots" content="noindex/,
    );
  });

  it('has archives of categories (with subcategories) and brands', async () => {
    const home = await visitor().get('/product-category/home');
    expect(home.statusCode).toBe(200);
    expect(names(home.body).sort()).toEqual(['Desk lamp', 'Floor lamp']);
    expect(home.body).toContain('<a href="/shop">Shop</a>');
    const lamps = await visitor().get('/product-category/lamps');
    expect(lamps.body).toContain('<a href="/product-category/home">Home</a>');
    expect(names((await visitor().get('/brand/verde')).body)).toEqual(['Clay pot']);
    expect((await visitor().get('/product-category/nothing')).statusCode).toBe(404);
  });

  it('refreshes when a price changes', async () => {
    expect((await visitor().get('/shop')).headers['x-cache']).toBe('HIT');
    await admin.request('PATCH', ext(`/products/${ids.pot}/quick`), { regularPrice: '17' });
    const after = await visitor().get('/shop');
    expect(after.headers['x-cache']).toBe('MISS');
    expect(after.body).toContain('€17.00');
  });

  it('shows the path, the structured data and related products on product pages', async () => {
    const slug = (await admin.get(`/api/v1/entries/${ids.floor}`)).json().slug;
    const page = await visitor().get(`/product/${slug}`);
    expect(page.body).toMatch(
      /<a href="\/shop">Shop<\/a><\/li>\s*<li><a href="\/product-category\/home">Home<\/a><\/li>\s*<li><a href="\/product-category\/lamps">Lamps<\/a>/,
    );
    const data = [...page.body.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]!))
      .find((d) => d['@type'] === 'Product');
    expect(data).toMatchObject({
      name: 'Floor lamp',
      sku: 'LAMP-2',
      brand: { name: 'Lumo' },
      offers: { '@type': 'Offer', price: '120.00', priceCurrency: 'EUR' },
    });
    // The up-sell chosen in the product.
    expect(page.body).toContain('You may also like');
    expect(names(page.body.slice(page.body.indexOf('You may also like')))).toEqual(['Desk lamp']);
  });

  it('has blocks for pages: a grid of products and the cart link', async () => {
    const block = (type: string, attrs: Record<string, unknown>) => ({
      id: `b${Math.random().toString(36).slice(2, 8)}`,
      type,
      v: 1,
      attrs,
    });
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Deals',
      document: {
        schema: 1,
        blocks: [
          block('shop/products', { heading: 'On sale now', show: 'sale', limit: 4 }),
          block('shop/products', { show: 'latest', category: 'garden' }),
          block('shop/cart-link', {}),
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    await admin.post(`/api/v1/entries/${created.json().id}/publish`);
    const page = await visitor().get('/deals');
    expect(page.body).toContain('<h2>On sale now</h2>');
    expect(names(page.body)).toEqual(['Desk lamp', 'Clay pot']);
    expect(page.body).toMatch(/<a class="shop-cart-link" href="\/cart">/);
    const script = /<script src="(\/shop-assets\/cart-[a-z0-9]+\.js)"/.exec(page.body)?.[1];
    expect(script).toBeTruthy();
    const js = await visitor().get(script!);
    expect(js.headers['content-type']).toContain('javascript');
    expect(js.body).toContain('/cart/count');
  });

  it('shows the pictures beside the buy box, and only published changes', async () => {
    const slug = (await admin.get(`/api/v1/entries/${ids.desk}`)).json().slug;
    const page = await visitor().get(`/product/${slug}`);
    expect(page.body).toMatch(/<div class="shop-summary[^"]*">/);
    expect(page.body).toContain('shop-buy__form');
    // A change not published yet stays in the admin.
    await admin.request('PATCH', `/api/v1/entries/${ids.desk}`, { title: 'Desk lamp (draft)' });
    expect((await admin.get(ext(`/products/${ids.desk}`))).json().title).toBe('Desk lamp (draft)');
    expect(names((await visitor().get('/shop?orderby=title')).body)).toContain('Desk lamp');
    expect(names((await visitor().get('/shop?orderby=title')).body)).not.toContain(
      'Desk lamp (draft)',
    );
    await admin.post(`/api/v1/entries/${ids.desk}/publish`);
    expect(names((await visitor().get('/shop?orderby=title')).body)).toContain('Desk lamp (draft)');
  });

  it('counts the cart for the cart link', async () => {
    const anna = visitor();
    expect((await anna.get('/cart/count')).json()).toMatchObject({ count: 0 });
    await anna.postForm('/cart/add', { product: ids.desk!, quantity: '2' });
    const counted = await anna.get('/cart/count');
    expect(counted.json()).toMatchObject({ count: 2 });
    expect(counted.headers['cache-control']).toContain('no-store');
  });
});

describe('the account', () => {
  let gina: TestClient;
  const billing = {
    email: 'gina@shop-front.test',
    'billing.firstName': 'Gina',
    'billing.lastName': 'Neri',
    'billing.address1': 'Via Garibaldi 5',
    'billing.city': 'Genova',
    'billing.postcode': '16124',
    'billing.province': 'GE',
    'billing.country': 'IT',
    'billing.phone': '010 555555',
    payment: 'bacs',
  };

  it('links the orders and addresses from the account page', async () => {
    gina = new TestClient(app, site.host, '10.94.0.20');
    await gina.login('gina@shop-front.test', PASSWORD);
    const account = await gina.get('/account');
    expect(account.body).toContain('<a href="/account/orders">Your orders</a>');
    expect(account.body).toContain('<a href="/account/addresses">Addresses</a>');
    expect((await gina.get('/account/orders')).body).toContain('You have no orders yet.');
    // Visitors sign in first.
    const anonymous = await new TestClient(app, site.host, '10.94.0.21').get('/account/orders');
    expect(anonymous.headers.location).toBe('/account/login?redirect=%2Faccount%2Forders');
  });

  it('keeps the addresses of an order and fills the next checkout', async () => {
    await gina.postForm('/cart/add', { product: ids.desk!, quantity: '1' });
    const first = await gina.get('/checkout');
    expect(first.body).not.toContain('Returning customer?');
    const placed = await gina.postForm('/checkout', billing);
    expect(placed.statusCode).toBe(303);

    const orders = await gina.get('/account/orders');
    expect(orders.body).toMatch(/<td>#\d+<\/td>/);
    const number = /<td>#(\d+)<\/td>/.exec(orders.body)![1];
    expect(orders.body).toContain('On hold');
    const detail = await gina.get(`/account/orders/${number}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.body).toContain('Desk lamp');
    expect(detail.body).not.toContain('Thank you');

    // Somebody else's order does not exist for Ugo.
    const ugo = new TestClient(app, site.host, '10.94.0.22');
    await ugo.login('ugo@shop-front.test', PASSWORD);
    expect((await ugo.get(`/account/orders/${number}`)).statusCode).toBe(404);

    await gina.postForm('/cart/add', { product: ids.floor!, quantity: '1' });
    const next = await gina.get('/checkout');
    expect(next.body).toContain('value="Via Garibaldi 5"');
    expect(next.body).toContain('value="gina@shop-front.test"');
    // Visitors are offered to sign in.
    const guest = new TestClient(app, site.host, '10.94.0.23');
    await guest.postForm('/cart/add', { product: ids.desk! });
    expect((await guest.get('/checkout')).body).toContain('Returning customer?');
  });

  it('edits the addresses in the account', async () => {
    const page = await gina.get('/account/addresses');
    expect(page.body).toContain('value="Genova"');
    const wrong = await gina.postForm('/account/addresses', {
      ...Object.fromEntries(Object.entries(billing).filter(([k]) => k.startsWith('billing.'))),
      'billing.postcode': '1',
    });
    expect(wrong.statusCode).toBe(422);
    const saved = await gina.postForm('/account/addresses', {
      ...Object.fromEntries(Object.entries(billing).filter(([k]) => k.startsWith('billing.'))),
      'billing.city': 'Savona',
      'billing.postcode': '17100',
      'billing.province': 'SV',
    });
    expect(saved.headers.location).toBe('/account/addresses?saved=1');
    expect((await gina.get('/checkout')).body).toContain('value="Savona"');
  });

  it('gives a customer their cart on another device', async () => {
    const phone = new TestClient(app, site.host, '10.94.0.24');
    await phone.login('gina@shop-front.test', PASSWORD);
    const cart = await phone.get('/cart');
    expect(cart.body).toContain('Floor lamp');
    expect(cart.cookies.find((c: { name: string }) => c.name === 'shop_cart')).toBeTruthy();
  });
});
