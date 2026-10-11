/** XML sitemaps (RF-THM-07): index, per type and taxonomy, images, exclusions. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let visitor: TestClient;

async function publish(type: string, title: string, extra: Record<string, unknown> = {}) {
  const created = (await admin.post('/api/v1/entries', { type, title, ...extra })).json();
  const published = await admin.post(
    `/api/v1/entries/${created.id}/publish`,
    extra.visibility ? { visibility: extra.visibility } : undefined,
  );
  expect(published.statusCode).toBe(200);
  return published.json() as { id: string; slug: string };
}

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'sitemaps');
  await seedUser(owner, {
    email: 'admin@sitemaps.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.45.0.1');
  await admin.login('admin@sitemaps.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.45.0.2');
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('XML sitemaps', () => {
  let photo: { id: string; url: string };
  let about: { id: string; slug: string };
  let story: { id: string; slug: string };

  it('lists pages and posts with their images and dates', async () => {
    const png = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#3366cc' },
    })
      .png()
      .toBuffer();
    photo = (await admin.upload('/api/v1/media', 'photo.png', png, 'image/png')).json();
    about = await publish('page', 'About', {
      featuredMediaId: photo.id,
      document: {
        schema: 1,
        blocks: [
          {
            id: 'img1',
            type: 'core/image',
            v: 1,
            attrs: { url: 'https://cdn.example.com/team.jpg', alt: 'Team' },
          },
        ],
      },
    });
    const term = (await admin.post('/api/v1/taxonomies/category/terms', { name: 'News' })).json();
    await admin.post('/api/v1/taxonomies/category/terms', { name: 'Empty' });
    story = await publish('article', 'Story');
    await admin.request('PATCH', `/api/v1/entries/${story.id}`, { terms: { category: [term.id] } });
    await admin.post(`/api/v1/entries/${story.id}/publish`);

    const index = await visitor.get('/sitemap.xml');
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('application/xml');
    expect(index.headers['x-robots-tag']).toBe('noindex, follow');
    expect(index.body).toContain('<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>');
    expect(index.body).toMatch(
      /<loc>http:\/\/sitemaps\.test\/sitemap-page-en\.xml<\/loc><lastmod>\d{4}-/,
    );
    expect(index.body).toContain('/sitemap-article-en.xml');
    expect(index.body).toContain('/sitemap-tax-category-en.xml');
    // Served from the cache the second time, with the same header.
    const cached = await visitor.get('/sitemap.xml');
    expect(cached.headers['x-cache']).toBe('HIT');
    expect(cached.headers['x-robots-tag']).toBe('noindex, follow');

    const pages = (await visitor.get('/sitemap-page-en.xml')).body;
    expect(pages).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(pages).toContain(`<loc>http://sitemaps.test/${about.slug}</loc>`);
    expect(pages).toContain(`<image:loc>http://sitemaps.test${photo.url}</image:loc>`);
    expect(pages).toContain('<image:loc>https://cdn.example.com/team.jpg</image:loc>');

    const terms = (await visitor.get('/sitemap-tax-category-en.xml')).body;
    expect(terms).toContain('<loc>http://sitemaps.test/category/news</loc>');
    // Empty archives are thin pages: not listed.
    expect(terms).not.toContain('/category/empty');
  });

  it('leaves out the 404 page, private content and unknown sitemaps', async () => {
    const missing = await publish('page', 'Not found');
    await publish('page', 'Members only', { visibility: 'private' });
    await admin.request('PATCH', '/api/v1/settings/core', {
      errorPage: missing.id,
      frontPage: about.id,
    });
    const pages = (await visitor.get('/sitemap-page-en.xml')).body;
    expect(pages).not.toContain(`/${missing.slug}<`);
    expect(pages).not.toContain('members-only');
    // The front page is listed at the home address.
    expect(pages).toContain('<loc>http://sitemaps.test/</loc>');
    expect((await visitor.get('/sitemap-page-en-2.xml')).statusCode).toBe(404);
    expect((await visitor.get('/sitemap-nothing-en.xml')).statusCode).toBe(404);
    expect((await visitor.get('/sitemap-page-xx.xml')).statusCode).toBe(404);
    expect((await visitor.get(`/sitemap-article-en.xml`)).body).toContain(`/${story.slug}`);
  });

  it('answers the addresses of WordPress and Yoast SEO, and is readable in a browser', async () => {
    for (const path of ['/sitemap_index.xml', '/wp-sitemap.xml']) {
      const res = await visitor.get(path);
      expect(res.statusCode).toBe(301);
      expect(res.headers.location).toBe('/sitemap.xml');
    }
    const xsl = await visitor.get('/sitemap.xsl');
    expect(xsl.headers['content-type']).toContain('text/xsl');
    expect(xsl.body).toContain('Google Search Console');
    expect((await visitor.get('/robots.txt')).body).toContain(
      'Sitemap: http://sitemaps.test/sitemap.xml',
    );
  });
});
