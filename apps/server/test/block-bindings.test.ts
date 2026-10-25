/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * Block bindings (plugin API 1.48) on the public site: core blocks showing
 * an entry's fields and the site's data, the Field block with each type's
 * format, Field rows over a list and over related entries; the basic field
 * types (relations, rich text, link, time) checked and formatted; the
 * editor's preview of values and the relation pickers.
 */
import type { CxdBlock } from '@cleitext/blocks';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
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
let admin: TestClient;
let editor: TestClient;
let subscriber: TestClient;
let visitor: TestClient;
let editorId: string;
let imageId: string;
let newsId: string;
const related: string[] = [];

const bind = (bindings: Record<string, string>) => ({
  metadata: {
    bindings: Object.fromEntries(
      Object.entries(bindings).map(([attribute, key]) => [
        attribute,
        { source: 'cleitext/field', args: { key } },
      ]),
    ),
  },
});

const DETAILS = {
  id: 'details',
  title: 'Details',
  location: [[{ param: 'contentType', operator: '==', value: 'page' }]],
  fields: [
    { name: 'subtitle', type: 'text', label: 'Subtitle' },
    { name: 'photo', type: 'media', label: 'Photo' },
    { name: 'cta', type: 'link', label: 'Call to action' },
    { name: 'opens', type: 'time', label: 'Opens at' },
    { name: 'bio', type: 'richtext', label: 'Story' },
    { name: 'topic', type: 'term', label: 'Topic', taxonomy: 'category' },
    { name: 'host', type: 'user', label: 'Host' },
    { name: 'related', type: 'entry', label: 'Related', types: ['article'], multiple: true },
    {
      name: 'team',
      type: 'list',
      label: 'Team',
      fields: [
        { name: 'name', type: 'text', label: 'Name' },
        { name: 'role', type: 'text', label: 'Role' },
      ],
    },
  ],
};

beforeAll(async () => {
  owner = ownerDatabase();
  app = await startTestApp();
  site = await seedSite(owner, 'bindings');
  await seedUser(owner, {
    email: 'admin@bindings.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  editorId = await seedUser(owner, {
    email: 'editor@bindings.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  await seedUser(owner, {
    email: 'subscriber@bindings.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
  });
  admin = new TestClient(app, site.host, '10.49.0.1');
  await admin.login('admin@bindings.test', PASSWORD);
  editor = new TestClient(app, site.host, '10.49.0.2');
  await editor.login('editor@bindings.test', PASSWORD);
  subscriber = new TestClient(app, site.host, '10.49.0.3');
  await subscriber.login('subscriber@bindings.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.49.0.4');
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#224466' } })
    .png()
    .toBuffer();
  const upload = await admin.upload('/api/v1/media', 'harbour.png', png, 'image/png');
  expect(upload.statusCode, upload.body).toBe(201);
  imageId = upload.json().id;
  const term = await admin.post('/api/v1/taxonomies/category/terms', {
    name: 'News',
    slug: 'news',
  });
  expect(term.statusCode, term.body).toBe(201);
  newsId = term.json().id;
  for (const title of ['First post', 'Second post']) {
    const created = await admin.post('/api/v1/entries', { type: 'article', title });
    await admin.post(`/api/v1/entries/${created.json().id}/publish`);
    related.push(created.json().id);
  }
  expect((await admin.post('/api/v1/field-groups', DETAILS)).statusCode).toBe(201);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('basic field types', () => {
  it('are checked when saving', async () => {
    const bad = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Bad',
      fields: {
        details: { topic: 'news', cta: { url: 'javascript:alert(1)' }, opens: '9 o’clock' },
      },
    });
    expect(bad.statusCode).toBe(400);
    expect(
      bad
        .json()
        .errors.map((e: any) => e.path)
        .sort(),
    ).toEqual(['fields.details.cta.url', 'fields.details.opens', 'fields.details.topic']);
  });
});

