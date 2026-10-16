/**
 * The Shop plugin: product reviews. A rating and a text, moderated like
 * comments, "verified owner" for buyers, the product's average on its
 * page, in the catalog and in its structured data.
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
let kettle: string;
let path: string;

const ext = (p: string) => `/api/v1/ext/shop${p}`;
const visitor = (n: number) => new TestClient(app, site.host, `10.96.0.${n}`);
const review = (fields: Record<string, string>) => ({
  entry: kettle,
  back: path,
  review: 'Boils fast and looks good.',
  ...fields,
});
const where = (location: unknown) => decodeURIComponent(String(location).replace(/\+/g, ' '));

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
  site = await seedSite(owner, 'shop-reviews');
  await seedUser(owner, {
    email: 'rev-admin@shop-reviews.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.96.0.1');
  await admin.login('rev-admin@shop-reviews.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
  await admin.request('PUT', ext('/payments'), {
    bacs: { enabled: true, accounts: [{ iban: 'IT60X0542811101000000123456' }] },
  });
  const { id } = (await admin.post('/api/v1/entries', { type: 'product', title: 'Kettle' })).json();
  await admin.request('PUT', ext(`/products/${id}`), { product: { regularPrice: '39' } });
  await admin.post(`/api/v1/entries/${id}/publish`);
  kettle = id;
  path = `/product/${(await admin.get(`/api/v1/entries/${id}`)).json().slug}`;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('reviews', () => {
  it('shows the form on the product page', async () => {
    const page = await visitor(2).get(path);
    expect(page.body).toContain('Reviews (0)');
    expect(page.body).toContain('Be the first to review this product');
    expect(page.body).toMatch(/name="rating"\s+value="5"/);
  });

  it('asks for a rating, then waits for approval', async () => {
    const lia = visitor(3);
    const none = await lia.postForm('/reviews', review({ name: 'Lia', email: 'lia@example.test' }));
    expect(where(none.headers.location)).toContain('review-error=Choose a rating.');
    const sent = await lia.postForm(
      '/reviews',
      review({ rating: '4', name: 'Lia', email: 'lia@example.test' }),
    );
    expect(sent.headers.location).toBe(`${path}?review=pending#reviews`);
    const list = (await admin.get(ext('/reviews?status=pending'))).json().items;
    expect(list[0]).toMatchObject({ author: 'Lia', rating: 4, verified: false, product: 'Kettle' });
    // Not public yet.
    expect((await visitor(4).get(path)).body).toContain('Reviews (0)');

    const approved = await admin.post('/api/v1/comments/status', {
      ids: [list[0].id],
      status: 'approved',
    });
    expect(approved.statusCode).toBe(200);
    const page = await visitor(4).get(path);
    expect(page.body).toContain('Reviews (1)');
    expect(page.body).toContain('Boils fast and looks good.');
    expect(page.body).toMatch(
      /"aggregateRating":\{"@type":"AggregateRating","ratingValue":"4.0","reviewCount":1\}/,
    );
    // The catalog shows it too.
    expect((await visitor(4).get('/shop')).body).toContain('Rated 4.0 out of 5');
    // Reviews are not comments.
    const comments = (await admin.get(`/api/v1/entries/${kettle}`)).json();
    expect(comments.comments?.count ?? 0).toBe(0);
  });

  it('marks the reviews of customers who bought the product', async () => {
    const ivo = visitor(5);
    await ivo.postForm('/cart/add', { product: kettle });
    await ivo.postForm('/checkout', {
      email: 'ivo@example.test',
      'billing.firstName': 'Ivo',
      'billing.lastName': 'Neri',
      'billing.address1': 'Via Po 1',
      'billing.city': 'Torino',
      'billing.postcode': '10121',
      'billing.province': 'TO',
      'billing.country': 'IT',
      'billing.phone': '011 123456',
      payment: 'bacs',
    });
    const orders = (await admin.get(ext('/orders'))).json().items;
    // Paid: the buyer is a verified owner.
    await admin.request('PATCH', ext(`/orders/${orders[0].id}/status`), { status: 'processing' });
    await ivo.postForm(
      '/reviews',
      review({ rating: '5', name: 'Ivo', email: 'IVO@example.test', review: 'Perfect.' }),
    );
    const list = (await admin.get(ext('/reviews'))).json().items;
    expect(list.find((r: { author: string }) => r.author === 'Ivo')).toMatchObject({
      verified: true,
      rating: 5,
    });
  });

  it('can be limited to buyers, or turned off', async () => {
    await admin.request('PATCH', '/api/v1/plugins/shop/settings', { reviewsVerifiedOnly: true });
    const refused = await visitor(6).postForm(
      '/reviews',
      review({ rating: '3', name: 'Zoe', email: 'zoe@example.test' }),
    );
    expect(where(refused.headers.location)).toContain(
      'Only customers who bought this product can review it.',
    );
    await admin.request('PATCH', '/api/v1/plugins/shop/settings', { reviewsEnabled: false });
    expect((await visitor(7).get(path)).body).not.toContain('id="reviews"');
    const closed = await visitor(7).postForm(
      '/reviews',
      review({ rating: '3', name: 'Zoe', email: 'zoe@example.test' }),
    );
    expect(where(closed.headers.location)).toContain('Reviews are closed.');
  });
});
