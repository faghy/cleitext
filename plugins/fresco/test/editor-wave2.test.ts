/**
 * Fresco 2.3, the editor and the Site settings: the complete kit (global
 * fonts, theme style, background, layout, lightbox), structures, user
 * preferences, the system clipboard, the Structure window's signs and keys,
 * History labels, global widgets edited in place, and the canvas's fonts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { documentCss } from '../src/core/css.js';
import { kitCss, normalizeKit, normalizeTheme, pageLayout, themeCss } from '../src/core/kit.js';
import { DEFAULT_BREAKPOINTS, type FrescoNode } from '../src/core/model.js';
import { getElement } from '../src/core/registry.js';
import { registerFreeElements } from '../src/elements/index.js';
import { canvasFontLinks, elementsGoogleFonts, familiesOf } from '../src/editor/canvas-fonts.js';
import {
  decodeClipboard,
  encodeClipboard,
  foreignMedia,
  importMedia,
  remapMedia,
} from '../src/editor/clipboard.js';
import { settingLabel } from '../src/editor/history.js';
import { indicatorsOf, navigatorKey, visibleRows } from '../src/editor/navigator-model.js';
import { elementSource, pluginName } from '../src/editor/plugin-blocks.js';
import {
  clampPanelWidth,
  exitUrl,
  isDark,
  normalizePreferences,
} from '../src/editor/prefs-model.js';
import { imageHtml } from '../src/editor/rich-text.js';
import { responsiveGet, responsiveSet } from '../src/editor/site-settings.js';
import { blocksToSave, createStore } from '../src/editor/store.js';
import { buildStructure, FLEX_PRESETS } from '../src/editor/structures.js';
import { find } from '../src/editor/tree.js';

beforeAll(() => registerFreeElements());

const node = (id: string, type: string, attrs = {}, children?: FrescoNode[]): FrescoNode => ({
  id,
  type,
  v: 1,
  attrs,
  ...(children ? { children } : {}),
});

describe('global fonts', () => {
  it('give their new values as variables, also per device, and a fallback family', () => {
    const css = kitCss(
      normalizeKit({
        fonts: [
          {
            id: 'primary',
            title: 'P',
            family: 'Raleway',
            weight: '700',
            fallback: 'sans-serif',
            decoration: 'underline',
            letter: { size: 1, unit: 'px' },
            word: { size: 2, unit: 'px' },
            devices: { mobile: { size: { size: 14, unit: 'px' }, line: { size: 1.2, unit: '' } } },
          },
        ],
      }),
    );
    expect(css).toContain('--fr-t-primary-family:"Raleway", sans-serif');
    expect(css).toContain('--fr-t-primary-decoration:underline');
    expect(css).toContain('--fr-t-primary-letter:1px;--fr-t-primary-word:2px');
    expect(css).toContain(
      '@media (max-width:767px){:root{--fr-t-primary-size:14px;--fr-t-primary-line:1.2}}',
    );
  });

  it('drop unsafe new values and keep the older ones as they were', () => {
    const kit = normalizeKit({
      fonts: [
        {
          id: 'text',
          title: 'T',
          family: 'Inter',
          weight: '400',
          decoration: 'red;}',
          fallback: 'evil',
          letter: { size: 'x', unit: 'px' },
        },
      ],
    });
    const font = kit.fonts.find((f) => f.id === 'text')!;
    expect(font).toEqual({ id: 'text', title: 'T', family: 'Inter', weight: '400' });
  });

  it('apply all their values to an element only when chosen since 2.3', () => {
    const tree = [
      node('c', 'fresco/container', {}, [
        node('old', 'fresco/heading', { title_typography_global: 'primary' }),
        node('new', 'fresco/heading', {
          title_typography_global: 'primary',
          title_typography_global_all: true,
        }),
      ]),
    ];
    const css = documentCss(tree, getElement, DEFAULT_BREAKPOINTS);
    const rule = (id: string) => css.split('}').find((r) => r.includes(`fr-e-${id} `)) ?? '';
    expect(rule('old')).not.toContain('letter-spacing');
    expect(rule('new')).toContain('letter-spacing:var(--fr-t-primary-letter)');
    expect(rule('new')).toContain('font-style:var(--fr-t-primary-style)');
  });
});

describe('theme style', () => {
  it('writes texts with spacing, decoration and sizes per device', () => {
    const css = themeCss(
      normalizeTheme({
        texts: {
          h2: {
            transform: 'uppercase',
            letter: { size: 2, unit: 'px' },
            line: { size: 1.1, unit: '' },
            devices: { tablet: { size: { size: 30, unit: 'px' } } },
          },
        },
        paragraph: {
          spacing: { size: 1, unit: 'em' },
          devices: { mobile: { size: 8, unit: 'px' } },
        },
        link: { decoration: 'none', hoverDecoration: 'underline', weight: '600' },
      }),
    );
    expect(css).toContain('body h2{text-transform:uppercase;line-height:1.1;letter-spacing:2px}');
    expect(css).toContain('.fr-e p{margin-block-end:1em}');
    expect(css).toContain('.fr-e a:not(.fr-button__link){font-weight:600;text-decoration:none}');
    expect(css).toContain('.fr-e a:not(.fr-button__link):hover{text-decoration:underline}');
    expect(css).toContain('@media (max-width:1024px){body h2{font-size:30px}}');
    expect(css).toContain('@media (max-width:767px){.fr-e p{margin-block-end:8px}}');
  });

  it('gives a global font all its values to a text only with fontAll', () => {
    const fonts = [
      {
        id: 'primary',
        title: 'P',
        family: 'Inter',
        weight: '600',
        letter: { size: 1, unit: 'px' },
      },
    ];
    const old = themeCss(normalizeTheme({ texts: { h1: { font: 'primary' } } }), { fonts });
    const all = themeCss(normalizeTheme({ texts: { h1: { font: 'primary', fontAll: true } } }), {
      fonts,
    });
    expect(old).not.toContain('letter-spacing');
    expect(all).toContain('letter-spacing:var(--fr-t-primary-letter)');
    expect(all).not.toContain('--fr-t-primary-size');
  });

  it('writes buttons with gradients, shadows, hover border and padding per device', () => {
    const css = themeCss(
      normalizeTheme({
        button: {
          background: '#111111',
          backgroundB: '#333333',
          angle: 90,
          hoverBackground: '#000000',
          hoverBorderColor: '#ff0000',
          borderStyle: 'dashed',
          shadow: { x: 0, y: 2, blur: 4, spread: 0, color: 'rgba(0,0,0,0.3)' },
          textShadow: { x: 1, y: 1, blur: 0, spread: 0, color: '#000000' },
          transition: 0.3,
          padding: { mobile: { y: { size: 8, unit: 'px' } } },
        },
      }),
    );
    expect(css).toContain('background-image:linear-gradient(90deg,#111111,#333333)');
    expect(css).toContain('border-style:dashed');
    expect(css).toContain('box-shadow:0px 2px 4px 0px rgba(0,0,0,0.3)');
    expect(css).toContain('text-shadow:1px 1px 0px 0px #000000');
    expect(css).toContain('transition:all 0.3s');
    expect(css).toContain('background-image:none;border-color:#ff0000');
    expect(css).toContain('@media (max-width:767px){.fr-button__link{padding:8px 24px}}');
  });

  it('writes images, form fields with labels, and the lightbox options', () => {
    const css = themeCss(
      normalizeTheme({
        image: { filters: { blur: 2, saturate: 50 }, hoverFilters: { hue: 90 }, transition: 0.5 },
        field: {
          accent: '#c2410c',
          focusBackground: '#ffffff',
          paddingY: { size: 6, unit: 'px' },
          label: { color: '#222222', weight: '700' },
        },
        lightbox: { counter: true, zoom: true, images: false, caption: 'alt', uiColor: '#ffffff' },
      }),
    );
    expect(css).toContain('filter:blur(2px) saturate(50%)');
    expect(css).toContain('.fr-image img:hover{filter:hue-rotate(90deg)}');
    expect(css).toContain('accent-color:#c2410c');
    expect(css).toContain('.frp-form__label,.fr-e label{color:#222222;font-weight:700}');
    expect(css).toContain('padding:6px 12px');
    expect(css).toContain(
      ':root{--fr-lb-images:0;--fr-lb-counter:1;--fr-lb-zoom:1;--fr-lb-caption:alt}',
    );
    expect(css).toContain('.fr-lb__tool{color:#ffffff}');
  });

  it('writes the page background and keeps unsafe images out', () => {
    expect(
      themeCss(
        normalizeTheme({
          background: { type: 'gradient', color: '#ffffff', colorB: '#000000', angle: 45 },
        }),
      ),
    ).toBe(
      'body{background-color:#ffffff;background-image:linear-gradient(45deg,#ffffff,#000000);min-height:100vh}',
    );
    const theme = normalizeTheme({
      background: { image: { url: 'javascript:alert(1)' }, mobileColor: '#123456' },
    });
    expect(theme.background).toEqual({ mobileColor: '#123456' });
  });
});

describe('layout of the kit', () => {
  it('sets the container padding and the widths per device as variables', () => {
    const css = kitCss(
      normalizeKit({
        layout: {
          padding: { top: 20, right: 10, bottom: 20, left: 10, unit: 'px' },
          devices: { mobile: { width: { size: 100, unit: '%' }, gap: { size: 10, unit: 'px' } } },
        },
      }),
    );
    expect(css).toContain('--fr-container-padding:20px 10px 20px 10px');
    expect(css).toContain(
      '@media (max-width:767px){:root{--fr-container-width:100%;--fr-gap:10px}}',
    );
  });

  it('gives pages the default layout of the site, unless they choose theirs', () => {
    const kit = { layout: { pageLayout: 'full' as const } };
    expect(pageLayout({}, kit)).toBe('full');
    expect(pageLayout({ layout: 'canvas' }, kit)).toBe('canvas');
    expect(pageLayout({ layout: 'theme' }, kit)).toBe('');
    expect(pageLayout({}, {})).toBe('');
  });
});

describe('structures', () => {
  it('has Elementor’s twelve, first', () => {
    expect(FLEX_PRESETS.slice(0, 12).map((p) => p.id)).toEqual([
      'c100',
      'r100',
      '50-50',
      '33-66',
      '25-25-25-25',
      '25-50-25',
      '50-50-50-50',
      '50-50-100',
      'c100-c50-50',
      '33-33-33-33-33-33',
      '33-33-33-33-66',
      '66-33-33-66',
    ]);
  });

  it('builds columns with 10px of padding, rows on several lines without a column gap', () => {
    const preset = FLEX_PRESETS.find((p) => p.id === '50-50-100')!;
    const outer = buildStructure(preset)!;
    expect(outer.attrs).toMatchObject({ flex_direction: 'row', flex_wrap: 'wrap' });
    expect(outer.attrs.column_gap).toEqual({ size: 0, unit: 'px' });
    expect(outer.children!.map((c) => (c.attrs.width as { size: number }).size)).toEqual([
      50, 50, 100,
    ]);
    expect(outer.children![0]!.attrs._padding).toMatchObject({ top: 10, left: 10, unit: 'px' });
    const thirds = buildStructure(FLEX_PRESETS.find((p) => p.id === '33-66')!)!;
    expect(thirds.attrs.flex_wrap).toBeUndefined();
    expect((thirds.children![0]!.attrs.width as { size: number }).size).toBe(33.33);
  });

  it('builds a column, a row, and a column beside two stacked ones', () => {
    const column = buildStructure(FLEX_PRESETS[0]!)!;
    expect(column.children).toEqual([]);
    expect(column.attrs.flex_direction).toBeUndefined();
    expect(buildStructure(FLEX_PRESETS[1]!)!.attrs.flex_direction).toBe('row');
    const split = buildStructure(FLEX_PRESETS.find((p) => p.id === 'c100-c50-50')!)!;
    expect(split.children).toHaveLength(2);
    expect(split.children![1]!.children).toHaveLength(2);
    expect(split.children![1]!.attrs._padding).toMatchObject({ top: 0 });
  });
});

describe('user preferences', () => {
  it('keep known values only', () => {
    expect(
      normalizePreferences({
        theme: 'neon',
        exitTo: 'page',
        panelWidth: 9999,
        favorites: ['a/b', 1, 'a/b'],
      }),
    ).toEqual({ theme: 'light', exitTo: 'page', panelWidth: 600, favorites: ['a/b'] });
    expect(clampPanelWidth(Number.NaN)).toBe(300);
  });

  it('say where Exit goes and when the editor is dark', () => {
    const places = { list: '/l', page: '/p', dashboard: '/d' };
    expect(exitUrl('page', places)).toBe('/p');
    expect(exitUrl('page', { ...places, page: null })).toBe('/l');
    expect(exitUrl('dashboard', places)).toBe('/d');
    expect(isDark('auto', true)).toBe(true);
    expect(isDark('light', true)).toBe(false);
    expect(isDark('dark', false)).toBe(true);
  });
});

describe('system clipboard', () => {
  const tree = [
    node('c', 'fresco/container', {}, [
      node('i', 'fresco/image', { image: { id: 'm1', url: '/media/a/photo.jpg' } }),
    ]),
  ];

  it('reads back what it writes, and nothing else', () => {
    const text = encodeClipboard(tree, 'https://a.test');
    expect(decodeClipboard(text)).toEqual({ origin: 'https://a.test', nodes: tree });
    expect(decodeClipboard('hello')).toBeNull();
    expect(decodeClipboard('{"nodes":[]}')).toBeNull();
    expect(
      decodeClipboard(JSON.stringify({ 'cleitext/fresco': 1, nodes: [{ id: 1, type: 'x' }] })),
    ).toBeNull();
  });

  it('points other sites’ media to their site, and copies them when it can', async () => {
    const payload = { origin: 'https://a.test', nodes: tree };
    expect(remapMedia(payload, 'https://a.test')).toBe(tree);
    const moved = remapMedia(payload, 'https://b.test');
    const image = moved[0]!.children![0]!.attrs.image;
    expect(image).toEqual({ url: 'https://a.test/media/a/photo.jpg' });
    expect(foreignMedia(moved, 'https://b.test')).toEqual(['https://a.test/media/a/photo.jpg']);
    const fetcher = (async () =>
      new Response(new Blob(['x'], { type: 'image/jpeg' }))) as unknown as typeof fetch;
    const result = await importMedia(
      moved,
      'https://b.test',
      async (file) => ({ id: 'new', url: `/media/b/${file.name}`, mime: file.type }),
      fetcher,
    );
    expect(result.copied).toBe(1);
    expect(result.nodes[0]!.children![0]!.attrs.image).toEqual({
      id: 'new',
      url: '/media/b/photo.jpg',
    });
    const failing = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    const kept = await importMedia(
      moved,
      'https://b.test',
      async () => ({ id: '', url: '', mime: '' }),
      failing,
    );
    expect(kept).toMatchObject({ copied: 0, failed: 1, nodes: moved });
  });
});

describe('Structure window', () => {
  it('shows signs of hidden, positioned, styled and moving elements', () => {
    const signs = indicatorsOf(
      node('x', 'fresco/heading', {
        _hide_mobile: true,
        _position: 'absolute',
        _custom_css: 'a{}',
        _animation: 'fadeIn',
      }),
      ['desktop', 'tablet', 'mobile'],
    );
    expect(signs.map((s) => s.kind)).toEqual(['hidden', 'position', 'css', 'motion']);
    expect(signs[0]!.devices).toEqual(['mobile']);
    expect(indicatorsOf(node('y', 'fresco/heading'), ['desktop'])).toEqual([]);
  });

  it('moves through the rows with the keyboard', () => {
    const blocks = [
      node('a', 'fresco/container', {}, [
        node('a1', 'fresco/heading'),
        node('a2', 'fresco/heading'),
      ]),
      node('b', 'fresco/container', {}, []),
    ];
    const lookup = (id: string) => find(blocks, id);
    expect(visibleRows(blocks, {})).toEqual(['a', 'a1', 'a2', 'b']);
    expect(visibleRows(blocks, { a: true })).toEqual(['a', 'b']);
    expect(navigatorKey('ArrowDown', 'a2', blocks, {}, lookup)).toEqual({ focus: 'b' });
    expect(navigatorKey('ArrowLeft', 'a1', blocks, {}, lookup)).toEqual({ focus: 'a' });
    expect(navigatorKey('ArrowLeft', 'a', blocks, {}, lookup)).toEqual({ close: 'a' });
    expect(navigatorKey('ArrowRight', 'a', blocks, { a: true }, lookup)).toEqual({ open: 'a' });
    expect(navigatorKey('ArrowRight', 'a', blocks, {}, lookup)).toEqual({ focus: 'a1' });
    expect(navigatorKey('End', 'a', blocks, {}, lookup)).toEqual({ focus: 'b' });
  });
});

describe('History', () => {
  it('names the setting a step changed', () => {
    expect(settingLabel('fresco/heading', 'title')).toBe('Title');
    expect(settingLabel('fresco/heading', 'title_typography_size@mobile')).toBe('Typography');
    expect(settingLabel('fresco/heading', 'nope')).toBeNull();
    const store = createStore({ blocks: [node('h', 'fresco/heading')], page: {}, readOnly: false });
    store.actions.setSettings('h', { title: 'Hi' });
    expect(store.history().done[0]).toMatchObject({ kind: 'edit', setting: 'title' });
  });
});

describe('global widgets edited in place', () => {
  it('save the page with the widget’s element, never its content', () => {
    const template = node('t', 'fresco-pro/template', { template: 'g1' });
    const store = createStore({
      blocks: [node('c', 'fresco/container', {}, [template])],
      page: {},
      readOnly: false,
    });
    const content = node('inner', 'fresco/heading', { title: 'Global' });
    store.actions.beginGlobalEdit('t', { id: 'g1', title: 'Header' }, content);
    expect(find(store.get().blocks, 'inner')).not.toBeNull();
    store.actions.setSettings('inner', { title: 'Changed' });
    expect(find(blocksToSave(store.get()), 't')).toEqual(template);
    expect(find(blocksToSave(store.get()), 'inner')).toBeNull();
    store.actions.endGlobalEdit();
    expect(store.get().globalEdit).toBeNull();
    expect(find(store.get().blocks, 't')).toEqual(template);
    // The history never brings the content back.
    store.actions.undo();
    expect(find(store.get().blocks, 'inner')).toBeNull();
  });
});

describe('editor helpers', () => {
  it('names the plugins of the elements', () => {
    expect(pluginName('kross-booking')).toBe('Kross Booking');
    expect(pluginName('fresco-pro')).toBe('Fresco Pro');
    expect(elementSource('fresco-pro/form')).toBe('fresco-pro');
    expect(elementSource('fresco/block:prisma/heading')).toBe('prisma');
  });

  it('keeps responsive values of the kit per device', () => {
    const size = { size: 20, unit: 'px' };
    const v = responsiveSet({}, 'size', 'tablet', size);
    expect(v).toEqual({ devices: { tablet: { size } } });
    expect(responsiveGet(v, 'size', 'tablet')).toEqual(size);
    expect(responsiveSet(v, 'size', 'tablet', undefined)).toEqual({});
  });

  it('writes images inserted in rich texts safely', () => {
    expect(imageHtml({ url: '/m/a "b".jpg', alt: '<x>', width: 10, height: 5 })).toBe(
      '<img src="/m/a &quot;b&quot;.jpg" alt="&lt;x>" width="10" height="5">',
    );
  });

  it('loads every Google font of the canvas in its own stylesheet', () => {
    expect(familiesOf('"PT Sans", Arial, sans-serif')).toEqual(['PT Sans']);
    expect(
      elementsGoogleFonts([
        node('c', 'fresco/container', {}, [
          node('b', 'fresco/button', { typography_family: 'Raleway' }),
        ]),
      ]),
    ).toEqual(['Raleway']);
    const links = canvasFontLinks(normalizeKit({}), ['Raleway', 'Not A Font', 'Raleway']);
    expect(links).toHaveLength(2);
    expect(links[0]).toContain('family=Inter');
    expect(links[1]).toContain('family=Raleway');
  });
});
