import { beforeAll, describe, expect, it } from 'vitest';
import type { FrescoNode } from '../src/core/model.js';
import { pageCss, pageStyleSettings, PAGE_CONTENT } from '../src/core/page-css.js';
import { uiText } from '../src/core/ui-text.js';
import { registerFreeElements } from '../src/elements/index.js';
import { formatColor, hsvaToRgba, parseColor, rgbaToHsva } from '../src/editor/color.js';
import {
  create,
  createStore,
  readClipboard,
  setTextTranslator,
  topmost,
} from '../src/editor/store.js';
import { find, reorder } from '../src/editor/tree.js';

beforeAll(() => registerFreeElements());

const heading = (id: string): FrescoNode => ({
  id,
  type: 'fresco/heading',
  v: 1,
  attrs: { title: id },
});
const box = (id: string, children: FrescoNode[]): FrescoNode => ({
  id,
  type: 'fresco/container',
  v: 1,
  attrs: {},
  children,
});
const page = () => [
  box('a', [heading('a1'), heading('a2')]),
  box('b', [heading('b1')]),
  box('c', []),
];
const ids = (list: FrescoNode[]): unknown[] =>
  list.map((node) => (node.children ? { [node.id]: ids(node.children) } : node.id));

const storeOf = () => createStore({ blocks: page(), page: {}, readOnly: false });

describe('multi-selection', () => {
  it('adds and removes elements with toggleSelect, the last one being the primary', () => {
    const store = storeOf();
    store.actions.select('a1');
    store.actions.toggleSelect('b1');
    expect(store.get().selection).toEqual(['a1', 'b1']);
    expect(store.get().selected).toBe('b1');
    expect(store.get().view).toBe('element');
    store.actions.toggleSelect('b1');
    expect(store.get().selection).toEqual(['a1']);
    expect(store.get().selected).toBe('a1');
    store.actions.toggleSelect('a1');
    expect(store.get().selection).toEqual([]);
    expect(store.get().selected).toBeNull();
    expect(store.get().view).toBe('elements');
  });

  it('keeps single selection working: select replaces the selection', () => {
    const store = storeOf();
    store.actions.select('a1');
    store.actions.toggleSelect('a2');
    store.actions.select('b1');
    expect(store.get().selection).toEqual(['b1']);
    store.actions.select(null);
    expect(store.get().selection).toEqual([]);
  });

  it('deletes the selection in one undo step, skipping children of selected containers', () => {
    const store = storeOf();
    store.actions.select('a');
    store.actions.toggleSelect('a2');
    store.actions.toggleSelect('b1');
    expect(topmost(store.get().blocks, store.get().selection)).toEqual(['a', 'b1']);
    store.actions.removeMany(store.get().selection);
    expect(ids(store.get().blocks)).toEqual([{ b: [] }, { c: [] }]);
    expect(store.get().selection).toEqual([]);
    expect(store.get().selected).toBeNull();
    store.actions.undo();
    expect(ids(store.get().blocks)).toEqual(ids(page()));
  });

  it('duplicates the selection after each element and selects the copies', () => {
    const store = storeOf();
    store.actions.select('a1');
    store.actions.toggleSelect('b1');
    store.actions.duplicateMany(store.get().selection);
    const { blocks, selection, selected } = store.get();
    expect(blocks[0]!.children!.map((n) => n.attrs.title)).toEqual(['a1', 'a1', 'a2']);
    expect(blocks[1]!.children!.map((n) => n.attrs.title)).toEqual(['b1', 'b1']);
    expect(selection).toHaveLength(2);
    expect(selection).not.toContain('a1');
    expect(selected).toBe(selection[1]);
    expect(find(blocks, selection[0]!)?.attrs.title).toBe('a1');
    store.actions.undo();
    expect(ids(store.get().blocks)).toEqual(ids(page()));
  });

  it('copies several elements in page order and pastes them as new elements', () => {
    const store = storeOf();
    store.actions.select('b1');
    store.actions.toggleSelect('a2');
    store.actions.copyMany(store.get().selection);
    expect(store.get().clipboard?.map((n) => n.id)).toEqual(['a2', 'b1']);
    store.actions.paste('c');
    const blocks = store.get().blocks;
    // Widgets pasted at the top level each get a container.
    expect(blocks).toHaveLength(5);
    expect(blocks[3]!.children![0]!.attrs.title).toBe('a2');
    expect(blocks[4]!.children![0]!.attrs.title).toBe('b1');
    expect(store.get().selection).toHaveLength(2);
  });

  it('reads the clipboard of older versions (one element) and of new ones (a list)', () => {
    expect(readClipboard(heading('x'))?.map((n) => n.id)).toEqual(['x']);
    expect(readClipboard([heading('x'), heading('y')])?.map((n) => n.id)).toEqual(['x', 'y']);
    expect(readClipboard(null)).toBeNull();
    expect(readClipboard([{ nope: true }])).toBeNull();
  });

  it('drops removed elements from the selection', () => {
    const store = storeOf();
    store.actions.select('a1');
    store.actions.toggleSelect('b1');
    store.actions.remove('a');
    expect(store.get().selection).toEqual(['b1']);
    expect(store.get().selected).toBe('b1');
  });
});

