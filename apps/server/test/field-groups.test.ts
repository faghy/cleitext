/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * Custom fields (plugin API 1.47): field groups of the site's owners (API),
 * of plugins (in code and computed per site) and of the theme, with location
 * rules evaluated by the core; a plugin's field type; required fields, list
 * row ids, `entry.validate`; term and user fields (privacy too); dynamic
 * sources; formatted values for templates; and the transfer round trip.
 */
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { userFields, users, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FieldGroupsService } from '../src/fields/field-groups.service.js';
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
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const fixture = fileURLToPath(new URL('./fixtures/fields-plugin', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let themed: SeededSite;
let clone: SeededSite;
let admin: TestClient;
let editor: TestClient;
let editorId: string;
let authorId: string;
let imageId: string;

/** A theme with page options (`entryFields`) and page templates, in THEMES_PATH. */
async function writeTheme(dir: string) {
  await mkdir(join(dir, 'fields-theme', 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'fields-theme', 'theme.json'),
    JSON.stringify({ slug: 'fields-theme', name: 'Fields theme', version: '1.0.0' }),
  );
  await writeFile(
    join(dir, 'fields-theme', 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) { return h('html', null, h('head', null, h('title', null, head.title)), h('body', null, children)); }
function Index(props) { return h('main', null, props.kind === 'entry' ? 'Index ' + (props.entry.template || 'none') : 'index'); }
function Landing(props) { return h('main', null, 'Landing ', h(sdk.Field, { name: 'details.subtitle' }), ' ', h(sdk.Rows, { name: 'details.team' }, (row) => h('i', null, row.name))); }
export default sdk.defineTheme({
  slug: 'fields-theme', name: 'Fields theme', version: '1.0.0', menuLocations: {},
  entryFields: { types: ['page'], fields: [{ name: 'sidebar', type: 'boolean', label: 'Sidebar' }] },
  pageTemplates: [{ name: 'landing', label: 'Landing' }],
  templates: { index: Index, 'template-landing': Landing }, Layout, css: '',
});
`,
  );
}

async function png(color: string) {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: color } })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'fields-src-')), 'fields-kit');
  await cp(fixture, source, { recursive: true });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  const themesPath = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await writeTheme(themesPath);
  app = await startTestApp({ pluginsPath, env: { THEMES_PATH: themesPath } });
  site = await seedSite(owner, 'fields');
  themed = await seedSite(owner, 'fields-themed');
  clone = await seedSite(owner, 'fields-clone');
  await seedUser(owner, {
    email: 'admin@fields.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  editorId = await seedUser(owner, {
    email: 'editor@fields.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  authorId = await seedUser(owner, {
    email: 'author@fields.test',
    password: PASSWORD,
    site,
    role: 'author',
  });
  await seedUser(owner, {
    email: 'admin@fields-themed.test',
    password: PASSWORD,
    site: themed,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.47.0.1');
  await admin.login('admin@fields.test', PASSWORD);
  editor = new TestClient(app, site.host, '10.47.0.2');
  await editor.login('editor@fields.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/fields-kit/activate')).statusCode).toBe(200);
  const upload = await admin.upload(
    '/api/v1/media',
    'photo.png',
    await png('#336699'),
    'image/png',
  );
  expect(upload.statusCode, upload.body).toBe(201);
  imageId = upload.json().id;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

/** The site owners' group used below: on pages of the "wide" template (Aurora's). */
const DETAILS = {
  id: 'details',
  title: { en: 'Details', it: 'Dettagli' },
  position: 'side',
  labelPlacement: 'left',
  location: [
    [
      { param: 'contentType', operator: '==', value: 'page' },
      { param: 'template', operator: '==', value: 'wide' },
    ],
  ],
  fields: [
    { name: 'subtitle', type: 'text', label: 'Subtitle', required: true },
    { name: 'photo', type: 'media', label: 'Photo' },
    { name: 'hasPrice', type: 'boolean', label: 'Has a price' },
    {
      name: 'price',
      type: 'number',
      label: 'Price',
      required: true,
      showIf: { field: 'hasPrice', equals: true },
    },
    {
      name: 'team',
      type: 'list',
      label: 'Team',
      fields: [
        { name: 'name', type: 'text', label: 'Name' },
        { name: 'picture', type: 'media', label: 'Picture' },
      ],
    },
  ],
};

describe('field groups of the site owners', () => {
  it('are created, listed, replaced and deleted through the API', async () => {
    const created = await admin.post('/api/v1/field-groups', DETAILS);
    expect(created.statusCode, created.body).toBe(201);
    expect((await admin.post('/api/v1/field-groups', DETAILS)).statusCode).toBe(409);
    const scratch = await admin.post('/api/v1/field-groups', {
      ...DETAILS,
      id: 'scratch',
      location: [[{ param: 'contentType', operator: '==', value: 'article' }]],
    });
    expect(scratch.statusCode).toBe(201);
    const replaced = await admin.request('PUT', '/api/v1/field-groups/scratch', {
      ...DETAILS,
      title: 'Scratch',
      location: [[{ param: 'status', operator: '!=', value: 'draft' }]],
    });
    expect(replaced.statusCode, replaced.body).toBe(200);
    expect(replaced.json()).toMatchObject({ id: 'scratch', title: 'Scratch' });
    const list = (await admin.get('/api/v1/field-groups')).json();
    expect(list.map((g: any) => g.id)).toEqual(['details', 'scratch']);
    expect((await admin.request('DELETE', '/api/v1/field-groups/scratch')).statusCode).toBe(204);
    expect((await admin.get('/api/v1/field-groups/scratch')).statusCode).toBe(404);
  });

  it('are checked: rules, field definitions, reserved and plugin ids', async () => {
    const bad = await admin.post('/api/v1/field-groups', {
      ...DETAILS,
      id: 'bad',
      location: [[{ param: 'colour', operator: '==', value: 'x' }]],
    });
    expect(bad.statusCode).toBe(400);
    expect(
      (
        await admin.post('/api/v1/field-groups', {
          ...DETAILS,
          id: 'bad',
          fields: [{ name: '1x', type: 'text', label: 'X' }],
        })
      ).statusCode,
    ).toBe(400);
    expect((await admin.post('/api/v1/field-groups', { ...DETAILS, id: 'theme' })).statusCode).toBe(
      400,
    );
    expect(
      (await admin.post('/api/v1/field-groups', { ...DETAILS, id: 'fields-kit-review' }))
        .statusCode,
    ).toBe(409);
    // Editors cannot change the structure of the site.
    expect((await editor.post('/api/v1/field-groups', { ...DETAILS, id: 'mine' })).statusCode).toBe(
      403,
    );
  });

  it('come with the plugins’ and the theme’s page templates to the editor', async () => {
    const screen = (await editor.get('/api/v1/field-screens/entry')).json();
    const ids = screen.groups.map((g: any) => g.id);
    expect(ids).toEqual(
      expect.arrayContaining(['details', 'fields-kit-legacy', 'fields-kit-review']),
    );
    // Computed per site for terms, not shown on entries.
    expect(ids).not.toContain('fields-kit-term');
    const legacy = screen.groups.find((g: any) => g.id === 'fields-kit-legacy');
    expect(legacy).toMatchObject({
      source: 'plugin:fields-kit',
      location: [[{ param: 'contentType', operator: '==', value: 'article' }]],
    });
    expect(screen.groups.find((g: any) => g.id === 'details')).toMatchObject({
      source: 'site',
      labelPlacement: 'left',
    });
    expect(screen.templates).toEqual([{ name: 'wide', label: { en: 'Wide', it: 'Largo' } }]);
    const terms = (await editor.get('/api/v1/field-screens/term')).json();
    expect(terms.groups.map((g: any) => g.id)).toEqual(['fields-kit-term']);
    expect((await editor.get('/api/v1/field-screens/nothing')).statusCode).toBe(400);
  });

  it('match by the core’s rules for plugins too', async () => {
    const wide = (await editor.get('/api/v1/ext/fields-kit/groups?template=wide')).json();
    expect(wide).toEqual(['details', 'fields-kit-review']);
    expect((await editor.get('/api/v1/ext/fields-kit/groups')).json()).toEqual([]);
    expect((await editor.get('/api/v1/ext/fields-kit/groups?type=article')).json()).toEqual([
      'fields-kit-legacy',
    ]);
  });
});

describe('entries', () => {
  let pageId: string;

  it('check only the groups shown: the template decides', async () => {
    // Default template: the group does not show, its values are kept as they are.
    const plain = await editor.post('/api/v1/entries', {
      type: 'page',
      title: 'Plain',
      fields: { details: { subtitle: 42 } },
    });
    expect(plain.statusCode, plain.body).toBe(201);
    expect(plain.json().revision.fields.details).toEqual({ subtitle: 42 });
    expect((await editor.post(`/api/v1/entries/${plain.json().id}/publish`)).statusCode).toBe(200);

    const wide = await editor.post('/api/v1/entries', {
      type: 'page',
      title: 'About us',
      template: 'wide',
      fields: { details: { subtitle: 42 } },
    });
    expect(wide.statusCode).toBe(400);
    expect(wide.json().errors).toEqual([
      expect.objectContaining({ path: 'fields.details.subtitle' }),
    ]);
  });

  it('save drafts with required fields empty, and refuse to publish them', async () => {
    const created = await editor.post('/api/v1/entries', {
      type: 'page',
      title: 'About us',
      template: 'wide',
      fields: { details: { hasPrice: false } },
    });
    expect(created.statusCode, created.body).toBe(201);
    pageId = created.json().id;
    expect(created.json().template).toBe('wide');
    const publish = await editor.post(`/api/v1/entries/${pageId}/publish`);
    expect(publish.statusCode).toBe(400);
    // The price is hidden (no price): only the subtitle is missing.
    expect(publish.json().errors).toEqual([
      { path: 'fields.details.subtitle', message: 'This field is required.' },
    ]);
  });

  it('enforce a required field shown by its condition', async () => {
    const saved = await editor.request('PATCH', `/api/v1/entries/${pageId}`, {
      fields: { details: { subtitle: 'Who we are', hasPrice: true } },
    });
    expect(saved.statusCode).toBe(200);
    const publish = await editor.post(`/api/v1/entries/${pageId}/publish`);
    expect(publish.json().errors).toEqual([
      expect.objectContaining({ path: 'fields.details.price' }),
    ]);
  });

  it('give list rows a stable id, and publish', async () => {
    const saved = await editor.request('PATCH', `/api/v1/entries/${pageId}`, {
      fields: {
        details: {
          subtitle: 'Who we are',
          hasPrice: true,
          price: 12,
          photo: imageId,
          team: [{ name: 'Ann', picture: imageId }, { name: 'Bob' }],
        },
        'fields-kit-review': { score: 2, code: 'ok' },
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const team = saved.json().revision.fields.details.team;
    expect(team.map((row: any) => typeof row._id)).toEqual(['string', 'string']);
    // Sent again with their ids: the same ids.
    const again = await editor.request('PATCH', `/api/v1/entries/${pageId}`, {
      fields: saved.json().revision.fields,
    });
    expect(again.json().revision.fields.details.team.map((r: any) => r._id)).toEqual(
      team.map((r: any) => r._id),
    );
    expect((await editor.post(`/api/v1/entries/${pageId}/publish`)).statusCode).toBe(200);
  });

  it('check values of a plugin’s field type with its settings', async () => {
    const tooHigh = await editor.request('PATCH', `/api/v1/entries/${pageId}`, {
      fields: { details: { subtitle: 'x' }, 'fields-kit-review': { score: 4 } },
    });
    expect(tooHigh.statusCode).toBe(400);
    expect(tooHigh.json().errors[0].path).toBe('fields.fields-kit-review.score');
    const badDefinition = await admin.post('/api/v1/field-groups', {
      ...DETAILS,
      id: 'rated',
      fields: [{ name: 'r', type: 'fields-kit/rating', label: 'R', settings: { max: 99 } }],
    });
    expect(badDefinition.statusCode).toBe(400);
    expect(badDefinition.json().errors[0].path).toBe('fields.0.settings.max');
  });

  it('are checked by plugins before saving (entry.validate)', async () => {
    const refused = await editor.request('PATCH', `/api/v1/entries/${pageId}`, {
      fields: { details: { subtitle: 'x' }, 'fields-kit-review': { code: 'bad' } },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().errors).toEqual([
      { path: 'fields.fields-kit-review.code', message: 'Not this code.' },
    ]);
  });

  it('show groups by terms, parent and status (live in the editor, checked here)', async () => {
    const category = await admin.post('/api/v1/taxonomies/category/terms', {
      name: 'News',
      fields: { 'fields-kit-term': { color: '#ff0000' } },
    });
    expect(category.statusCode, category.body).toBe(201);
    const termId = category.json().id;
    const group = await admin.post('/api/v1/field-groups', {
      id: 'news',
      title: 'News',
      location: [[{ param: 'term', operator: '==', value: termId }]],
      fields: [{ name: 'source', type: 'url', label: 'Source' }],
    });
    expect(group.statusCode).toBe(201);
    const post = await editor.post('/api/v1/entries', { type: 'article', title: 'Hi' });
    // Not in the category: the value is not checked.
    const free = await editor.request('PATCH', `/api/v1/entries/${post.json().id}`, {
      fields: { news: { source: 'not a link' } },
    });
    expect(free.statusCode).toBe(200);
    // Put in the category with the same request: checked.
    const checked = await editor.request('PATCH', `/api/v1/entries/${post.json().id}`, {
      terms: { category: [termId] },
      fields: { news: { source: 'not a link' } },
    });
    expect(checked.statusCode).toBe(400);
    expect(checked.json().errors[0].path).toBe('fields.news.source');
  });

  it('keep the template through copies, and list the groups with the type', async () => {
    const copy = await editor.post(`/api/v1/entries/${pageId}/duplicate`);
    expect(copy.statusCode, copy.body).toBe(201);
    expect(copy.json().template).toBe('wide');
    const types = (await editor.get('/api/v1/content-types')).json();
    const page = types.find((t: any) => t.slug === 'page');
    expect(page.fieldGroups.map((g: any) => g.id)).toEqual(
      expect.arrayContaining(['details', 'fields-kit-review']),
    );
    expect(page.fieldGroups.map((g: any) => g.id)).not.toContain('fields-kit-legacy');
  });

  it('render with the template class and formatted values for templates', async () => {
    const visitor = new TestClient(app, site.host, '10.47.0.9');
    const page = await visitor.get('/about-us');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('template-wide');
  });
});

describe('dynamic sources', () => {
  it('list the core’s, the fields’ and the plugins’', async () => {
    const sources = (await editor.get('/api/v1/dynamic-sources')).json();
    const ids = sources.map((s: any) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'entry.title',
        'entry.featuredImage',
        'site.title',
        'entry.field:details.photo',
        'entry.field:details.team',
        'entry.field:fields-kit-review.score',
        'term.field:fields-kit-term.color',
        'fields-kit:hello',
      ]),
    );
    expect(sources.find((s: any) => s.id === 'entry.field:details.photo').type).toBe('media');
    expect(sources.find((s: any) => s.id === 'entry.field:fields-kit-review.score').type).toBe(
      'number',
    );
  });

  it('resolve formatted values: media fields as images (Fresco’s field tag)', async () => {
    const entry = (await editor.get('/api/v1/entries?type=page&q=About'))
      .json()
      .items.find((e: any) => e.status === 'published');
    const resolve = async (id: string, extra = '') =>
      (
        await editor.get(
          `/api/v1/ext/fields-kit/resolve?id=${encodeURIComponent(id)}&entry=${entry.id}${extra}`,
        )
      ).json().value;
    const photo = await resolve('entry.field:details.photo');
    expect(photo).toMatchObject({ id: imageId, alt: '', mime: 'image/png' });
    expect(photo.url).toMatch(/^\/media\//);
    // By name alone too, like ACF's get_field.
    expect((await resolve('entry.field:photo')).id).toBe(imageId);
    const team = await resolve('entry.field:details.team');
    expect(team[0]).toMatchObject({ name: 'Ann', picture: { id: imageId } });
    expect(typeof team[0]._id).toBe('string');
    expect(await resolve('entry.field:fields-kit-review.score')).toEqual({
      stars: 2,
      text: '★★',
    });
    expect(await resolve('entry.title')).toBe('About us');
    expect(await resolve('entry.url')).toMatch(/\/about-us$/);
    expect(await resolve('fields-kit:hello')).toBe('Hello (en)');
    expect(await resolve('entry.field:nothing')).toBeNull();
  });
});

describe('term fields', () => {
  it('are checked against the taxonomy’s groups, except for terms added from the editor', async () => {
    const missing = await admin.post('/api/v1/taxonomies/category/terms', {
      name: 'Sport',
      fields: {},
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().errors[0]).toMatchObject({ path: 'fields.fields-kit-term.color' });
    const post = await editor.post('/api/v1/entries', { type: 'article', title: 'Quick' });
    const quick = await editor.request('PATCH', `/api/v1/entries/${post.json().id}`, {
      terms: { category: [{ name: 'Quick category' }] },
    });
    expect(quick.statusCode, quick.body).toBe(200);
    // Tags are not categories: no group.
    expect(
      (await admin.post('/api/v1/taxonomies/tag/terms', { name: 'Free', fields: {} })).statusCode,
    ).toBe(201);
  });

  it('are read as dynamic sources', async () => {
    const terms = (await admin.get('/api/v1/taxonomies/category/terms')).json();
    const news = terms.find((t: any) => t.name === 'News');
    const value = (
      await editor.get(
        `/api/v1/ext/fields-kit/resolve?id=${encodeURIComponent('term.field:color')}&term=${news.id}`,
      )
    ).json().value;
    expect(value).toBe('#ff0000');
  });
});

describe('user fields', () => {
  it('show for people of a role, edited by administrators and in the profile', async () => {
    const group = await admin.post('/api/v1/field-groups', {
      id: 'staff',
      title: 'Staff',
      location: [
        [
          { param: 'userRole', operator: '==', value: 'editor' },
          { param: 'userForm', operator: '==', value: 'all' },
        ],
      ],
      fields: [
        { name: 'phone', type: 'text', label: 'Phone', required: true },
        { name: 'portrait', type: 'media', label: 'Portrait' },
      ],
    });
    expect(group.statusCode).toBe(201);
    const empty = (await admin.get(`/api/v1/users/${editorId}/fields`)).json();
    expect(empty).toMatchObject({ values: {}, groups: [{ id: 'staff' }] });
    // Authors are not editors: no group, nothing to check.
    expect((await admin.get(`/api/v1/users/${authorId}/fields`)).json().groups).toEqual([]);
    const missing = await admin.request('PUT', `/api/v1/users/${editorId}/fields`, {
      fields: { staff: {} },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().errors[0].path).toBe('fields.staff.phone');
    const saved = await admin.request('PUT', `/api/v1/users/${editorId}/fields`, {
      fields: { staff: { phone: '+39 010 1234', portrait: imageId } },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    // The person sees and changes them in their profile.
    const own = (await editor.get('/api/v1/profile/fields')).json();
    expect(own.values).toEqual({ staff: { phone: '+39 010 1234', portrait: imageId } });
    const changed = await editor.request('PUT', '/api/v1/profile/fields', {
      fields: { staff: { phone: '+39 010 9999', portrait: imageId } },
    });
    expect(changed.statusCode).toBe(200);
    // Editors cannot edit others' fields.
    expect(
      (
        await editor.request('PUT', `/api/v1/users/${authorId}/fields`, {
          fields: { staff: { phone: '1' } },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('are read as dynamic sources', async () => {
    const value = (
      await editor.get(
        `/api/v1/ext/fields-kit/resolve?id=${encodeURIComponent('user.field:staff.portrait')}&user=${editorId}`,
      )
    ).json().value;
    expect(value).toMatchObject({ id: imageId });
  });

  it('are in privacy exports and erased on request', async () => {
    const host = app.get(PluginHost);
    const exported = await host.exportPersonalData(site.id, 'editor@fields.test');
    const core = exported.find((r) => r.source === 'core')!;
    const fields = core.groups.find((g) => g.id === 'core.fields');
    expect(fields?.items[0]).toEqual({
      staff: JSON.stringify({ phone: '+39 010 9999', portrait: imageId }),
    });
    const erased = await host.erasePersonalData(site.id, 'editor@fields.test');
    expect(erased.find((r) => r.source === 'core.fields')).toMatchObject({ removed: 1 });
    expect((await admin.get(`/api/v1/users/${editorId}/fields`)).json().values).toEqual({});
    // Put back for the transfer below.
    await admin.request('PUT', `/api/v1/users/${editorId}/fields`, {
      fields: { staff: { phone: '+39 010 9999', portrait: imageId } },
    });
  });
});

describe('the theme’s page options', () => {
  it('are a group of the theme, with its page templates and template components', async () => {
    const themedAdmin = new TestClient(app, themed.host, '10.47.1.1');
    await themedAdmin.login('admin@fields-themed.test', PASSWORD);
    expect((await themedAdmin.post('/api/v1/themes/fields-theme/activate')).statusCode).toBe(200);
    const screen = (await themedAdmin.get('/api/v1/field-screens/entry')).json();
    expect(screen.templates).toEqual([{ name: 'landing', label: 'Landing' }]);
    const theme = screen.groups.find((g: any) => g.id === 'theme');
    expect(theme).toMatchObject({
      source: 'theme',
      storage: 'document',
      location: [[{ param: 'contentType', operator: '==', value: 'page' }]],
    });
    const groups = app.get(FieldGroupsService);
    expect((await groups.groups(themed.id, 'term')).map((g) => g.id)).toEqual([]);

    // A template of the theme reads the formatted values with <Field> and <Rows>.
    expect(
      (
        await themedAdmin.post('/api/v1/field-groups', {
          ...DETAILS,
          location: [[{ param: 'template', operator: '==', value: 'landing' }]],
        })
      ).statusCode,
    ).toBe(201);
    const created = await themedAdmin.post('/api/v1/entries', {
      type: 'page',
      title: 'Welcome',
      template: 'landing',
      fields: { details: { subtitle: 'Fresh <bread>', team: [{ name: 'Ann' }, { name: 'Bob' }] } },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(
      (await themedAdmin.post(`/api/v1/entries/${created.json().id}/publish`)).statusCode,
    ).toBe(200);
    const visitor = new TestClient(app, themed.host, '10.47.1.2');
    const html = (await visitor.get('/welcome')).body;
    expect(html).toContain('Landing Fresh &lt;bread&gt; <i>Ann</i><i>Bob</i>');
  });
});

describe('transfer', () => {
  it('exports field values with refs and imports them into another site', async () => {
    const host = app.get(PluginHost);
    const groups = app.get(FieldGroupsService);
    const { document, files } = await exportSite(
      owner.db,
      site.id,
      {},
      undefined,
      {},
      await exportFieldDefinitions(owner.db, host, groups, site.id),
    );
    const page = document.entries!.find((e) => e.title === 'About us' && e.status === 'published')!;
    expect(page.template).toBe('wide');
    const details = page.fields!.details as any;
    expect(details.photo).toEqual({ $media: imageId });
    expect(details.team[0].picture).toEqual({ $media: imageId });
    const editorRow = document.users!.find((u) => u.email === 'editor@fields.test')!;
    expect((editorRow.fields as any).staff.portrait).toEqual({ $media: imageId });

    // The other site has the same groups (made by its owners).
    const [importer] = await owner.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'admin@fields.test'));
    const cloneAdmin = new TestClient(app, clone.host, '10.47.2.1');
    await seedUser(owner, {
      email: 'admin@fields-clone.test',
      password: PASSWORD,
      site: clone,
      role: 'administrator',
    });
    await cloneAdmin.login('admin@fields-clone.test', PASSWORD);
    expect((await cloneAdmin.post('/api/v1/field-groups', DETAILS)).statusCode).toBe(201);
    const { DiskStorage } = await import('../src/media/storage.js');
    const { APP_CONFIG } = await import('../src/config/config.js');
    const storage = new DiskStorage(app.get<{ media: { path: string } }>(APP_CONFIG).media.path);
    const { readFile } = await import('node:fs/promises');
    const report = await importDocument(document, {
      db: owner.db,
      siteId: clone.id,
      asUserId: importer!.id,
      media: app.get(MediaService),
      cache: app.get(PageCacheService),
      readFile: (file) => readFile(storage.pathOf(files.get(file)!)),
    });
    expect(report.errors).toEqual([]);
    const items = (await cloneAdmin.get('/api/v1/entries?type=page&q=About')).json().items;
    const imported = (
      await cloneAdmin.get(`/api/v1/entries/${items.find((e: any) => e.status === 'published').id}`)
    ).json();
    expect(imported.template).toBe('wide');
    const media = (await cloneAdmin.get('/api/v1/media')).json();
    const newImage = (media.items ?? media)[0].id;
    expect(newImage).not.toBe(imageId);
    expect(imported.revision.fields.details.photo).toBe(newImage);
    expect(imported.revision.fields.details.team[0].picture).toBe(newImage);
    // Row ids travel with the rows.
    expect(imported.revision.fields.details.team[0]._id).toBe(details.team[0]._id);
    // Terms keep their fields, the editor their user fields (media remapped).
    const news = (await cloneAdmin.get('/api/v1/taxonomies/category/terms'))
      .json()
      .find((t: any) => t.name === 'News');
    expect(news.fields).toEqual({ 'fields-kit-term': { color: '#ff0000' } });
    const [stored] = await withSiteContext(owner.db, clone.id, (tx) =>
      tx.select().from(userFields).where(eq(userFields.userId, editorId)),
    );
    expect(stored?.fields).toEqual({ staff: { phone: '+39 010 9999', portrait: newImage } });
  });
});
