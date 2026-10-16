/**
 * The Shop plugin, milestone 2: a visitor buys. Buy box on the product page,
 * cart in a cookie, checkout with a bank transfer, the order with its stock
 * taken, the order page with the bank details.
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
let shirt: string;
let mugPath: string;

const ext = (path: string) => `/api/v1/ext/shop${path}`;

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
};

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
  site = await seedSite(owner, 'shop-checkout');
  await seedUser(owner, {
    email: 'admin@shop-checkout.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.92.0.1');
  await admin.login('admin@shop-checkout.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
  expect(
    (
      await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
        bankAccountName: 'Bottega Srl',
        bankIban: 'it60 x054 2811 1010 0000 0123 456',
        termsUrl: 'http://shop-checkout.test/terms',
      })
    ).statusCode,
  ).toBe(200);

  mug = await product('Mug', { sku: 'MUG', regularPrice: '12.50', manageStock: true, stock: 3 });
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
        {
          attributes: { colour: 'red' },
          sku: 'TS-R',
          regularPrice: '20',
          manageStock: true,
          stock: 1,
        },
        { attributes: { colour: 'blue' }, sku: 'TS-B', regularPrice: '22' },
      ],
    },
  );
  mugPath = (await admin.get(`/api/v1/entries/${mug}`)).json().slug;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('buying', () => {
  const visitor = () => new TestClient(app, site.host, '10.92.0.9');
  let anna: TestClient;

  it('shows the buy box on product pages, cached until the product changes', async () => {
    anna = visitor();
    const page = await anna.get(`/product/${mugPath}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<form class="shop-buy__form" action="/cart/add" method="post">');
    expect(page.body).toContain('€12.50');
    expect(page.body).toContain('In stock');
    expect((await anna.get(`/product/${mugPath}`)).headers['x-cache']).toBe('HIT');
    await admin.request('PATCH', ext(`/products/${mug}/quick`), { regularPrice: '12.90' });
    const changed = await anna.get(`/product/${mugPath}`);
    expect(changed.headers['x-cache']).toBe('MISS');
    expect(changed.body).toContain('€12.90');
  });

  it('keeps a cart in a cookie, with what is left in stock', async () => {
    const added = await anna.postForm('/cart/add', { product: mug, quantity: '2' });
    expect(added.statusCode).toBe(303);
    expect(added.headers.location).toBe('/cart?added=Mug');
    expect(added.cookies.find((c: { name: string }) => c.name === 'shop_cart')).toMatchObject({
      httpOnly: true,
    });

    const none = await anna.postForm('/cart/add', { product: shirt });
    expect(decodeURIComponent(String(none.headers.location).replace(/\+/g, ' '))).toContain(
      'This combination is not available.',
    );
    // Five red shirts asked, one in stock.
    await anna.postForm('/cart/add', { product: shirt, attribute_colour: 'red', quantity: '5' });

    const cart = await anna.get('/cart');
    expect(cart.statusCode).toBe(200);
    expect(cart.headers['cache-control']).toBe('private, no-store');
    expect(cart.body).toContain('Mug');
    expect(cart.body).toContain('Colour: Red');
    expect(cart.body).toMatch(/name="qty_[^"]+" value="1"/);
    expect(cart.body).toContain('€45.80'); // 2 × 12.90 + 20
  });

  it('checks the details at checkout and keeps what was typed', async () => {
    expect((await anna.get('/checkout')).body).toContain('name="billing.firstName"');
    const wrong = await anna.postForm('/checkout', {
      ...billing,
      'billing.postcode': '170',
      email: 'nope',
      terms: '',
    });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.body).toContain('Not a valid postcode');
    expect(wrong.body).toContain('Not a valid email address');
    expect(wrong.body).toContain('Accept the terms to place the order.');
    expect(wrong.body).toContain('value="Via Roma 1"');
  });

  it('places the order, takes the stock and empties the cart', async () => {
    const placed = await anna.postForm('/checkout', billing);
    expect(placed.statusCode).toBe(303);
    const location = String(placed.headers.location);
    expect(location).toMatch(/^\/order-received\/1\?key=order_/);

    const received = await anna.get(location);
    expect(received.statusCode).toBe(200);
    expect(received.body).toContain('Thank you: we received your order.');
    expect(received.body).toContain('IT60 X054 2811 1010 0000 0123 456');
    expect(received.body).toContain('Order 1');
    expect(received.body).toContain('17019 Varazze (SV)');
    // Without the key, the order is nobody's business.
    expect((await visitor().get('/order-received/1')).statusCode).toBe(404);

    const orders = (await admin.get(ext('/orders'))).json();
    expect(orders[0]).toMatchObject({
      number: 1,
      status: 'on-hold',
      total: '45.80',
      email: 'anna@example.test',
    });
    const mugNow = (await admin.get(ext(`/products/${mug}`))).json();
    expect(mugNow).toMatchObject({ stock: 1, totalSales: 2 });
    const shirtNow = (await admin.get(ext(`/products/${shirt}`))).json();
    expect(shirtNow.variations[0]).toMatchObject({ stock: 0, stockStatus: 'outofstock' });
    expect((await anna.get('/cart')).body).toContain('Your cart is empty.');
  });

  it('never sells more than there is', async () => {
    const bruno = visitor();
    await bruno.postForm('/cart/add', { product: mug, quantity: '2' });
    const cart = await bruno.get('/cart');
    expect(cart.body).toMatch(/name="qty_[^"]+" value="1"/);
    // Meanwhile someone buys the last one: the checkout sends Bruno back to the cart.
    const carla = visitor();
    await carla.postForm('/cart/add', { product: mug, quantity: '1' });
    expect((await carla.postForm('/checkout', billing)).statusCode).toBe(303);
    const late = await bruno.postForm('/checkout', billing);
    expect(late.headers.location).toMatch(/^\/cart\?error=/);
    expect((await admin.get(ext(`/products/${mug}`))).json()).toMatchObject({
      stock: 0,
      stockStatus: 'outofstock',
    });
  });
});