describe('repeater reorder', () => {
  const list = ['a', 'b', 'c', 'd'];
  it('moves an item to the slot shown by the drop line', () => {
    expect(reorder(list, 0, 2)).toEqual(['b', 'a', 'c', 'd']);
    expect(reorder(list, 0, 4)).toEqual(['b', 'c', 'd', 'a']);
    expect(reorder(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(reorder(list, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
  });
  it('leaves the list as it is when dropped in place or out of range', () => {
    expect(reorder(list, 1, 1)).toEqual(list);
    expect(reorder(list, 1, 2)).toEqual(list);
    expect(reorder(list, 9, 0)).toEqual(list);
    expect(reorder(list, 0, 99)).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('page settings CSS', () => {
  const options = { titleSelector: 'h1.entry-title', breakpoints: { tablet: 1024, mobile: 767 } };

  it('is empty without settings', () => {
    expect(pageCss({}, options)).toBe('');
  });

  it('keeps the single background color of older pages', () => {
    expect(pageStyleSettings({ background: '#fafafa' })).toMatchObject({
      bg_type: 'classic',
      bg_color: '#fafafa',
    });
    expect(pageCss({ background: '#fafafa' }, options)).toContain('body{background-color:#fafafa}');
  });

  it('paints a gradient background on the body', () => {
    const css = pageCss(
      {
        bg_type: 'gradient',
        bg_color: '#c2410c',
        bg_color_b: 'rgba(14, 116, 144, 0.5)',
        bg_angle: { size: 90, unit: 'deg' },
      },
      options,
    );
    expect(css).toContain(
      'body{background-image:linear-gradient(90deg, #c2410c 0%, rgba(14, 116, 144, 0.5) 100%)}',
    );
    expect(css).toContain('body{min-height:100vh}');
  });

  it('pads the content, per device', () => {
    const css = pageCss(
      {
        padding: { top: 40, right: 20, bottom: 40, left: 20, unit: 'px' },
        'padding@mobile': { top: 10, right: 10, bottom: 10, left: 10, unit: 'px' },
      },
      options,
    );
    expect(css).toContain(`${PAGE_CONTENT}{padding:40px 20px 40px 20px}`);
    expect(css).toContain(`@media (max-width:767px){${PAGE_CONTENT}{padding:10px 10px 10px 10px}}`);
  });

  it('hides the title (never headings of elements) and widens full width pages', () => {
    const css = pageCss({ hideTitle: true, layout: 'full' }, options);
    expect(css).toContain('h1.entry-title:not(.fr-e *){display:none!important}');
    expect(css).toContain('width:100vw');
  });

  it('drops unsafe values', () => {
    const css = pageCss(
      { bg_type: 'classic', bg_color: 'red;}</style><script>', hideTitle: true },
      { ...options, titleSelector: null },
    );
    expect(css).not.toContain('script');
    expect(css).not.toContain('background-color');
  });
});

describe('sample texts of new elements', () => {
  it('are stored in the editor language, and not in English', () => {
    setTextTranslator(null);
    expect(create('fresco/heading')!.attrs.title).toBeUndefined();
    setTextTranslator((text) =>
      text === 'Add your heading here'
        ? 'Aggiungi qui il tuo titolo'
        : text === 'List item'
          ? 'Voce dell’elenco'
          : text === 'Tab'
            ? 'Scheda'
            : text,
    );
    try {
      expect(create('fresco/heading')!.attrs.title).toBe('Aggiungi qui il tuo titolo');
      const list = create('fresco/icon-list')!.attrs.items as { text: string }[];
      expect(list.map((item) => item.text)).toEqual([
        'Voce dell’elenco',
        'Voce dell’elenco',
        'Voce dell’elenco',
      ]);
      const tabs = create('fresco/tabs')!;
      expect(tabs.children!.map((c) => c.attrs._title)).toEqual([
        'Scheda 1',
        'Scheda 2',
        'Scheda 3',
      ]);
    } finally {
      setTextTranslator(null);
    }
  });
});

describe('colors with opacity', () => {
  it('reads hex and rgba values', () => {
    expect(parseColor('#c2410c')).toEqual({ r: 194, g: 65, b: 12, a: 1 });
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#0e749080')).toEqual({ r: 14, g: 116, b: 144, a: 0.5 });
    expect(parseColor('rgba(14, 116, 144, 0.25)')).toEqual({ r: 14, g: 116, b: 144, a: 0.25 });
    expect(parseColor('var(--fr-c-primary)')).toBeNull();
  });
  it('writes hex when opaque and rgba otherwise', () => {
    expect(formatColor({ r: 194, g: 65, b: 12, a: 1 })).toBe('#c2410c');
    expect(formatColor({ r: 194, g: 65, b: 12, a: 0.456 })).toBe('rgba(194, 65, 12, 0.46)');
  });
  it('goes through hue, saturation and value without losing the color', () => {
    for (const value of ['#c2410c', '#0e7490', '#000000', '#ffffff', '#808080']) {
      expect(formatColor(hsvaToRgba(rgbaToHsva(parseColor(value)!)))).toBe(value);
    }
  });
});

describe('labels for visitors', () => {
  it('follow the page language', () => {
    expect(uiText('it-IT', 'Close')).toBe('Chiudi');
    expect(uiText('it', 'Next')).toBe('Successivo');
    expect(uiText('en', 'Previous')).toBe('Previous');
    expect(uiText('de', 'Menu')).toBe('Menu');
  });
});
