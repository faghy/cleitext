import type {
  PluginContext,
  RenderHookContext,
  RouteRequest,
  RouteResponse,
} from '@cleitext/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';
import { pageCss } from '../src/core/page-css.js';
import { convertDiviTemplate, isDiviTemplate } from '../src/editor/divi-template.js';
import {
  LOCATIONS_KEY,
  importLocations,
  locationMatches,
  locationsToKeep,
  normalizeLocations,
  registerImportedLocations,
} from '../src/imported-locations.js';

const SITE = 'site-1';
const block = (type: string) => ({ id: 'b1', type, v: 1, attrs: {} });
const HEADER = {
  ref: 'post:30',
  title: 'Header (Divi)',
  blocks: [block('fresco/nav-menu')],
  rules: [{ mode: 'include', rule: 'all' }],
};
const FOOTER = {
  ref: 'post:31',
  title: 'Footer (Divi)',
  blocks: [block('fresco/text')],
  rules: [
    { mode: 'include', rule: 'type:page' },
    { mode: 'exclude', rule: 'entry:e2' },
  ],
};

/** A plugin context with storage, cache, hooks and routes. */
function fakeContext() {
  const stored = new Map<string, unknown>();
  const routes = new Map<string, (request: RouteRequest) => Promise<RouteResponse>>();
  let filter: ((value: unknown, context: RenderHookContext) => Promise<unknown>) | null = null;
  const invalidate = vi.fn(async () => {});
  const ctx = {
    storage: {
      get: async (_site: string, key: string) => stored.get(key) ?? null,
      set: async (_site: string, key: string, value: unknown) => void stored.set(key, value),
      delete: async (_site: string, key: string) => void stored.delete(key),
    },
    cache: { invalidate },
    hooks: { filter: (_name: string, fn: typeof filter) => (filter = fn) },
    routes: {
      api: (route: {
        method: string;
        path: string;
        handler: (r: RouteRequest) => Promise<RouteResponse>;
      }) => routes.set(`${route.method} ${route.path}`, route.handler),
    },
  } as unknown as PluginContext;
  registerImportedLocations(ctx);
  const render = (context: Partial<RenderHookContext>) =>
    filter!({ header: { schema: 1, blocks: [] } }, {
      siteId: SITE,
      locale: 'it',
      path: '/',
      tag: () => {},
      route: 'entry',
      ...context,
    } as RenderHookContext) as Promise<Record<string, { blocks: unknown[] }>>;
  const call = (key: string, query: Record<string, string> = {}) =>
    routes.get(key)!({ siteId: SITE, query } as unknown as RouteRequest);
  return { ctx, stored, render, call, invalidate };
}

