/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * Options pages (plugin API 1.48): pages of the site's owners (API), of a
 * plugin and of the theme; field groups attached with the `optionsPage`
 * rule; values per site and per language; the readers (`useOption`,
 * `<Field of="option">`, dynamic sources, bindings) and the transfer round
 * trip of the definitions and values.
 */
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import {
  contentTypes,
  media,
  optionValues,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { asc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FieldGroupsService } from '../src/fields/field-groups.service.js';
import { OptionsPagesService } from '../src/fields/options-pages.service.js';
import { MediaService } from '../src/media/media.service.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
import { exportSite } from '../src/transfer/exporter.js';
import { exportFieldDefinitions } from '../src/transfer/field-definitions.js';
import { importDocument } from '../src/transfer/importer.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
  unlockMultilingual,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/options-plugin', import.meta.url));
const EXT = '/api/v1/ext/multilingual';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let other: SeededSite;
let clone: SeededSite;
let admin: TestClient;
let editor: TestClient;
let visitor: TestClient;
let adminId: string;
let imageId: string;

/** A theme with an options page, whose template shows options and the entry's blocks. */
async function writeTheme(dir: string) {
  await mkdir(join(dir, 'options-theme', 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'options-theme', 'theme.json'),
    JSON.stringify({ slug: 'options-theme', name: 'Options theme', version: '1.0.0' }),
  );
  await writeFile(
    join(dir, 'options-theme', 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) { return h('html', null, h('head', null, h('title', null, head.title)), h('body', null, children)); }
function Options() {
  const phone = sdk.useOption('phone', { page: 'contacts' });
  const motto = sdk.useOption('motto', { page: 'theme-look' });
  return h('footer', null, 'Phone: ', phone || '-', ' | Motto: ', motto || '-', ' | Lead: ', h(sdk.Field, { of: 'option', page: 'contacts', name: 'team.lead', fallback: '-' }));
}
function Index(props) {
  return h('main', null, props.kind === 'entry' ? h(sdk.EntryContent, { document: props.entry.document }) : 'index', h(Options));
}
export default sdk.defineTheme({
  slug: 'options-theme', name: 'Options theme', version: '1.0.0', menuLocations: {},
  optionsPages: [{ slug: 'theme-look', title: { en: 'Look', it: 'Aspetto' }, parent: '/appearance', capability: 'edit_theme_settings', fields: [{ name: 'motto', type: 'text', label: 'Motto' }] }],
  templates: { index: Index }, Layout, css: '',
});
`,
  );
}

async function install(source: string, pluginsPath: string, name: string) {
  const copy = join(await mkdtemp(join(tmpdir(), `${name}-src-`)), name);
  await cp(source, copy, { recursive: true, filter: (file) => !file.includes('node_modules') });
  await buildPlugin(copy);
  await installPlugin(owner.db, {
    source: copy,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install(fixture, pluginsPath, 'options-kit');
  await install(join(pluginsRoot, 'multilingual'), pluginsPath, 'multilingual');
  const themesPath = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await writeTheme(themesPath);
  app = await startTestApp({ pluginsPath, env: { THEMES_PATH: themesPath } });
  unlockMultilingual();
  site = await seedSite(owner, 'options');
  other = await seedSite(owner, 'options-other');
  clone = await seedSite(owner, 'options-clone');
  adminId = await seedUser(owner, {
    email: 'admin@options.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@options.test', password: PASSWORD, site, role: 'editor' });
  admin = new TestClient(app, site.host, '10.48.0.1');
  await admin.login('admin@options.test', PASSWORD);
  editor = new TestClient(app, site.host, '10.48.0.2');
  await editor.login('editor@options.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.48.0.3');
  expect((await admin.post('/api/v1/plugins/options-kit/activate')).statusCode).toBe(200);
  expect((await admin.post('/api/v1/plugins/multilingual/activate')).statusCode).toBe(200);
  expect((await admin.post(`${EXT}/languages`, { code: 'it', name: 'Italiano' })).statusCode).toBe(
    201,
  );
  expect((await admin.post('/api/v1/themes/options-theme/activate')).statusCode).toBe(200);
  const png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#996633' },
  })
    .png()
    .toBuffer();
  const upload = await admin.upload('/api/v1/media', 'menu.png', png, 'image/png');
  expect(upload.statusCode, upload.body).toBe(201);
  imageId = upload.json().id;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const CONTACTS = {
  slug: 'contacts',
  title: { en: 'Contacts', it: 'Contatti' },
  icon: 'settings',
  position: 5,
  fields: [
    { name: 'phone', type: 'text', label: 'Phone' },
    { name: 'hours', type: 'text', label: 'Opening hours', translation: 'copy' },
    { name: 'note', type: 'text', label: 'Note', translation: 'ignore' },
    { name: 'brochure', type: 'file', label: 'Brochure' },
  ],
};

const TEAM = {
  id: 'team',
  title: 'Team',
  location: [[{ param: 'optionsPage', operator: '==', value: 'contacts' }]],
  fields: [
    { name: 'lead', type: 'user', label: 'Lead' },
    { name: 'email', type: 'text', label: 'Email', required: true },
  ],
};

describe('options pages', () => {
  it('come from the site’s owners (API), plugins and the theme', async () => {
    const created = await admin.post('/api/v1/options-pages', CONTACTS);
    expect(created.statusCode, created.body).toBe(201);
    expect((await admin.post('/api/v1/options-pages', CONTACTS)).statusCode).toBe(409);
    expect(
      (await admin.post('/api/v1/options-pages', { ...CONTACTS, slug: 'options-kit-social' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await admin.post('/api/v1/options-pages', { ...CONTACTS, slug: 'Bad slug' })).statusCode,
    ).toBe(400);
    expect(
      (await editor.post('/api/v1/options-pages', { ...CONTACTS, slug: 'x' })).statusCode,
    ).toBe(403);

    const pages = (await admin.get('/api/v1/options-pages')).json();
    // By position, then title.
    expect(pages.map((p: any) => [p.slug, p.source])).toEqual([
      ['contacts', 'site'],
      ['theme-look', 'theme'],
      ['options-kit-social', 'plugin:options-kit'],
    ]);
    expect(pages.find((p: any) => p.slug === 'options-kit-social').parent).toBe('/settings');
    // Each page for those with its capability (manage_settings by default).
    expect((await editor.get('/api/v1/options-pages')).json()).toEqual([]);
    expect((await editor.get('/api/v1/options/contacts')).statusCode).toBe(403);
    // Plugins see every page.
    expect((await admin.get('/api/v1/ext/options-kit/pages')).json()).toEqual([
      'contacts',
      'theme-look',
      'options-kit-social',
    ]);
  });

  it('show their fields and the groups attached with the optionsPage rule, and save values', async () => {
    expect((await admin.post('/api/v1/field-groups', TEAM)).statusCode).toBe(201);
    const screen = (await admin.get('/api/v1/options/contacts')).json();
    expect(screen.page.fields.map((f: any) => f.name)).toEqual([
      'phone',
      'hours',
      'note',
      'brochure',
    ]);
    expect(screen.groups.map((g: any) => g.id)).toEqual(['team']);
    expect(screen.values).toEqual({});
    expect(screen.translationsOnly).toBe(false);
    expect(screen.locales.map((l: any) => l.code)).toEqual(['en', 'it']);

    // Checked like entries' fields: the group's required field.
    const refused = await admin.request('PUT', '/api/v1/options/contacts', {
      fields: { phone: '010 1', team: { lead: adminId } },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().errors).toEqual([
      { path: 'fields.team.email', message: 'This field is required.' },
    ]);
    const saved = await admin.request('PUT', '/api/v1/options/contacts', {
      fields: {
        phone: '010 1',
        hours: '9-17',
        note: 'Base note',
        brochure: imageId,
        team: { lead: adminId, email: 'team@options.test' },
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().values).toMatchObject({
      phone: '010 1',
      team: { email: 'team@options.test' },
    });
    // Other values are kept: a group's fields one by one.
    await admin.request('PUT', '/api/v1/options/contacts', {
      fields: { team: { email: 'a@options.test' } },
    });
    expect((await admin.get('/api/v1/options/contacts')).json().values).toMatchObject({
      phone: '010 1',
      team: { lead: adminId, email: 'a@options.test' },
    });
  });

  it('are read and saved by plugins', async () => {
    expect((await admin.get('/api/v1/ext/options-kit/options?page=contacts')).json()).toMatchObject(
      { phone: '010 1' },
    );
    const saved = await admin.post('/api/v1/ext/options-kit/options', {
      page: 'options-kit-social',
      values: { instagram: 'https://instagram.com/trattoria' },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await admin.get('/api/v1/options/options-kit-social')).json().values).toEqual({
      instagram: 'https://instagram.com/trattoria',
    });
    const bad = await admin.post('/api/v1/ext/options-kit/options', {
      page: 'options-kit-social',
      values: { instagram: 'javascript:alert(1)' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('keep each language’s translations of translatable fields', async () => {
    const saved = await admin.request('PUT', '/api/v1/options/contacts', {
      locale: 'it',
      fields: {
        phone: '010 IT',
        hours: 'never saved',
        note: 'Nota',
        team: { email: 'it@options.test' },
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const it = (await admin.get('/api/v1/options/contacts?locale=it')).json();
    expect(it.translationsOnly).toBe(true);
    // Fields copied in every language are edited in the default one only.
    expect(it.page.fields.map((f: any) => f.name)).toEqual(['phone', 'note', 'brochure']);
    expect(it.values).toMatchObject({
      phone: '010 IT',
      hours: '9-17',
      note: 'Nota',
      brochure: imageId,
      team: { lead: adminId, email: 'it@options.test' },
    });
    const en = (await admin.get('/api/v1/options/contacts')).json();
    expect(en.values).toMatchObject({ phone: '010 1', hours: '9-17', note: 'Base note' });
    const rows = await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .select()
        .from(optionValues)
        .where(eq(optionValues.page, 'contacts'))
        .orderBy(asc(optionValues.locale)),
    );
    expect(rows.map((r) => r.locale)).toEqual(['', 'it']);
    expect(rows[1]!.fields).toEqual({
      phone: '010 IT',
      note: 'Nota',
      team: { email: 'it@options.test' },
    });
    // `ignore`: empty in a language until written there.
    await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .update(optionValues)
        .set({ fields: { phone: '010 IT' } })
        .where(eq(optionValues.locale, 'it')),
    );
    const again = (await admin.get('/api/v1/options/contacts?locale=it')).json().values;
    expect(again.note).toBeUndefined();
    expect(again.team.email).toBe('a@options.test');
    expect(
      (await admin.request('PUT', '/api/v1/options/contacts', { locale: 'fr', fields: {} }))
        .statusCode,
    ).toBe(400);
  });

  it('belong to their site', async () => {
    await seedUser(owner, {
      email: 'admin@options-other.test',
      password: PASSWORD,
      site: other,
      role: 'administrator',
    });
    const otherAdmin = new TestClient(app, other.host, '10.48.1.1');
    await otherAdmin.login('admin@options-other.test', PASSWORD);
    expect((await otherAdmin.get('/api/v1/options/contacts')).statusCode).toBe(404);
    expect((await otherAdmin.post('/api/v1/options-pages', CONTACTS)).statusCode).toBe(201);
    expect((await otherAdmin.get('/api/v1/options/contacts')).json().values).toEqual({});
  });
});

describe('reading options', () => {
  it('templates read them with useOption and <Field of="option">, in the page’s language', async () => {
    const before = (await visitor.get('/')).body;
    expect(before).toContain('Phone: 010 1 | Motto: - | Lead: ');
    // A member as a link to their author page.
    expect(before).toMatch(/Lead: <a href="\/author\/[^"]+">admin<\/a>/);
    expect((await visitor.get('/it')).body).toContain('Phone: 010 IT');
    // Saving refreshes the cached pages.
    await admin.request('PUT', '/api/v1/options/theme-look', { fields: { motto: 'Slow food' } });
    expect((await visitor.get('/')).body).toContain('Motto: Slow food');
  });

  it('are dynamic sources, for Fresco’s tags and bindings', async () => {
    const sources = (await admin.get('/api/v1/dynamic-sources')).json();
    const phone = sources.find((s: any) => s.id === 'option.field:contacts.phone');
    expect(phone).toMatchObject({ type: 'text', group: { en: 'Options' } });
    expect(sources.find((s: any) => s.id === 'option.field:contacts.team.lead')).toMatchObject({
      type: 'user',
    });
    expect(sources.some((s: any) => s.id === 'option.field:theme-look.motto')).toBe(true);
    const resolved = await admin.post('/api/v1/dynamic-sources/resolve', {
      ids: ['option.field:contacts.phone', 'option.field:contacts.brochure', 'option.field:nope.x'],
      locale: 'it',
    });
    expect(resolved.json().values).toMatchObject({
      'option.field:contacts.phone': '010 IT',
      'option.field:contacts.brochure': { id: imageId, filename: 'menu.png', mime: 'image/png' },
    });
    expect('option.field:nope.x' in resolved.json().values).toBe(false);
  });

  it('a heading bound to an option shows it on the page', async () => {
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Call us',
      document: {
        schema: 1,
        blocks: [
          {
            id: 'h1',
            type: 'core/heading',
            v: 1,
            attrs: {
              level: 2,
              metadata: {
                bindings: {
                  content: {
                    source: 'cleitext/field',
                    args: { key: 'option.field:contacts.phone' },
                  },
                },
              },
            },
            content: [{ text: 'Our phone' }],
          },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect((await admin.post(`/api/v1/entries/${created.json().id}/publish`)).statusCode).toBe(200);
    expect((await visitor.get('/call-us')).body).toContain(
      '<h2 class="wp-block-heading">010 1</h2>',
    );
  });
});

describe('transfer', () => {
  it('carries the owners’ field groups, options pages and every page’s values', async () => {
    const created = await admin.post('/api/v1/content-types', {
      slug: 'dish',
      name: { en: 'Dishes' },
      fields: [{ name: 'price', type: 'number', label: 'Price' }],
    });
    expect(created.statusCode, created.body).toBe(201);
    const host = app.get(PluginHost);
    const { document, files } = await exportSite(
      owner.db,
      site.id,
      {},
      undefined,
      {},
      await exportFieldDefinitions(owner.db, host, app.get(FieldGroupsService), site.id),
      await app.get(OptionsPagesService).exportValues(site.id),
    );
    expect(document.fieldGroups!.map((g: any) => g.id)).toEqual(['team']);
    expect(document.optionsPages!.map((p: any) => p.slug)).toEqual(['contacts']);
    expect(document.contentTypes!.find((t) => t.slug === 'dish')?.fields).toEqual([
      { name: 'price', type: 'number', label: 'Price' },
    ]);
    const contacts = document.options!.find((o) => o.page === 'contacts' && !o.locale)!;
    expect(contacts.fields).toMatchObject({
      brochure: { $media: imageId },
      team: { lead: { $user: adminId } },
    });
    expect(document.options!.map((o) => `${o.page}|${o.locale ?? ''}`).sort()).toEqual([
      'contacts|',
      'contacts|it',
      'options-kit-social|',
      'theme-look|',
    ]);

    const [importer] = await owner.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'admin@options.test'));
    const { DiskStorage } = await import('../src/media/storage.js');
    const { APP_CONFIG } = await import('../src/config/config.js');
    const storage = new DiskStorage(app.get<{ media: { path: string } }>(APP_CONFIG).media.path);
    const report = await importDocument(document, {
      db: owner.db,
      siteId: clone.id,
      asUserId: importer!.id,
      media: app.get(MediaService),
      cache: app.get(PageCacheService),
      readFile: (file) => readFile(storage.pathOf(files.get(file)!)),
    });
    expect(report.errors).toEqual([]);
    expect(report.created).toMatchObject({ fieldGroups: 1, optionsPages: 1, options: 4 });

    const pages = app.get(OptionsPagesService);
    expect((await pages.listSite(clone.id)).map((p) => p.slug)).toEqual(['contacts']);
    const groups = await app.get(FieldGroupsService).listSite(clone.id);
    expect(groups.map((g) => g.id)).toEqual(['team']);
    const values = await pages.values(clone.id, 'contacts');
    const [newImage] = await withSiteContext(owner.db, clone.id, (tx) =>
      tx.select({ id: media.id }).from(media),
    );
    expect(values.brochure).toBe(newImage!.id);
    expect(values.brochure).not.toBe(imageId);
    // The person is the same account, a member of the new site.
    expect((values.team as any).lead).toBe(adminId);
    const types = await withSiteContext(owner.db, clone.id, (tx) => tx.select().from(contentTypes));
    expect((types.find((t) => t.slug === 'dish')?.fieldsSchema as any).fields).toHaveLength(1);

    // Imported again: what is on the site is kept.
    const again = await importDocument(document, {
      db: owner.db,
      siteId: clone.id,
      asUserId: importer!.id,
      media: app.get(MediaService),
      cache: app.get(PageCacheService),
      readFile: (file) => readFile(storage.pathOf(files.get(file)!)),
    });
    expect(again.skipped).toMatchObject({ fieldGroups: 1, optionsPages: 1, options: 4 });
  });
});
