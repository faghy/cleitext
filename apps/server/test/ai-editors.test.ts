/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers of the tools, read field by field. */
/**
 * AI assistants and the site's editors (plugin API 1.40): entries keep the
 * editor they were made with (block editor, Fresco, Classic Editor), blocks
 * are converted on the server by the editor's plugin, native Fresco trees are
 * checked, new entries use the default editor of their type, and plugins add
 * sections of the guide and tools.
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
const fixture = fileURLToPath(new URL('./fixtures/ai-plugin', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let token: string;
let editorToken: string;

const MARKUP =
  '<!-- wp:heading {"level":2} --><h2>Fresh bread</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Baked every morning.</p><!-- /wp:paragraph -->';

async function call(name: string, args: Record<string, unknown> = {}, as = token) {
  const response = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      host: site.host,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${as}`,
    },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(response.statusCode).toBe(200);
  const body = response.json() as {
    result?: { content: { text: string }[]; isError?: boolean };
    error?: { message: string };
  };
  if (body.error) return { text: body.error.message, isError: true, json: null };
  const text = body.result!.content[0]!.text;
  let json: Record<string, any> | null = null;
  try {
    json = JSON.parse(text) as Record<string, any>;
  } catch {
    // A guide or a message.
  }
  return { text, isError: body.result!.isError === true, json };
}

async function toolNames(as: string): Promise<string[]> {
  const response = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      host: site.host,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${as}`,
    },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  });
  return (response.json().result.tools as { name: string }[]).map((t) => t.name);
}

/** The stored document of an entry. */
async function documentOf(id: string) {
  const entry = (await admin.get(`/api/v1/entries/${id}`)).json();
  return entry.revision.document as {
    blocks: { type: string; attrs: Record<string, unknown>; children?: unknown[] }[];
    editor?: { id: string; data?: Record<string, unknown> };
  };
}

