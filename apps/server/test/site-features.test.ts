/**
 * Public site services around the pages (milestone M3): menus API, robots.txt,
 * sitemaps, signed previews and maintenance mode.
 */
import { sites, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPreviewToken, verifyPreviewToken } from '../src/public/preview.js';
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
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let author: TestClient;
let visitor: TestClient;

async function publish(title: string, extra: Record<string, unknown> = {}) {
  const created = (
    await admin.post('/api/v1/entries', { type: 'article', title, ...extra })
  ).json();
  return (await admin.post(`/api/v1/entries/${created.id}/publish`)).json();
}

/** What the CLI does for `site:maintenance`. */
async function setStatus(status: 'active' | 'maintenance') {
  await owner.db.update(sites).set({ status }).where(eq(sites.id, site.id));
  const payload = JSON.stringify({ siteId: site.id, tags: ['site'], sites: true });
  await owner.db.execute(sql`select pg_notify('cleitext_cache', ${payload})`);
}

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
  owner = ownerDatabase();
  site = await seedSite(owner, 'features', { locales: ['en', 'it'] });
  await seedUser(owner, {
    email: 'admin@features.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'author@features.test',
    password: PASSWORD,
    site,
    role: 'author',
  });
  admin = new TestClient(app, site.host, '10.7.0.1');
  await admin.login('admin@features.test', PASSWORD);
  author = new TestClient(app, site.host, '10.7.0.2');
  await author.login('author@features.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.7.0.3');
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('menus API', () => {
  it('lists the theme locations and manages a menu tree', async () => {
    const theme = (await admin.get('/api/v1/themes/current')).json();
    expect(theme.slug).toBe('aurora');
    expect(Object.keys(theme.menuLocations)).toEqual(['primary', 'footer']);

    const about = (await admin.post('/api/v1/entries', { type: 'page', title: 'About us' })).json();
    await admin.post(`/api/v1/entries/${about.id}/publish`);
    const menu = (await admin.post('/api/v1/menus', { name: 'Main', location: 'primary' })).json();
    expect(menu).toMatchObject({ slug: 'main', locale: 'en', location: 'primary', items: [] });

    const saved = await admin.request('PUT', `/api/v1/menus/${menu.id}/items`, {
      items: [
        {
          kind: 'entry',
          entryId: about.id,
          children: [
            { kind: 'url', url: 'https://example.com/', label: 'Example', target: '_blank' },
          ],
        },
      ],
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().items[0]).toMatchObject({
      displayLabel: 'About us',
      children: [{ displayLabel: 'Example', target: '_blank' }],
    });

    const home = await visitor.get('/');
    expect(home.body).toContain('About us');
    expect(home.body).toContain('https://example.com/');

    // The menu is updated on the site without flushing the cache by hand.
    await admin.request('PUT', `/api/v1/menus/${menu.id}/items`, { items: [] });
    expect((await visitor.get('/')).body).not.toContain('https://example.com/');
  });

  it('keeps one menu per location and language', async () => {
    const first = (
      await admin.post('/api/v1/menus', { name: 'Footer A', location: 'footer' })
    ).json();
    const second = (
      await admin.post('/api/v1/menus', { name: 'Footer B', location: 'footer' })
    ).json();
    expect((await admin.get(`/api/v1/menus/${first.id}`)).json().location).toBeNull();
    expect((await admin.get(`/api/v1/menus/${second.id}`)).json().location).toBe('footer');

    const it = (
      await admin.post('/api/v1/menus', { name: 'Piè di pagina', locale: 'it', location: 'footer' })
    ).json();
    expect(it.location).toBe('footer');
    expect((await admin.get(`/api/v1/menus/${second.id}`)).json().location).toBe('footer');
  });

  it('rejects unsafe links, unknown locations and entries in another language', async () => {
    const menu = (await admin.post('/api/v1/menus', { name: 'Checks' })).json();
    const unsafe = await admin.request('PUT', `/api/v1/menus/${menu.id}/items`, {
      items: [{ kind: 'url', url: 'javascript:alert(1)', label: 'Bad' }],
    });
    expect(unsafe.statusCode).toBe(400);

    const location = await admin.request('PATCH', `/api/v1/menus/${menu.id}`, {
      location: 'sidebar',
    });
    expect(location.statusCode).toBe(400);

    const italian = (
      await admin.post('/api/v1/entries', { type: 'page', title: 'Chi siamo', locale: 'it' })
    ).json();
    const foreign = await admin.request('PUT', `/api/v1/menus/${menu.id}/items`, {
      items: [{ kind: 'entry', entryId: italian.id }],
    });
    expect(foreign.statusCode).toBe(400);

    expect((await admin.request('DELETE', `/api/v1/menus/${menu.id}`)).statusCode).toBe(204);
    expect((await admin.get(`/api/v1/menus/${menu.id}`)).statusCode).toBe(404);
  });

  it('is reserved to users who can manage menus', async () => {
    expect((await author.get('/api/v1/menus')).statusCode).toBe(403);
  });
});

describe('robots.txt and sitemaps', () => {
  it('points crawlers to the sitemap index', async () => {
    const robots = await visitor.get('/robots.txt');
    expect(robots.statusCode).toBe(200);
    expect(robots.headers['content-type']).toContain('text/plain');
    expect(robots.body).toContain('Disallow: /admin');
    expect(robots.body).toContain(`Sitemap: http://${site.host}/sitemap.xml`);
  });

  it('lists published entries per type and language, with translations', async () => {
    const story = await publish('Sitemap story');
    const translation = (
      await admin.post(`/api/v1/entries/${story.id}/translations`, {
        locale: 'it',
        title: 'Storia della mappa',
      })
    ).json();
    await admin.post(`/api/v1/entries/${translation.id}/publish`);
    await admin.post('/api/v1/entries', { type: 'article', title: 'Draft only' });

    const index = await visitor.get('/sitemap.xml');
    expect(index.headers['content-type']).toContain('application/xml');
    expect(index.body).toContain(`http://${site.host}/sitemap-article-en.xml`);
    expect(index.body).toContain(`http://${site.host}/sitemap-article-it.xml`);

    const articles = await visitor.get('/sitemap-article-en.xml');
    expect(articles.statusCode).toBe(200);
    expect(articles.body).not.toMatch(/draft-only/);
    expect(articles.body).toContain('hreflang="it"');
    expect(articles.body).toContain('<lastmod>');
    expect(articles.body).toContain('/sitemap-story</loc>');

    expect((await visitor.get('/sitemap-article-fr.xml')).statusCode).toBe(404);
    expect((await visitor.get('/sitemap-nothing-en.xml')).statusCode).toBe(404);
  });

  it('asks crawlers to stay away when search engines are discouraged', async () => {
    await admin.request('PATCH', '/api/v1/settings/core', { discourageSearchEngines: true });
    const robots = await visitor.get('/robots.txt');
    expect(robots.body).toContain('Disallow: /\n');
    expect(robots.body).not.toContain('Sitemap:');
    await admin.request('PATCH', '/api/v1/settings/core', { discourageSearchEngines: false });
    expect((await visitor.get('/robots.txt')).body).toContain('Sitemap:');
  });
});

describe('previews', () => {
  it('signs links that expire and belong to one entry', () => {
    const secret = 'x'.repeat(32);
    const token = createPreviewToken(secret, 'a', 1_000_000);
    expect(verifyPreviewToken(secret, 'a', token, 1_000_000)).toBe(true);
    expect(verifyPreviewToken(secret, 'b', token, 1_000_000)).toBe(false);
    expect(verifyPreviewToken('y'.repeat(32), 'a', token, 1_000_000)).toBe(false);
    expect(verifyPreviewToken(secret, 'a', token, 1_000_000 + 3_601_000)).toBe(false);
    expect(verifyPreviewToken(secret, 'a', 'garbage', 1_000_000)).toBe(false);
  });

  it('shows the latest saved version of a draft to anyone with the link', async () => {
    const draft = (
      await admin.post('/api/v1/entries', { type: 'article', title: 'Secret plans' })
    ).json();
    const { url } = (await admin.post(`/api/v1/entries/${draft.id}/preview`)).json();
    expect(url).toMatch(new RegExp(`^/__preview/${draft.id}\\?token=`));

    const preview = await visitor.get(url);
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain('Secret plans');
    expect(preview.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(preview.headers['x-cache']).toBe('BYPASS');

    // Edits show up without publishing.
    await admin.request('PATCH', `/api/v1/entries/${draft.id}`, { title: 'Public plans' });
    expect((await visitor.get(url)).body).toContain('Public plans');

    expect((await visitor.get(`/__preview/${draft.id}?token=nope`)).statusCode).toBe(404);
    expect((await visitor.get(`/__preview/${draft.id}`)).statusCode).toBe(404);
  });

  it('is offered only to users who can edit the entry', async () => {
    const draft = (
      await admin.post('/api/v1/entries', { type: 'article', title: 'Admin draft' })
    ).json();
    expect((await author.post(`/api/v1/entries/${draft.id}/preview`)).statusCode).toBe(403);
  });
});

describe('maintenance mode', () => {
  it('answers 503 to visitors while signed-in users see the site', async () => {
    await publish('Before maintenance');
    expect((await visitor.get('/')).statusCode).toBe(200);

    await setStatus('maintenance');
    await eventually(async () => (await visitor.get('/')).statusCode === 503);
    const down = await visitor.get('/');
    expect(down.headers['retry-after']).toBe('3600');
    expect(down.body).toContain('<meta name="robots"');
    expect(down.body).not.toContain('Before maintenance');
    expect((await admin.get('/')).statusCode).toBe(200);

    await setStatus('active');
    await eventually(async () => (await visitor.get('/')).statusCode === 200);
  });
});

describe('RSS feeds (RF-THM-08)', () => {
  it('lists the latest public posts, also per term, with autodiscovery', async () => {
    const term = (await admin.post('/api/v1/taxonomies/category/terms', { name: 'Feeds' })).json();
    const post = await publish('Feed <story>', { excerpt: 'Short & sweet' });
    await admin.request('PATCH', `/api/v1/entries/${post.id}`, {
      terms: { category: [term.id] },
    });
    await admin.post(`/api/v1/entries/${post.id}/publish`);
    const secret = (
      await admin.post('/api/v1/entries', { type: 'article', title: 'Secret feed post' })
    ).json();
    await admin.post(`/api/v1/entries/${secret.id}/publish`, { visibility: 'private' });

    const feed = await admin.get('/feed');
    expect(feed.statusCode).toBe(200);
    expect(feed.headers['content-type']).toContain('application/rss+xml');
    expect(feed.body).toContain('<title>Feed &#60;story&#62;</title>');
    expect(feed.body).toContain('<description>Short &#38; sweet</description>');
    // Private posts never appear, even to a signed-in administrator.
    expect(feed.body).not.toContain('Secret feed post');

    const termFeed = await visitor.get('/category/feeds/feed');
    expect(termFeed.statusCode).toBe(200);
    expect(termFeed.body).toContain('Feed &#60;story&#62;');
    expect((await visitor.get('/category/missing/feed')).statusCode).toBe(404);

    const archive = await visitor.get('/category/feeds');
    expect(archive.body).toContain('type="application/rss+xml"');
    expect(archive.body).toContain('/category/feeds/feed');
    expect((await visitor.get('/it/feed')).statusCode).toBe(200);
  });
});
