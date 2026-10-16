/**
 * The Shop plugin, milestone 1: products as entries with categories and
 * brands, their commercial data kept by the plugin, and the admin list with
 * filters that stack.
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
let author: TestClient;

const ext = (path: string) => `/api/v1/ext/shop${path}`;

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
  site = await seedSite(owner, 'shop-catalog');
  await seedUser(owner, {
    email: 'admin@shop-catalog.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'author@shop-catalog.test',
    password: PASSWORD,
    site,
    role: 'author',
  });
  admin = new TestClient(app, site.host, '10.91.0.1');
  await admin.login('admin@shop-catalog.test', PASSWORD);
  author = new TestClient(app, site.host, '10.91.0.2');
  await author.login('author@shop-catalog.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

async function term(taxonomy: string, name: string, parentId?: string) {
  const res = await admin.post(`/api/v1/taxonomies/${taxonomy}/terms`, {
    name,
    ...(parentId ? { parentId } : {}),
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

/** A product as the admin form makes it: the entry through the core, then the shop data. */
async function product(
  title: string,
  terms: { category?: string; brand?: string },
  data: Record<string, unknown>,
  publish = true,
) {
  const entry = await admin.post('/api/v1/entries', { type: 'product', title });
  expect(entry.statusCode).toBe(201);
  const { id } = entry.json() as { id: string };
  const assigned = await admin.request('PATCH', `/api/v1/entries/${id}`, {
    terms: {
      'product-category': terms.category ? [terms.category] : [],
      brand: terms.brand ? [terms.brand] : [],
    },
  });
  expect(assigned.statusCode).toBe(200);
  const saved = await admin.request('PUT', ext(`/products/${id}`), { product: data });
  expect(saved.statusCode).toBe(200);
  if (publish) expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
  return id;
}

let phones: { id: string };
let smartphones: { id: string };
let laptops: { id: string };
let acme: { id: string };
let zeta: { id: string };
let first: string;

describe('setup', () => {
  it('adds products, product categories with an image and brands with a logo', async () => {
    const types = (await admin.get('/api/v1/content-types')).json();
    expect(types.find((t: { slug: string }) => t.slug === 'product')).toMatchObject({
      source: 'plugin:shop',
      permalink: '/product/{slug}',
    });
    const taxonomies = (await admin.get('/api/v1/taxonomies')).json();
    expect(taxonomies.find((t: { slug: string }) => t.slug === 'product-category')).toMatchObject({
      hierarchical: true,
      fields: [{ name: 'image' }],
    });
    expect(taxonomies.find((t: { slug: string }) => t.slug === 'brand')).toMatchObject({
      fields: [{ name: 'logo' }, { name: 'website' }],
    });
    phones = await term('product-category', 'Phones');
    smartphones = await term('product-category', 'Smartphones', phones.id);
    laptops = await term('product-category', 'Laptops');
    acme = await term('brand', 'Acme');
    zeta = await term('brand', 'Zeta');
    const setup = (await admin.get(ext('/setup'))).json();
    expect(setup.settings).toMatchObject({ currency: 'EUR', lowStock: 2, wizard: false });
    expect(setup.categories.map((c: { name: string }) => c.name)).toEqual([
      'Laptops',
      'Phones',
      'Smartphones',
    ]);
  });

  it('is for shop managers only', async () => {
    expect((await author.get(ext('/products'))).statusCode).toBe(403);
  });
});