/** Official plugins are built where their dependencies are; the fixture in a copy. */
async function install(source: string, slug: string, pluginsPath: string, inPlace = true) {
  if (inPlace) await buildPlugin(source);
  const copy = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(source, copy, { recursive: true, filter: (file) => !file.includes('node_modules') });
  if (!inPlace) await buildPlugin(copy);
  await installPlugin(owner.db, {
    source: copy,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  for (const slug of ['fresco', 'classic-editor', 'seo']) {
    await install(join(pluginsRoot, slug), slug, pluginsPath);
  }
  await install(fixture, 'ai-helper', pluginsPath, false);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'ai-editors');
  await seedUser(owner, {
    email: 'admin@ai.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@ai.test', password: PASSWORD, site, role: 'editor' });
  admin = new TestClient(app, site.host, '10.49.0.1');
  await admin.login('admin@ai.test', PASSWORD);
  for (const slug of ['fresco', 'classic-editor', 'seo', 'ai-helper']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
  expect((await admin.request('PATCH', '/api/v1/settings/core', { mcp: true })).statusCode).toBe(
    200,
  );
  const created = await admin.post('/api/v1/tokens', {
    name: 'ai',
    scopes: ['read', 'write'],
    expiresInDays: null,
  });
  token = created.json().token;
  const editor = new TestClient(app, site.host, '10.49.0.2');
  await editor.login('editor@ai.test', PASSWORD);
  editorToken = (
    await editor.post('/api/v1/tokens', {
      name: 'ai',
      scopes: ['read', 'write'],
      expiresInDays: null,
    })
  ).json().token;
}, 300_000);

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('AI assistants and editors', () => {
  it('lists the editors and the editor of each content type', async () => {
    const { json } = await call('get_site');
    expect(json!.editors.map((e: { id: string }) => e.id)).toEqual(['blocks', 'classic', 'fresco']);
    expect(json!.editors.find((e: { id: string }) => e.id === 'fresco')).toMatchObject({
      plugin: 'fresco',
      send: 'content or blocks (converted), native',
    });
    const page = json!.content_types.find((t: { slug: string }) => t.slug === 'page');
    expect(page.editor).toBe('blocks');
    expect(page.fields).toContain('seo.title (text, max 70) — Search title');
  });

  it('writes block editor entries as blocks, keeping page settings and other fields', async () => {
    const created = await call('create_entry', {
      title: 'Blocks page',
      content: MARKUP,
      fields: { seo: { title: 'Bread', description: 'Fresh bread every day' } },
    });
    expect(created.isError).toBe(false);
    expect(created.json!.editor).toBe('blocks');
    const id = created.json!.id as string;
    // The theme's page options of the block editor.
    const document = await documentOf(id);
    expect(document.editor).toBeUndefined();
    await admin.request('PATCH', `/api/v1/entries/${id}`, {
      document: { ...document, editor: { id: 'blocks', data: { hideTitle: true } } },
    });

    const updated = await call('update_entry', {
      id,
      content: '<p>Now with croissants.</p>',
      fields: { seo: { description: 'Bread and croissants' } },
    });
    expect(updated.isError).toBe(false);
    const after = await documentOf(id);
    expect(after.blocks.map((b) => b.type)).toEqual(['core/paragraph']);
    expect(after.editor).toEqual({ id: 'blocks', data: { hideTitle: true } });
    const read = await call('get_entry', { id });
    expect(read.json!.editor).toBe('blocks');
    expect(read.json!.blocks).toHaveLength(1);
    // Only the given SEO field changed.
    expect(read.json!.fields.seo).toMatchObject({
      title: 'Bread',
      description: 'Bread and croissants',
    });

    const native = await call('update_entry', { id, native: [] });
    expect(native.isError).toBe(true);
    expect(native.text).toContain('block editor');
  });

  it('keeps Fresco pages in Fresco: blocks are converted, native trees checked', async () => {
    const created = await call('create_entry', {
      title: 'Fresco page',
      editor: 'fresco',
      content: MARKUP,
    });
    expect(created.isError).toBe(false);
    expect(created.json!.editor).toBe('fresco');
    const id = created.json!.id as string;
    let document = await documentOf(id);
    expect(document.editor?.id).toBe('fresco');
    expect(document.blocks.map((b) => b.type)).toEqual(['fresco/container']);

    // Page settings of Fresco stay through the assistant's changes.
    await admin.request('PATCH', `/api/v1/entries/${id}`, {
      document: { ...document, editor: { id: 'fresco', data: { layout: 'canvas' } } },
    });
    const changed = await call('update_entry', { id, content: '<p>Only this.</p>' });
    expect(changed.isError).toBe(false);
    expect(changed.json!.editor).toBe('fresco');
    document = await documentOf(id);
    expect(document.editor).toEqual({ id: 'fresco', data: { layout: 'canvas' } });
    expect(JSON.stringify(document.blocks)).toContain('Only this.');

    const read = await call('get_entry', { id });
    expect(read.json!.editor).toBe('fresco');
    expect(read.json!.native[0].type).toBe('fresco/container');
    expect(read.json!.editor_settings).toEqual({ layout: 'canvas' });
    const asBlocks = await call('get_entry', { id, as_blocks: true });
    expect(asBlocks.json!.blocks.map((b: { type: string }) => b.type)).toEqual(['core/paragraph']);

    const tree = [
      {
        type: 'fresco/container',
        attrs: { flex_direction: 'row', 'flex_direction@mobile': 'column' },
        children: [
          { type: 'fresco/heading', attrs: { title: 'Native', tag: 'h2' } },
          { type: 'fresco/text', attrs: { content: '<p>Hi<script>alert(1)</script></p>' } },
        ],
      },
    ];
    const native = await call('update_entry', { id, native: tree });
    expect(native.isError).toBe(false);
    document = await documentOf(id);
    expect(document.editor).toEqual({ id: 'fresco', data: { layout: 'canvas' } });
    const section = document.blocks[0] as unknown as {
      attrs: Record<string, unknown>;
      children: { type: string; attrs: Record<string, unknown> }[];
    };
    expect(section.attrs['flex_direction@mobile']).toBe('column');
    expect(section.children.map((c) => c.type)).toEqual(['fresco/heading', 'fresco/text']);
    expect(section.children[1]!.attrs.content).toBe('<p>Hi</p>');

    // Invalid trees are refused with the reasons, and nothing changes.
    const invalid = await call('update_entry', {
      id,
      native: [{ type: 'fresco/heading', attrs: { title: 'Loose' } }, { type: 'fresco/nope' }],
    });
    expect(invalid.isError).toBe(true);
    expect(invalid.text).toContain('top level holds only fresco/container');
    expect(invalid.text).toContain('unknown element type "fresco/nope"');
    expect(JSON.stringify((await documentOf(id)).blocks)).toContain('Native');

    // A move to the block editor converts the page.
    const moved = await call('update_entry', { id, editor: 'blocks' });
    expect(moved.json!.editor).toBe('blocks');
    document = await documentOf(id);
    expect(document.editor).toBeUndefined();
    expect(document.blocks.map((b) => b.type)).toEqual(['core/heading', 'core/paragraph']);
  });

  it('keeps Classic Editor entries classic', async () => {
    const created = await call('create_entry', {
      type: 'article',
      title: 'Classic post',
      editor: 'classic',
      content: '<h2>News</h2><p>We moved.</p>',
    });
    expect(created.isError).toBe(false);
    const id = created.json!.id as string;
    let document = await documentOf(id);
    expect(document.editor).toEqual({ id: 'classic' });
    expect(document.blocks.map((b) => b.type)).toEqual(['core/heading', 'core/paragraph']);

    await call('update_entry', { id, content: '<p>We moved to Main Street.</p>' });
    document = await documentOf(id);
    expect(document.editor).toEqual({ id: 'classic' });
    expect(JSON.stringify(document.blocks)).toContain('Main Street');
    const read = await call('get_entry', { id });
    expect(read.json!.editor).toBe('classic');
    expect(read.json!.native[0].type).toBe('core/paragraph');
  });

  it('uses the default editor of the type, and refuses editors that are not there', async () => {
    const saved = await admin.request('PATCH', '/api/v1/settings/core', {
      defaultEditors: { page: 'fresco' },
    });
    expect(saved.statusCode).toBe(200);
    expect((await admin.get('/api/v1/auth/me')).json().site.defaultEditors).toEqual({
      page: 'fresco',
    });
    const site = await call('get_site');
    expect(site.json!.content_types.find((t: { slug: string }) => t.slug === 'page').editor).toBe(
      'fresco',
    );

    const empty = await call('create_entry', { title: 'Empty Fresco page' });
    expect(empty.json!.editor).toBe('fresco');
    expect((await documentOf(empty.json!.id)).editor).toEqual({ id: 'fresco' });

    const unknown = await call('create_entry', { title: 'Nope', editor: 'elementor' });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain('"elementor"');

    // Without Fresco on the site, its pages are not silently moved.
    expect((await admin.post('/api/v1/plugins/fresco/deactivate')).statusCode).toBe(200);
    const missing = await call('create_entry', { title: 'Default missing', content: MARKUP });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('the default editor of this type');
    const fresco = (await call('list_entries', { search: 'Empty Fresco' })).json as unknown as {
      id: string;
    }[];
    const update = await call('update_entry', { id: fresco[0]!.id, content: '<p>x</p>' });
    expect(update.isError).toBe(true);
    expect(update.text).toContain('"fresco" is not available');
    expect((await admin.post('/api/v1/plugins/fresco/activate')).statusCode).toBe(200);
    await admin.request('PATCH', '/api/v1/settings/core', { defaultEditors: {} });
  });

  it('gives one guide: rules, the editor, plugins, theme and patterns', async () => {
    const blocks = await call('get_block_guide');
    expect(blocks.text).toContain('# Writing for a Cleitext site');
    expect(blocks.text).toContain('Drafts first');
    expect(blocks.text).toContain('# Writing with the block editor');
    expect(blocks.text).toContain('Fresco ("fresco")');
    expect(blocks.text).toContain('## Opening hours (plugin ai-helper)');

    const fresco = await call('get_block_guide', { editor: 'fresco' });
    expect(fresco.text).toContain('# Writing with Fresco (editor "fresco")');
    expect(fresco.text).toContain('`fresco/heading` — Heading');
    expect(fresco.text).toContain('var(--fr-c-primary)');
    expect(fresco.text).not.toContain('# Writing with the block editor');
    // Fresco's own elements are not listed again as plugin blocks.
    expect(fresco.text).not.toContain('- fresco/heading (fresco)');
  });

  it('adds the tools of plugins, run as the person', async () => {
    expect(await toolNames(token)).toEqual(
      expect.arrayContaining(['get_site', 'ai_helper_who_am_i', 'ai_helper_secret']),
    );
    expect(await toolNames(editorToken)).not.toContain('ai_helper_secret');
    const me = await call('ai_helper_who_am_i', { shout: true });
    expect(me.isError).toBe(false);
    expect(me.json!.name).toBe(me.json!.name.toUpperCase());
    const exposed = await call('ai_helper_who_am_i', { shout: 'no' });
    expect(exposed).toMatchObject({ isError: true, text: 'Say yes or no.' });
    const refused = await call('ai_helper_secret', {}, editorToken);
    expect(refused.isError).toBe(true);
  });
});
