import { describe, expect, it, vi } from 'vitest';
import { LocalFonts, type FontStore, type HttpSend } from '@cleitext/design/font-copies';
import { fontLink } from '@cleitext/design/fonts';
import { blockFontItems, canvasSheets } from '../src/editor/fonts';
import {
  fontItem,
  fontWeights,
  googleCssUrl,
  googleFontsLink,
  pageFonts,
} from '../src/lib/extensions';
import { normalizeGlobals } from '../src/lib/globals';

const WOFF2 = 'd09GMgABAAAAAAAA'; // "wOF2" and a few bytes, base64
const SITE = '00000000-0000-4000-8000-000000000001';
const ROUTE = '/_prisma/gfonts';

function memoryStore(): FontStore {
  const files = new Map<string, { mime: string; data: string }>();
  const sets = new Map<string, string>();
  return {
    getSet: async (siteId, key) => sets.get(`${siteId}|${key}`) ?? null,
    setSet: async (siteId, key, css) => void sets.set(`${siteId}|${key}`, css),
    existing: async (siteId, names) =>
      new Set(names.filter((name) => files.has(`${siteId}|${name}`))),
    put: async (siteId, name, mime, data) =>
      void files.set(`${siteId}|${name}`, {
        mime,
        data: 'base64' in data ? data.base64 : data.text,
      }),
    get: async (siteId, name) => {
      const file = files.get(`${siteId}|${name}`);
      return file ? { mime: file.mime, bytes: new TextEncoder().encode(file.data) } : null;
    },
  };
}

const page = (fonts: string, head = '') =>
  `<html><head>${head}</head><body><h2 class="pr-block-x" data-pr-fonts="${fonts}">x</h2></body></html>`;

describe('Google fonts of Prisma’s blocks', () => {
  it('are kept on the site unless the settings say otherwise, for old sites too', () => {
    expect(normalizeGlobals({}).googleFonts).toBe('local');
    expect(normalizeGlobals(null).googleFonts).toBe('local');
    expect(normalizeGlobals({ googleFonts: 'google' }).googleFonts).toBe('google');
    expect(normalizeGlobals({ googleFonts: 'none' }).googleFonts).toBe('none');
    expect(normalizeGlobals({ googleFonts: 'cdn' }).googleFonts).toBe('local');
  });

  it('ask Google for the same styles as before, one family at a time for the copies', () => {
    const html = page('Poiret One|Lora:600') + page('Lora:300|bad!name');
    expect(googleFontsLink(html)).toBe(
      'https://fonts.googleapis.com/css2?family=Lora:wght@300;400;600;700&family=Poiret+One:wght@400;700&display=swap',
    );
    expect([...pageFonts(html)]).toEqual([
      ['Lora', ['300', '400', '600', '700']],
      ['Poiret One', ['400', '700']],
    ]);
    expect(googleCssUrl([fontItem('Poiret One', ['400', '700'])])).toBe(
      'https://fonts.googleapis.com/css2?family=Poiret+One:wght@400;700&display=swap',
    );
    expect(googleCssUrl(['Evil:x', 'a"b:400'])).toBeNull();
    expect(googleFontsLink('<p>none</p>')).toBeNull();
  });

  it('are copied with Prisma’s route, never linking Google', async () => {
    const calls: string[] = [];
    const http: HttpSend = async (request) => {
      calls.push(request.url);
      const url = new URL(request.url);
      if (url.hostname === 'fonts.googleapis.com') {
        return {
          status: 200,
          type: 'text/css',
          text: "@font-face{font-family:'Poiret One';src:url(https://fonts.gstatic.com/s/poiretone/v1/a.woff2) format('woff2')}",
        };
      }
      return { status: 200, type: 'font/woff2', text: '', base64: WOFF2 };
    };
    const store = memoryStore();
    const onReady = vi.fn();
    const fonts = new LocalFonts({
      http,
      store,
      log: { debug() {}, info() {}, warn: vi.fn(), error() {} },
      onReady,
      route: ROUTE,
      cssUrl: (item) => googleCssUrl([item]),
      label: 'Prisma',
    });
    const [sheet] = await fonts.sheets(SITE, ['Poiret One:400;700'], 1000);
    expect(sheet!.family).toBe('Poiret One:400;700');
    expect(sheet!.href).toMatch(/^\/_prisma\/gfonts\/[a-f0-9]{32}\.css$/);
    expect(calls[0]).toBe(
      'https://fonts.googleapis.com/css2?family=Poiret+One:wght@400;700&display=swap',
    );
    const css = await store.get(SITE, sheet!.href.slice(ROUTE.length + 1));
    expect(new TextDecoder().decode(css!.bytes)).toMatch(
      /url\(\/_prisma\/gfonts\/[a-f0-9]{32}\.woff2\)/,
    );
    expect(onReady).toHaveBeenCalledWith(SITE);
  });
});

describe('Google fonts in the editor’s canvas', () => {
  const blocks = [
    {
      name: 'prisma/container',
      attributes: {},
      innerBlocks: [
        {
          name: 'prisma/heading',
          attributes: { headLoadGoogleFonts: true, headFontFamily: 'Lora', headFontWeight: '600' },
          innerBlocks: [],
        },
        {
          name: 'core/paragraph',
          attributes: { loadGoogleFonts: true, fontFamily: 'Karla' },
          innerBlocks: [],
        },
      ],
    },
  ];
  const href = `${ROUTE}/${'c'.repeat(32)}.css`;

  it('finds the fonts of Prisma’s blocks, nested too, as on the site', () => {
    expect(blockFontItems(blocks)).toEqual(['Lora:600']);
    expect([...fontWeights(['Lora:600'])]).toEqual([['Lora', ['400', '600', '700']]]);
  });

  it('uses the site’s copies when the site does, Google only when it does, none with “Don’t load”', () => {
    expect(canvasSheets('local', ['Lora:600'], { Lora: href })).toEqual([href]);
    expect(canvasSheets('local', ['Lora:600'], { Lora: null })).toEqual([]);
    expect(canvasSheets('google', ['Lora:600'], {})).toEqual([
      'https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&display=swap',
    ]);
    expect(canvasSheets('none', ['Lora:600'], { Lora: href })).toEqual([]);
  });

  it('link markup Fresco recognises as loaded', () => {
    expect(fontLink(href, 'Lora')).toContain('data-font-family="Lora"');
  });
});
