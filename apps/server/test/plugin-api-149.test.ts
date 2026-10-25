/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * Plugin API 1.49, for field plugins like Campus: plugin lists that say
 * what their rows hold, hidden sources, the `block` location rule and
 * `ctx.fields.blockFields`, `hideOnScreen` of field groups, plugin blocks
 * rendering core blocks with their own data (`renderBlocks`), the
 * `term.saved` and `user.saved` actions, files of the site's theme and the
 * `notContains` / `pattern` conditions.
 */
import { cp, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CxdBlock } from '@cleitext/blocks';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
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
const fixture = fileURLToPath(new URL('./fixtures/c3-plugin', import.meta.url));
const EXT = '/api/v1/ext/c3-kit';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;
let adminId: string;
let imageId: string;
let outside: string;

/** A theme whose folder has JSON files for a plugin, one too large and a link leading out. */
async function writeTheme(dir: string) {
  const base = join(dir, 'c3-theme');
  await mkdir(join(base, 'dist'), { recursive: true });
  await mkdir(join(base, 'c3'), { recursive: true });
  await writeFile(
    join(base, 'theme.json'),
    JSON.stringify({ slug: 'c3-theme', name: 'C3 theme', version: '1.2.3' }),
  );
  await writeFile(
    join(base, 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) { return h('html', null, h('head', null, h('title', null, head.title)), h('body', null, children)); }
function Index(props) { return h('main', null, props.kind === 'entry' ? h(sdk.EntryContent, { document: props.entry.document }) : 'index'); }
export default sdk.defineTheme({ slug: 'c3-theme', name: 'C3 theme', version: '1.2.3', menuLocations: {}, templates: { index: Index }, Layout, css: '' });
`,
  );
  await writeFile(join(base, 'c3', 'one.json'), '{"id":"one"}');
  await writeFile(join(base, 'c3', 'two.json'), '{"id":"two"}');
  await writeFile(join(base, 'c3', 'big.json'), 'x'.repeat(1024 * 1024 + 1));
  outside = await mkdtemp(join(tmpdir(), 'c3-outside-'));
  await writeFile(join(outside, 'secret.json'), '{"secret":true}');
  await symlink(join(outside, 'secret.json'), join(base, 'c3', 'escape.json'));
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
  await install(fixture, pluginsPath, 'c3-kit');
  const themesPath = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await writeTheme(themesPath);
  app = await startTestApp({ pluginsPath, env: { THEMES_PATH: themesPath } });
  site = await seedSite(owner, 'c3');
  adminId = await seedUser(owner, {
    email: 'admin@c3.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.149.0.1');
  await admin.login('admin@c3.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.149.0.2');
  expect((await admin.post('/api/v1/plugins/c3-kit/activate')).statusCode).toBe(200);
  expect((await admin.post('/api/v1/themes/c3-theme/activate')).statusCode).toBe(200);
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#335577' } })
    .png()
    .toBuffer();
  const upload = await admin.upload('/api/v1/media', 'card.png', png, 'image/png');
  expect(upload.statusCode, upload.body).toBe(201);
  imageId = upload.json().id;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('field groups', () => {
  it('keep the parts of the editor they hide, and refuse unknown ones', async () => {
    const group = {
      id: 'quiet',
      title: 'Quiet',
      location: [[{ param: 'contentType', operator: '==', value: 'article' }]],
      hideOnScreen: ['excerpt', 'slug', 'tags'],
      fields: [{ name: 'note', type: 'text', label: 'Note' }],
    };
    expect((await admin.post('/api/v1/field-groups', group)).statusCode).toBe(201);
    const screen = (await admin.get('/api/v1/field-screens/entry')).json();
    expect(screen.groups.find((g: any) => g.id === 'quiet').hideOnScreen).toEqual([
      'excerpt',
      'slug',
      'tags',
    ]);
    const bad = await admin.post('/api/v1/field-groups', {
      ...group,
      id: 'loud',
      hideOnScreen: ['content'],
    });
    expect(bad.statusCode).toBe(400);
  });

  it('check the conditions they use', async () => {
    const group = (pattern: string) => ({
      id: 'patterns',
      title: 'Patterns',
      location: [[{ param: 'contentType', operator: '==', value: 'page' }]],
      fields: [
        { name: 'code', type: 'text', label: 'Code' },
        {
          name: 'extra',
          type: 'text',
          label: 'Extra',
          required: true,
          showIf: {
            all: [
              { field: 'code', pattern },
              { field: 'code', notContains: 'x' },
            ],
          },
        },
      ],
    });
    expect((await admin.post('/api/v1/field-groups', group('(unclosed'))).statusCode).toBe(400);
    expect((await admin.post('/api/v1/field-groups', group('^[A-Z]{3}$'))).statusCode).toBe(201);
    // `extra` is required only while `code` matches and has no "x".
    const publish = async (code: string) => {
      const created = await admin.post('/api/v1/entries', {
        type: 'page',
        title: `Code ${code}`,
        fields: { patterns: { code } },
      });
      return (await admin.post(`/api/v1/entries/${created.json().id}/publish`)).statusCode;
    };
    expect(await publish('ABC')).toBe(400);
    expect(await publish('abc')).toBe(200);
    expect(await publish('AXC')).toBe(400);
    expect(await admin.delete('/api/v1/field-groups/patterns')).toMatchObject({ statusCode: 204 });
  });

  it('give the fields of plugin blocks, and only to blocks', async () => {
    const own = {
      id: 'card-extra',
      title: 'Card extras',
      location: [[{ param: 'block', operator: '==', value: 'c3-kit/card' }]],
      fields: [
        { name: 'title', type: 'text', label: 'Second title' },
        { name: 'badge', type: 'text', label: 'Badge' },
      ],
    };
    expect((await admin.post('/api/v1/field-groups', own)).statusCode).toBe(201);
    const blocks = (await admin.get('/api/v1/field-screens/block')).json();
    expect(blocks.groups.map((g: any) => g.id).sort()).toEqual(['c3-kit-card', 'card-extra']);
    const entries = (await admin.get('/api/v1/field-screens/entry')).json();
    expect(entries.groups.map((g: any) => g.id)).not.toContain('card-extra');
    const read = (await admin.get(`${EXT}/block-fields?name=c3-kit/card`)).json();
    // Groups by order then title; the first field of a name wins.
    expect(read.groups).toEqual(['c3-kit-card', 'card-extra']);
    expect(read.fields).toEqual(['title', 'photo', 'items', 'badge']);
    expect((await admin.get(`${EXT}/block-fields?name=c3-kit/other`)).json().fields).toEqual([]);
    // Block fields are not entry sources.
    const sources = (await admin.get('/api/v1/dynamic-sources')).json();
    expect(sources.some((s: any) => s.id.includes('card-extra'))).toBe(false);
  });
});

describe('dynamic data', () => {
  it('describes the rows of plugin lists and leaves hidden sources out of lists', async () => {
    const sources = (await admin.get('/api/v1/dynamic-sources')).json();
    const sections = sources.find((s: any) => s.id === 'entry.field:c3-kit-sections.sections');
    expect(sections).toMatchObject({ type: 'list', rowKind: 'fields' });
    expect(sections.rows.map((r: any) => [r.id, r.type, r.rowKind ?? null])).toEqual([
      ['row.field:heading', 'text', null],
      ['row.field:picture', 'media', null],
      ['row.field:links', 'list', 'fields'],
    ]);
    expect(sections.rows[2].rows.map((r: any) => r.id)).toEqual(['row.field:url']);
    expect(sources.some((s: any) => s.id === 'c3-kit:old')).toBe(false);
    expect((await admin.get(`${EXT}/resolve?id=c3-kit:old`)).json().value).toBe(
      'From the old source',
    );
  });
});

describe('plugin blocks rendering core blocks', () => {
  it('bind the template to the block’s own data, with hidden sources still resolved', async () => {
    const blocks: CxdBlock[] = [
      {
        id: 'card',
        type: 'c3-kit/card',
        v: 1,
        attrs: {
          title: 'Harbour card',
          photo: imageId,
          items: [{ label: 'One' }, { label: 'Two' }],
        },
      },
      {
        id: 'old',
        type: 'core/paragraph',
        v: 1,
        attrs: {
          metadata: {
            bindings: { content: { source: 'cleitext/field', args: { key: 'c3-kit:old' } } },
          },
        },
        content: [{ text: 'Typed' }],
      },
    ];
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Card page',
      document: { schema: 1, blocks },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect((await admin.post(`/api/v1/entries/${created.json().id}/publish`)).statusCode).toBe(200);
    const html = (await visitor.get('/card-page')).body;
    expect(html).toContain('<div class="c3-card">');
    expect(html).toContain('<h3 class="wp-block-heading">Harbour card</h3>');
    expect(html).not.toContain('No title');
    // The Field block shows the image of the row with the library's variants.
    expect(html).toMatch(/wp-block-cleitext-field is-media[^]*?\/media\//);
    expect(html).toContain('<p>One</p>');
    expect(html).toContain('<p>Two</p>');
    // Raw HTML of a template is cleaned.
    expect(html).toContain('<b>ok</b>');
    expect(html).not.toContain('bad()');
    expect(html).toContain('<p>From the old source</p>');
  });

  it('render in the editor’s preview too', async () => {
    const res = await admin.post('/api/v1/blocks/preview', {
      block: { id: 'b_card', type: 'c3-kit/card', v: 1, attrs: { title: 'Preview card' } },
      locale: 'en',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().html).toContain('<h3 class="wp-block-heading">Preview card</h3>');
  });
});

describe('save actions', () => {
  it('tell plugins about terms and people saved, with the values before', async () => {
    const term = await admin.post('/api/v1/taxonomies/category/terms', { name: 'Boats' });
    expect(term.statusCode).toBe(201);
    await admin.request('PATCH', `/api/v1/terms/${term.json().id}`, { name: 'Ships' });
    expect(
      (
        await admin.post('/api/v1/field-groups', {
          id: 'people',
          title: 'People',
          location: [[{ param: 'userRole', operator: '==', value: '*' }]],
          fields: [{ name: 'motto', type: 'text', label: 'Motto' }],
        })
      ).statusCode,
    ).toBe(201);
    const put = await admin.request('PUT', `/api/v1/users/${adminId}/fields`, {
      fields: { people: { motto: 'Ahoy' } },
    });
    expect(put.statusCode, put.body).toBe(200);
    const events = (await admin.get(`${EXT}/events`)).json();
    expect(events).toEqual([
      { action: 'term.saved', name: 'Boats', fields: {}, previous: null },
      { action: 'term.saved', name: 'Ships', fields: {}, previous: {} },
      { action: 'user.saved', id: adminId, fields: { people: { motto: 'Ahoy' } }, previous: {} },
    ]);
  });
});

describe('files of the site’s theme', () => {
  it('are listed and read inside its folder only', async () => {
    const read = async (query: string) => (await admin.get(`${EXT}/theme?${query}`)).json();
    const listed = await read('dir=c3&file=c3/one.json');
    expect(listed.active).toEqual({ slug: 'c3-theme', name: 'C3 theme', version: '1.2.3' });
    // The link leading out of the folder is not listed.
    expect(listed.files).toEqual(['big.json', 'one.json', 'two.json']);
    expect(listed.file).toBe('{"id":"one"}');
    expect((await read('file=c3/big.json')).file).toBeNull();
    expect((await read('file=c3/escape.json')).file).toBeNull();
    expect((await read('file=../c3-theme/theme.json')).file).toBeNull();
    expect(
      (await read(`file=${encodeURIComponent(join(outside, 'secret.json'))}`)).file,
    ).toBeNull();
    expect((await read('dir=..')).files).toEqual([]);
    expect((await read('file=theme.json')).file).toContain('"slug":"c3-theme"');
  });
});
