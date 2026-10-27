/**
 * The Shop plugin with the Multilingual plugin: a product's translations
 * share its prices, codes, stock and variations; titles and descriptions
 * stay in each language; an order in any language takes from the same stock.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { withContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
  unlockMultilingual,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
const ids: Record<string, string> = {};

const ext = (p: string) => `/api/v1/ext/shop${p}`;
const product = async (id: string) => (await admin.get(ext(`/products/${id}`))).json();
const save = async (id: string, body: unknown) => {
  const response = await admin.request('PUT', ext(`/products/${id}`), body);
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
};
const translate = async (id: string) => {
  const response = await admin.post(`/api/v1/ext/multilingual/translations/entry/${id}`, {
    locale: 'it',
  });
  expect(response.statusCode, response.body).toBe(201);
  const it = response.json().id as string;
  expect((await admin.post(`/api/v1/entries/${it}/publish`)).statusCode).toBe(200);
  return it;
};

async function install(name: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${name}-src-`)), name);
  await cp(join(pluginsRoot, name), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('shop', pluginsPath);
  await install('multilingual', pluginsPath);
  app = await startTestApp({ pluginsPath });
  unlockMultilingual();
  site = await seedSite(owner, 'shop-langs');
  await seedUser(owner, {
    email: 'langs-admin@shop-langs.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.97.0.1');
  await admin.login('langs-admin@shop-langs.test', PASSWORD);
  for (const slug of ['multilingual', 'shop'])
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  expect(
    (await admin.post('/api/v1/ext/multilingual/languages', { code: 'it' })).statusCode,
  ).toBeLessThan(300);
  await admin.request('PUT', ext('/payments'), {
    bacs: { enabled: true, accounts: [{ iban: 'IT60X0542811101000000123456' }] },
  });

  const lamp = (await admin.post('/api/v1/entries', { type: 'product', title: 'Lamp' })).json();
  await save(lamp.id, {
    product: { sku: 'LAMP', regularPrice: '40', manageStock: true, stock: 5 },
  });
  await admin.post(`/api/v1/entries/${lamp.id}/publish`);
  ids.lamp = lamp.id;

  const shirt = (await admin.post('/api/v1/entries', { type: 'product', title: 'Shirt' })).json();
  await save(shirt.id, {
    product: { kind: 'variable', regularPrice: '20' },
    attributes: [{ name: 'Size', values: ['S', 'M'], variation: true }],
    variations: [
      {
        attributes: { Size: 'S' },
        sku: 'SHIRT-S',
        regularPrice: '20',
        manageStock: true,
        stock: 3,
      },
      {
        attributes: { Size: 'M' },
        sku: 'SHIRT-M',
        regularPrice: '22',
        manageStock: true,
        stock: 3,
      },
    ],
  });
  await admin.post(`/api/v1/entries/${shirt.id}/publish`);
  ids.shirt = shirt.id;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('products in several languages', () => {
  it('gives a translation the prices, codes, stock and variations of the original', async () => {
    ids.lampIt = await translate(ids.lamp!);
    ids.shirtIt = await translate(ids.shirt!);
    expect(await product(ids.lampIt)).toMatchObject({
      locale: 'it',
      sku: 'LAMP',
      regularPrice: '40.0000',
      manageStock: true,
      stock: 5,
      groupId: ids.lamp,
    });
    const shirtIt = await product(ids.shirtIt);
    expect(shirtIt.kind).toBe('variable');
    expect(shirtIt.attributes).toEqual([
      expect.objectContaining({ name: 'Size', values: ['S', 'M'] }),
    ]);
    expect(shirtIt.variations.map((v: { sku: string; stock: number }) => [v.sku, v.stock])).toEqual(
      [
        ['SHIRT-S', 3],
        ['SHIRT-M', 3],
      ],
    );
  });

  it('keeps shared data the same in every language, texts apart', async () => {
    const en = await product(ids.shirt!);
    await save(ids.shirt!, {
      product: { regularPrice: '25' },
      variations: en.variations.map((v: Record<string, unknown>) =>
        v.sku === 'SHIRT-M' ? { ...v, stock: 10 } : v,
      ),
    });
    const it = await product(ids.shirtIt!);
    expect(it.regularPrice).toBe('25.0000');
    expect(it.variations.find((v: { sku: string }) => v.sku === 'SHIRT-M').stock).toBe(10);
    // A description written in Italian stays Italian.
    await save(ids.shirtIt!, {
      variations: it.variations.map((v: Record<string, unknown>) =>
        v.sku === 'SHIRT-M' ? { ...v, description: 'Taglia media' } : v,
      ),
    });
    const after = await product(ids.shirt!);
    expect(after.variations.find((v: { sku: string }) => v.sku === 'SHIRT-M')).toMatchObject({
      description: '',
      stock: 10,
    });
    // The code is the product's in every language, and nobody else's.
    const other = (await admin.post('/api/v1/entries', { type: 'product', title: 'Other' })).json();
    const clash = await admin.request('PUT', ext(`/products/${other.id}`), {
      product: { sku: 'LAMP' },
    });
    expect(clash.statusCode).toBe(400);
  });

  it('takes an order in Italian from the stock of every language', async () => {
    const buyer = new TestClient(app, site.host, '10.97.0.5');
    await buyer.postForm('/it/cart/add', { product: ids.lampIt!, quantity: '2' });
    const placed = await buyer.postForm('/it/checkout', {
      email: 'eva@example.test',
      'billing.firstName': 'Eva',
      'billing.lastName': 'Rossi',
      'billing.address1': 'Via Roma 1',
      'billing.city': 'Milano',
      'billing.postcode': '20121',
      'billing.province': 'MI',
      'billing.country': 'IT',
      'billing.phone': '02 123456',
      payment: 'bacs',
    });
    expect(placed.statusCode, placed.body).toBe(303);
    expect((await product(ids.lamp!)).stock).toBe(3);
    expect((await product(ids.lampIt!)).stock).toBe(3);
    expect((await product(ids.lamp!)).totalSales).toBe(2);
  });

  it('copies a duplicate without its codes, outside the group', async () => {
    const copy = await admin.post(ext(`/products/${ids.lamp}/duplicate`));
    expect(copy.statusCode).toBe(201);
    expect(await product(copy.json().id)).toMatchObject({
      sku: '',
      regularPrice: '40.0000',
      groupId: null,
    });
  });

  it('groups products translated before the shop kept groups', async () => {
    const vase = (await admin.post('/api/v1/entries', { type: 'product', title: 'Vase' })).json();
    await save(vase.id, { product: { sku: 'VASE', regularPrice: '12' } });
    const vaseIt = await translate(vase.id);
    // As an older Cleishop left them: no group, nothing commercial in the translation.
    await withContext(owner.db, { siteId: site.id }, async (tx) => {
      await tx.execute(
        sql`UPDATE plg_shop.products SET group_id = NULL, sku = '', regular_price = NULL WHERE entry_id = ${vaseIt}`,
      );
      await tx.execute(
        sql`UPDATE plg_shop.products SET group_id = NULL WHERE entry_id = ${vase.id}`,
      );
    });
    expect((await product(vaseIt)).regularPrice).toBeNull();
    await app.get(PluginHost).runSchedules(Date.now());
    expect(await product(vaseIt)).toMatchObject({
      sku: 'VASE',
      regularPrice: '12.0000',
      groupId: vase.id,
    });
  });

  it('shows the texts entered in the admin in the customer’s language', async () => {
    // A shared attribute and a product's own one, with their Italian names.
    const colour = await admin.post(ext('/attributes'), {
      name: 'Colour',
      translations: { it: { name: 'Colore' } },
      values: [
        { name: 'Red', translations: { it: { name: 'Rosso' } } },
        { name: 'Blue', translations: { it: { name: 'Blu' } } },
      ],
    });
    expect(colour.statusCode, colour.body).toBe(201);
    const mug = (await admin.post('/api/v1/entries', { type: 'product', title: 'Mug' })).json();
    await save(mug.id, {
      product: { kind: 'variable' },
      attributes: [
        { attributeId: colour.json().id, values: ['red', 'blue'], variation: true },
        {
          name: 'Size',
          values: ['S', 'M'],
          variation: true,
          translations: { it: { name: 'Taglia', 'value:S': 'Piccola' } },
        },
      ],
      variations: [
        { attributes: { colour: 'red', size: 'S' }, regularPrice: '9' },
        { attributes: { colour: 'blue', size: 'M' }, regularPrice: '9' },
      ],
    });
    await admin.post(`/api/v1/entries/${mug.id}/publish`);
    const mugIt = await translate(mug.id);
    const visitor = new TestClient(app, site.host, '10.97.0.9');
    const slugOf = async (id: string) => (await admin.get(`/api/v1/entries/${id}`)).json().slug;
    const italian = (await visitor.get(`/it/product/${await slugOf(mugIt)}`)).body;
    for (const text of ['Colore', 'Rosso', 'Blu', 'Taglia', 'Piccola'])
      expect(italian).toContain(text);
    const english = (await visitor.get(`/product/${await slugOf(mug.id)}`)).body;
    for (const text of ['Colour', 'Red', 'Size']) expect(english).toContain(text);
    expect(english).not.toContain('Colore');

    // Payment, shipping, taxes and an email, with their Italian texts.
    await admin.request('PUT', ext('/payments'), {
      bacs: {
        enabled: true,
        accounts: [{ iban: 'IT60X0542811101000000123456' }],
        title: 'Bank transfer',
        instructions: 'Pay within a week.',
        translations: {
          it: { title: 'Bonifico bancario', instructions: 'Paga entro una settimana.' },
        },
      },
    });
    const shipping = await admin.request('PUT', ext('/shipping'), {
      zones: [],
      rest: [
        {
          title: 'Courier',
          settings: { kind: 'flat', cost: '5', classCosts: {}, calculation: 'class' },
          translations: { it: { title: 'Corriere' } },
        },
      ],
    });
    expect(shipping.statusCode, shipping.body).toBe(200);
    await admin.request('PUT', ext('/taxes'), {
      enabled: true,
      rates: [{ country: 'IT', rate: 22, name: 'VAT', translations: { it: { name: 'IVA' } } }],
    });
    await admin.request('PUT', ext('/emails'), {
      customer_on_hold: {
        subject: 'Thanks for order #{number}',
        translations: { it: { subject: 'Grazie per l’ordine #{number}' } },
      },
    });
    const buyer = new TestClient(app, site.host, '10.97.0.10');
    await buyer.postForm('/it/cart/add', { product: ids.lampIt!, quantity: '1' });
    const checkout = (await buyer.get('/it/checkout')).body;
    expect(checkout.match(/value="bacs"[^]{0,400}/)?.[0]).toContain('Bonifico bancario');
    const placed = await buyer.postForm('/it/checkout', {
      email: 'ugo@example.test',
      'billing.firstName': 'Ugo',
      'billing.lastName': 'Neri',
      'billing.address1': 'Via Po 2',
      'billing.city': 'Torino',
      'billing.postcode': '10121',
      'billing.province': 'TO',
      'billing.country': 'IT',
      'billing.phone': '011 654321',
      payment: 'bacs',
      rate: shipping.json().rest[0].id,
    });
    expect(
      placed.statusCode,
      (placed.body.match(/role="alert"[^]{0,300}/g) ?? []).join(' | '),
    ).toBe(303);
    const mail = app.get(MailService).outbox.find((m) => m.to === 'ugo@example.test');
    expect(mail?.subject).toMatch(/^Grazie per l’ordine #\d+$/);
    for (const text of ['Bonifico bancario', 'Paga entro una settimana.', 'Corriere', 'IVA'])
      expect(mail?.html).toContain(text);
  });
});
