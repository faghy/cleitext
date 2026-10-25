/**
 * Official plugins (milestone M4): SEO and Forms, built from plugins/ and
 * installed like any other plugin.
 */
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { CxdDocument } from '@cleitext/blocks';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import sharp from 'sharp';
import { MailService } from '../src/mail/mail.service.js';
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

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('seo', pluginsPath);
  await install('forms', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'official');
  await seedUser(owner, {
    email: 'admin@official.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.9.0.1');
  await admin.login('admin@official.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.9.0.2');
  for (const slug of ['seo', 'forms']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('SEO', () => {
  it('adds a field group to pages and articles', async () => {
    const types = (await admin.get('/api/v1/content-types')).json();
    const article = types.find((t: { slug: string }) => t.slug === 'article');
    expect(article.fieldGroups.map((g: { id: string }) => g.id)).toEqual(['seo']);
  });

  it('uses the search title, description and indexing of an entry', async () => {
    const entry = await publish('article', 'A long and descriptive title', {
      fields: {
        seo: { title: 'Short title', description: 'What this article is about.', noindex: true },
      },
    });
    const html = (await visitor.get(`/${new Date().getUTCFullYear()}/${entry.slug}`)).body;
    expect(html).toContain('<title>Short title – Site official</title>');
    expect(html).toContain('<meta name="description" content="What this article is about."/>');
    expect(html).toContain('<meta name="robots" content="noindex, follow"/>');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"headline":"Short title"');
  });

  it('validates its fields', async () => {
    const response = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Too long',
      fields: { seo: { title: 'x'.repeat(71) } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].path).toBe('fields.seo.title');
  });

  it('applies the site settings', async () => {
    await admin.request('PATCH', '/api/v1/plugins/seo/settings', {
      separator: '|',
      defaultDescription: 'A site about things.',
      twitterSite: 'example',
    });
    const entry = await publish('page', 'About');
    const page = (await visitor.get(`/${entry.slug}`)).body;
    expect(page).toContain('<title>About | Site official</title>');
    expect(page).toContain('<meta name="description" content="A site about things."/>');
    expect(page).toContain('<meta name="twitter:site" content="@example"/>');
    expect((await visitor.get('/')).body).toContain('"@type":"WebSite"');
    // The home page's own search title, with variables; Rank Math's separators too.
    const home = await publish('page', 'Welcome', {
      fields: { seo: { title: 'Web agency %%sep%% %%sitename%%' } },
    });
    await admin.request('PATCH', '/api/v1/settings/core', { frontPage: home.id });
    await admin.request('PATCH', '/api/v1/plugins/seo/settings', { separator: '⋆' });
    expect((await visitor.get('/')).body).toContain('<title>Web agency ⋆ Site official</title>');
    // Feeds of a category use it too.
    const term = (await admin.post('/api/v1/taxonomies/category/terms', { name: 'Feeds' })).json();
    expect((await visitor.get(`/category/${term.slug as string}/feed`)).body).toContain(
      '<title>Feeds ⋆ Site official</title>',
    );
    await admin.request('PATCH', '/api/v1/settings/core', { frontPage: null });
    await admin.request('PATCH', '/api/v1/plugins/seo/settings', { separator: '|' });
  });

  it('shows imported titles as the whole title, without the site’s name again', async () => {
    // From Yoast SEO: an old home page that is now an ordinary page.
    const imported = await publish('page', 'Old home', {
      fields: { seo: { title: 'Hotel Aurora - Welcome', fullTitle: true } },
    });
    expect((await visitor.get(`/${imported.slug}`)).body).toContain(
      '<title>Hotel Aurora - Welcome</title>',
    );
    // Titles with variables are whole titles too, the variables resolved.
    const templated = await publish('page', 'Rooms', {
      fields: {
        seo: {
          title: '%%title%% %%sep%% %%sitedesc%% %%sep%% %%sitename%%',
          description: 'Our %%title%%',
        },
      },
    });
    const html = (await visitor.get(`/${templated.slug}`)).body;
    expect(html).toContain('<title>Rooms | Site official</title>');
    expect(html).toContain('<meta name="description" content="Our Rooms"/>');
    await admin.request('PATCH', '/api/v1/settings/core', { tagline: 'By the sea' });
    expect((await visitor.get(`/${templated.slug}`)).body).toContain(
      '<title>Rooms | By the sea | Site official</title>',
    );
    await admin.request('PATCH', '/api/v1/settings/core', { tagline: '' });
  });

  it('keeps out of the sitemaps what is kept out of search', async () => {
    const shown = await publish('page', 'Shown page', {
      document: {
        schema: 1,
        blocks: [
          { id: 'i1', type: 'core/image', v: 1, attrs: { url: 'https://cdn.example.com/a.jpg' } },
        ],
      },
    });
    const hidden = await publish('page', 'Hidden page', { fields: { seo: { noindex: true } } });
    const copy = await publish('page', 'Copied page', {
      fields: { seo: { canonical: 'https://elsewhere.example/original' } },
    });
    const pages = (await visitor.get('/sitemap-page-en.xml')).body;
    expect(pages).toContain(`/${shown.slug}</loc>`);
    expect(pages).toContain('<image:loc>https://cdn.example.com/a.jpg</image:loc>');
    expect(pages).not.toContain(`/${hidden.slug}<`);
    expect(pages).not.toContain(`/${copy.slug}<`);

    const page = (await visitor.get(`/${shown.slug}`)).body;
    expect(page).toContain(
      '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"/>',
    );
    expect((await visitor.get(`/${copy.slug}`)).body).toContain(
      '<link rel="canonical" href="https://elsewhere.example/original"/>',
    );

    // Content types and taxonomies hidden from search results, and no images.
    const saved = await admin.request('PUT', '/api/v1/ext/seo/config', {
      hiddenTypes: ['article'],
      hiddenTaxonomies: ['category'],
      sitemapImages: false,
      representation: {
        kind: 'organization',
        name: 'Official Ltd',
        logo: 'https://official.test/logo.png',
        sameAs: ['https://www.linkedin.com/company/official', 'not a url'],
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().representation.sameAs).toEqual([
      'https://www.linkedin.com/company/official',
    ]);
    const index = (await visitor.get('/sitemap.xml')).body;
    expect(index).toContain('sitemap-page-en.xml');
    expect(index).not.toContain('sitemap-article-en.xml');
    expect(index).not.toContain('sitemap-tax-category');
    expect((await visitor.get('/sitemap-article-en.xml')).statusCode).toBe(404);
    expect((await visitor.get('/sitemap-page-en.xml')).body).not.toContain('<image:loc>');
    const article = await publish('article', 'Hidden type');
    expect((await visitor.get(`/${new Date().getUTCFullYear()}/${article.slug}`)).body).toContain(
      '<meta name="robots" content="noindex, follow"/>',
    );

    // The schema.org graph of the home page, linked by @id.
    const home = (await visitor.get('/')).body;
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(home)![1]!;
    const graph = JSON.parse(json)['@graph'] as Record<string, unknown>[];
    const types = graph.map((g) => g['@type']);
    expect(types).toEqual(expect.arrayContaining(['WebSite', 'Organization', 'WebPage']));
    const website = graph.find((g) => g['@type'] === 'WebSite')!;
    expect(website.publisher).toEqual({ '@id': 'http://official.test/#organization' });
    expect(JSON.stringify(website.potentialAction)).toContain('/search?q={search_term_string}');
    const org = graph.find((g) => g['@type'] === 'Organization')!;
    expect(org.sameAs).toEqual(['https://www.linkedin.com/company/official']);
    await admin.request('PUT', '/api/v1/ext/seo/config', {});
  });

  it('adds breadcrumbs, title templates and a social image', async () => {
    const parent = await publish('page', 'Services');
    const child = await publish('page', 'Design', {
      parentId: parent.id,
      document: { schema: 1, blocks: [{ id: 'bc', type: 'seo/breadcrumbs', v: 1, attrs: {} }] },
    });
    const png = await sharp({
      create: { width: 1200, height: 630, channels: 3, background: '#0f4c81' },
    })
      .png()
      .toBuffer();
    const image = (await admin.upload('/api/v1/media', 'card.png', png, 'image/png')).json();
    await admin.request('PATCH', `/api/v1/entries/${child.id}`, {
      fields: { seo: { socialImage: image.id, keyphrase: 'design' } },
    });
    await admin.post(`/api/v1/entries/${child.id}/publish`);
    await admin.request('PUT', '/api/v1/ext/seo/config', {
      titles: { page: '%%title%% %%sep%% Guides %%sep%% %%sitename%%' },
    });

    const html = (await visitor.get(`/${parent.slug}/${child.slug}`)).body;
    expect(html).toMatch(
      /<nav class="seo-breadcrumbs"[^>]*>.*<a href="\/">Home<\/a>.*<a href="\/services">Services<\/a>.*aria-current="page">Design</s,
    );
    expect(html).toContain('<title>Design | Guides | Site official</title>');
    expect(html).toContain(
      `<meta property="og:image" content="http://official.test${image.url}"/>`,
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"/>');
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]!;
    const graph = JSON.parse(json)['@graph'] as Record<string, unknown>[];
    const crumbs = graph.find((g) => g['@type'] === 'BreadcrumbList')!;
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'http://official.test/' },
      { '@type': 'ListItem', position: 2, name: 'Services', item: 'http://official.test/services' },
      { '@type': 'ListItem', position: 3, name: 'Design' },
    ]);

    const verification = (await admin.get('/api/v1/ext/seo/verification')).json();
    expect(verification).toMatchObject({ host: 'official.test', dns: [], meta: { google: false } });
    await admin.request('PUT', '/api/v1/ext/seo/config', {});
  });
});

