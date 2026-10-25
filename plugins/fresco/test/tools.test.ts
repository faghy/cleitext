import type { PluginContext, PluginEntry, RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';
import { systemReport, systemSections } from '../src/system-report.js';
import {
  registerTools,
  replaceInValue,
  systemInfo,
  validUrl,
  type ReplaceStore,
} from '../src/tools.js';

const SITE = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';

const doc = (blocks: unknown[], data?: Record<string, unknown>) => ({
  schema: 1,
  blocks,
  editor: { id: 'fresco', ...(data ? { data } : {}) },
});

const entry = (id: string, type: string, document: unknown, title = id): PluginEntry =>
  ({ id, type, title, status: 'published', document }) as unknown as PluginEntry;

/** A plugin context with the routes and content the tools use. */
function fakeContext(
  entries: PluginEntry[],
  stored: Record<string, unknown> = {},
  stores?: ReplaceStore[],
) {
  const routes = new Map<string, (request: RouteRequest) => Promise<RouteResponse>>();
  const update = vi.fn(async () => {});
  const set = vi.fn(async (_site: string, key: string, value: unknown) => {
    stored[key] = value;
  });
  const invalidate = vi.fn(async () => {});
  const ctx = {
    storage: { get: async (_site: string, key: string) => stored[key] ?? null, set },
    cache: { invalidate },
    plugin: { slug: 'fresco', version: '2.1.0' },
    site: async () => ({ id: SITE, name: 'Demo', defaultLocale: 'it', locales: ['it', 'en'] }),
    content: {
      // Like the core: every query may return the same entries again.
      find: async (_site: string, query: { type?: string }) =>
        entries.filter((e) => !query.type || e.type === query.type),
      update,
    },
    routes: {
      api: (route: {
        method: string;
        path: string;
        handler: (request: RouteRequest) => Promise<RouteResponse>;
      }) => routes.set(`${route.method} ${route.path}`, route.handler),
    },
  } as unknown as PluginContext;
  const regenerate = vi.fn(async () => {});
  registerTools(ctx, { regenerate, ...(stores ? { stores } : {}) });
  const call = (key: string, body?: unknown, user: unknown = { id: USER }) =>
    routes.get(key)!({ siteId: SITE, body, user } as unknown as RouteRequest);
  return { call, update, regenerate, set, invalidate, stored };
}

describe('replacing an address in Fresco documents', () => {
  it('accepts only http(s) addresses, without the final slash', () => {
    expect(validUrl(' https://old.example.com/ ')).toBe('https://old.example.com');
    expect(validUrl('http://old.example.com/path')).toBe('http://old.example.com/path');
    expect(validUrl('ftp://old.example.com')).toBeNull();
    expect(validUrl('https://a b.com')).toBeNull();
    expect(validUrl('javascript:alert(1)')).toBeNull();
    expect(validUrl(42)).toBeNull();
  });

  it('replaces in every string, keeps keys and other values, counts each one', () => {
    const value = {
      blocks: [
        {
          id: 'a',
          attrs: {
            link: { url: 'http://old.test/contact' },
            html: '<a href="http://old.test/">x</a> and http://old.test/b',
            size: 3,
          },
        },
      ],
      'http://old.test': true,
    };
    const { value: next, count } = replaceInValue(value, 'http://old.test', 'https://new.test');
    expect(count).toBe(3);
    expect(next.blocks[0]!.attrs.link.url).toBe('https://new.test/contact');
    expect(next.blocks[0]!.attrs.html).toBe(
      '<a href="https://new.test/">x</a> and https://new.test/b',
    );
    expect(next.blocks[0]!.attrs.size).toBe(3);
    expect(next['http://old.test']).toBe(true);
  });

  it('returns the same value when nothing matches', () => {
    const value = { a: ['x', { b: 'y' }] };
    expect(replaceInValue(value, 'http://old.test', 'https://new.test')).toEqual({
      value,
      count: 0,
    });
  });

  it('counts first, then replaces only Fresco documents, once each', async () => {
    const page = entry(
      'p1',
      'page',
      doc([{ id: 'x', attrs: { image: { url: 'http://old.test/a.jpg' } } }], {
        background: 'http://old.test/bg.jpg',
      }),
    );
    const template = entry(
      't1',
      'fresco_template',
      doc([{ id: 'y', attrs: { url: 'http://old.test' } }]),
    );
    const blocks = entry('b1', 'page', { schema: 1, blocks: [{ text: 'http://old.test' }] });
    const tools = fakeContext([page, template, blocks]);

    const counted = await tools.call('POST /tools/replace-url', {
      from: 'http://old.test/',
      to: 'https://new.test',
    });
    expect(counted.body).toEqual({
      replaced: 3,
      dryRun: true,
      entries: [
        { id: 'p1', title: 'p1', count: 2 },
        { id: 't1', title: 't1', count: 1 },
      ],
    });
    expect(tools.update).not.toHaveBeenCalled();

    const done = await tools.call('POST /tools/replace-url', {
      from: 'http://old.test',
      to: 'https://new.test',
      dryRun: false,
    });
    expect((done.body as { replaced: number }).replaced).toBe(3);
    expect(tools.update).toHaveBeenCalledTimes(2);
    expect(tools.update).toHaveBeenCalledWith(
      SITE,
      'p1',
      {
        document: doc([{ id: 'x', attrs: { image: { url: 'https://new.test/a.jpg' } } }], {
          background: 'https://new.test/bg.jpg',
        }),
      },
      { userId: USER },
    );
    expect(tools.regenerate).toHaveBeenCalledWith(SITE);
  });

  it('also replaces in the imported header and footer, the kit and the components', async () => {
    const old = 'https://ilpescepazzo.it/wp-content/uploads';
    const footer = {
      footer: {
        title: 'Footer',
        rules: [{ mode: 'include', rule: 'all' }],
        blocks: [{ id: 'f', attrs: { content: `<img src="${old}/2026/07/dueclic-288x300.png">` } }],
      },
    };
    const stores: ReplaceStore[] = [
      { key: 'imported-locations', title: 'Imported header and footer', tags: ['loc'] },
      { key: 'kit', title: 'Site settings', tags: ['kit'] },
      { key: 'components', title: 'Components', tags: ['comp'] },
      { key: 'missing', title: 'Nothing', tags: ['none'] },
    ];
    const tools = fakeContext(
      [entry('p1', 'page', doc([{ id: 'x', attrs: { image: { url: `${old}/a.jpg` } } }]))],
      {
        'imported-locations': footer,
        kit: { logo: { url: `${old}/logo.png` }, css: `body{background:url(${old}/bg.png)}` },
        components: { items: [{ id: 'c1', blocks: [] }] },
      },
      stores,
    );
    const counted = await tools.call('POST /tools/replace-url', {
      from: old,
      to: 'https://ilpescepazzo.it/media/site',
    });
    expect(counted.body).toEqual({
      replaced: 4,
      dryRun: true,
      entries: [
        { id: 'p1', title: 'p1', count: 1 },
        {
          id: 'storage:imported-locations',
          title: 'Imported header and footer',
          count: 1,
          stored: true,
        },
        { id: 'storage:kit', title: 'Site settings', count: 2, stored: true },
      ],
    });
    expect(tools.set).not.toHaveBeenCalled();
    expect(tools.invalidate).not.toHaveBeenCalled();

    await tools.call('POST /tools/replace-url', {
      from: old,
      to: 'https://ilpescepazzo.it/media/site',
      dryRun: false,
    });
    expect(tools.set).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(tools.stored)).not.toContain('/wp-content/');
    expect(
      (tools.stored['imported-locations'] as typeof footer).footer.blocks[0]!.attrs.content,
    ).toBe('<img src="https://ilpescepazzo.it/media/site/2026/07/dueclic-288x300.png">');
    expect(tools.invalidate).toHaveBeenCalledWith(SITE, ['loc', 'kit']);
    expect(tools.regenerate).toHaveBeenCalledWith(SITE);
  });

  it('refuses bad or equal addresses with a message for the admin', async () => {
    const tools = fakeContext([]);
    const bad = await tools.call('POST /tools/replace-url', { from: 'old', to: 'https://x.test' });
    expect(bad.status).toBe(400);
    expect((bad.body as { detail: string }).detail).toMatch(/http/);
    const same = await tools.call('POST /tools/replace-url', {
      from: 'https://x.test',
      to: 'https://x.test/',
    });
    expect(same.status).toBe(400);
  });

  it('regenerates the CSS on request', async () => {
    const tools = fakeContext([]);
    expect((await tools.call('POST /tools/regenerate-css')).body).toEqual({ ok: true });
    expect(tools.regenerate).toHaveBeenCalledWith(SITE);
  });
});

