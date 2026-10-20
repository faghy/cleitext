/**
 * Public site (milestone M3): routing, templates, languages, archives, search,
 * menus, redirects, metadata and 404s.
 */
import { menuItems, menus, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { CxdDocument } from '@cleitext/blocks';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
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
let editor: TestClient;
let visitor: TestClient;
const year = new Date().getUTCFullYear();

const doc = (...texts: string[]): CxdDocument => ({
  schema: 1,
  blocks: texts.map((text, i) => ({
    id: `p${i}`,
    type: 'core/paragraph',
    v: 1,
    attrs: {},
    content: [{ text }],
  })),
});

async function publish(
  type: string,
  title: string,
  options: { text?: string; parentId?: string; locale?: string } = {},
) {
  const created = (
    await editor.post('/api/v1/entries', {
      type,
      title,
      document: doc(options.text ?? `${title} body text.`),
      ...(options.parentId ? { parentId: options.parentId } : {}),
      ...(options.locale ? { locale: options.locale } : {}),
    })
  ).json();
  return (await editor.post(`/api/v1/entries/${created.id}/publish`)).json();
}

const page = async (path: string) => {
  const res = await visitor.get(path);
  return { status: res.statusCode, html: res.body, headers: res.headers };
};

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'public');
  await seedUser(owner, { email: 'editor@public.test', password: PASSWORD, site, role: 'editor' });
  await seedUser(owner, {
    email: 'admin@public.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  editor = new TestClient(app, site.host, '10.6.0.1');
  await editor.login('editor@public.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.6.0.2');
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('entries', () => {
  it('renders a published post with its content, metadata and terms', async () => {
    const category = (
      await editor.post('/api/v1/taxonomies/category/terms', { name: 'Travel' })
    ).json();
    const post = await publish('article', 'Weekend in Rome', {
      text: 'We walked a lot in Trastevere.',
    });
    await editor.request('PATCH', `/api/v1/entries/${post.id}`, {
      terms: { category: [category.id] },
    });
    await editor.post(`/api/v1/entries/${post.id}/publish`);

    const { status, html, headers } = await page(`/${year}/weekend-in-rome`);
    expect(status).toBe(200);
    expect(headers['content-type']).toBe('text/html; charset=utf-8');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(html.startsWith('<!doctype html><html lang="en">')).toBe(true);
    expect(html).toContain('<title>Weekend in Rome – Site public</title>');
    expect(html).toContain('<meta name="description" content="We walked a lot in Trastevere."/>');
    expect(html).toContain(
      `<link rel="canonical" href="http://public.test/${year}/weekend-in-rome"/>`,
    );
    expect(html).toContain('<meta property="og:type" content="article"/>');
    expect(html).toContain('<h1>Weekend in Rome</h1>');
    expect(html).toContain('<p>We walked a lot in Trastevere.</p>');
    expect(html).toContain('<a href="/category/travel">Travel</a>');
    // No JavaScript, except the small optional one of comments and likes.
    expect(html.replace(/<script data-cx-community>[\s\S]*?<\/script>/, '')).not.toContain(
      '<script',
    );
  });

  it('serves hierarchical pages at their full path only', async () => {
    const about = await publish('page', 'About');
    await publish('page', 'Team', { parentId: about.id });
    expect((await page('/about/team')).status).toBe(200);
    expect((await page('/team')).status).toBe(404);
    expect((await page(`/${year}/about`)).status).toBe(404);
  });

  it('never shows drafts or unpublished entries', async () => {
    const draft = (
      await editor.post('/api/v1/entries', { type: 'page', title: 'Secret plan' })
    ).json();
    expect((await page('/secret-plan')).status).toBe(404);
    const live = await publish('page', 'Short lived');
    expect((await page('/short-lived')).status).toBe(200);
    await editor.post(`/api/v1/entries/${live.id}/unpublish`);
    expect((await page('/short-lived')).status).toBe(404);
    expect(draft.status).toBe('draft');
  });

  it('shows the published version while edits are pending', async () => {
    const entry = await publish('page', 'Stable', { text: 'Published words.' });
    await editor.request('PATCH', `/api/v1/entries/${entry.id}`, {
      title: 'Renamed draft',
      slug: 'stable',
      document: doc('Unpublished words.'),
    });
    const { html } = await page('/stable');
    expect(html).toContain('Published words.');
    expect(html).toContain('<h1>Stable</h1>');
    expect(html).not.toContain('Unpublished words.');
    expect(html).not.toContain('Renamed draft');
  });

  it('escapes titles and content', async () => {
    await publish('page', 'Evil <script>alert(1)</script>', {
      text: '<img src=x onerror=alert(1)>',
    });
    const { html } = await page('/evil-script-alert-1-script');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html.replace(/<script data-cx-community>[\s\S]*?<\/script>/, '')).not.toMatch(
      /<script|<img src=x/,
    );
  });
});

describe('one language (no language plugin)', () => {
  it('has no language addresses, hreflang or language switcher', async () => {
    await publish('page', 'Contact');
    const english = await page('/contact');
    expect(english.status).toBe(200);
    expect(english.html).toContain('<html lang="en">');
    expect(english.html).not.toContain('hrefLang');
    expect(english.html).not.toContain('class="languages"');
    expect((await page('/it/contact')).status).toBe(404);
    expect((await page('/en/contact')).status).toBe(404);
  });
});

describe('home and archives', () => {
  it('lists the latest posts on the home page, paginated', async () => {
    const admin = new TestClient(app, site.host, '10.6.0.3');
    await admin.login('admin@public.test', PASSWORD);
    const patched = await admin.request('PATCH', '/api/v1/settings/core', {
      postsPerPage: 2,
      tagline: 'Notes and trips',
    });
    expect(patched.json()).toMatchObject({
      postsPerPage: 2,
      tagline: 'Notes and trips',
      frontPage: null,
    });
    for (const n of [1, 2, 3]) await publish('article', `Listed post ${n}`);

    const home = await page('/');
    expect(home.status).toBe(200);
    expect(home.html).toContain('<title>Site public – Notes and trips</title>');
    expect(home.html).toContain(`<a href="/${year}/listed-post-3">Listed post 3</a>`);
    expect(home.html).toContain('href="/page/2"');
    expect((await page('/page/2')).status).toBe(200);
    expect((await page('/page/999')).status).toBe(404);
    expect((await page('/page/1')).status).toBe(404);
    await admin.request('PATCH', '/api/v1/settings/core', { postsPerPage: 10 });
  });

  it('uses a static front page and a posts page when configured', async () => {
    const welcome = await publish('page', 'Welcome', { text: 'Hello visitors.' });
    const blog = await publish('page', 'Blog');
    const admin = new TestClient(app, site.host, '10.6.0.4');
    await admin.login('admin@public.test', PASSWORD);
    await admin.request('PATCH', '/api/v1/settings/core', {
      frontPage: welcome.id,
      postsPage: blog.id,
    });
    const home = await page('/');
    expect(home.html).toContain('Hello visitors.');
    expect(home.html).toContain('<link rel="canonical" href="http://public.test/"/>');
    expect((await page('/blog')).html).toContain('Listed post 1');
    // The posts page has later pages too.
    await admin.request('PATCH', '/api/v1/settings/core', { postsPerPage: 2 });
    const blogPage = await page('/blog');
    expect(blogPage.html).toContain('href="/blog/page/2"');
    const second = await page('/blog/page/2');
    expect(second.status).toBe(200);
    expect(second.html).toContain('Listed post 1');
    expect((await page('/blog/page/1')).status).toBe(404);
    // The front page does not answer at its own slug: one address, the home.
    const own = await page('/welcome');
    expect(own.status).toBe(301);
    expect(own.headers.location).toBe('/');
    await admin.request('PATCH', '/api/v1/settings/core', {
      frontPage: null,
      postsPage: null,
      postsPerPage: 10,
    });
  });

  it('lists the posts of a category', async () => {
    const { html, status } = await page('/category/travel');
    expect(status).toBe(200);
    expect(html).toContain('<h1>Travel</h1>');
    expect(html).toContain('Weekend in Rome');
    expect(html).not.toContain('Listed post 1');
    expect((await page('/category/unknown')).status).toBe(404);
  });
});

describe('search', () => {
  it('finds published content only', async () => {
    await publish('article', 'Gelato guide', { text: 'The best pistachio in town.' });
    const draft = (
      await editor.post('/api/v1/entries', { type: 'article', title: 'Pistachio secret' })
    ).json();
    const { html, status } = await page('/search?q=pistachio');
    expect(status).toBe(200);
    expect(html).toContain('Gelato guide');
    expect(html).not.toContain('Pistachio secret');
    expect(html).toContain('<meta name="robots" content="noindex, follow"/>');
    // The matching word is marked in the result (RF-THM-10).
    expect(html).toContain('<mark>pistachio</mark>');
    expect(draft.status).toBe('draft');
  });

  it('can look in one content type only', async () => {
    await publish('page', 'Pistachio page', { text: 'Pistachio cream recipe.' });
    const pages = await page('/search?q=pistachio&type=page');
    expect(pages.html).toContain('Pistachio page');
    expect(pages.html).not.toContain('Gelato guide');
    expect((await page('/search?q=pistachio&type=bad%20type')).html).toContain('Gelato guide');
  });
});

describe('menus', () => {
  it('renders menus assigned to theme locations, following entries', async () => {
    const services = await publish('page', 'Services');
    const hidden = (
      await editor.post('/api/v1/entries', { type: 'page', title: 'Not yet' })
    ).json();
    await withSiteContext(owner.db, site.id, async (tx) => {
      const [menu] = await tx
        .insert(menus)
        .values({ siteId: site.id, slug: 'main', name: 'Main', locale: 'en', location: 'primary' })
        .returning();
      await tx.insert(menuItems).values([
        { siteId: site.id, menuId: menu!.id, kind: 'entry', entryId: services.id, position: 0 },
        { siteId: site.id, menuId: menu!.id, kind: 'entry', entryId: hidden.id, position: 1 },
        {
          siteId: site.id,
          menuId: menu!.id,
          kind: 'url',
          url: 'javascript:alert(1)',
          label: 'Bad',
          position: 2,
        },
        {
          siteId: site.id,
          menuId: menu!.id,
          kind: 'url',
          url: 'https://example.org',
          label: 'Partner',
          target: '_blank',
          position: 3,
        },
      ]);
    });
    const { html } = await page('/services');
    expect(html).toContain('<nav class="site-nav" aria-label="Main menu">');
    expect(html).toContain(
      '<li class="is-current"><a href="/services" aria-current="page">Services</a></li>',
    );
    expect(html).toContain(
      '<a href="https://example.org" target="_blank" rel="noopener noreferrer">Partner</a>',
    );
    expect(html).not.toContain('Not yet');
    expect(html).not.toContain('javascript:');
  });
});

describe('redirects and errors', () => {
  it('normalizes trailing slashes and follows slug changes', async () => {
    const res = await visitor.get('/about/team/');
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe('/about/team');

    const entry = await publish('page', 'Old name');
    await editor.request('PATCH', `/api/v1/entries/${entry.id}`, { slug: 'new-name' });
    const moved = await visitor.get('/old-name');
    expect(moved.statusCode).toBe(301);
    expect(moved.headers.location).toBe('/new-name');
  });

  it('answers 404 with the theme template, or the configured error page', async () => {
    const missing = await page('/nothing/here');
    expect(missing.status).toBe(404);
    expect(missing.html).toContain('Page not found');
    expect(missing.html).toContain('<meta name="robots" content="noindex, follow"/>');

    const errorPage = await publish('page', 'Lost', { text: 'Custom lost page.' });
    const admin = new TestClient(app, site.host, '10.6.0.5');
    await admin.login('admin@public.test', PASSWORD);
    await admin.request('PATCH', '/api/v1/settings/core', {
      errorPage: errorPage.id,
    });
    const custom = await page('/still/nothing');
    expect(custom.status).toBe(404);
    expect(custom.html).toContain('Custom lost page.');
    await admin.request('PATCH', '/api/v1/settings/core', { errorPage: null });
  });

  it('keeps the API and the admin out of the public router', async () => {
    expect((await visitor.get('/api/v1/nope')).statusCode).toBe(404);
    expect((await visitor.get('/api/v1/nope')).headers['content-type']).not.toContain('text/html');
  });
});
