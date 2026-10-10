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

  ({ site, admin } = await newSite('multi', '10.50.0.1'));
  await seedUser(owner, { email: 'editor@multi.test', password: PASSWORD, site, role: 'editor' });
  editor = new TestClient(app, site.host, '10.50.0.2');
  await editor.login('editor@multi.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.50.0.3');

  expect((await admin.post('/api/v1/plugins/multilingual/activate')).statusCode).toBe(200);
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
      links: [{ id, locale: 'it', title: 'Contact', status: 'draft' }],
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
    expect(italian.body).toContain('<html lang="it">');
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
    expect(english.body).toContain('<a href="/it/chi-siamo" hrefLang="it" lang="it">Italiano</a>');
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
      { id: created.json().id, locale: 'it', title: 'Mondo' },
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
    await owner2.post('/api/v1/plugins/multilingual/activate');
    const list = (await owner2.get(`${EXT}/languages`)).json();
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