describe('an imported header and footer (without Fresco Pro)', () => {
  it('are kept unless Fresco Pro imported them as templates', async () => {
    const { ctx, stored, invalidate } = fakeContext();
    expect(
      locationsToKeep(
        { header: HEADER, footer: FOOTER },
        { entries: { 'post:30': 'x' }, terms: {}, media: {} },
      ),
    ).toEqual({
      footer: { title: 'Footer (Divi)', blocks: FOOTER.blocks, rules: FOOTER.rules },
    });
    expect(await importLocations(ctx, SITE, { header: HEADER, footer: FOOTER })).toBe(2);
    expect(Object.keys(stored.get(LOCATIONS_KEY) as object)).toEqual(['header', 'footer']);
    expect(invalidate).toHaveBeenCalled();
    expect(await importLocations(ctx, SITE, null)).toBe(0);
    // Without blocks or rules to include them, nothing is kept.
    expect(
      normalizeLocations({
        header: { blocks: [] },
        footer: { blocks: [block('x')], rules: [{ mode: 'exclude', rule: 'all' }] },
      }),
    ).toEqual({});
  });

  it('show in the theme’s place where their rules choose', async () => {
    const { ctx, render } = fakeContext();
    await importLocations(ctx, SITE, { header: HEADER, footer: FOOTER });
    const page = { id: 'e1', type: 'page', document: { schema: 1, blocks: [] } };
    const out = await render({ entry: page as never });
    expect(out.header!.blocks).toEqual(HEADER.blocks);
    expect(out.footer!.blocks).toEqual(FOOTER.blocks);
    const excluded = await render({ entry: { ...page, id: 'e2' } as never });
    expect(excluded.footer).toBeUndefined();
    const post = await render({ entry: { ...page, type: 'article' } as never });
    expect(post.footer).toBeUndefined();
    // Canvas pages and the editor's frame keep the theme's.
    const canvas = await render({
      entry: {
        ...page,
        document: { schema: 1, blocks: [], editor: { id: 'fresco', data: { layout: 'canvas' } } },
      } as never,
    });
    expect(canvas.header!.blocks).toEqual([]);
    expect((await render({ editorFrame: true })).header!.blocks).toEqual([]);
  });

  it('match the rules of templates', () => {
    const at = (context: Partial<RenderHookContext>) =>
      ({
        siteId: SITE,
        locale: 'it',
        path: '/',
        tag: () => {},
        route: 'entry',
        ...context,
      }) as RenderHookContext;
    const yes = (rule: string, context: Partial<RenderHookContext>) =>
      locationMatches([{ mode: 'include', rule }], at(context));
    expect(yes('front', { isFrontPage: true })).toBe(true);
    expect(yes('singular', {})).toBe(true);
    expect(yes('archive', { route: 'archive' })).toBe(true);
    expect(yes('archive-type:article', { route: 'archive', archive: { type: 'article' } })).toBe(
      true,
    );
    expect(yes('taxonomy:category', { route: 'archive', archive: { taxonomy: 'category' } })).toBe(
      true,
    );
    expect(
      yes('term:category:news', {
        route: 'archive',
        archive: { taxonomy: 'category', term: 'news' },
      }),
    ).toBe(true);
    expect(yes('search', { route: 'search' })).toBe(true);
    expect(yes('404', { route: '404' })).toBe(true);
    expect(yes('in-term:category:news', {})).toBe(false);
  });

  it('are listed and removed in Tools', async () => {
    const { ctx, call, stored } = fakeContext();
    await importLocations(ctx, SITE, { header: HEADER, footer: FOOTER });
    expect((await call('GET /tools/locations')).body).toEqual({
      locations: [
        { kind: 'header', title: 'Header (Divi)' },
        { kind: 'footer', title: 'Footer (Divi)' },
      ],
    });
    await call('DELETE /tools/locations', { kind: 'header' });
    expect(Object.keys(stored.get(LOCATIONS_KEY) as object)).toEqual(['footer']);
    await call('DELETE /tools/locations', { kind: 'footer' });
    expect(stored.has(LOCATIONS_KEY)).toBe(false);
  });
});

describe('pages without space around the content', () => {
  it('remove the theme’s vertical spacing on full width pages only', () => {
    const options = { titleSelector: null, breakpoints: { tablet: 980, mobile: 767 } };
    expect(pageCss({ layout: 'full', flush: true }, options)).toContain('padding-top:0!important');
    expect(pageCss({ flush: true }, options)).toBe('');
  });
});

describe('Divi layout files', () => {
  it('are recognised and converted, with their presets and global colors', () => {
    const file = {
      context: 'et_builder_layouts',
      data: {
        '12': {
          post_title: 'Hero',
          post_content:
            '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_text _module_preset="p" text_text_color="gcid-aaaaaaaa-1"]Hi[/et_pb_text][et_pb_image src="https://old.example/a.jpg"][/et_pb_image][et_pb_testimonial]Nice[/et_pb_testimonial][/et_pb_column][/et_pb_row][/et_pb_section][et_pb_section][/et_pb_section]',
        },
        '13': 'not a layout',
      },
      presets: { et_pb_text: { presets: { p: { settings: { text_font_size: '20px' } } } } },
      global_colors: [['gcid-aaaaaaaa-1', { color: '#123456' }]],
    };
    expect(isDiviTemplate(file)).toBe(true);
    expect(isDiviTemplate({ context: 'other', data: {} })).toBe(false);
    expect(isDiviTemplate([])).toBe(false);
    const converted = convertDiviTemplate(file);
    expect(converted).toMatchObject({
      title: 'Hero',
      kind: 'page',
      unconverted: 1,
      externalImages: 1,
    });
    const text = JSON.stringify(converted.blocks);
    expect(text).toContain('"color":"#123456"');
    expect(text).toContain('"typography_size":{"size":20,"unit":"px"}');
    const plain = convertDiviTemplate({
      context: 'et_builder',
      data: {
        a: '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_text]x[/et_pb_text][/et_pb_column][/et_pb_row][/et_pb_section]',
      },
    });
    expect(plain).toMatchObject({ title: '', kind: 'section' });
  });
});
