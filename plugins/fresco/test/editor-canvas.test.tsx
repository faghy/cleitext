/**
 * The editor's canvas logic that needs no browser: the CSS changed for the
 * canvas (content column, elements hidden on a device), the device cycle of
 * Ctrl+Shift+M, the texts edited in place, the virtual grid of the libraries
 * and the labels of select options.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { withDefaults } from '../src/core/css.js';
import { DEFAULT_KIT, kitCss } from '../src/core/kit.js';
import {
  DEFAULT_BREAKPOINTS,
  type Control,
  type FrescoNode,
  type RenderContext,
} from '../src/core/model.js';
import { pageCss, PAGE_CONTENT } from '../src/core/page-css.js';
import { getElement } from '../src/core/registry.js';
import { registerFreeElements } from '../src/elements/index.js';
import { optionLabel } from '../src/editor/controls.js';
import { editorKitCss, editorPageCss, hiddenOn, nextDevice } from '../src/editor/frame-css.js';
import {
  INLINE_FIELDS,
  inlineChange,
  inlineControl,
  inlineFields,
  inlineKey,
  inlineValue,
  parseInlineKey,
} from '../src/editor/inline.js';
import {
  controlShown,
  hasHoverView,
  isHoverOnly,
  parentLayout,
} from '../src/editor/panel-filter.js';
import { gridWindow } from '../src/editor/virtual-grid.js';

beforeAll(() => registerFreeElements());

const context: RenderContext = {
  media: new Map(),
  locale: 'en',
  editing: true,
  site: { title: '', tagline: '', home: '/' },
};

describe('canvas CSS', () => {
  it('aims the page padding at the theme element marked in the canvas', () => {
    const css = pageCss(
      { padding: { top: '10', right: '0', bottom: '10', left: '0', unit: 'px' } },
      { titleSelector: null, breakpoints: DEFAULT_BREAKPOINTS },
    );
    expect(css).toContain(PAGE_CONTENT);
    const editor = editorPageCss(css);
    expect(editor).not.toContain(PAGE_CONTENT);
    expect(editor).toContain('[data-fre-content]{padding:');
  });

  it('fades the elements hidden on a device instead of removing them', () => {
    const css = kitCss(DEFAULT_KIT);
    expect(css).toContain('.fr-hide-tablet{display:none!important}');
    const editor = editorKitCss(css);
    expect(editor).not.toContain('display:none!important');
    expect(editor).toMatch(/\.fr-hide-tablet\{opacity:\.45/);
    expect(editor).toMatch(/\.fr-hide-desktop\{opacity:\.45/);
    expect(hiddenOn({ _hide_mobile: true }, 'mobile')).toBe(true);
    expect(hiddenOn({ _hide_mobile: true }, 'tablet')).toBe(false);
  });
});

describe('Ctrl+Shift+M', () => {
  it('goes through every active device, then back', () => {
    const order = ['desktop'];
    let device = nextDevice('desktop', DEFAULT_BREAKPOINTS);
    while (device !== 'desktop' && order.length < 10) {
      order.push(device);
      device = nextDevice(device, DEFAULT_BREAKPOINTS);
    }
    expect(order).toEqual(['desktop', 'tablet', 'mobile']);
  });

  it('includes the extra breakpoints a site turned on', () => {
    const breakpoints = { ...DEFAULT_BREAKPOINTS, laptop: 1366, widescreen: 2400 };
    const seen = new Set<string>();
    let device = nextDevice('desktop', breakpoints);
    for (let i = 0; i < 6; i++) {
      seen.add(device);
      device = nextDevice(device, breakpoints);
    }
    expect([...seen].sort()).toEqual(['desktop', 'laptop', 'mobile', 'tablet', 'widescreen']);
  });
});

describe('texts edited in place', () => {
  const node = (type: string, attrs = {}, children?: FrescoNode[]): FrescoNode => ({
    id: 'el',
    type,
    v: 1,
    attrs,
    ...(children ? { children } : {}),
  });

  it('names only real text settings of the elements described', () => {
    for (const [type, fields] of Object.entries(INLINE_FIELDS)) {
      const definition = getElement(type);
      if (!definition) continue; // Fresco Pro's.
      expect(inlineFields(definition)).toBe(fields);
      for (const field of fields)
        expect(inlineKey(definition, field, 0), `${type} ${field.setting}`).not.toBeNull();
    }
  });

  it('finds the described texts in the markup the elements render', () => {
    for (const type of [
      'fresco/icon-box',
      'fresco/alert',
      'fresco/testimonial',
      'fresco/icon-list',
    ]) {
      const definition = getElement(type)!;
      const element = node(type);
      const html = renderToStaticMarkup(
        <>
          {definition.render({
            node: element,
            settings: withDefaults(definition, element.attrs),
            context,
          })}
        </>,
      );
      for (const field of INLINE_FIELDS[type]!) {
        const name = /^\.([\w-]+)/.exec(field.selector)![1]!;
        expect(html, `${type} ${field.selector}`).toContain(name);
      }
    }
  });

  it('reads and writes a setting, an item of a list and the title of a tab', () => {
    const box = node('fresco/icon-box', { title: 'Old' });
    const definition = getElement('fresco/icon-box')!;
    const key = parseInlineKey('title')!;
    expect(inlineControl(definition, key)?.type).toBe('text');
    expect(inlineValue(box, withDefaults(definition, box.attrs), key)).toBe('Old');
    expect(inlineChange(box, box.attrs, key, 'New')).toEqual({
      id: 'el',
      changes: { title: 'New' },
    });

    const listDefinition = getElement('fresco/icon-list')!;
    const list = node('fresco/icon-list');
    const settings = withDefaults(listDefinition, list.attrs);
    const item = parseInlineKey('items.1.text')!;
    expect(item).toEqual({ kind: 'item', name: 'items', index: 1, field: 'text' });
    expect(inlineControl(listDefinition, item)).not.toBeNull();
    const change = inlineChange(list, settings, item, 'Second');
    const items = change!.changes.items as { text: string }[];
    expect(items[1]!.text).toBe('Second');
    expect(items[0]!.text).toBe((settings.items as { text: string }[])[0]!.text);
    expect(inlineChange(list, settings, { ...item, index: 99 } as typeof item, 'x')).toBeNull();

    const tab = parseInlineKey('[1]._title')!;
    const tabs = node('fresco/tabs', {}, [
      { id: 'one', type: 'fresco/container', v: 1, attrs: { _title: 'One' } },
      { id: 'two', type: 'fresco/container', v: 1, attrs: { _title: 'Two' } },
    ]);
    expect(inlineValue(tabs, {}, tab)).toBe('Two');
    expect(inlineChange(tabs, {}, tab, 'Deux')).toEqual({ id: 'two', changes: { _title: 'Deux' } });
  });

  it('refuses keys that are not texts', () => {
    const definition = getElement('fresco/icon-box')!;
    expect(inlineControl(definition, parseInlineKey('icon')!)).toBeNull();
    expect(inlineKey(definition, { selector: '.x', setting: 'icon' }, 0)).toBeNull();
    expect(parseInlineKey('bad key')).toBeNull();
  });
});

describe('virtual grid', () => {
  it('draws only the rows in view, with rows of a fixed height', () => {
    const view = gridWindow({
      width: 870,
      height: 500,
      scrollTop: 0,
      count: 2000,
      minCell: 92,
      gap: 10,
      rowHeight: 84,
      overscan: 2,
    });
    expect(view.columns).toBe(8);
    expect(view.rowHeight).toBe(84);
    expect(view.start).toBe(0);
    expect(view.end).toBeLessThan(120);
    expect(view.total).toBe(250 * 94 - 10);
  });

  it('follows the scroll, and makes square cells from the column width', () => {
    const view = gridWindow({
      width: 530,
      height: 400,
      scrollTop: 1300,
      count: 100,
      minCell: 120,
      gap: 10,
      rowHeight: (cell) => cell,
      overscan: 1,
    });
    expect(view.columns).toBe(4);
    expect(view.rowHeight).toBe(125);
    // Row 9 (1215–1340) is the first in view: the window starts one row above it.
    expect(view.start).toBe(8 * 4);
    expect(view.offset).toBe(8 * 135);
    expect(view.end).toBe(14 * 4);
  });
});

describe('select options', () => {
  it('turns raw values used as labels into words', () => {
    expect(optionLabel({ value: 'bottom-left', label: 'bottom-left' })).toBe('Bottom left');
    expect(optionLabel({ value: 'top', label: 'top' })).toBe('Top');
    expect(optionLabel({ value: 'slide_up', label: 'slide_up' })).toBe('Slide up');
    expect(optionLabel({ value: 'top', label: 'Above' })).toBe('Above');
    expect(optionLabel({ value: 'H2', label: 'H2' })).toBe('H2');
  });
});

describe('panel: Normal and Hover, flex and grid items', () => {
  const control = (name: string, hover?: boolean) =>
    ({ name, type: 'slider', label: name, ...(hover ? { hover } : {}) }) as Control;

  it('shows the hover-only settings in the Hover view only', () => {
    for (const name of [
      '_border_hover',
      '_shadow_hover',
      '_border_hover_transition',
      '_background_hover',
      '_background_hover_transition',
      'border_hover',
      'shadow_hover',
      'background_hover_transition',
    ]) {
      expect(isHoverOnly({ name }), name).toBe(true);
      expect(controlShown(control(name), { hover: false, layout: 'flex' }), name).toBe(false);
      expect(controlShown(control(name), { hover: true, layout: 'flex' }), name).toBe(true);
    }
    expect(isHoverOnly({ name: 'button_background_hover' })).toBe(false);
    // Normal settings: in Normal; those with a hover value: in both.
    expect(controlShown(control('_border'), { hover: false, layout: null })).toBe(true);
    expect(controlShown(control('_border'), { hover: true, layout: null })).toBe(false);
    expect(controlShown(control('color', true), { hover: true, layout: null })).toBe(true);
    expect(hasHoverView([control('_border'), control('_border_hover')])).toBe(true);
    expect(hasHoverView([control('_border')])).toBe(false);
  });

  it('shows the item fields of the parent layout only', () => {
    const flex = { hover: false, layout: 'flex' as const };
    const grid = { hover: false, layout: 'grid' as const };
    const page = { hover: false, layout: null };
    expect(controlShown(control('_flex_size'), flex)).toBe(true);
    expect(controlShown(control('_flex_size'), grid)).toBe(false);
    expect(controlShown(control('_align_self'), page)).toBe(false);
    expect(controlShown(control('_grid_column'), grid)).toBe(true);
    expect(controlShown(control('_grid_row_custom'), flex)).toBe(false);
    expect(controlShown(control('_margin'), page)).toBe(true);
    const box = (attrs: Record<string, unknown>): FrescoNode => ({
      id: 'p',
      type: 'fresco/container',
      v: 1,
      attrs,
      children: [],
    });
    expect(parentLayout(box({}))).toBe('flex');
    expect(parentLayout(box({ container_type: 'grid' }))).toBe('grid');
    expect(parentLayout(null)).toBeNull();
    expect(parentLayout({ ...box({}), type: 'fresco/tabs' })).toBeNull();
  });
});
