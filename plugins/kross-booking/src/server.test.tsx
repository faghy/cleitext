import type { PluginBlockDefinition, PluginContext, PublicAsset } from '@cleitext/plugin-sdk';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import plugin from './server';
import {
  blockFromShortcode,
  newVersion,
  safeUrl,
  validateConfig,
  type KrossConfig,
  type WidgetAttrs,
} from './widget';

type Filter = (value: unknown, context: Record<string, unknown>) => unknown;
type Route = { method: string; path: string; handler: (request: unknown) => Promise<unknown> };

/** The plugin set up against a fake context: what it registered. */
function setUp() {
  const blocks: PluginBlockDefinition<WidgetAttrs, KrossConfig>[] = [];
  const assets: PublicAsset[] = [];
  const filters = new Map<string, Filter>();
  const routes: Route[] = [];
  const stored = new Map<string, unknown>();
  const invalidated: string[][] = [];
  const ctx = {
    blocks: { register: (definition: never) => blocks.push(definition) },
    assets: { enqueue: (asset: PublicAsset) => assets.push(asset), url: (file: string) => file },
    hooks: { filter: (name: string, handler: Filter) => filters.set(name, handler) },
    routes: { api: (route: Route) => routes.push(route) },
    storage: {
      get: async (_siteId: string, key: string) => stored.get(key) ?? null,
      set: async (_siteId: string, key: string, value: unknown) => void stored.set(key, value),
    },
    cache: { invalidate: async (_siteId: string, tags: string[]) => void invalidated.push(tags) },
  } as unknown as PluginContext;
  void plugin.setup(ctx);
  const route = (method: string, path: string) =>
    routes.find((r) => r.method === method && r.path === path)!.handler;
  return { block: blocks[0]!, assets, filters, route, stored, invalidated };
}

const CONFIG: KrossConfig = { hotelId: 'pratonevoso', widgetId: 11, version: 6 };

function render(
  attrs: WidgetAttrs,
  options: { locale?: string; config?: KrossConfig; preview?: boolean } = {},
): string {
  const { block } = setUp();
  const node = block.render({
    attrs,
    data: options.config ?? CONFIG,
    block: { id: 'b1', type: block.type, v: 1, attrs: attrs as Record<string, unknown> },
    context: {
      siteId: 's',
      locale: options.locale ?? 'it-IT',
      page: { route: 'entry', site: { title: '', tagline: '', home: '/' } },
      media: new Map(),
      menus: {},
      ...(options.preview ? { preview: true } : {}),
    },
  });
  return renderToStaticMarkup(createElement(Fragment, null, node));
}

describe('the Kross Booking block', () => {
  it('renders the container of the WordPress shortcode, with the page language', () => {
    expect(render({ room: '0' })).toBe(
      '<div data-lang="it" data-hotel-id="pratonevoso" data-id-room="0" class="kross-container" data-cx-widget="11" data-cx-version="6"></div>',
    );
    expect(render({}, { locale: 'en' })).toContain(
      'data-lang="en" data-hotel-id="pratonevoso" data-id-room="0"',
    );
  });

  it('keeps a language and an address of its own', () => {
    const html = render({ room: '12', lang: 'DE', url: '/prenota' });
    expect(html).toContain('data-lang="de"');
    expect(html).toContain('data-id-room="12"');
    expect(html).toContain('data-url="/prenota" class="kross-container"');
  });

  it('escapes what it writes and drops what is not valid', () => {
    const html = render({ url: 'https://book.example.com/?a=1&b="x"', room: '"><script>' });
    expect(html).not.toContain('<script');
    expect(html).toContain('data-id-room="0"');
    // Quotes make the address invalid; ampersands are escaped.
    expect(html).not.toContain('data-url');
    expect(render({ url: 'https://book.example.com/?a=1&b=2' })).toContain(
      'data-url="https://book.example.com/?a=1&amp;b=2"',
    );
    expect(render({ url: 'javascript:alert(1)' })).not.toContain('data-url');
    expect(render({ lang: 'x' }, { locale: 'fr' })).toContain('data-lang="fr"');
  });

  it('leaves the widget files out until the hotel and widget are set', () => {
    const html = render({}, { config: { hotelId: '', widgetId: null, version: 6 } });
    expect(html).toBe(
      '<div data-lang="it" data-hotel-id="" data-id-room="0" class="kross-container"></div>',
    );
  });

  it('shows a placeholder in an editor preview, with a note when not set', () => {
    const ready = render({ room: '3' }, { preview: true, locale: 'en' });
    expect(ready).toContain('Kross Booking widget — room 3');
    expect(ready).not.toContain('kross-container');
    expect(ready).not.toContain('Settings → Kross Booking');
    const missing = render(
      {},
      { preview: true, config: { hotelId: '', widgetId: null, version: 6 } },
    );
    expect(missing).toContain('Widget Kross Booking — camera 0');
    expect(missing).toContain('Impostazioni → Kross Booking');
  });

  it('adds its loader only to pages with the widget', async () => {
    const { assets } = setUp();
    expect(assets).toHaveLength(1);
    expect(assets[0]!.file).toBe('kross-booking.js');
    const when = (html: string) => assets[0]!.when!({ html } as never);
    expect(await when('<div class="kross-container"></div>')).toBe(true);
    expect(await when('<p>Hello</p>')).toBe(false);
  });
});

