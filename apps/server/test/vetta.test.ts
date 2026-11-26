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
  // The WordPress Importer is built in place: it bundles its own dependencies.
  if (slug === 'wordpress-importer') await buildPlugin(join(pluginsRoot, slug));
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules') && !file.includes('.build-lock'),
  });
  if (slug !== 'wordpress-importer') await buildPlugin(source);
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
  await install('wordpress-importer', pluginsPath);
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
  expect((await admin.post('/api/v1/plugins/wordpress-importer/activate')).statusCode).toBe(200);
  // Vetta SEO Pro, as its plugin answers: on unless a test switches it off.
  vettaPro().unlocked.push(() => pro);
});

/** Whether Vetta SEO Pro lifts the limits (its answer to Vetta's question). */
let pro = true;
const vettaPro = () =>
  (globalThis as unknown as Record<symbol, { unlocked: (() => boolean)[] }>)[
    Symbol.for('cleitext.vetta')
  ]!;

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

  it('serves the IndexNow key at the root, leaving every other .txt to the site', async () => {
    const saved = await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: { module_indexNow: true, module_robotsTxt: true },
    });
    const key = saved.json().config.indexnow_key as string;
    const root = await visitor.get(`/${key}.txt`);
    expect(root.statusCode).toBe(200);
    expect(root.body).toBe(key);
    // The old address keeps working.
    expect((await visitor.get(`/indexnow-key/${key}`)).body).toBe(key);
    // robots.txt is the site's, another key and other .txt files are not found.
    expect((await visitor.get('/robots.txt')).body).toContain('Sitemap:');
    expect((await visitor.get('/0123456789abcdef0123456789abcdef.txt')).statusCode).toBe(404);
    expect((await visitor.get('/ads.txt')).statusCode).toBe(404);
    expect((await visitor.get('/.txt')).statusCode).toBe(404);
    await admin.request('PUT', '/api/v1/ext/vetta/config', { config: { module_indexNow: false } });
    expect((await visitor.get(`/${key}.txt`)).statusCode).toBe(404);
  });

  it('replaces an IndexNow key IndexNow would refuse, and makes one when none was saved', async () => {
    const saved = await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: { module_indexNow: true, indexnow_key: '????????????????' },
    });
    expect(saved.json().config.indexnow_key).toMatch(/^[0-9a-f]{32}$/);
    // Turned off and on without saving a key: the settings show a new one.
    await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: { module_indexNow: false, indexnow_key: '' },
    });
    const off = (await admin.get('/api/v1/ext/vetta/config')).json().config;
    expect(off.indexnow_key ?? '').toBe('');
    await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: { module_indexNow: true, indexnow_key: 'own-key-1234' },
    });
    const own = (await admin.get('/api/v1/ext/vetta/config')).json().config;
    expect(own.indexnow_key).toBe('own-key-1234');
    expect((await visitor.get('/own-key-1234.txt')).body).toBe('own-key-1234');
    await admin.request('PUT', '/api/v1/ext/vetta/config', { config: { module_indexNow: false } });
  });

  it('serves the verification files at the root, leaving other addresses to the site', async () => {
    await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: {
        verify_files: [
          { name: 'google0123abcd.html', content: 'google-site-verification: google0123abcd.html' },
          {
            name: 'BingSiteAuth.xml',
            content: '<?xml version="1.0"?><users><user>K1</user></users>',
          },
          { name: 'yandex_99.txt', content: 'verify-99' },
        ],
      },
    });
    const google = await visitor.get('/google0123abcd.html');
    expect(google.statusCode).toBe(200);
    expect(google.body).toBe('google-site-verification: google0123abcd.html');
    expect(google.headers['content-type']).toContain('text/html');
    const bing = await visitor.get('/BingSiteAuth.xml');
    expect(bing.statusCode).toBe(200);
    expect(bing.headers['content-type']).toContain('xml');
    expect(bing.body).toContain('<user>K1</user>');
    expect((await visitor.get('/yandex_99.txt')).body).toBe('verify-99');
    expect((await visitor.get('/google-other.html')).statusCode).toBe(404);
    expect((await visitor.get('/robots.txt')).body).toContain('User-agent');
    await admin.request('PUT', '/api/v1/ext/vetta/config', { config: {} });
    expect((await visitor.get('/google0123abcd.html')).statusCode).toBe(404);
  });

  it('gives categories and tags their own search title, description, robots and canonical', async () => {
    const screen = (await admin.get('/api/v1/field-screens/term')).json() as {
      groups: { id: string; fields: { name: string; type: string }[] }[];
    };
    const group = screen.groups.find((g) => g.id === 'vetta-term')!;
    expect(group.fields.map((f) => f.name).slice(0, 4)).toEqual([
      'vettaBox',
      'keywords',
      'title',
      'description',
    ]);
    const created = await admin.post('/api/v1/taxonomies/category/terms', {
      name: 'Roasts',
      description: 'Light and dark roasts.',
      fields: {
        'vetta-term': {
          keywords: 'coffee roasts',
          title: '%focuskw%: %term% %sep% %sitename%',
          description: 'Every %term% we make. %term_description%',
          ogTitle: 'Our roasts',
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const roasts = created.json() as { id: string; slug: string };
    const plain = (
      await admin.post('/api/v1/taxonomies/category/terms', { name: 'Grinders' })
    ).json() as { id: string; slug: string };
    const post = await publish('article', 'Dark roast');
    await admin.request('PATCH', `/api/v1/entries/${post.id}`, {
      terms: { category: [roasts.id, plain.id] },
    });
    await admin.post(`/api/v1/entries/${post.id}/publish`);

    const html = (await visitor.get(`/category/${roasts.slug}`)).body;
    expect(html).toMatch(/<title>coffee roasts: Roasts \S Site vetta<\/title>/);
    expect(meta(html, 'description')).toBe('Every Roasts we make. Light and dark roasts.');
    expect(meta(html, 'og:title')).toBe('Our roasts');
    // Without its own: the taxonomy's template.
    expect((await visitor.get(`/category/${plain.slug}`)).body).toMatch(
      /<title>Grinders \S Site vetta<\/title>/,
    );

    // Out of search: noindex, no canonical, out of the sitemap.
    const categories = '/sitemap-tax-category-en.xml';
    expect((await visitor.get(categories)).body).toContain(`/category/${plain.slug}`);
    expect(
      (
        await admin.request('PATCH', `/api/v1/terms/${plain.id}`, {
          fields: { 'vetta-term': { noindex: true } },
        })
      ).statusCode,
    ).toBe(200);
    const hidden = (await visitor.get(`/category/${plain.slug}`)).body;
    expect(meta(hidden, 'robots')).toBe('noindex, follow');
    expect(hidden).not.toContain('rel="canonical"');
    const after = (await visitor.get(categories)).body;
    expect(after).not.toContain(`/category/${plain.slug}`);
    expect(after).toContain(`/category/${roasts.slug}`);

    // A canonical address elsewhere.
    await admin.request('PATCH', `/api/v1/terms/${roasts.id}`, {
      fields: { 'vetta-term': { canonical: 'https://elsewhere.example/roasts' } },
    });
    expect((await visitor.get(`/category/${roasts.slug}`)).body).toContain(
      '<link rel="canonical" href="https://elsewhere.example/roasts"',
    );

    // A least number of entries (1.6): with one post, below 2, noindex and out of the sitemap.
    await admin.request('PATCH', `/api/v1/terms/${roasts.id}`, {
      fields: { 'vetta-term': { canonical: '' } },
    });
    const few = await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: { tax_category_min_entries: 2 },
    });
    expect(few.statusCode, few.body).toBe(200);
    expect(meta((await visitor.get(`/category/${roasts.slug}`)).body, 'robots')).toMatch(
      /^noindex, follow/,
    );
    expect((await visitor.get(categories)).body).not.toContain(`/category/${roasts.slug}`);
    await admin.request('PUT', '/api/v1/ext/vetta/config', {
      config: { tax_category_min_entries: 1 },
    });
    expect(meta((await visitor.get(`/category/${roasts.slug}`)).body, 'robots')).toMatch(
      /^index, follow/,
    );
    expect((await visitor.get(categories)).body).toContain(`/category/${roasts.slug}`);
  });

  it('gives the links of the breadcrumbs the whole title', async () => {
    const parent = await publish('page', 'Our coffee bar in the old town', {
      fields: { vetta: { breadcrumbTitle: 'The bar' } },
    });
    const child = await publish('page', 'Opening hours', {
      parentId: parent.id,
      document: {
        schema: 1,
        blocks: [{ id: 'b_crumbs', type: 'vetta/breadcrumbs', v: 1, attrs: {} }],
      },
    });
    const html = (await visitor.get(`/${parent.slug}/${child.slug}`)).body;
    expect(html).toMatch(/<a href="\/[^"]*" title="Our coffee bar in the old town">The bar<\/a>/);
    expect(html).toMatch(/<a href="\/" title="Home">Home<\/a>/);
  });

  it('imports the SEO of categories written with Rank Math', async () => {
    const cdata = (value: string) => `<![CDATA[${value}]]>`;
    const termMeta = Object.entries({
      rank_math_title: '%term% beans to buy %sep% %sitename%',
      rank_math_description: 'Beans from Brazil and Ethiopia.',
      rank_math_focus_keyword: 'coffee beans',
      rank_math_robots: 'a:1:{i:0;s:8:"nofollow";}',
    })
      .map(
        ([key, value]) =>
          `<wp:termmeta><wp:meta_key>${cdata(key)}</wp:meta_key><wp:meta_value>${cdata(value)}</wp:meta_value></wp:termmeta>`,
      )
      .join('');
    const wxr = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
<title>Beans</title>
<link>https://beans.example.com</link>
<wp:wxr_version>1.2</wp:wxr_version>
<wp:base_blog_url>https://beans.example.com</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata('ada')}</wp:author_login><wp:author_email>${cdata('ada@beans.example.com')}</wp:author_email><wp:author_display_name>${cdata('Ada')}</wp:author_display_name></wp:author>
<wp:category><wp:term_id>7</wp:term_id><wp:category_nicename>${cdata('beans')}</wp:category_nicename><wp:category_parent>${cdata('')}</wp:category_parent><wp:cat_name>${cdata('Beans')}</wp:cat_name>${termMeta}</wp:category>
<item>
<title>${cdata('Arabica')}</title>
<link>https://beans.example.com/arabica/</link>
<dc:creator>${cdata('ada')}</dc:creator>
<content:encoded>${cdata('<p>Sweet.</p>')}</content:encoded>
<excerpt:encoded>${cdata('')}</excerpt:encoded>
<wp:post_id>70</wp:post_id>
<wp:post_date_gmt>${cdata('2024-05-01 08:00:00')}</wp:post_date_gmt>
<wp:post_name>${cdata('arabica')}</wp:post_name>
<wp:status>${cdata('publish')}</wp:status>
<wp:post_parent>0</wp:post_parent>
<wp:menu_order>0</wp:menu_order>
<wp:post_type>${cdata('post')}</wp:post_type>
<category domain="category" nicename="beans">${cdata('Beans')}</category>
</item>
</channel>
</rss>`;
    const started = await admin.upload(
      '/api/v1/ext/wordpress-importer/imports?locale=en',
      'beans.xml',
      Buffer.from(wxr),
      'text/xml',
    );
    expect(started.statusCode, started.body).toBe(202);
    await eventually(async () => {
      const { job } = (await admin.get('/api/v1/ext/wordpress-importer/status')).json();
      if (job.status === 'running') return false;
      expect(job.error ?? job.status).toBe('done');
      return true;
    }, 20_000);
    const terms = (await admin.get('/api/v1/taxonomies/category/terms')).json() as {
      slug: string;
      fields: Record<string, unknown>;
    }[];
    expect(terms.find((t) => t.slug === 'beans')!.fields['vetta-term']).toEqual({
      keywords: 'coffee beans',
      title: '%term% beans to buy %sep% %sitename%',
      description: 'Beans from Brazil and Ethiopia.',
      nofollow: true,
    });
    const html = (await visitor.get('/category/beans')).body;
    // (The import gave the site the export's name.)
    expect(html).toMatch(/<title>Beans beans to buy \S Beans<\/title>/);
    expect(meta(html, 'robots')).toMatch(/^index, nofollow/);
  });

  it('tells editors when a keyword is already used, and gives them the templates', async () => {
    const used = (await admin.get('/api/v1/ext/vetta/keyword-used?keyword=espresso')).json();
    expect(used.title).toBe('Espresso at home');
    const editor = (await admin.get('/api/v1/ext/vetta/editor-config')).json();
    expect(editor.config.separator).toBe(undefined);
    expect(editor.siteName).toBeTruthy();
  });
  it('without Vetta SEO Pro, a site new to Vetta has one keyword and none of the Pro modules', async () => {
    const other = await seedSite(owner, 'vetta-free');
    await seedUser(owner, {
      email: 'admin@vetta-free.test',
      password: PASSWORD,
      site: other,
      role: 'administrator',
    });
    const freeAdmin = new TestClient(app, other.host, '10.9.1.3');
    await freeAdmin.login('admin@vetta-free.test', PASSWORD);
    pro = false;
    try {
      expect((await freeAdmin.post('/api/v1/plugins/vetta/activate')).statusCode).toBe(200);
      vettaPro().unlocked.push(() => pro);
      await freeAdmin.request('PUT', '/api/v1/ext/vetta/config', {
        config: { module_llms: true, module_localSeo: true, module_monitor404: true },
      });
      const got = (await freeAdmin.get('/api/v1/ext/vetta/config')).json();
      expect(got.limits.pro).toBe(false);
      expect(got.limits.keywords).toBe(1);
      expect(got.limits.terms).toBe(false);
      expect(got.config.module_llms).toBe(false);
      expect(got.config.module_localSeo).toBe(false);
      expect(got.config.module_indexNow).toBe(false);
      expect((await new TestClient(app, other.host, '10.9.1.4').get('/llms.txt')).statusCode).toBe(
        404,
      );
      expect((await freeAdmin.get('/api/v1/ext/vetta/editor-config')).json().limits.keywords).toBe(
        1,
      );
      // With Pro the same settings apply, and stay on when the license ends.
      pro = true;
      await freeAdmin.request('PUT', '/api/v1/ext/vetta/config', {
        config: { module_llms: true },
      });
      expect((await freeAdmin.get('/api/v1/ext/vetta/config')).json().config.module_llms).toBe(
        true,
      );
      pro = false;
      await freeAdmin.request('PUT', '/api/v1/ext/vetta/config', {
        config: { module_llms: true, module_localSeo: true },
      });
      const after = (await freeAdmin.get('/api/v1/ext/vetta/config')).json();
      expect(after.limits.pro).toBe(false);
      expect(after.config.module_llms).toBe(true);
      expect(after.config.module_localSeo).toBe(false);
    } finally {
      pro = true;
    }
  });
});
