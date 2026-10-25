/**
 * Addresses with a trailing slash, as WordPress's (RF-SET-03, `trailingSlash`):
 * one canonical form per address, a single 301 from the other, and every
 * address the site writes in that form. Off (the default): no slash.
 */
import { menuItems, menus, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';
import {
  addressKey,
  canonicalPath,
  canonicalUrl,
  isSlashOnlyRedirect,
  UrlBuilder,
} from '../src/public/urls.js';

const PASSWORD = 'correct horse battery staple';
const year = new Date().getUTCFullYear();

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let visitor: TestClient;

async function publish(type: string, title: string, extra: Record<string, unknown> = {}) {
  const { terms, ...rest } = extra;
  const created = (await admin.post('/api/v1/entries', { type, title, ...rest })).json();
  if (terms) await admin.request('PATCH', `/api/v1/entries/${created.id}`, { terms });
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  return published.json() as { id: string; slug: string };
}

const setSlash = async (trailingSlash: boolean) => {
  const res = await admin.request('PATCH', '/api/v1/settings/core', { trailingSlash });
  expect(res.statusCode, res.body).toBe(200);
  expect(res.json().trailingSlash).toBe(trailingSlash);
};

const hop = async (path: string) => {
  const res = await visitor.get(path);
  return [res.statusCode, res.headers.location];
};

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'slashes');
  await seedUser(owner, {
    email: 'admin@slashes.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.71.0.1');
  await admin.login('admin@slashes.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.71.0.2');

  const about = await publish('page', 'About');
  await publish('page', 'Team', { parentId: about.id });
  const travel = (await admin.post('/api/v1/taxonomies/category/terms', { name: 'Travel' })).json();
  await publish('article', 'Hello', { terms: { category: [travel.id] } });
  await publish('article', 'Again', { terms: { category: [travel.id] } });
  await admin.request('PATCH', '/api/v1/settings/core', { postsPerPage: 1 });
  await admin.post('/api/v1/redirects', { from: '/old-about', to: '/about' });
  await withSiteContext(owner.db, site.id, async (tx) => {
    const [menu] = await tx
      .insert(menus)
      .values({ siteId: site.id, slug: 'main', name: 'Main', locale: 'en', location: 'primary' })
      .returning();
    await tx.insert(menuItems).values([
      { siteId: site.id, menuId: menu!.id, kind: 'entry', entryId: about.id, position: 0 },
      {
        siteId: site.id,
        menuId: menu!.id,
        kind: 'url',
        url: '/about/team?ref=menu',
        label: 'Our team',
        position: 1,
      },
      {
        siteId: site.id,
        menuId: menu!.id,
        kind: 'url',
        url: '/files/price-list.pdf',
        label: 'Prices',
        position: 2,
      },
    ]);
  });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('canonical forms', () => {
  it('add the slash only to addresses of pages', () => {
    expect(canonicalPath('/about', true)).toBe('/about/');
    expect(canonicalPath('/about//', true)).toBe('/about/');
    expect(canonicalPath('/about/', false)).toBe('/about');
    expect(canonicalPath('/', true)).toBe('/');
    expect(canonicalPath('/it', true)).toBe('/it/');
    for (const path of [
      '/sitemap.xml',
      '/robots.txt',
      '/wp-content/uploads/a.jpg',
      '/account',
      '/it/account/login',
      '/api/v1/entries',
      '/cl-admin/settings',
      '/_fresco/x',
      '/__preview/123',
    ]) {
      expect(canonicalPath(path, true), path).toBe(path);
    }
    expect(canonicalUrl('/a?b=1#c', true)).toBe('/a/?b=1#c');
    expect(canonicalUrl('https://other.example/it', true)).toBe('https://other.example/it/');
    expect(canonicalUrl('#top', true)).toBe('#top');
    expect(canonicalUrl('//cdn.example/x', true)).toBe('//cdn.example/x');
  });

  it('tell apart addresses as the router does', () => {
    expect(addressKey('/menu/')).toBe('/menu');
    expect(addressKey('/caff%C3%A8//?a=1#top')).toBe('/caffè?a=1');
    expect(addressKey('/%E0%A4%A')).toBe('/%E0%A4%A');
    expect(addressKey('/')).toBe('/');
    expect(isSlashOnlyRedirect('/menu', '/menu/')).toBe(true);
    expect(isSlashOnlyRedirect('/caff%C3%A8/', '/caffè')).toBe(true);
    expect(isSlashOnlyRedirect('/menu', '/Menu/')).toBe(false);
    expect(isSlashOnlyRedirect('/menu?p=1', '/menu/')).toBe(false);
    expect(isSlashOnlyRedirect('/menu', 'https://example.com/menu')).toBe(false);
    expect(isSlashOnlyRedirect('/menu', '//menu/')).toBe(false);
  });

  it('are what the URL builder writes', () => {
    const urls = new UrlBuilder(
      [
        { code: 'en', name: 'English', prefix: '', isDefault: true },
        { code: 'it', name: 'Italiano', prefix: '/it', isDefault: false },
      ],
      new Map([['page', { slug: 'page', permalink: '/{path}', hierarchical: true }]]),
      new Map([['p1', ['about', 'team']]]),
      new Map(),
      new Map(),
      true,
    );
    const entry = {
      id: 'p1',
      typeSlug: 'page',
      locale: 'it',
      slug: 'team',
      parentId: null,
      publishedAt: null,
      createdAt: new Date(),
    };
    expect(urls.home('en')).toBe('/');
    expect(urls.home('it')).toBe('/it/');
    expect(urls.entry(entry)).toBe('/it/about/team/');
    expect(urls.term('category', 'news', 'en')).toBe('/category/news/');
    expect(urls.page(urls.term('category', 'news', 'it'), 3)).toBe('/it/category/news/page/3/');
    expect(urls.page(urls.home('en'), 2)).toBe('/page/2/');
    expect(urls.author('it', 'ann')).toBe('/it/author/ann/');
    expect(urls.feed('en')).toBe('/feed/');
    expect(urls.search('it')).toBe('/it/search/');
    expect(urls.account('it', 'login')).toBe('/it/account/login');
    expect(urls.join('/category/news/', '/feed')).toBe('/category/news/feed/');
  });
});

describe('with the trailing slash', () => {
  it('redirects once to the slashed form, keeping the query', async () => {
    await setSlash(true);
    expect(await hop('/about')).toEqual([301, '/about/']);
    expect(await hop('/about/team?x=1&y=2')).toEqual([301, '/about/team/?x=1&y=2']);
    expect(await hop('/about//')).toEqual([301, '/about/']);
    expect(await hop(`/${year}/hello`)).toEqual([301, `/${year}/hello/`]);
    expect(await hop('/page/2')).toEqual([301, '/page/2/']);
    expect(await hop('/feed')).toEqual([301, '/feed/']);
    expect(await hop('/search?q=hello')).toEqual([301, '/search/?q=hello']);
    // Saved redirects go straight to the slashed target, from either form.
    expect(await hop('/old-about')).toEqual([301, '/about/']);
    expect(await hop('/old-about/')).toEqual([301, '/about/']);
    // Missing addresses too, then a 404.
    expect(await hop('/nothing')).toEqual([301, '/nothing/']);
    expect((await visitor.get('/nothing/')).statusCode).toBe(404);
  });

  it('serves pages and writes every address with the slash', async () => {
    const home = await visitor.get('/');
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('href="/page/2/"');
    expect(home.body).toContain('href="http://slashes.test/feed/"');

    const about = await visitor.get('/about/');
    expect(about.statusCode).toBe(200);
    expect(about.body).toContain('<link rel="canonical" href="http://slashes.test/about/"/>');
    // Menus: entries, and custom links to the site's own pages (not files).
    expect(about.body).toContain('<a href="/about/" aria-current="page">About</a>');
    expect(about.body).toContain('<a href="/about/team/?ref=menu">Our team</a>');
    expect(about.body).toContain('<a href="/files/price-list.pdf">Prices</a>');
    expect((await visitor.get('/about/team/')).body).toContain('class="is-current"');

    const post = await visitor.get(`/${year}/hello/`);
    expect(post.statusCode).toBe(200);
    expect(post.body).toContain('href="/category/travel/"');

    const archive = await visitor.get('/category/travel/');
    expect(archive.statusCode).toBe(200);
    expect(archive.body).toContain('href="/category/travel/page/2/"');
    expect(archive.body).toContain('href="http://slashes.test/category/travel/feed/"');
    expect((await visitor.get('/category/travel/page/2/')).statusCode).toBe(200);
    expect(await hop('/category/travel/page/2')).toEqual([301, '/category/travel/page/2/']);
    expect((await visitor.get('/page/2/')).statusCode).toBe(200);

    const feed = await visitor.get('/feed/');
    expect(feed.statusCode).toBe(200);
    expect(feed.body).toContain(`http://slashes.test/${year}/hello/`);
    expect((await visitor.get('/category/travel/feed/')).statusCode).toBe(200);
    expect((await visitor.get('/search/?q=hello')).statusCode).toBe(200);
  });

  it('keeps files, the API and account pages as they are', async () => {
    const index = await visitor.get('/sitemap.xml');
    expect(index.statusCode).toBe(200);
    const sitemap = await visitor.get('/sitemap-page-en.xml');
    expect(sitemap.statusCode).toBe(200);
    expect(sitemap.body).toContain('<loc>http://slashes.test/about/</loc>');
    expect(sitemap.body).toContain('<loc>http://slashes.test/about/team/</loc>');
    expect(await hop('/sitemap.xml/')).toEqual([301, '/sitemap.xml']);
    expect((await visitor.get('/robots.txt')).statusCode).toBe(200);
    const api = await visitor.get('/api/v1/nope');
    expect(api.statusCode).toBe(404);
    expect(api.headers['content-type']).not.toContain('text/html');
    expect((await visitor.get('/account/login')).statusCode).toBe(200);
    expect(await hop('/account/login/')).toEqual([301, '/account/login']);
  });

  it('follows renamed entries to the slashed address in one hop', async () => {
    const entry = await publish('page', 'Old name');
    await admin.request('PATCH', `/api/v1/entries/${entry.id}`, { slug: 'new-name' });
    expect(await hop('/old-name')).toEqual([301, '/new-name/']);
    expect(await hop('/old-name/')).toEqual([301, '/new-name/']);
  });
});

describe('without the trailing slash (the default)', () => {
  it('redirects the slashed form to the bare one, and writes bare addresses', async () => {
    await setSlash(false);
    expect(await hop('/about/')).toEqual([301, '/about']);
    expect(await hop('/about/team/?x=1')).toEqual([301, '/about/team?x=1']);
    expect(await hop('/old-about/')).toEqual([301, '/about']);
    const about = await visitor.get('/about');
    expect(about.statusCode).toBe(200);
    expect(about.body).toContain('<link rel="canonical" href="http://slashes.test/about"/>');
    expect(about.body).toContain('<a href="/about/team?ref=menu">Our team</a>');
    const home = await visitor.get('/');
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('href="/page/2"');
    expect((await visitor.get('/sitemap-page-en.xml')).body).toContain(
      '<loc>http://slashes.test/about</loc>',
    );
  });
});