const BLOCKS: CxdBlock[] = [
  {
    id: 'h',
    type: 'core/heading',
    v: 1,
    attrs: { level: 2, ...bind({ content: 'entry.field:subtitle' }) },
    content: [{ text: 'Typed subtitle' }],
  },
  {
    id: 'p',
    type: 'core/paragraph',
    v: 1,
    attrs: bind({ content: 'site.title' }),
    content: [{ text: 'Site' }],
  },
  {
    id: 'img',
    type: 'core/image',
    v: 1,
    attrs: {
      url: '/placeholder.png',
      ...bind({ id: 'entry.field:photo', url: 'entry.field:photo' }),
    },
  },
  {
    id: 'btns',
    type: 'core/buttons',
    v: 1,
    attrs: {},
    children: [
      {
        id: 'btn',
        type: 'core/button',
        v: 1,
        attrs: { url: '/old', ...bind({ url: 'entry.field:cta', text: 'entry.field:cta' }) },
        content: [{ text: 'Old' }],
      },
    ],
  },
  {
    id: 'list',
    type: 'core/list',
    v: 1,
    attrs: {},
    children: [
      {
        id: 'li',
        type: 'core/list-item',
        v: 1,
        attrs: bind({ content: 'entry.field:opens' }),
        content: [{ text: 'hours' }],
      },
    ],
  },
  { id: 'f-bio', type: 'cleitext/field', v: 1, attrs: { source: 'entry.field:details.bio' } },
  {
    id: 'f-topic',
    type: 'cleitext/field',
    v: 1,
    attrs: { source: 'entry.field:topic', label: 'Topic:' },
  },
  { id: 'f-host', type: 'cleitext/field', v: 1, attrs: { source: 'entry.field:host' } },
  {
    id: 'f-none',
    type: 'cleitext/field',
    v: 1,
    attrs: { source: 'entry.field:missing', fallback: 'Nothing here' },
  },
  {
    id: 'team',
    type: 'cleitext/field-rows',
    v: 1,
    attrs: { source: 'entry.field:team' },
    children: [
      {
        id: 'name',
        type: 'core/heading',
        v: 1,
        attrs: { level: 3, ...bind({ content: 'row.field:name' }) },
        content: [{ text: 'Name' }],
      },
      { id: 'role', type: 'cleitext/field', v: 1, attrs: { source: 'row.field:role' } },
    ],
  },
  {
    id: 'rel',
    type: 'cleitext/field-rows',
    v: 1,
    attrs: { source: 'entry.field:related' },
    children: [
      {
        id: 'rel-title',
        type: 'core/paragraph',
        v: 1,
        attrs: bind({ content: 'entry.title' }),
        content: [],
      },
    ],
  },
];

describe('bound blocks on the public site', () => {
  it('show the entry’s fields, formatted, resolved on the server', async () => {
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Harbour days',
      document: { schema: 1, blocks: BLOCKS },
      fields: {
        details: {
          subtitle: 'Boats & <nets>',
          photo: imageId,
          cta: { url: '/book', label: 'Book now', target: '_blank' },
          opens: '09:30',
          bio: '<p>Since <strong>1950</strong>.<script>alert(1)</script></p>',
          topic: newsId,
          host: editorId,
          related: [related[1], related[0]],
          team: [
            { name: 'Ann', role: 'Skipper' },
            { name: 'Bob', role: 'Cook' },
          ],
        },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const saved = created.json();
    // Saved cleaned: rich text without the script.
    expect(saved.revision.fields.details.bio).toBe('<p>Since <strong>1950</strong>.</p>');
    expect((await admin.post(`/api/v1/entries/${saved.id}/publish`)).statusCode).toBe(200);

    const html = (await visitor.get('/harbour-days')).body;
    expect(html).toContain('<h2 class="wp-block-heading">Boats &amp; &lt;nets&gt;</h2>');
    expect(html).not.toContain('Typed subtitle');
    expect(html).toContain('<p>Site bindings</p>');
    // The image of the field, with the library's variants.
    expect(html).not.toContain('placeholder.png');
    expect(html).toMatch(new RegExp(`<figure class="wp-block-image"><picture>.*?/media/`));
    expect(html).toContain('target="_blank"');
    expect(html).toMatch(/href="\/book"[^>]*>Book now<\/a>/);
    expect(html).toContain('<li>09:30</li>');
    expect(html).toContain(
      '<div class="wp-block-cleitext-field is-richtext"><div class="wp-block-cleitext-field__text"><p>Since <strong>1950</strong>.</p></div></div>',
    );
    expect(html).toContain(
      '<span class="wp-block-cleitext-field__label">Topic: </span><a href="/category/news">News</a>',
    );
    expect(html).toMatch(/<a href="\/author\/[^"]+">editor<\/a>/);
    expect(html).toContain('<p class="wp-block-cleitext-field is-empty">Nothing here</p>');
    // Field rows: each row of the list, and each related entry in order.
    expect(html).toContain('<h3 class="wp-block-heading">Ann</h3>');
    expect(html).toContain('<h3 class="wp-block-heading">Bob</h3>');
    expect(html).toContain('>Cook</p>');
    expect(html.indexOf('<p>Second post</p>')).toBeGreaterThan(0);
    expect(html.indexOf('<p>Second post</p>')).toBeLessThan(html.indexOf('<p>First post</p>'));
  });

  it('keep what was typed when the field is empty', async () => {
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Empty fields',
      document: { schema: 1, blocks: BLOCKS.slice(0, 1) },
    });
    await admin.post(`/api/v1/entries/${created.json().id}/publish`);
    expect((await visitor.get('/empty-fields')).body).toContain(
      '<h2 class="wp-block-heading">Typed subtitle</h2>',
    );
  });
});