describe('system info', () => {
  it('reports Fresco, the plugin API, Node and the site from the endpoint', async () => {
    const tools = fakeContext([
      entry('p1', 'page', doc([])),
      entry('a1', 'article', doc([])),
      entry('t1', 'fresco_template', doc([])),
      entry('b1', 'page', { schema: 1, blocks: [] }),
    ]);
    const info = (await tools.call('GET /system')).body as ReturnType<typeof systemInfo>;
    expect(info.fresco).toEqual({ version: '2.1.0', pages: 2, templates: 1 });
    expect(info.pluginApi).toMatch(/^\d+\.\d+\.\d+$/);
    expect(info.node).toBe((globalThis as { process?: { version: string } }).process?.version);
    expect(info.memory?.rss).toBeGreaterThan(0);
    expect(info.site).toEqual({ name: 'Demo', defaultLocale: 'it', locales: ['it', 'en'] });
  });

  it('works without a process (no Node details)', () => {
    const info = systemInfo({
      version: '2.1.0',
      entries: [],
      site: { name: 'x', defaultLocale: 'en', locales: ['en'] },
    });
    expect(info.node).toBeNull();
    expect(info.memory).toBeNull();
  });

  it('becomes text to paste, with what the user may see', () => {
    const fresco = systemInfo({
      version: '2.1.0',
      entries: [{ type: 'page' }],
      site: { name: 'Demo', defaultLocale: 'it', locales: ['it'] },
    });
    const sections = systemSections(
      {
        fresco,
        core: null,
        plugins: [
          { slug: 'fresco', name: 'Fresco', version: '2.1.0', active: true, status: 'loaded' },
          {
            slug: 'fresco-pro',
            name: 'Fresco Pro',
            version: '2.2.0',
            active: true,
            status: 'loaded',
          },
          { slug: 'seo', name: 'SEO', version: '1.0.0', active: false, status: 'loaded' },
        ],
        themes: [{ slug: 'zenit', name: 'Zenit', version: '1.4.0', active: true }],
      },
      (text) => text,
    );
    const text = systemReport(sections);
    expect(text).toContain('### Server\nCleitext: —');
    expect(text).toContain('Fresco Pro: 2.2.0');
    expect(text).toContain('Active theme: Zenit 1.4.0');
    expect(text).toContain('Pages made with Fresco: 1');
    expect(text).not.toContain('SEO');
  });
});
