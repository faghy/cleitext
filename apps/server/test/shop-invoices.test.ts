/**
 * PDF invoices (Cleishop add-on): the numbers of WooCommerce PDF Invoices
 * for imported orders, a new invoice when an order is completed, continuing
 * from them, attached to Cleishop's email; the customer's and the admin's
 * links; every invoice of a month in one PDF.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
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
const EXT = '/api/v1/ext/shop-invoices';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
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

const billing = {
  first_name: 'Giulia',
  last_name: 'Bianchi',
  address_1: 'Via Roma 1',
  city: 'Varazze',
  postcode: '17019',
  country: 'IT',
};
const order = (id: number, status: string, meta: Record<string, unknown> = {}) => ({
  id,
  number: String(7000 + id),
  status,
  currency: 'EUR',
  createdAt: '2025-02-01T10:00:00+00:00',
  customerId: 0,
  email: 'giulia@invoices.test',
  billing,
  totals: { subtotal: '40.00', shipping: '0.00', tax: '8.80', total: '48.80' },
  items: [
    { type: 'line_item', name: 'Lavanda', sku: 'LAV-1', quantity: 2, total: '40.00', tax: '8.80' },
  ],
  meta,
});

const SHOP = '/api/v1/ext/shop';
const orderId = async (number: number) => {
  const list = (await admin.get(`${SHOP}/orders`)).json();
  return list.items.find((o: { number: number }) => o.number === number).id as string;
};

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const appRole = new URL(inject('appUrl')).username;
  for (const slug of ['shop', 'shop-woo-import', 'shop-invoices'])
    await install(slug, pluginsPath, appRole);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'shop-invoices');
  await seedUser(owner, {
    email: 'admin@invoices.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.96.0.1');
  await admin.login('admin@invoices.test', PASSWORD);
  for (const slug of ['shop', 'shop-woo-import', 'shop-invoices']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`, {})).statusCode).toBe(200);
  }
  const imported = await admin.post('/api/v1/ext/shop-woo-import/orders', {
    orders: [
      order(1, 'completed', {
        _wcpdf_invoice_number: '41',
        _wcpdf_invoice_date: String(Date.parse('2025-02-01T11:00:00Z') / 1000),
        _wcpdf_invoice_number_data: { number: 41, formatted_number: 'W-41' },
      }),
      order(2, 'processing'),
    ],
  });
  expect(imported.statusCode, imported.body).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('PDF invoices', () => {
  it('keeps the numbers of WooCommerce PDF Invoices, once', async () => {
    const settings = await admin.request('PUT', `${EXT}/settings`, {
      shopName: 'Bottega Lavanda',
      address: 'Via Mare 2\nVarazze',
      numbering: { prefix: 'FT-', padding: 3 },
      createOn: ['completed'],
      attachTo: ['customer_completed'],
    });
    expect(settings.statusCode, settings.body).toBe(200);
    expect(settings.json()).toMatchObject({ createOn: ['completed'], customerDownload: true });
    const first = await admin.post(`${EXT}/import-woocommerce`, {});
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toEqual({ imported: 1, already: 0, warnings: [] });
    expect((await admin.post(`${EXT}/import-woocommerce`, {})).json()).toMatchObject({
      imported: 0,
      already: 1,
    });
    const list = (await admin.get(`${EXT}/invoices`)).json();
    expect(list).toMatchObject({ shop: true, count: 1 });
    expect(list.invoices[0]).toMatchObject({ formatted: 'W-41', order: 7001, imported: true });
  });

  it('creates the next invoice when an order is completed and attaches it to the email', async () => {
    const id = await orderId(7002);
    const outbox = app.get(MailService).outbox;
    const before = outbox.length;
    const done = await admin.request('PATCH', `${SHOP}/orders/${id}/status`, {
      status: 'completed',
    });
    expect(done.statusCode, done.body).toBe(200);
    const mail = outbox.slice(before).find((m) => m.to === 'giulia@invoices.test');
    expect(mail?.attachments?.[0]).toMatchObject({ contentType: 'application/pdf' });
    expect(mail!.attachments![0]!.filename).toMatch(/FT-042\.pdf$/);
    const pdf = Buffer.from(mail!.attachments![0]!.content as Uint8Array);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    // The admin's links: the invoice and the packing slip.
    const detail = (await admin.get(`${SHOP}/orders/${id}`)).json();
    const links = detail.documents as { label: string; url: string }[];
    expect(links.map((l) => l.label)).toEqual(['Invoice FT-042 (PDF)', 'Packing slip (PDF)']);

    // A visitor with the order's key gets the invoice; not without it, and never the slip.
    const guest = new TestClient(app, site.host, '10.96.0.2');
    const invoice = await guest.get(links[0]!.url);
    expect(invoice.statusCode).toBe(200);
    expect(invoice.headers['content-type']).toContain('application/pdf');
    expect(invoice.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await guest.get(links[0]!.url.replace(/key=[^&]+/, 'key=wrong'))).statusCode).toBe(404);
    expect((await guest.get(links[1]!.url)).statusCode).toBe(404);
    expect((await admin.get(links[1]!.url)).statusCode).toBe(200);
  });

  it('creates an invoice from the admin link, and puts a month in one PDF', async () => {
    const imported = await admin.post('/api/v1/ext/shop-woo-import/orders', {
      orders: [order(3, 'processing')],
    });
    expect(imported.statusCode, imported.body).toBe(200);
    const id = await orderId(7003);
    const links = (await admin.get(`${SHOP}/orders/${id}`)).json().documents as {
      url: string;
    }[];
    expect(links[0]!.url).toContain('create=1');
    expect((await new TestClient(app, site.host, '10.96.0.3').get(links[0]!.url)).statusCode).toBe(
      404,
    );
    expect((await admin.get(links[0]!.url)).statusCode).toBe(200);
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const bulk = (
      await admin.post(`${EXT}/bulk`, { from: from.toISOString(), to: to.toISOString() })
    ).json();
    expect(bulk.count).toBe(2);
    expect(Buffer.from(bulk.data, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    const list = (await admin.get(`${EXT}/invoices`)).json();
    expect(list.invoices.map((i: { formatted: string }) => i.formatted).sort()).toEqual([
      'FT-042',
      'FT-043',
      'W-41',
    ]);
  });
});
