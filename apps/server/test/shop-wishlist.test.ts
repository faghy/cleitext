/**
 * Wishlist (Cleishop add-on): a guest's list in a cookie, the list page with
 * Cleishop's cards, the shared link, the guest's list joined at sign-in, and
 * YITH lists imported for customers of WooCommerce Import.
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
let perfume: string;

async function install(slug: string, pluginsPath: string, appRole: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, { source, pluginsPath, appRole });
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const appRole = new URL(inject('appUrl')).username;
  for (const slug of ['shop', 'shop-woo-import', 'shop-wishlist'])
    await install(slug, pluginsPath, appRole);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'shop-wishlist');
  await seedUser(owner, {
    email: 'admin@wishlist.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'anna@wishlist.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
  });
  admin = new TestClient(app, site.host, '10.95.0.1');
  await admin.login('admin@wishlist.test', PASSWORD);
  for (const slug of ['shop', 'shop-woo-import', 'shop-wishlist']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`, {})).statusCode).toBe(200);
  }
  const { id } = (
    await admin.post('/api/v1/entries', { type: 'product', title: 'Rose Perfume' })
  ).json();
  const saved = await admin.request('PUT', `/api/v1/ext/shop/products/${id}`, {
    product: { sku: 'ROSE-50', regularPrice: '89.00' },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
  perfume = id;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Wishlist', () => {
  it('keeps a guest’s list, shows it with Cleishop’s cards and shares it', async () => {
    const guest = new TestClient(app, site.host, '10.95.0.2');
    expect((await guest.get('/wishlist/state')).json()).toEqual({ count: 0, ids: [] });
    const added = await guest.postForm('/wishlist/toggle', { product: perfume });
    expect(added.statusCode, added.body).toBe(200);
    expect(added.json()).toEqual({ saved: true, count: 1 });
    expect((await guest.get('/wishlist/state')).json()).toEqual({ count: 1, ids: [perfume] });
    const page = await guest.get('/wishlist');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Rose Perfume');
    expect(page.body).toContain('data-product="' + perfume + '"');
    const shared = /\/wishlist\/shared\/([A-Za-z0-9_-]+)/.exec(page.body)?.[1];
    expect(shared).toBeTruthy();
    const view = await new TestClient(app, site.host, '10.95.0.3').get(
      `/wishlist/shared/${shared}`,
    );
    expect(view.statusCode).toBe(200);
    expect(view.body).toContain('Rose Perfume');
    expect(view.body).toContain('data-wishlist-shared');
    // The hearts' script comes on pages with products.
    expect(page.body).toMatch(/wishlist\.js/);

    // Signing in joins the guest's list to the account.
    await guest.login('anna@wishlist.test', PASSWORD);
    expect((await guest.get('/wishlist/state')).json()).toEqual({ count: 1, ids: [perfume] });
    // A second click removes it.
    expect((await guest.postForm('/wishlist/toggle', { product: perfume })).json()).toEqual({
      saved: false,
      count: 0,
    });
  });

  it('imports YITH lists for the customers WooCommerce Import brought', async () => {
    await admin.post('/api/v1/ext/shop-woo-import/customers', {
      customers: [
        { id: 501, email: 'yith@woo.test', displayName: 'Yith', orders: 1, paidOrders: 1 },
      ],
      which: 'paid',
    });
    const imported = await admin.post('/api/v1/ext/shop-wishlist/import', {
      wishlists: [
        { userId: 501, items: [{ sku: 'ROSE-50' }, { sku: 'GONE' }] },
        { userId: 999, items: [{ sku: 'ROSE-50' }] },
      ],
    });
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json()).toEqual({ imported: 1, saved: 1, skipped: 1, linked: true });
    const statsRes = await admin.get('/api/v1/ext/shop-wishlist/stats');
    expect(statsRes.statusCode, statsRes.body).toBe(200);
    const stats = statsRes.json();
    expect(stats.top[0]).toMatchObject({ id: perfume, title: 'Rose Perfume', n: 1 });
  });
});
