/**
 * Cleishop 1.17 on plugin API 1.74: the catalog in the products' manual order
 * (WordPress's menu_order) and their short description on the cards, both
 * chosen in Settings → Cleishop; entries' position and excerpt reach plugins.
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

async function product(title: string, position: number, excerpt: string) {
  const { id } = (await admin.post('/api/v1/entries', { type: 'product', title })).json() as {
    id: string;
  };
  expect(
    (
      await admin.request('PUT', `/api/v1/ext/shop/products/${id}`, {
        product: { regularPrice: '10' },
      })
    ).statusCode,
  ).toBe(200);
  const patched = await admin.request('PATCH', `/api/v1/entries/${id}`, { position, excerpt });
  expect(patched.statusCode, patched.body).toBe(200);
  expect((await admin.post(`/api/v1/entries/${id}/publish`)).statusCode).toBe(200);
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'shop-src-')), 'shop');
  await cp(join(pluginsRoot, 'shop'), source, {
    recursive: true,
    filter: (f) => !f.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'shop-order');
  await seedUser(owner, {
    email: 'admin@shop-order.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.98.0.1');
  await admin.login('admin@shop-order.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
  await product('Charlie', 1, '<p>The <strong>third</strong> one.</p>');
  await product('Alpha', 3, 'The first one.');
  await product('Bravo', 2, 'The second one.');
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const titles = (body: string) =>
  [...body.matchAll(/shop-card__title"[^>]*>\s*<a [^>]*>\s*([^<]+?)\s*<\/a/g)].map((m) => m[1]);

describe('the catalog’s order and the cards’ short description', () => {
  it('lists the products as before by default, without descriptions', async () => {
    const page = await new TestClient(app, site.host, '10.98.0.2').get('/shop');
    expect(titles(page.body).sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(page.body).not.toContain('class="shop-card__excerpt"');
  });

  it('follows the manual order and shows the short description when chosen', async () => {
    const saved = await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
      catalogSort: 'position',
      cardExcerpt: true,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const page = await new TestClient(app, site.host, '10.98.0.3').get('/shop');
    expect(titles(page.body)).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(page.body).toContain('<p class="shop-card__excerpt">The third one.</p>');
  });
});