describe('the block editor', () => {
  it('lists the sources, with the rows of lists and relations', async () => {
    const sources = (await editor.get('/api/v1/dynamic-sources')).json();
    const team = sources.find((s: any) => s.id === 'entry.field:details.team');
    expect(team).toMatchObject({ type: 'list', rowKind: 'fields' });
    expect(team.rows.map((r: any) => [r.id, r.type])).toEqual([
      ['row.field:name', 'text'],
      ['row.field:role', 'text'],
    ]);
    expect(sources.find((s: any) => s.id === 'entry.field:details.related')).toMatchObject({
      type: 'list',
      rowKind: 'entry',
    });
    expect(sources.find((s: any) => s.id === 'entry.field:details.cta').type).toBe('link');
    expect(sources.find((s: any) => s.id === 'entry.field:details.host').type).toBe('user');
    expect(sources.find((s: any) => s.id === 'user.name')).toBeTruthy();
  });

  it('previews values of the entry being edited, with fields not saved yet', async () => {
    const items = (await admin.get('/api/v1/entries?type=page&q=Harbour')).json().items;
    const res = await editor.post('/api/v1/dynamic-sources/resolve', {
      ids: ['entry.field:subtitle', 'entry.title', 'entry.field:related', 'site.title'],
      entryId: items[0].id,
      title: 'Typed title',
      fields: { details: { subtitle: 'Not saved yet', related: [related[0]] } },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().values).toEqual({
      'entry.field:subtitle': 'Not saved yet',
      'entry.title': 'Typed title',
      'entry.field:related': [
        expect.objectContaining({ id: related[0], title: 'First post', type: 'article' }),
      ],
      'site.title': 'Site bindings',
    });
    expect((await subscriber.post('/api/v1/dynamic-sources/resolve', { ids: [] })).statusCode).toBe(
      403,
    );
  });

  it('pickers of relation fields find entries, terms and members', async () => {
    const entries = (await editor.get('/api/v1/field-pickers/entry?q=second&types=article')).json();
    expect(entries).toEqual([{ id: related[1], label: 'Second post', hint: 'article · en' }]);
    const chosen = (
      await editor.get(`/api/v1/field-pickers/entry?ids=${related.join(',')}`)
    ).json();
    expect(chosen.map((e: any) => e.label).sort()).toEqual(['First post', 'Second post']);
    const terms = (await editor.get('/api/v1/field-pickers/term?taxonomy=category&q=ne')).json();
    expect(terms).toEqual([{ id: newsId, label: 'News', hint: 'category · en' }]);
    const people = (await editor.get('/api/v1/field-pickers/user?roles=editor')).json();
    expect(people).toEqual([{ id: editorId, label: 'editor', hint: 'Editor' }]);
    expect((await editor.get('/api/v1/field-pickers/menu')).statusCode).toBe(400);
    expect((await subscriber.get('/api/v1/field-pickers/user')).statusCode).toBe(403);
  });
});