describe('products', () => {
  it('keep their commercial data, with the stock status following the quantity', async () => {
    first = await product(
      'Acme One',
      { category: smartphones.id, brand: acme.id },
      {
        sku: 'AC-1',
        gtin: '8001234567890',
        cost: '200',
        listPrice: '349,90',
        regularPrice: '299.90',
        manageStock: true,
        stock: 0,
        weight: 0.2,
      },
    );
    const view = (await admin.get(ext(`/products/${first}`))).json();
    expect(view).toMatchObject({
      entryId: first,
      title: 'Acme One',
      status: 'published',
      sku: 'AC-1',
      cost: '200.0000',
      listPrice: '349.9000',
      regularPrice: '299.9000',
      stockStatus: 'outofstock',
      categoryIds: [smartphones.id],
      brandId: acme.id,
      weight: '0.200',
    });
  });

  it('refuse a code used by another product, and wrong values', async () => {
    const other = await product(
      'Acme Two',
      { category: phones.id, brand: acme.id },
      {
        regularPrice: '150',
        salePrice: '120',
      },
    );
    const taken = await admin.request('PUT', ext(`/products/${other}`), {
      product: { sku: 'ac-1' },
    });
    expect(taken.statusCode).toBe(400);
    expect(taken.json().detail).toContain('ac-1');
    const wrong = await admin.request('PUT', ext(`/products/${other}`), {
      product: { regularPrice: 'cheap', gtin: '12' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['product.regularPrice', 'product.gtin']),
    );
  });

  it('are listed with filters that stack and the brands of the category', async () => {
    await product(
      'Zeta Book',
      { category: laptops.id, brand: zeta.id },
      {
        regularPrice: '999',
        manageStock: true,
        stock: 1,
      },
    );
    await product(
      'Zeta Phone',
      { category: smartphones.id, brand: zeta.id },
      {
        regularPrice: '199',
        condition: 'used',
      },
      false,
    );

    const list = async (query: string) => (await admin.get(ext(`/products?${query}`))).json();
    // Phones include Smartphones.
    const inPhones = await list(`category=${phones.id}`);
    expect(inPhones.items.map((p: { title: string }) => p.title).sort()).toEqual([
      'Acme One',
      'Acme Two',
      'Zeta Phone',
    ]);
    expect(inPhones.brands).toEqual([
      { id: acme.id, name: 'Acme', count: 2 },
      { id: zeta.id, name: 'Zeta', count: 1 },
    ]);
    expect(inPhones.statuses).toMatchObject({ published: 2, draft: 1 });
    // The brand filter keeps the other brands' counts.
    const acmePhones = await list(`category=${phones.id}&brand=${acme.id}`);
    expect(acmePhones.total).toBe(2);
    expect(acmePhones.brands).toHaveLength(2);
    expect((await list('sale=1')).items.map((p: { title: string }) => p.title)).toEqual([
      'Acme Two',
    ]);
    expect((await list('condition=used')).items.map((p: { title: string }) => p.title)).toEqual([
      'Zeta Phone',
    ]);
    expect((await list('stock=low')).items.map((p: { title: string }) => p.title).sort()).toEqual([
      'Acme One',
      'Zeta Book',
    ]);
    expect((await list('q=ac-1')).total).toBe(1);
    const byPrice = await list('sort=price&dir=asc');
    expect(byPrice.items.map((p: { price: string }) => Number(p.price))).toEqual([
      120, 199, 299.9, 999,
    ]);
    expect(byPrice.items[0]).toMatchObject({ onSale: true, regularPrice: '150.0000' });
  });

  it('change price and stock from the list', async () => {
    const res = await admin.request('PATCH', ext(`/products/${first}/quick`), {
      stock: 7,
      regularPrice: '289,90',
    });
    expect(res.statusCode).toBe(204);
    const view = (await admin.get(ext(`/products/${first}`))).json();
    expect(view).toMatchObject({ stock: 7, stockStatus: 'instock', regularPrice: '289.9000' });
  });

  it('follow their entry: title, terms and trash', async () => {
    await admin.request('PATCH', `/api/v1/entries/${first}`, {
      title: 'Acme One Pro',
      terms: { 'product-category': [phones.id] },
    });
    const view = (await admin.get(ext(`/products/${first}`))).json();
    expect(view).toMatchObject({ title: 'Acme One Pro', categoryIds: [phones.id] });
  });

  it('are duplicated with their data, as drafts without codes', async () => {
    const res = await admin.post(ext(`/products/${first}/duplicate`));
    expect(res.statusCode).toBe(201);
    const copy = (await admin.get(ext(`/products/${res.json().id}`))).json();
    expect(copy).toMatchObject({ status: 'draft', sku: '', regularPrice: '289.9000', stock: 7 });
  });
});

describe('variations', () => {
  it('belong to variable products, with shared attributes and their own prices', async () => {
    const created = await admin.post(ext('/attributes'), {
      name: 'Colour',
      kind: 'color',
      values: [
        { name: 'Red', color: '#cc0000' },
        { name: 'Blue', color: '#0000cc' },
      ],
    });
    expect(created.statusCode).toBe(201);
    const colour = created.json().id as string;
    const id = await product(
      'Zeta Case',
      { category: phones.id, brand: zeta.id },
      {
        kind: 'variable',
      },
    );
    const saved = await admin.request('PUT', ext(`/products/${id}`), {
      attributes: [{ attributeId: colour, values: ['red', 'blue'], variation: true }],
      variations: [
        { attributes: { colour: 'red' }, sku: 'ZC-R', regularPrice: '19', salePrice: '15' },
        { attributes: { colour: 'blue' }, sku: 'ZC-B', regularPrice: '21' },
      ],
    });
    expect(saved.statusCode).toBe(200);
    const view = saved.json();
    expect(view.variations.map((v: { sku: string }) => v.sku)).toEqual(['ZC-R', 'ZC-B']);
    // Saved again with the ids: kept; one removed.
    const again = await admin.request('PUT', ext(`/products/${id}`), {
      variations: [{ ...view.variations[1], regularPrice: '22' }],
    });
    expect(again.json().variations).toMatchObject([
      { id: view.variations[1].id, regularPrice: '22.0000' },
    ]);
    const list = (await admin.get(ext(`/products?q=Zeta Case`))).json();
    expect(list.items[0]).toMatchObject({
      kind: 'variable',
      price: '22.0000',
      priceMax: '22.0000',
      stockStatus: 'instock',
      stock: null,
    });
    const taken = await admin.request('PUT', ext(`/products/${first}`), {
      product: { sku: 'zc-b' },
    });
    expect(taken.statusCode).toBe(400);
  });
});

describe('CSV', () => {
  it('exports the filtered products with WooCommerce’s columns and ours', async () => {
    const res = await admin.get(ext(`/export.csv?category=${laptops.id}`));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const [header, row, end] = res.body.replace(/^\uFEFF/, '').split('\r\n');
    expect(header).toContain('ID,Type,SKU,"GTIN, UPC, EAN, or ISBN",Name,Published');
    expect(header).toContain('Cost,List price,Condition,Categories,Brands');
    expect(row).toContain('Zeta Book');
    expect(row).toContain('Laptops');
    expect(end).toBe('');
  });

  it('finds the products of an import by id and code', async () => {
    const res = await admin.post(ext('/import/match'), {
      ids: [first],
      skus: ['ZC-B', 'AC-1', 'none'],
    });
    expect(res.json()).toEqual({ ids: [first], skus: { 'ac-1': first } });
  });
});

describe('pricing rules', () => {
  it('are kept per site', async () => {
    const rules = {
      surcharge: 3.2,
      tiers: [
        { upTo: 30, markup: 65 },
        { upTo: null, markup: 35 },
      ],
      discount: 10,
      rounding: 'ninety',
    };
    expect((await admin.request('PUT', ext('/pricing'), rules)).statusCode).toBe(200);
    expect((await admin.get(ext('/pricing'))).json()).toEqual(rules);
    expect(
      (await admin.request('PUT', ext('/pricing'), { ...rules, rounding: 'weird' })).statusCode,
    ).toBe(400);
  });
});
