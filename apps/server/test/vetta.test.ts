/**
 * Vetta SEO (official plugin, API 1.24): head from templates and fields,
 * the schema.org graph, sitemaps, robots.txt and llms.txt, the log of pages
 * not found, and the conflict with the SEO plugin.
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
let visitor: TestClient;

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
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

async function publish(type: string, title: string, extra: Record<string, unknown> = {}) {
  const created = (await admin.post('/api/v1/entries', { type, title, ...extra })).json();
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode).toBe(200);
  return published.json() as { id: string; slug: string };
}

async function eventually(check: () => Promise<boolean>, timeoutMs = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
}

const meta = (html: string, name: string) =>
  new RegExp(`<meta (?:name|property)="${name.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(
    html,
  )?.[1];

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('vetta', pluginsPath);
  await install('seo', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'vetta');
  await seedUser(owner, {
    email: 'admin@vetta.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.9.1.1');
  await admin.login('admin@vetta.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.9.1.2');
  expect((await admin.post('/api/v1/plugins/vetta/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Vetta SEO', () => {
  it('cannot run with the SEO plugin', async () => {
    const refused = await admin.post('/api/v1/plugins/seo/activate');
    expect(refused.statusCode).toBe(400);
    expect(refused.json().detail).toMatch(/Deactivate Vetta SEO first/);
  });

  it('puts its fields on every content type', async () => {
    const types = (await admin.get('/api/v1/content-types')).json() as {
      slug: string;
      fieldGroups: { id: string }[];
    }[];
    for (const slug of ['page', 'article']) {
      expect(types.find((t) => t.slug === slug)!.fieldGroups.map((g) => g.id)).toContain('vetta');
    }
  });

  it('writes the head from the templates and the entry’s fields', async () => {
    const saved = await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: {
        separator: '|',
        pt_article_title: '%title% (%category%) %sep% %sitename%',
        twitter_site: 'vetta',
        knowledge_name: 'Vetta Bar',
        module_localSeo: true,
        local_locality: 'Bologna',
        verify_google: '<meta name="google-site-verification" content="g-123" />',
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().config.indexnow_key).toMatch(/^[0-9a-f]{32}$/);

    const post = await publish('article', 'Espresso at home', {
      excerpt: 'How we make it.',
      fields: { vetta: { keywords: 'espresso, moka', ogTitle: 'Make espresso like a barista' } },
    });
    const html = (await visitor.get(`/${new Date().getUTCFullYear()}/${post.slug}`)).body;
    expect(html).toContain('<title>Espresso at home | ');
    expect(meta(html, 'description')).toBe('How we make it.');
    expect(meta(html, 'robots')).toBe(
      'index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large',
    );
    expect(meta(html, 'og:title')).toBe('Make espresso like a barista');
    expect(meta(html, 'twitter:site')).toBe('@vetta');
    expect(meta(html, 'twitter:label1')).toBe('Written by');
    const graph = JSON.parse(
      /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!,
    )['@graph'] as { '@type': string; address?: unknown; keywords?: string }[];
    expect(graph.map((n) => n['@type'])).toEqual(
      expect.arrayContaining(['WebSite', 'LocalBusiness', 'WebPage', 'BlogPosting']),
    );
    expect(graph.find((n) => n['@type'] === 'BlogPosting')!.keywords).toBe('espresso, moka');

    const hidden = await publish('page', 'Hidden page', { fields: { vetta: { noindex: true } } });
    const hiddenHtml = (await visitor.get(`/${hidden.slug}`)).body;
    expect(meta(hiddenHtml, 'robots')).toBe('noindex, follow');
    expect(hiddenHtml).not.toContain('rel="canonical"');
    const sitemap = (await visitor.get('/sitemap-page-en.xml')).body;
    expect(sitemap).not.toContain(hidden.slug);

    // Verification tags on the home page only.
    expect(meta((await visitor.get('/')).body, 'google-site-verification')).toBe('g-123');
    expect(meta(html, 'google-site-verification')).toBeUndefined();
  });

  it('reads the fields of the SEO plugin on sites moving over', async () => {
    const old = await publish('page', 'Moved page', {
      fields: { seo: { title: 'Kept title', description: 'Kept description' } },
    });
    const html = (await visitor.get(`/${old.slug}`)).body;
    // The SEO plugin's title was the page's part: the template adds the site.
    expect(html).toContain('<title>Kept title | Site vetta</title>');
    expect(meta(html, 'description')).toBe('Kept description');
  });

  it('shows titles imported from Yoast SEO as they are, without the site’s name again', async () => {
    const home = await publish('page', 'Old home', {
      fields: { seo: { title: 'Hotel Aurora - Welcome', fullTitle: true } },
    });
    expect((await visitor.get(`/${home.slug}`)).body).toContain(
      '<title>Hotel Aurora - Welcome</title>',
    );
    const rooms = await publish('page', 'Rooms', {
      fields: { seo: { title: '%%title%% - %%sitedesc%% - %%sitename%%', fullTitle: true } },
    });
    expect((await visitor.get(`/${rooms.slug}`)).body).toContain(
      '<title>Rooms - Site vetta</title>',
    );
    await admin.request('PATCH', '/api/v1/settings/core', { tagline: 'By the sea' });
    expect((await visitor.get(`/${rooms.slug}`)).body).toContain(
      '<title>Rooms - By the sea - Site vetta</title>',
    );
    await admin.request('PATCH', '/api/v1/settings/core', { tagline: '' });
    // Titles as written in WordPress (the page keeps its curly quotes and dashes).
    const written = await publish('page', 'L’ipnosi – cos’è', {
      fields: { seo: { rawTitle: "L'ipnosi - cos'è" } },
    });
    const html = (await visitor.get(`/${written.slug}`)).body;
    // (The separator is the one an earlier test chose.)
    expect(html).toMatch(/<title>L&#x27;ipnosi - cos&#x27;è \S Site vetta<\/title>/);
    expect(html).toContain('<meta property="og:title" content="L&#x27;ipnosi - cos&#x27;è ');
    expect(html).toContain('L’ipnosi – cos’è</h1>');
  });

  it('uses the search title and description of the page of the posts on its archive', async () => {
    const blog = await publish('page', 'Blog', {
      fields: { vetta: { title: 'Blog - Our news', description: 'News from the bar.' } },
    });
    await admin.request('PATCH', '/api/v1/settings/core', { postsPage: blog.id });
    const html = (await visitor.get(`/${blog.slug}`)).body;
    expect(html).toContain('<title>Blog - Our news</title>');
    expect(meta(html, 'description')).toBe('News from the bar.');
    // Without its own search title, the archive's: the page's title and the site's name.
    await admin.request('PATCH', `/api/v1/entries/${blog.id}`, { fields: { vetta: {} } });
    await admin.post(`/api/v1/entries/${blog.id}/publish`);
    expect((await visitor.get(`/${blog.slug}`)).body).toContain('<title>Blog | Site vetta</title>');
    // Imported from Yoast SEO: the whole title, as it was.
    await admin.request('PATCH', `/api/v1/entries/${blog.id}`, {
      fields: { seo: { title: '%%title%% %%sep%% %%sitename%%', fullTitle: true } },
    });
    await admin.post(`/api/v1/entries/${blog.id}/publish`);
    expect((await visitor.get(`/${blog.slug}`)).body).toContain('<title>Blog | Site vetta</title>');
    await admin.request('PATCH', '/api/v1/settings/core', { postsPage: null });
  });

  it('serves robots.txt and llms.txt, and logs pages not found', async () => {
    await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: {
        module_robotsTxt: true,
        robots_txt: 'User-agent: *\nDisallow: /private/',
        module_llms: true,
        llms_summary: 'Coffee in Bologna.',
        module_monitor404: true,
        monitor_exclude: 'start:/skip',
      },
    });
    const robots = (await visitor.get('/robots.txt')).body;
    expect(robots).toContain('Disallow: /private/');
    expect(robots).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
    const llms = await visitor.get('/llms.txt');
    expect(llms.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(llms.body).toContain('> Coffee in Bologna.');
    expect(llms.body).toContain('Moved page');

    await visitor.get('/gone-page?x=1');
    await visitor.get('/gone-page?x=2');
    await visitor.get('/skip/me');
    await eventually(async () => {
      const rows = (await admin.get('/api/v1/ext/vetta/not-found')).json() as {
        path: string;
        hits: number;
      }[];
      return rows.some((r) => r.path === '/gone-page' && r.hits === 2);
    });
    const rows = (await admin.get('/api/v1/ext/vetta/not-found')).json() as { path: string }[];
    expect(rows.map((r) => r.path)).not.toContain('/skip/me');
    expect((await admin.request('DELETE', '/api/v1/ext/vetta/not-found', {})).statusCode).toBe(200);
    expect((await admin.get('/api/v1/ext/vetta/not-found')).json()).toEqual([]);
  });

  it('tells editors when a keyword is already used, and gives them the templates', async () => {
    const used = (await admin.get('/api/v1/ext/vetta/keyword-used?keyword=espresso')).json();
    expect(used.title).toBe('Espresso at home');
    const editor = (await admin.get('/api/v1/ext/vetta/editor-config')).json();
    expect(editor.config.separator).toBe(undefined);
    expect(editor.siteName).toBeTruthy();
  });
});
