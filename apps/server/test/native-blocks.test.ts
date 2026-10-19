/**
 * Blocks with their own editor (plugin API 1.23): the plugin's block editor
 * entry and canvas styles, JSON attributes with rich text, nested blocks.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const fixture = fileURLToPath(new URL('./fixtures/native-plugin', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let visitor: TestClient;

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'native-src-')), 'native');
  await cp(fixture, source, { recursive: true });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'native');
  await seedUser(owner, {
    email: 'admin@native.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.72.0.1');
  visitor = new TestClient(app, site.host, '10.72.0.2');
  await admin.login('admin@native.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/native/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('blocks with their own editor', () => {
  it('gives the editor the entry, the canvas styles and the block', async () => {
    const info = (await admin.get('/api/v1/plugins/admin')).json() as {
      slug: string;
      editorUrl: string | null;
      editorStyles: string[];
    }[];
    const native = info.find((p) => p.slug === 'native')!;
    expect(native.editorUrl).toBe('/admin-plugins/native/1.0.0/dist/editor.js');
    expect(native.editorStyles).toEqual(['/plugin-assets/native/1.0.0/native.css']);

    // The entry uses the editor's own @wordpress/* instances.
    const entry = await admin.get(native.editorUrl!);
    expect(entry.statusCode).toBe(200);
    expect(entry.headers['content-type']).toContain('text/javascript');
    expect(entry.body).toContain('__cleitextShared');
    expect(entry.body).toContain('@wordpress/block-editor');
    expect(entry.body).not.toContain('function registerBlockType');
    expect((await admin.get(native.editorStyles[0]!)).body).toContain('.nb-box');
    // Sources and the manifest are not served.
    expect((await admin.get('/admin-plugins/native/1.0.0/src/editor.tsx')).statusCode).toBe(404);

    const blocks = (await admin.get('/api/v1/blocks')).json() as Record<string, unknown>[];
    expect(blocks.find((b) => b.type === 'native/box')).toMatchObject({
      native: true,
      container: true,
      richAttributes: ['heading'],
    });
  });

  it('saves free-form attributes with rich text and nested blocks, and renders them', async () => {
    const box = {
      id: 'box1',
      type: 'native/box',
      v: 1,
      attrs: {
        heading: [{ text: 'Hello ' }, { text: 'world', marks: ['bold'] }],
        padding: { desktop: 40, mobile: 12 },
        anything: { deep: [1, 2, { three: true }] },
      },
      children: [
        { id: 'p1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Inside' }] },
      ],
    };
    const created = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Native',
      document: { schema: 1, blocks: [box] },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().revision.document.blocks[0].attrs.anything).toEqual({
      deep: [1, 2, { three: true }],
    });
    const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
    const html = (await visitor.get(`/${published.json().slug as string}`)).body;
    expect(html).toContain('<section class="nb-box nb-box1"><h2>Hello <strong>world</strong></h2>');
    expect(html).toMatch(/<p>Inside<\/p>\s*<\/section>/);
    expect(html).toContain('.nb-box1{padding:40px}');

    // Attributes are bounded.
    const huge = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Huge',
      document: {
        schema: 1,
        blocks: [{ ...box, id: 'box2', attrs: { blob: 'x'.repeat(70_000) }, children: [] }],
      },
    });
    expect(huge.statusCode).toBe(400);
  });

  it('turns blocks of other WordPress plugins into its own on import', async () => {
    const imported = (type: string, attrs: Record<string, unknown>, children: unknown[] = []) => ({
      id: `i${Math.random().toString(36).slice(2, 8)}`,
      type: 'core/imported',
      v: 1,
      attrs: { name: type, attrs, html: '<div>old</div>', fallback: [] },
      children,
    });
    const paragraph = (text: string) => ({
      id: `p${Math.random().toString(36).slice(2, 8)}`,
      type: 'core/paragraph',
      v: 1,
      attrs: {},
      content: [{ text }],
    });
    const res = await admin.post('/api/v1/ext/native/import', {
      format: 'cleitext-transfer',
      version: 1,
      source: { kind: 'wordpress', exportedAt: '2026-10-18T10:00:00Z' },
      entries: [
        {
          ref: 'post:1',
          type: 'page',
          locale: 'en',
          slug: 'legacy',
          title: 'Legacy',
          status: 'published',
          publishedAt: '2026-10-18T10:00:00Z',
          document: {
            schema: 1,
            blocks: [
              imported('legacy/box', { title: 'Outer', space: 30 }, [
                // Inner blocks are converted first.
                imported('legacy/box', { title: 'Inner' }, [paragraph('Deep')]),
              ]),
              imported('other/thing', {}, [paragraph('Kept text')]),
            ],
          },
        },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().warnings).toContain(
      'Block other/thing has no equivalent (1×): its content was kept. A plugin may add it.',
    );
    const html = (await visitor.get('/legacy')).body;
    expect(html).toMatch(
      /<section class="nb-box nb-imported-\w+"><h2>Outer<\/h2><section class="nb-box nb-imported-\w+"><h2>Inner<\/h2><p>Deep<\/p>/,
    );
    expect(html).toContain('<p>Kept text</p>');
    expect(html).not.toContain('core/imported');
  });

  it('resolves entry references and hands plugins their data on import', async () => {
    const box = (id: string, attrs: Record<string, unknown>) => ({
      id,
      type: 'native/box',
      v: 1,
      attrs,
      children: [],
    });
    const page = (ref: string, slug: string, blocks: unknown[]) => ({
      ref,
      type: 'page',
      locale: 'en',
      slug,
      title: slug,
      status: 'published',
      publishedAt: '2026-10-18T10:00:00Z',
      document: { schema: 1, blocks },
    });
    const res = await admin.post('/api/v1/ext/native/import', {
      format: 'cleitext-transfer',
      version: 1,
      source: { kind: 'wordpress', exportedAt: '2026-10-18T10:00:00Z' },
      entries: [
        // It points to a page imported after it.
        page('post:1', 'linking', [
          box('r1', {
            heading: [{ text: 'Links' }],
            target: { $entry: 'post:2', prefix: 'entry:' },
            gone: { $entry: 'post:99' },
          }),
        ]),
        page('post:2', 'linked', []),
        { ...page('post:3', 'event-one', []), type: 'event' },
      ],
      plugins: {
        native: { home: { $entry: 'post:2' }, untouched: 'yes' },
        'not-installed': { anything: true },
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const report = res.json() as { warnings: string[]; errors: string[] };
    expect(report.errors).toEqual([]);
    const list = (await admin.get('/api/v1/entries?type=page&limit=50')).json() as {
      items: { id: string; slug: string }[];
    };
    const linking = list.items.find((e) => e.slug === 'linking')!;
    const linked = list.items.find((e) => e.slug === 'linked')!;
    const entry = (await admin.get(`/api/v1/entries/${linking.id}`)).json();
    expect(entry.revision.document.blocks[0].attrs).toMatchObject({
      target: `entry:${linked.id}`,
      gone: null,
    });
    expect(report.warnings).toContain(
      `native: {"home":"${linked.id}","untouched":"yes"} post:1,post:2`,
    );
    expect(report.warnings).toContain(
      'Settings for the plugin "not-installed" were not imported: it is not active on this site.',
    );
    expect(report.warnings).toContain(
      '1 entry of the type "event" was not imported: the site has no such content type (activate the plugin that adds it, then import again).',
    );
  });
});