describe('settings', () => {
  it('validates the hotel and widget IDs', () => {
    expect(validateConfig({ hotelId: 'pratonevoso', widgetId: '11' }).config).toEqual(CONFIG);
    expect(validateConfig({ hotelId: 'prato nevoso', widgetId: 0 }).errors).toHaveProperty(
      'hotelId',
    );
    expect(validateConfig({ hotelId: 'a"b', widgetId: 1 }).errors).toHaveProperty('hotelId');
    expect(validateConfig({ hotelId: 'ok', widgetId: -3 }).errors).toHaveProperty('widgetId');
    expect(validateConfig({ hotelId: 'ok', widgetId: 1.5 }).errors).toHaveProperty('widgetId');
    expect(validateConfig({ hotelId: 'ok', widgetId: 2, version: 'x' }).errors).toHaveProperty(
      'version',
    );
  });

  it('saves them, and "Refresh the widget" gives a new version', async () => {
    const { route, stored, invalidated } = setUp();
    const bad = (await route('PUT', '/config')({ siteId: 's', body: { hotelId: '../x' } })) as {
      status: number;
    };
    expect(bad.status).toBe(400);
    expect(stored.size).toBe(0);
    await route('PUT', '/config')({ siteId: 's', body: { hotelId: 'pratonevoso', widgetId: 11 } });
    expect(stored.get('config')).toEqual(CONFIG);
    const { body } = (await route('POST', '/refresh')({ siteId: 's' })) as { body: KrossConfig };
    expect(body.version).not.toBe(6);
    expect(body.version).toBeGreaterThan(0);
    expect(stored.get('config')).toEqual({ ...CONFIG, version: body.version });
    expect(invalidated).toEqual([['site'], ['site']]);
    expect(newVersion(5)).not.toBe(5);
  });
});

describe('the [kross-booking] shortcode on import', () => {
  it('becomes the block, with its attributes', async () => {
    const { filters } = setUp();
    const filter = filters.get('import.shortcode')!;
    const blocks = (await filter(null, {
      tag: 'kross-booking',
      attrs: { url: 'https://example.com/book', id: '7', lang: 'EN' },
    })) as { type: string; attrs: unknown }[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('kross-booking/widget');
    expect(blocks[0]!.attrs).toEqual({ room: '7', lang: 'en', url: 'https://example.com/book' });
    expect(await filter(null, { tag: 'other', attrs: {} })).toBeNull();
    // Another plugin's answer is kept.
    expect(await filter(['x'], { tag: 'kross-booking', attrs: {} })).toEqual(['x']);
  });

  it('works without attributes and drops unsafe ones', () => {
    expect(blockFromShortcode({}).attrs).toEqual({ room: '0' });
    expect(blockFromShortcode({ id: '1 OR 1', lang: 'eng', url: 'javascript:x' }).attrs).toEqual({
      room: '0',
    });
    expect(safeUrl('//evil.example')).toBe('');
    expect(safeUrl('prenota')).toBe('prenota');
  });
});
