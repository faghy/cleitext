/**
 * The official Multilingual plugin (M7): languages, translations, language
 * addresses, hreflang, menus, sitemaps and the hand-over of language data.
 * Without it a site has one language (see public.test.ts).
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import {
  entries,
  revisions,
  settings,
  superAdmins,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { LanguagesService } from '../src/content/languages.service.js';
import { MediaService } from '../src/media/media.service.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
import { exportSite } from '../src/transfer/exporter.js';
import { importDocument } from '../src/transfer/importer.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  unlockMultilingual,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const EXT = '/api/v1/ext/multilingual';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let editor: TestClient;
let visitor: TestClient;
/** Multilingual Pro's answer: the other tests use every feature, as with Pro. */
let unlocked = true;

async function publish(client: TestClient, type: string, title: string, extra = {}) {
  const created = (await client.post('/api/v1/entries', { type, title, ...extra })).json();
  const published = await client.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode).toBe(200);
  return published.json() as { id: string; slug: string; locale: string };
}

async function translate(client: TestClient, id: string, locale: string) {
  const response = await client.post(`${EXT}/translations/entry/${id}`, { locale });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id as string;
}

async function newSite(slug: string, ip: string) {
  const created = await seedSite(owner, slug);
  await seedUser(owner, {
    email: `admin@${slug}.test`,
    password: PASSWORD,
    site: created,
    role: 'administrator',
  });
  const client = new TestClient(app, created.host, ip);
  await client.login(`admin@${slug}.test`, PASSWORD);
  return { site: created, admin: client };
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'multilingual-src-')), 'multilingual');
  await cp(join(pluginsRoot, 'multilingual'), source, {
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
  unlockMultilingual(() => unlocked);

  ({ site, admin } = await newSite('multi', '10.50.0.1'));
  await seedUser(owner, { email: 'editor@multi.test', password: PASSWORD, site, role: 'editor' });
  editor = new TestClient(app, site.host, '10.50.0.2');
  await editor.login('editor@multi.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.50.0.3');

  const activated = await admin.post('/api/v1/plugins/multilingual/activate');
  expect(activated.statusCode, activated.body).toBe(200);
  const added = await admin.post(`${EXT}/languages`, { code: 'it', name: 'Italiano' });
  expect(added.statusCode, added.body).toBe(201);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('languages', () => {
  it('are listed with the default first, and reach every screen', async () => {
    const list = (await admin.get(`${EXT}/languages`)).json();
    expect(list.map((l: { code: string; prefix: string }) => [l.code, l.prefix])).toEqual([
      ['en', ''],
      ['it', '/it'],
    ]);
    expect((await admin.get('/api/v1/auth/me')).json().site.locales).toEqual([
      { code: 'en', name: 'English', isDefault: true },
      { code: 'it', name: 'Italiano', isDefault: false },
    ]);
    expect((await admin.post(`${EXT}/languages`, { code: 'it' })).statusCode).toBe(409);
    expect((await admin.post(`${EXT}/languages`, { code: 'Italian' })).statusCode).toBe(400);
    expect(
      (await admin.post(`${EXT}/languages`, { code: 'fr', urlPrefix: '/admin' })).statusCode,
    ).toBe(409);
    expect((await editor.get(`${EXT}/languages`)).statusCode).toBe(403);
  });
});

describe('translations of entries', () => {
  it('copy the entry as a draft in the other language, once per language', async () => {
    const en = await publish(editor, 'page', 'Contact');
    const id = await translate(editor, en.id, 'it');
    const copy = (await editor.get(`/api/v1/entries/${id}`)).json();
    expect(copy).toMatchObject({
      locale: 'it',
      status: 'draft',
      slug: 'contact',
      title: 'Contact',
    });

    const links = (await editor.get(`${EXT}/translations?kind=entry&ids=${en.id}`)).json();
    expect(links[en.id]).toEqual({
      locale: 'en',
      needsUpdate: false,
      isOriginal: true,
      links: [{ id, locale: 'it', title: 'Contact', status: 'draft', needsUpdate: false }],
    });
    expect(
      (await editor.post(`${EXT}/translations/entry/${en.id}`, { locale: 'it' })).statusCode,
    ).toBe(409);
    // Languages of the site only (the core refuses the others).
    expect(
      (await editor.post(`${EXT}/translations/entry/${en.id}`, { locale: 'de' })).statusCode,
    ).toBe(400);
  });

  it('are served under the language prefix, linked with hreflang and the switcher', async () => {
    const en = await publish(editor, 'page', 'About us');
    const id = await translate(editor, en.id, 'it');
    await editor.request('PATCH', `/api/v1/entries/${id}`, {
      title: 'Chi siamo',
      slug: 'chi-siamo',
    });
    await editor.post(`/api/v1/entries/${id}/publish`);

    const italian = await visitor.get('/it/chi-siamo');
    expect(italian.statusCode).toBe(200);
    expect(italian.body).toContain('<html lang="it" data-color-scheme="auto">');
    expect(italian.body).toContain(
      '<link rel="alternate" hrefLang="en" href="http://multi.test/about-us"/>',
    );
    expect(italian.body).toContain(
      '<link rel="alternate" hrefLang="x-default" href="http://multi.test/about-us"/>',
    );
    const english = await visitor.get('/about-us');
    expect(english.body).toContain(
      '<link rel="alternate" hrefLang="it" href="http://multi.test/it/chi-siamo"/>',
    );
    // Aurora shows Multilingual's switcher (1.6.0) in its own look.
    expect(english.body).toContain(
      '<a href="/it/chi-siamo" hrefLang="it" lang="it"><span class="ml-switcher__name">Italiano</span></a>',
    );
    expect((await visitor.get('/it/about-us')).statusCode).toBe(404);
  });

  it('keep search, feeds and sitemaps per language', async () => {
    const story = await publish(editor, 'article', 'Gelato guide', {
      document: {
        schema: 1,
        blocks: [
          { id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Pistachio.' }] },
        ],
      },
    });
    const id = await translate(editor, story.id, 'it');
    await editor.request('PATCH', `/api/v1/entries/${id}`, { title: 'Guida al gelato' });
    await editor.post(`/api/v1/entries/${id}/publish`);

    expect((await visitor.get('/search?q=pistachio')).body).toContain('Gelato guide');
    const italianSearch = (await visitor.get('/it/search?q=pistachio')).body;
    expect(italianSearch).toContain('Guida al gelato');
    expect(italianSearch).not.toContain('Gelato guide');
    expect((await visitor.get('/it/feed')).body).toContain('Guida al gelato');

    const index = (await visitor.get('/sitemap.xml')).body;
    expect(index).toContain('sitemap-article-it.xml');
    expect((await visitor.get('/sitemap-article-en.xml')).body).toContain('hreflang="it"');
  });

  it('give the front page of each language', async () => {
    const home = await publish(admin, 'page', 'Welcome');
    const id = await translate(admin, home.id, 'it');
    await admin.request('PATCH', `/api/v1/entries/${id}`, {
      title: 'Benvenuti',
      slug: 'benvenuti',
    });
    await admin.post(`/api/v1/entries/${id}/publish`);
    await admin.request('PATCH', '/api/v1/settings/core', { frontPage: home.id });

    expect((await visitor.get('/')).body).toContain('Welcome');
    const italian = await visitor.get('/it');
    expect(italian.statusCode).toBe(200);
    expect(italian.body).toContain('Benvenuti');
    expect(italian.body).toContain('hrefLang="en" href="http://multi.test/"');
    await admin.request('PATCH', '/api/v1/settings/core', { frontPage: null });
  });

  it('add the trailing slash after the language prefix too (trailingSlash)', async () => {
    await admin.request('PATCH', '/api/v1/settings/core', { trailingSlash: true });
    const hop = async (path: string) => {
      const res = await visitor.get(path);
      return [res.statusCode, res.headers.location];
    };
    expect(await hop('/it')).toEqual([301, '/it/']);
    expect(await hop('/it/chi-siamo?x=1')).toEqual([301, '/it/chi-siamo/?x=1']);
    expect((await visitor.get('/it/')).statusCode).toBe(200);
    const italian = await visitor.get('/it/chi-siamo/');
    expect(italian.statusCode).toBe(200);
    expect(italian.body).toContain(
      '<link rel="canonical" href="http://multi.test/it/chi-siamo/"/>',
    );
    expect(italian.body).toContain(
      '<link rel="alternate" hrefLang="en" href="http://multi.test/about-us/"/>',
    );
    expect(italian.body).toContain(
      '<a href="/about-us/" hrefLang="en" lang="en"><span class="ml-switcher__name">English</span></a>',
    );
    expect((await visitor.get('/it/feed/')).statusCode).toBe(200);
    expect((await visitor.get('/sitemap-page-it.xml')).body).toContain(
      '<loc>http://multi.test/it/chi-siamo/</loc>',
    );
    expect(await hop('/it/account/login/')).toEqual([301, '/it/account/login']);
    await admin.request('PATCH', '/api/v1/settings/core', { trailingSlash: false });
    expect(await hop('/it/')).toEqual([301, '/it']);
  });
});

describe('translations of terms', () => {
  it('copy the term in the other language and link the archives', async () => {
    const world = (await admin.post('/api/v1/taxonomies/category/terms', { name: 'World' })).json();
    const created = await admin.post(`${EXT}/translations/term/${world.id}`, {
      locale: 'it',
      name: 'Mondo',
    });
    expect(created.statusCode, created.body).toBe(201);
    const links = (await admin.get(`${EXT}/translations?kind=term&ids=${world.id}`)).json();
    expect(links[world.id].links).toEqual([
      { id: created.json().id, locale: 'it', title: 'Mondo', needsUpdate: false },
    ]);

    const archive = await visitor.get('/category/world');
    expect(archive.body).toMatch(/hrefLang="it" href="[^"]*\/it\/category\/mondo"/);

    // Deleted, it leaves its group.
    await admin.request('DELETE', `/api/v1/terms/${created.json().id}`);
    expect(
      (await admin.get(`${EXT}/translations?kind=term&ids=${world.id}`)).json()[world.id].links,
    ).toEqual([]);
  });
});

describe('menus and addresses', () => {
  it('keep one menu per location and language', async () => {
    const en = (await admin.post('/api/v1/menus', { name: 'Footer', location: 'footer' })).json();
    const it = (
      await admin.post('/api/v1/menus', { name: 'Piè di pagina', locale: 'it', location: 'footer' })
    ).json();
    expect(it.location).toBe('footer');
    expect((await admin.get(`/api/v1/menus/${en.id}`)).json().location).toBe('footer');
    // Entries of another language cannot be linked.
    const page = (await admin.post('/api/v1/entries', { type: 'page', title: 'Inglese' })).json();
    const foreign = await admin.request('PUT', `/api/v1/menus/${it.id}/items`, {
      items: [{ kind: 'entry', entryId: page.id }],
    });
    expect(foreign.statusCode).toBe(400);
  });

  it('reserve the language prefixes for the languages', async () => {
    const res = await admin.request('PATCH', '/api/v1/content-types/article', {
      permalink: '/it/{slug}',
    });
    expect([400, 409]).toContain(res.statusCode);
  });
});

describe('the default language', () => {
  it('can change, and languages in use cannot be removed', async () => {
    const { site: other, admin: owner2 } = await newSite('switch', '10.50.1.1');
    await owner2.post('/api/v1/plugins/multilingual/activate');
    await owner2.post(`${EXT}/languages`, { code: 'it', name: 'Italiano' });
    const page = await publish(owner2, 'page', 'Chi siamo', { locale: 'it' });
    const guest = new TestClient(app, other.host, '10.50.1.2');
    expect((await guest.get('/it/chi-siamo')).statusCode).toBe(200);

    const changed = await owner2.request('PATCH', `${EXT}/languages/it`, { isDefault: true });
    expect(changed.statusCode, changed.body).toBe(200);
    expect((await owner2.get('/api/v1/auth/me')).json().site.defaultLocale).toBe('it');
    expect((await guest.get('/chi-siamo')).statusCode).toBe(200);
    expect(page.locale).toBe('it');

    expect((await owner2.request('DELETE', `${EXT}/languages/it`)).statusCode).toBe(409);
    await owner2.request('PATCH', `${EXT}/languages/en`, { isDefault: true });
    expect((await owner2.request('DELETE', `${EXT}/languages/it`)).statusCode).toBe(409);
    await owner2.post(`${EXT}/languages`, { code: 'de', name: 'Deutsch' });
    const removed = await owner2.request('DELETE', `${EXT}/languages/de`);
    expect(removed.json().map((l: { code: string }) => l.code)).toEqual(['en', 'it']);
  });
});

describe('deactivation', () => {
  it('brings the site back to one language, and reactivation restores it', async () => {
    const { site: other, admin: owner2 } = await newSite('back', '10.50.2.1');
    await owner2.post('/api/v1/plugins/multilingual/activate');
    await owner2.post(`${EXT}/languages`, { code: 'it', name: 'Italiano' });
    const en = await publish(owner2, 'page', 'Home page');
    const id = await translate(owner2, en.id, 'it');
    await owner2.post(`/api/v1/entries/${id}/publish`);
    const guest = new TestClient(app, other.host, '10.50.2.2');
    expect((await guest.get('/it/home-page')).statusCode).toBe(200);

    await owner2.post('/api/v1/plugins/multilingual/deactivate');
    expect((await owner2.get('/api/v1/auth/me')).json().site.locales).toHaveLength(1);
    expect((await guest.get('/it/home-page')).statusCode).toBe(404);
    expect((await guest.get('/home-page')).body).not.toContain('hrefLang');

    await owner2.post('/api/v1/plugins/multilingual/activate');
    expect((await guest.get('/it/home-page')).statusCode).toBe(200);
  });
});

describe('translation status and fields (step 5)', () => {
  it('flags translations when the original changes, until they are saved', async () => {
    const en = await publish(editor, 'page', 'Opening hours');
    const id = await translate(editor, en.id, 'it');
    const status = async (of: string) =>
      (await editor.get(`${EXT}/translations?kind=entry&ids=${of}`)).json()[of];
    expect((await status(en.id)).links[0].needsUpdate).toBe(false);

    await editor.request('PATCH', `/api/v1/entries/${en.id}`, { title: 'Opening hours (summer)' });
    expect((await status(en.id)).links[0].needsUpdate).toBe(true);
    expect(await status(id)).toMatchObject({ needsUpdate: true, isOriginal: false });

    await editor.request('PATCH', `/api/v1/entries/${id}`, { title: 'Orari estivi' });
    expect((await status(en.id)).links[0].needsUpdate).toBe(false);

    const overview = (await editor.get(`${EXT}/overview?type=page`)).json();
    expect(overview.find((r: { id: string }) => r.id === en.id).links).toEqual([
      expect.objectContaining({ id, locale: 'it', title: 'Orari estivi', needsUpdate: false }),
    ]);
  });

  it('keeps copied fields in step and starts ignored ones empty', async () => {
    const created = await admin.post('/api/v1/content-types', {
      slug: 'product',
      name: { en: 'Products' },
      fields: [
        { name: 'price', type: 'number', label: 'Price', translation: 'copy' },
        { name: 'blurb', type: 'text', label: 'Blurb', translation: 'ignore' },
        { name: 'note', type: 'text', label: 'Note' },
      ],
    });
    expect(created.statusCode, created.body).toBe(201);
    const en = (
      await admin.post('/api/v1/entries', {
        type: 'product',
        title: 'Lamp',
        fields: { price: 10, blurb: 'Bright', note: 'Fragile' },
      })
    ).json();
    const id = await translate(admin, en.id, 'it');
    const fieldsOf = async (of: string) =>
      (await admin.get(`/api/v1/entries/${of}`)).json().revision.fields;
    expect(await fieldsOf(id)).toEqual({ price: 10, note: 'Fragile' });

    await admin.request('PATCH', `/api/v1/entries/${en.id}`, {
      fields: { price: 12, blurb: 'Bright', note: 'Fragile!' },
    });
    expect(await fieldsOf(id)).toEqual({ price: 12, note: 'Fragile' });
    // The sync itself does not count as bringing the translation up to date.
    const links = (await admin.get(`${EXT}/translations?kind=entry&ids=${id}`)).json()[id];
    expect(links.needsUpdate).toBe(true);
  });

  it('translates the site title and tagline', async () => {
    expect(
      (await admin.request('PUT', `${EXT}/strings/it`, { title: 'Il sito', tagline: 'Note' }))
        .statusCode,
    ).toBe(204);
    expect((await admin.request('PUT', `${EXT}/strings/en`, { title: 'X' })).statusCode).toBe(400);
    expect((await admin.get(`${EXT}/strings`)).json()).toEqual({
      it: { title: 'Il sito', tagline: 'Note' },
    });
    const italian = (await visitor.get('/it')).body;
    expect(italian).toContain('Il sito');
    expect((await visitor.get('/')).body).not.toContain('Il sito');
  });
});

describe('automatic translation (DeepL)', () => {
  it('translates a new copy, keeping marks, and keeps the key encrypted', async () => {
    // DeepL answers by wrapping each text: [IT] … (marks and links pass through).
    const calls: { url: string; body: { text: string[]; target_lang: string } }[] = [];
    const real = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.includes('deepl.com')) return real(input, init);
      const body = JSON.parse(String(init!.body));
      calls.push({ url, body });
      return new Response(
        JSON.stringify({ translations: body.text.map((t: string) => ({ text: `[IT] ${t}` })) }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    try {
      expect((await admin.get(`${EXT}/machine`)).json()).toEqual({
        provider: 'deepl',
        configured: false,
      });
      expect((await admin.request('PUT', `${EXT}/machine`, { apiKey: 'short' })).statusCode).toBe(
        400,
      );
      const key = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890:fx';
      expect((await admin.request('PUT', `${EXT}/machine`, { apiKey: key })).statusCode).toBe(204);
      expect((await editor.get(`${EXT}/machine`)).json().configured).toBe(true);
      // Stored encrypted, never in clear.
      const stored = await withSiteContext(owner.db, site.id, (tx) =>
        tx.select().from(settings).where(eq(settings.namespace, 'plugin:multilingual')),
      );
      expect(JSON.stringify(stored)).not.toContain(key);

      const en = (
        await editor.post('/api/v1/entries', {
          type: 'page',
          title: 'Machine page',
          excerpt: 'Short & sweet',
          document: {
            schema: 1,
            blocks: [
              {
                id: 'p',
                type: 'core/paragraph',
                v: 1,
                attrs: {},
                content: [{ text: 'Hello ' }, { text: 'world', marks: ['bold'] }],
              },
            ],
          },
        })
      ).json();
      const created = await editor.post(`${EXT}/translations/entry/${en.id}`, {
        locale: 'it',
        machine: true,
      });
      expect(created.statusCode, created.body).toBe(201);
      expect(created.json().warning).toBeUndefined();
      const copy = (await editor.get(`/api/v1/entries/${created.json().id}`)).json();
      expect(copy.title).toBe('[IT] Machine page');
      expect(copy.revision.excerpt).toBe('[IT] Short & sweet');
      expect(copy.revision.document.blocks[0].content).toEqual([
        { text: '[IT] Hello ' },
        { text: 'world', marks: ['bold'] },
      ]);
      expect(calls[0]!.url).toBe('https://api-free.deepl.com/v2/translate');
      expect(calls[0]!.body.target_lang).toBe('IT');

      // Again from the original, after it changed.
      await editor.request('PATCH', `/api/v1/entries/${en.id}`, { title: 'Machine page 2' });
      expect(
        (await editor.post(`${EXT}/translations/entry/${created.json().id}/machine`)).statusCode,
      ).toBe(204);
      expect((await editor.get(`/api/v1/entries/${created.json().id}`)).json().title).toBe(
        '[IT] Machine page 2',
      );
      const state = (
        await editor.get(`${EXT}/translations?kind=entry&ids=${created.json().id}`)
      ).json()[created.json().id];
      expect(state.needsUpdate).toBe(false);

      // A refusal from DeepL leaves an untranslated copy and says why.
      spy.mockImplementation(async (input, init) =>
        String(input).includes('deepl.com')
          ? new Response('{}', { status: 456 })
          : real(input, init),
      );
      const other = (await editor.post('/api/v1/entries', { type: 'page', title: 'Quota' })).json();
      const failed = await editor.post(`${EXT}/translations/entry/${other.id}`, {
        locale: 'it',
        machine: true,
      });
      expect(failed.statusCode).toBe(201);
      expect(failed.json().warning).toMatch(/quota/);
    } finally {
      spy.mockRestore();
      await admin.request('DELETE', `${EXT}/machine`);
    }
  });
});

describe('content not translated yet', () => {
  it('can be listed in the other languages, in the default one', async () => {
    const { site: shown, admin: owner2 } = await newSite('fallback', '10.50.6.1');
    await owner2.post('/api/v1/plugins/multilingual/activate');
    await owner2.post(`${EXT}/languages`, { code: 'it', name: 'Italiano' });
    const only = await publish(owner2, 'article', 'Only in English');
    const both = await publish(owner2, 'article', 'In both languages');
    const id = await translate(owner2, both.id, 'it');
    await owner2.request('PATCH', `/api/v1/entries/${id}`, { title: 'In entrambe le lingue' });
    await owner2.post(`/api/v1/entries/${id}/publish`);
    const guest = new TestClient(app, shown.host, '10.50.6.2');
    const year = new Date().getUTCFullYear();

    let home = (await guest.get('/it')).body;
    expect(home).toContain('In entrambe le lingue');
    expect(home).not.toContain('Only in English');

    expect(
      (await owner2.request('PUT', `${EXT}/options`, { showUntranslated: true })).statusCode,
    ).toBe(204);
    home = (await guest.get('/it')).body;
    expect(home).toContain('In entrambe le lingue');
    expect(home).toContain(`href="/${year}/only-in-english"`);
    expect(home).not.toContain('In both languages');
    expect((await guest.get('/it/feed')).body).toContain('Only in English');
    expect((await guest.get('/it/search?q=english')).body).toContain('Only in English');
    // The default language lists only its own entries.
    expect((await guest.get('/')).body).not.toContain('In entrambe le lingue');
    expect(only.locale).toBe('en');
  });
});

describe('a domain per language', () => {
  it('serves a language on its own domain, linked to the others', async () => {
    const domains = await seedSite(owner, 'domains', {
      aliases: ['domains.de', 'www.domains.test'],
    });
    await seedUser(owner, {
      email: 'admin@domains.test',
      password: PASSWORD,
      site: domains,
      role: 'administrator',
    });
    const owner2 = new TestClient(app, domains.host, '10.50.7.1');
    await owner2.login('admin@domains.test', PASSWORD);
    await owner2.post('/api/v1/plugins/multilingual/activate');
    await owner2.post(`${EXT}/languages`, { code: 'de', name: 'Deutsch' });
    expect(
      (await owner2.request('PATCH', `${EXT}/languages/de`, { host: 'https://x.de/a' })).statusCode,
    ).toBe(400);
    expect(
      (await owner2.request('PATCH', `${EXT}/languages/en`, { host: 'domains.de' })).statusCode,
    ).toBe(400);
    const set = await owner2.request('PATCH', `${EXT}/languages/de`, { host: 'domains.de' });
    expect(set.statusCode, set.body).toBe(200);

    const en = await publish(owner2, 'page', 'About');
    const id = await translate(owner2, en.id, 'de');
    await owner2.request('PATCH', `/api/v1/entries/${id}`, {
      title: 'Über uns',
      slug: 'ueber-uns',
    });
    await owner2.post(`/api/v1/entries/${id}/publish`);

    const german = new TestClient(app, 'domains.de', '10.50.7.2');
    const page = await german.get('/ueber-uns');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<html lang="de" data-color-scheme="auto">');
    expect(page.body).toContain('hrefLang="en" href="http://domains.test/about"');
    expect((await german.get('/about')).statusCode).toBe(404);
    // The admin stays on the primary domain.
    const admin = await german.get('/cl-admin/');
    expect(admin.statusCode).toBe(301);
    expect(admin.headers.location).toBe('http://domains.test/cl-admin/');

    const english = await new TestClient(app, domains.host, '10.50.7.3').get('/about');
    expect(english.body).toContain('hrefLang="de" href="http://domains.de/ueber-uns"');
    expect(english.body).toContain('href="http://domains.de/ueber-uns" hrefLang="de"');
    // Other secondary domains still lead to the primary one; prefixes are gone for German.
    expect(
      (await new TestClient(app, 'www.domains.test', '10.50.7.4').get('/about')).statusCode,
    ).toBe(301);
    expect(
      (await new TestClient(app, domains.host, '10.50.7.5').get('/de/ueber-uns')).statusCode,
    ).toBe(404);

    // A domain that is not the site's is ignored: German is back under /de.
    await owner2.request('PATCH', `${EXT}/languages/de`, { host: 'elsewhere.de' });
    expect(
      (await new TestClient(app, domains.host, '10.50.7.6').get('/de/ueber-uns')).statusCode,
    ).toBe(200);
  });
});

describe('the language switcher (Multilingual 1.6.0)', () => {
  let owner2: TestClient;
  let guest: TestClient;
  let about: { id: string; slug: string };
  let alone: { id: string; slug: string };
  const SWITCHER = `${EXT}/switcher`;

  beforeAll(async () => {
    ({ admin: owner2 } = await newSite('switcher', '10.50.8.1'));
    guest = new TestClient(app, 'switcher.test', '10.50.8.2');
    expect((await owner2.post('/api/v1/plugins/multilingual/activate')).statusCode).toBe(200);
    await owner2.post(`${EXT}/languages`, { code: 'it', name: 'Italiano' });
    about = await publish(owner2, 'page', 'About');
    const id = await translate(owner2, about.id, 'it');
    await owner2.request('PATCH', `/api/v1/entries/${id}`, {
      title: 'Chi siamo',
      slug: 'chi-siamo',
    });
    await owner2.post(`/api/v1/entries/${id}/publish`);
    alone = await publish(owner2, 'page', 'Only in English');
  });

  const settings = async (body: Record<string, unknown>) => {
    const saved = await owner2.request('PUT', SWITCHER, body);
    expect(saved.statusCode, saved.body).toBe(200);
    return saved.json();
  };

  it('is the one Aurora shows, with the styles and the script of the plugin', async () => {
    const html = (await guest.get(`/${about.slug}`)).body;
    expect(html).toContain(
      '<nav class="ml-switcher ml-switcher--inline ml-switcher--at-header languages" aria-label="Languages">',
    );
    expect(html).toContain(
      '<a href="/about" hrefLang="en" lang="en" aria-current="true"><span class="ml-switcher__name">English</span></a>',
    );
    expect(html).toMatch(/plugin-assets\/multilingual\/[^"]*switcher\.css/);
    // Aurora asks for links side by side: no dropdown, no script.
    expect(html).not.toMatch(/plugin-assets\/multilingual\/[^"]*switcher\.js/);
  });

  it('links a language without a translation to its home page, or hides it', async () => {
    expect((await guest.get(`/${alone.slug}`)).body).toContain(
      '<li class="ml-switcher__item is-untranslated"><a href="/it" hrefLang="it" lang="it">',
    );
    await settings({ untranslated: 'hide' });
    expect((await guest.get(`/${alone.slug}`)).body).not.toContain('ml-switcher');
    await settings({ untranslated: 'home' });
  });

  it('follows the settings everywhere when asked, a dropdown with SVG flags', async () => {
    const saved = await settings({ themeLook: 'site', style: 'dropdown', flags: true });
    expect(saved).toMatchObject({
      themeLook: 'site',
      style: 'dropdown',
      flags: true,
      footer: 'off',
    });
    const html = (await guest.get(`/${about.slug}`)).body;
    expect(html).toContain('<details class="ml-switcher__dropdown">');
    expect(html).toContain('<svg class="ml-switcher__flag" viewBox="0 0 20 15"');
    expect(html).toMatch(/plugin-assets\/multilingual\/[^"]*switcher\.js/);
    await settings({ themeLook: 'theme', style: 'dropdown', flags: true });
  });

  it('is a block, and [language_switcher] in a paragraph', async () => {
    const page = await publish(owner2, 'page', 'Blocks', {
      document: {
        schema: 1,
        blocks: [
          {
            id: 'sw',
            type: 'multilingual/language-switcher',
            v: 1,
            attrs: { style: 'list', names: 'code', flags: 'no' },
          },
          {
            id: 'sc',
            type: 'core/paragraph',
            v: 1,
            attrs: {},
            content: [{ text: '[language_switcher style="inline" names="translated"]' }],
          },
        ],
      },
    });
    const html = (await guest.get(`/${page.slug}`)).body;
    expect(html).toContain('ml-switcher--list ml-switcher--at-block');
    expect(html).toContain(
      '<span class="ml-switcher__name" aria-hidden="true">IT</span><span class="ml-switcher__sr">Italiano</span>',
    );
    // Flags are on in the settings (the default).
    expect(html).toContain('ml-switcher--inline ml-switcher--flags ml-switcher--at-block');
    expect(html).toContain('<span class="ml-switcher__name">Italian</span>');
    expect(html).not.toContain('[language_switcher');
  });

  it('becomes menu items of any theme: in the chosen location and for switcher links', async () => {
    const primary = (
      await owner2.post('/api/v1/menus', { name: 'Main', location: 'primary' })
    ).json();
    const items = await owner2.request('PUT', `/api/v1/menus/${primary.id}/items`, {
      items: [{ kind: 'url', url: '/contact', label: 'Contact' }],
    });
    expect(items.statusCode, items.body).toBe(200);
    await settings({ menuLocation: 'primary', menuStyle: 'inline' });
    let nav = (await guest.get(`/${about.slug}`)).body;
    nav = nav.slice(
      nav.indexOf('<nav class="site-nav"'),
      nav.indexOf('</nav>', nav.indexOf('<nav class="site-nav"')),
    );
    expect(nav).toContain('<a href="/contact">Contact</a>');
    expect(nav).toContain('<a href="/about" aria-current="page">English</a>');
    expect(nav).toContain('<a href="/it/chi-siamo">Italiano</a>');

    // A custom link puts the switcher exactly there, with its own choices.
    await settings({ menuLocation: '' });
    const footer = (
      await owner2.post('/api/v1/menus', { name: 'Foot', location: 'footer' })
    ).json();
    await owner2.request('PUT', `/api/v1/menus/${footer.id}/items`, {
      items: [
        { kind: 'url', url: '#language-switcher?style=dropdown&names=code', label: 'Languages' },
      ],
    });
    const html = (await guest.get(`/${about.slug}`)).body;
    expect(html).not.toContain('#language-switcher');
    expect(html).toMatch(/<a href="\/about">EN<\/a><ul><li><a href="\/it\/chi-siamo">IT<\/a>/);
  });

  it('shows at the bottom of the page or floating, only when chosen', async () => {
    expect((await guest.get(`/${about.slug}`)).body).not.toContain('ml-switcher--at-floating');
    await settings({ footer: 'floating', floatingSide: 'left' });
    const html = (await guest.get(`/${about.slug}`)).body;
    expect(html).toContain('ml-switcher--at-floating ml-switcher--side-left');
    expect(html.indexOf('ml-switcher--at-floating')).toBeGreaterThan(html.indexOf('</footer>'));
    await settings({ footer: 'off' });
  });

  it('settings are for those who manage the site, and checked', async () => {
    expect((await guest.get(SWITCHER)).statusCode).toBe(401);
    const odd = await settings({ style: 'carousel', menuLocation: '<b>' });
    expect(odd.style).toBe('dropdown');
    expect(odd.menuLocation).toBe('');
  });
});

describe('sites without the plugin', () => {
  it('pay nothing for it: no provider call, no language markup', async () => {
    const { site: plain, admin: owner2 } = await newSite('plain', '10.50.5.1');
    const page = await publish(owner2, 'page', 'Just one language');
    const host = app.get(PluginHost);
    const runHook = vi.spyOn(host, 'runHook');
    try {
      const guest = new TestClient(app, plain.host, '10.50.5.2');
      const html = (await guest.get(`/${page.slug}`)).body;
      await owner2.get('/api/v1/auth/me');
      await owner2.get(`/api/v1/entries/${page.id}`);
      expect(html).not.toContain('hrefLang');
      expect(html).not.toContain('class="languages"');
      const calls = runHook.mock.calls.map(([hook]) => hook.name);
      expect(calls.filter((name) => name.startsWith('languages.'))).toEqual([]);
    } finally {
      runHook.mockRestore();
    }
    expect((await owner2.get('/api/v1/auth/me')).json().site.locales).toHaveLength(1);
  });
});

describe('language data waiting for the plugin', () => {
  it('is taken over on activation (sites from before M7)', async () => {
    const { site: old, admin: owner2 } = await newSite('legacy', '10.50.3.1');
    const en = (await owner2.post('/api/v1/entries', { type: 'page', title: 'Old' })).json();
    // Written as the core migration 0016 does; an Italian entry from before.
    const itId = crypto.randomUUID();
    await withSiteContext(owner.db, old.id, async (tx) => {
      await tx
        .insert(entries)
        .values({ id: itId, siteId: old.id, typeSlug: 'page', locale: 'it', slug: 'vecchio' });
      const [revision] = await tx
        .insert(revisions)
        .values({
          siteId: old.id,
          entryId: itId,
          title: 'Vecchio',
          document: { schema: 1, blocks: [] },
          schemaVersion: 1,
        })
        .returning();
      await tx.update(entries).set({ currentRevisionId: revision!.id }).where(eq(entries.id, itId));
      await tx.insert(settings).values({
        siteId: old.id,
        namespace: 'languages',
        key: 'pending',
        value: {
          locales: [
            { code: 'en', name: 'EN', isDefault: true, position: 0 },
            { code: 'it', name: 'Italiano', position: 1, urlPrefix: '/ita' },
          ],
          entries: [
            { id: en.id, group: 'g1' },
            { id: itId, group: 'g1' },
          ],
          terms: [],
        },
      });
    });
    const activated = await owner2.post('/api/v1/plugins/multilingual/activate');
    expect(activated.statusCode, activated.body).toBe(200);
    const languages = await owner2.get(`${EXT}/languages`);
    expect(languages.statusCode, languages.body).toBe(200);
    const list = languages.json();
    expect(list.map((l: { code: string; prefix: string }) => [l.code, l.prefix])).toEqual([
      ['en', ''],
      ['it', '/ita'],
    ]);
    const links = (await owner2.get(`${EXT}/translations?kind=entry&ids=${en.id}`)).json();
    expect(links[en.id].links.map((l: { id: string }) => l.id)).toEqual([itId]);
    const left = await withSiteContext(owner.db, old.id, (tx) =>
      tx.select().from(settings).where(eq(settings.namespace, 'languages')),
    );
    expect(left).toEqual([]);
  });

  it('travels with an exported site', async () => {
    const languages = app.get(LanguagesService);
    const { document, files } = await exportSite(
      owner.db,
      site.id,
      { name: 'multi' },
      {
        locales: await languages.locales(site.id, 'en'),
        translations: (kind, ids) => languages.translations(site.id, kind, ids),
      },
    );
    expect(files.size).toBe(0);
    expect(document.locales?.map((l) => l.code)).toEqual(['en', 'it']);

    const { site: copy, admin: owner2 } = await newSite('copy', '10.50.4.1');
    await owner2.post('/api/v1/plugins/multilingual/activate');
    const [importer] = await owner.db
      .insert(users)
      .values({ email: 'importer@multi.test', displayName: 'Importer' })
      .returning();
    await owner.db.insert(superAdmins).values({ userId: importer!.id });
    const host = app.get(PluginHost);
    const report = await importDocument(document, {
      db: owner.db,
      siteId: copy.id,
      asUserId: importer!.id,
      media: app.get(MediaService),
      cache: app.get(PageCacheService),
      readFile: () => Promise.reject(new Error('no files')),
      activePlugins: await host.activeSlugs(copy.id),
      onLanguagesPending: () => host.emit('languages.pending', {}, copy.id),
    });
    expect(report.errors).toEqual([]);
    const guest = new TestClient(app, copy.host, '10.50.4.2');
    const italian = await guest.get('/it/chi-siamo');
    expect(italian.statusCode).toBe(200);
    expect(italian.body).toContain('hrefLang="en" href="http://copy.test/about-us"');
  });
});

describe('without Multilingual Pro', () => {
  it('keeps what is there and asks for Pro to add more', async () => {
    // A third language, added while Pro was there.
    expect((await admin.post(`${EXT}/languages`, { code: 'fr' })).statusCode).toBe(201);
    unlocked = false;
    try {
      const limits = (await admin.get(`${EXT}/limits`)).json();
      expect(limits).toMatchObject({
        pro: false,
        upgradeUrl: 'https://cleitext.com/plugins/multilingual-pro',
      });
      expect(limits.languages).toBe(limits.freeSite ? 2 : 1);

      // The three languages stay.
      const before = (await admin.get(`${EXT}/languages`)).json();
      expect(before.length).toBeGreaterThan(2);
      const more = await admin.post(`${EXT}/languages`, { code: 'pl' });
      expect(more.statusCode).toBe(402);
      expect(more.json()).toMatchObject({ pro: true });
      expect((await admin.get(`${EXT}/languages`)).json()).toHaveLength(before.length);
      expect((await visitor.get('/it')).statusCode).toBe(200);

      // The extras: a first DeepL key, turning on content not translated yet, a new domain.
      expect(
        (await admin.request('PUT', `${EXT}/machine`, { apiKey: 'a'.repeat(36) + ':fx' }))
          .statusCode,
      ).toBe(402);
      await admin.request('PUT', `${EXT}/options`, { showUntranslated: false });
      expect(
        (await admin.request('PUT', `${EXT}/options`, { showUntranslated: true })).statusCode,
      ).toBe(402);
      expect(
        (await admin.request('PATCH', `${EXT}/languages/it`, { host: 'multi.it' })).statusCode,
      ).toBe(402);
      // What does not need Pro still works.
      expect(
        (await admin.request('PATCH', `${EXT}/languages/it`, { name: 'Italiano' })).statusCode,
      ).toBe(200);

      // Another site of the installation keeps its default language only.
      const { admin: second } = await newSite('second-free', '10.50.9.1');
      expect((await second.post('/api/v1/plugins/multilingual/activate')).statusCode).toBe(200);
      expect((await second.get(`${EXT}/limits`)).json()).toMatchObject({
        pro: false,
        languages: 1,
        freeSite: false,
      });
      expect((await second.post(`${EXT}/languages`, { code: 'it' })).statusCode).toBe(402);

      // With Pro, no limits.
      unlocked = true;
      expect((await second.get(`${EXT}/limits`)).json()).toMatchObject({
        pro: true,
        languages: null,
      });
      expect((await second.post(`${EXT}/languages`, { code: 'it' })).statusCode).toBe(201);
    } finally {
      unlocked = true;
    }
  });
});