describe('Forms', () => {
  let contact: { id: string; slug: string };
  const blockId = 'contact1';

  beforeAll(async () => {
    await admin.request('PATCH', '/api/v1/plugins/forms/settings', {
      recipient: 'owner@official.test',
    });
    const document: CxdDocument = {
      schema: 1,
      blocks: [
        {
          id: blockId,
          type: 'forms/contact',
          v: 1,
          attrs: { formName: 'Contact us', askPhone: true },
        },
      ],
    };
    contact = await publish('page', 'Contact', { document });
  });

  const submit = (fields: Record<string, string>, origin = `http://${site.host}`) =>
    app.inject({
      method: 'POST',
      url: '/_forms/submit',
      headers: {
        host: site.host,
        origin,
        referer: `http://${site.host}/${contact.slug}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      remoteAddress: `10.9.1.${Math.floor(Math.random() * 200)}`,
      payload: new URLSearchParams({ _form: 'Contact us', _block: blockId, ...fields }).toString(),
    });

  it('renders a form that works without JavaScript', async () => {
    const html = (await visitor.get(`/${contact.slug}`)).body;
    expect(html).toContain('action="/_forms/submit"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('Thank you, we will reply soon.');
  });

  it('stores messages, emails them and goes back to the page', async () => {
    const response = await submit({
      name: 'Ada',
      email: 'ADA@example.com',
      message: 'Hello!\nHow are you?',
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(`/${contact.slug}#form-${blockId}-sent`);

    const messages = (await admin.get('/api/v1/ext/forms/submissions')).json();
    expect(messages[0]).toMatchObject({
      formName: 'Contact us',
      name: 'Ada',
      email: 'ada@example.com',
      pagePath: `/${contact.slug}`,
    });
    const mail = app.get(MailService).outbox.at(-1)!;
    expect(mail).toMatchObject({
      to: 'owner@official.test',
      replyTo: 'ada@example.com',
      subject: '[Contact us] Ada',
    });
  });

  it('refuses invalid, automated and cross-site messages', async () => {
    const before = (await admin.get('/api/v1/ext/forms/submissions')).json().length;
    const invalid = await submit({ name: 'Bob', email: 'not-an-email', message: 'Hi' });
    expect(invalid.headers.location).toMatch(/#form-contact1-error$/);
    const bot = await submit({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'Buy',
      website: 'spam.test',
    });
    expect(bot.headers.location).toMatch(/-sent$/);
    expect(
      (await submit({ name: 'Eve', email: 'eve@example.com', message: 'Hi' }, 'https://evil.test'))
        .statusCode,
    ).toBe(403);
    expect((await admin.get('/api/v1/ext/forms/submissions')).json()).toHaveLength(before);
  });

  it('limits messages per address', async () => {
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/_forms/submit',
        headers: {
          host: site.host,
          origin: `http://${site.host}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        remoteAddress: '10.9.2.1',
        payload: 'name=Max&email=max%40example.com&message=Hi',
      });
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await send()).statusCode);
    expect(statuses).toEqual([303, 303, 303, 303, 303, 429]);
  });

  it('takes custom fields, as a hotel booking form from Contact Form 7', async () => {
    const { attrs: HOTEL_ATTRS, request: HOTEL_REQUEST } = JSON.parse(
      await readFile(join(pluginsRoot, 'forms/src/hotel.fixture.json'), 'utf8'),
    ) as { attrs: Record<string, unknown>; request: Record<string, string> };
    const hotel = await publish('page', 'Prenota', {
      document: {
        schema: 1,
        blocks: [{ id: 'hotel1', type: 'forms/contact', v: 1, attrs: HOTEL_ATTRS }],
      } satisfies CxdDocument,
    });
    const html = (await visitor.get(`/${hotel.slug}`)).body;
    expect(html).toContain('class="cf-grid"');
    expect(html).toContain('class="cf-field cf-date cf-w-1-6"');
    expect(html).toContain('<div class="cf-submit-row">');
    const spec = /name="_spec" value="([^"]+)"/.exec(html)![1]!;
    const post = (fields: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: '/_forms/submit',
        headers: {
          host: site.host,
          origin: `http://${site.host}`,
          referer: `http://${site.host}/${hotel.slug}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        remoteAddress: '10.9.3.1',
        payload: new URLSearchParams({ _block: 'hotel1', _spec: spec, ...fields }).toString(),
      });

    const missing = await post({ ...HOTEL_REQUEST, privacy: '' });
    expect(missing.headers.location).toBe(`/${hotel.slug}#form-hotel1-error`);
    const sent = await post(HOTEL_REQUEST);
    expect(sent.headers.location).toBe(`/${hotel.slug}#form-hotel1-sent`);

    const [message] = (await admin.get('/api/v1/ext/forms/submissions')).json();
    expect(message).toMatchObject({
      formName: 'Prenotazione',
      name: 'Mario Rossi',
      email: 'mario@example.com',
      message: 'Camera vista mare,\nse possibile.',
    });
    expect(message.fields.map((f: { name: string; value: string }) => [f.name, f.value])).toEqual([
      ['your-name', 'Mario Rossi'],
      ['your-email', 'mario@example.com'],
      ['your-tel', '+39 019 123456'],
      ['guests', '2'],
      ['arrival', '2027-07-10'],
      ['departure', '2027-07-17'],
      ['requests', 'Camera vista mare,\nse possibile.'],
      ['privacy', 'Yes'],
    ]);
    const mail = app.get(MailService).outbox.at(-1)!;
    expect(mail).toMatchObject({
      to: 'owner@official.test',
      replyTo: 'mario@example.com',
      subject: 'Sito Hotel aurora Varazze',
    });
    expect(mail.text).toContain('Arrivo*: 2027-07-10\nPartenza*: 2027-07-17');

    // The classic form's messages have no fields.
    const classic = (await admin.get('/api/v1/ext/forms/submissions'))
      .json()
      .find((m: { formName: string }) => m.formName === 'Contact us');
    expect(classic.fields).toBeNull();
  });

  it('lets editors read and delete messages', async () => {
    const [message] = (await admin.get('/api/v1/ext/forms/submissions')).json();
    expect(
      (await admin.request('DELETE', `/api/v1/ext/forms/submissions/${message.id}`)).statusCode,
    ).toBe(204);
    expect((await visitor.get('/api/v1/ext/forms/submissions')).statusCode).toBe(401);
  });
});
