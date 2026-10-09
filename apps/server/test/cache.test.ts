/**
 * Page cache (docs/ARCHITECTURE.md §15): hits, revalidation, invalidation by
 * tags on publishing, across processes through PostgreSQL NOTIFY.
 */
import { entries, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SchedulerService } from '../src/content/scheduler.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let second: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let editor: TestClient;
const year = new Date().getUTCFullYear();

async function get(
  target: NestFastifyApplication,
  path: string,
  headers: Record<string, string> = {},
) {
  return target.inject({ method: 'GET', url: path, headers: { host: site.host, ...headers } });
}

async function publish(title: string, extra: Record<string, unknown> = {}) {
  const created = (
    await editor.post('/api/v1/entries', { type: 'article', title, ...extra })
  ).json();
  return (await editor.post(`/api/v1/entries/${created.id}/publish`)).json();
}

/** Waits until a notification has been processed (asynchronous). */
async function eventually(check: () => Promise<boolean>, timeoutMs = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
}

beforeAll(async () => {
  app = await startTestApp();
  second = await startTestApp(); // a second process on the same database
  owner = ownerDatabase();
  site = await seedSite(owner, 'cache');
  await seedUser(owner, { email: 'editor@cache.test', password: PASSWORD, site, role: 'editor' });
  editor = new TestClient(app, site.host, '10.5.0.1');
  await editor.login('editor@cache.test', PASSWORD);
});

afterAll(async () => {
  await second?.close();
  await app?.close();
  await owner?.close();
});

describe('page cache', () => {
  it('serves repeated requests from the cache and revalidates with ETag', async () => {
    await publish('First story');
    const first = await get(app, '/');
    expect(first.headers['x-cache']).toBe('MISS');
    const again = await get(app, '/');
    expect(again.headers['x-cache']).toBe('HIT');
    expect(again.body).toBe(first.body);
    expect(again.headers['cache-control']).toBe('public, max-age=0, must-revalidate');

    const notModified = await get(app, '/', { 'if-none-match': String(first.headers.etag) });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.body).toBe('');
  });

  it('refreshes the home, archives and the entry when content is published (M3 acceptance)', async () => {
    const category = (
      await editor.post('/api/v1/taxonomies/category/terms', { name: 'News' })
    ).json();
    const story = await publish('Second story');
    await editor.request('PATCH', `/api/v1/entries/${story.id}`, {
      terms: { category: [category.id] },
    });
    await editor.post(`/api/v1/entries/${story.id}/publish`);

    // Warm up the cache.
    await get(app, '/');
    await get(app, '/category/news');
    expect((await get(app, '/')).headers['x-cache']).toBe('HIT');
    expect((await get(app, '/category/news')).headers['x-cache']).toBe('HIT');

    const third = (
      await editor.post('/api/v1/entries', { type: 'article', title: 'Breaking news' })
    ).json();
    await editor.request('PATCH', `/api/v1/entries/${third.id}`, {
      terms: { category: [category.id] },
    });
    await editor.post(`/api/v1/entries/${third.id}/publish`);

    const home = await get(app, '/');
    expect(home.headers['x-cache']).toBe('MISS');
    expect(home.body).toContain('Breaking news');
    const archive = await get(app, '/category/news');
    expect(archive.headers['x-cache']).toBe('MISS');
    expect(archive.body).toContain('Breaking news');
  });

  it('drops pages when an entry is unpublished or moved', async () => {
    const story = await publish('Short story');
    const path = `/${year}/short-story`;
    expect((await get(app, path)).statusCode).toBe(200);
    expect((await get(app, path)).headers['x-cache']).toBe('HIT');

    await editor.request('PATCH', `/api/v1/entries/${story.id}`, { slug: 'longer-story' });
    const moved = await get(app, path);
    expect(moved.statusCode).toBe(301);
    expect(moved.headers.location).toBe(`/${year}/longer-story`);

    await get(app, `/${year}/longer-story`);
    await editor.post(`/api/v1/entries/${story.id}/unpublish`);
    expect((await get(app, `/${year}/longer-story`)).statusCode).toBe(404);
  });

  it('compresses pages for clients that accept it', async () => {
    const plain = await get(app, '/');
    const br = await get(app, '/', { 'accept-encoding': 'gzip, deflate, br' });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers.vary).toContain('accept-encoding');
    expect(brotliDecompressSync(br.rawPayload).toString()).toBe(plain.body);
    // The compressed copy is kept with the cached page.
    const again = await get(app, '/', { 'accept-encoding': 'br' });
    expect(again.headers['x-cache']).toBe('HIT');
    expect(again.rawPayload.equals(br.rawPayload)).toBe(true);

    const gzip = await get(app, '/', { 'accept-encoding': 'gzip' });
    expect(gzip.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gzip.rawPayload).toString()).toBe(plain.body);
  });

  it('is bypassed by signed-in users and by search', async () => {
    const signedIn = await editor.get('/');
    expect(signedIn.headers['x-cache']).toBe('BYPASS');
    expect(signedIn.headers['cache-control']).toBe('private, no-cache');
    expect((await get(app, '/search?q=story')).headers['x-cache']).toBe('BYPASS');
  });

  it('refreshes after scheduled publishing, which runs inside the database', async () => {
    const scheduled = (
      await editor.post('/api/v1/entries', { type: 'article', title: 'Scheduled story' })
    ).json();
    await editor.post(`/api/v1/entries/${scheduled.id}/schedule`, {
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await get(app, '/');
    expect((await get(app, '/')).body).not.toContain('Scheduled story');

    await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .update(entries)
        .set({ scheduledAt: new Date(Date.now() - 1_000) })
        .where(eq(entries.id, scheduled.id)),
    );
    expect(await app.get(SchedulerService).tick()).toBeGreaterThanOrEqual(1);
    await eventually(async () => (await get(app, '/')).body.includes('Scheduled story'));
  });

  it('keeps several processes consistent through NOTIFY', async () => {
    // Both processes cache the home page.
    await get(app, '/');
    await get(second, '/');
    expect((await get(second, '/')).headers['x-cache']).toBe('HIT');

    // A change made through the first process…
    await publish('Story from process one');

    // …reaches the second one.
    await eventually(async () => (await get(second, '/')).body.includes('Story from process one'));
  });
});
