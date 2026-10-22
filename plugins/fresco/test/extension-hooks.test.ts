/**
 * The editor extension hooks of Fresco 2.5: top bar items, shortcuts,
 * canvas overlays and right-click menu items, without a browser.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extensions,
  resetExtensions,
  type EditorContext,
  type EditorShortcut,
} from '../src/core/extensions.js';
import type { FrescoNode } from '../src/core/model.js';
import {
  contextMenuItemsOf,
  createEditorContext,
  matchesKeys,
  overlayIds,
  parseKeys,
  refreshExtensions,
  runExtensionShortcut,
  shortcutFor,
  shortcutGroups,
  topbarItemsOf,
} from '../src/editor/extension-hooks.js';
import { createStore } from '../src/editor/store.js';

const key = (
  k: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean; code: string }> = {},
) => ({
  key: k,
  code: mods.code ?? '',
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

const node = (id: string, type = 'fresco/heading'): FrescoNode =>
  ({ id, type, v: 1, attrs: {} }) as unknown as FrescoNode;

function fakeEditor(): EditorContext {
  return {
    entry: { id: 'e1', type: 'page', locale: 'en' },
    readOnly: () => false,
    selected: () => null,
    select: () => {},
    node: () => null,
    canvas: () => null,
    reveal: () => {},
    refresh: () => {},
    notify: () => {},
  };
}

afterEach(() => {
  resetExtensions();
  vi.restoreAllMocks();
});

describe('extension lists', () => {
  it('has the four new hooks, emptied with the others', () => {
    const all = extensions();
    expect(all.topbarItems).toEqual([]);
    expect(all.shortcuts).toEqual([]);
    expect(all.canvasOverlays).toEqual([]);
    expect(all.contextMenuItems).toEqual([]);
    all.topbarItems.push({ id: 'a', label: 'A', icon: 'M0 0', onClick() {} });
    all.shortcuts.push({ id: 's', keys: 'Shift+C', label: 'S', run() {} });
    resetExtensions();
    expect(extensions().topbarItems).toEqual([]);
    expect(extensions().shortcuts).toEqual([]);
  });

  it('adds them to lists made by an older copy of Fresco', () => {
    const holder = globalThis as unknown as Record<symbol, Record<string, unknown>>;
    const all = holder[Symbol.for('cleitext.fresco.extensions')]!;
    delete all.canvasOverlays;
    delete all.contextMenuItems;
    expect(extensions().canvasOverlays).toEqual([]);
    expect(extensions().contextMenuItems).toEqual([]);
  });
});

describe('shortcut keys', () => {
  it('reads modifiers and named keys', () => {
    expect(parseKeys('Ctrl+Shift+C')).toEqual({ ctrl: true, shift: true, alt: false, key: 'c' });
    expect(parseKeys('Esc')).toEqual({ ctrl: false, shift: false, alt: false, key: 'escape' });
    expect(parseKeys('Ctrl++')?.key).toBe('+');
    expect(parseKeys('Hyper+C')).toBeNull();
    expect(parseKeys('')).toBeNull();
  });

  it('matches every modifier exactly, Ctrl being ⌘ too', () => {
    expect(matchesKeys('Shift+C', key('C', { shift: true }))).toBe(true);
    expect(matchesKeys('Shift+C', key('C', { shift: true, ctrl: true }))).toBe(false);
    expect(matchesKeys('Shift+C', key('c'))).toBe(false);
    expect(matchesKeys('Ctrl+Alt+N', key('n', { meta: true, alt: true }))).toBe(true);
    // Alt changes the character on a Mac: the key's place counts.
    expect(matchesKeys('Alt+N', key('˜', { alt: true, code: 'KeyN' }))).toBe(true);
    expect(matchesKeys('Escape', key('Escape'))).toBe(true);
    // A character typed with Shift.
    expect(matchesKeys('?', key('?', { shift: true }))).toBe(true);
    expect(matchesKeys('Shift+?', key('?', { shift: true }))).toBe(true);
  });

  it('finds a plugin shortcut, not while typing unless it says so', () => {
    const list: EditorShortcut[] = [
      { id: 'a', keys: 'Shift+C', label: 'Notes mode', run() {} },
      { id: 'b', keys: 'Ctrl+Enter', label: 'Send', whileTyping: true, run() {} },
    ];
    expect(shortcutFor(key('C', { shift: true }), false, list)?.id).toBe('a');
    expect(shortcutFor(key('C', { shift: true }), true, list)).toBeNull();
    expect(shortcutFor(key('Enter', { ctrl: true }), true, list)?.id).toBe('b');
    expect(shortcutFor(key('x'), false, list)).toBeNull();
  });

  it('runs it and keeps the key from the browser, unless it answers false', () => {
    const run = vi.fn((_editor: EditorContext, _event: KeyboardEvent): void | boolean => undefined);
    extensions().shortcuts.push({ id: 'a', keys: 'Shift+C', label: 'Notes', run });
    const event = {
      ...key('C', { shift: true }),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    const editor = fakeEditor();
    expect(runExtensionShortcut(event, false, editor)).toBe(true);
    expect(run).toHaveBeenCalledWith(editor, event);
    expect(event.preventDefault).toHaveBeenCalled();
    run.mockReturnValueOnce(false);
    expect(runExtensionShortcut(event, false, editor)).toBe(false);
    expect(runExtensionShortcut(event, false, null)).toBe(false);
  });

  it('a failing shortcut does not break the editor', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    extensions().shortcuts.push({
      id: 'a',
      keys: 'Shift+C',
      label: 'Notes',
      run() {
        throw new Error('boom');
      },
    });
    const event = {
      ...key('C', { shift: true }),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    expect(runExtensionShortcut(event, false, fakeEditor())).toBe(false);
  });

  it('lists them by group in the Keyboard shortcuts window', () => {
    expect(
      shortcutGroups([
        { id: 'a', keys: 'Shift+C', label: 'Notes mode', run() {} },
        { id: 'b', keys: 'Ctrl+Shift+N', label: 'Notes', group: 'Notes', run() {} },
      ]),
    ).toEqual([
      { group: 'Plugins', items: [['Notes mode', 'Shift+C']] },
      { group: 'Notes', items: [['Notes', 'Ctrl+Shift+N']] },
    ]);
  });
});

describe('top bar items', () => {
  it('gives badges, state and visibility; failing ones fall back', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = fakeEditor();
    const shown = topbarItemsOf(editor, [
      { id: 'n', label: 'Notes', icon: 'M0 0', badge: () => 3, active: () => true, onClick() {} },
      { id: 'z', label: 'Zero', icon: 'M0 0', badge: () => 0, onClick() {} },
      { id: 'm', label: 'Many', icon: 'M0 0', badge: () => 120, onClick() {} },
      { id: 't', label: 'Text', icon: 'M0 0', badge: () => 'new!!', onClick() {} },
      {
        id: 'f',
        label: 'Failing',
        icon: 'M0 0',
        badge: () => {
          throw new Error('x');
        },
        onClick() {},
      },
      { id: 'h', label: 'Hidden', icon: 'M0 0', when: () => false, onClick() {} },
    ]);
    expect(shown.map((s) => [s.item.id, s.badge, s.active])).toEqual([
      ['n', '3', true],
      ['z', '', false],
      ['m', '99+', false],
      ['t', 'new!', false],
      ['f', '', false],
    ]);
  });
});

describe('context menu items', () => {
  it('filters by element and says which are disabled', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = fakeEditor();
    const items = contextMenuItemsOf(node('a', 'fresco/heading'), editor, [
      { id: 'note', label: 'Add note', run() {} },
      { id: 'img', label: 'Images only', when: (n) => n.type === 'fresco/image', run() {} },
      { id: 'off', label: 'Off', disabled: () => true, run() {} },
      {
        id: 'bad',
        label: 'Bad',
        disabled: () => {
          throw new Error('x');
        },
        run() {},
      },
    ]);
    expect(items.map((i) => [i.item.id, i.disabled])).toEqual([
      ['note', false],
      ['off', true],
      ['bad', true],
    ]);
  });
});

describe('canvas overlays', () => {
  it('asks each overlay for its elements; a failing one asks for none', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = fakeEditor();
    const ids = overlayIds(editor, [
      { id: 'pins', elements: () => ['a', 'b'], component: () => null },
      {
        id: 'bad',
        elements: () => {
          throw new Error('x');
        },
        component: () => null,
      },
    ]);
    expect(ids).toEqual({ pins: ['a', 'b'], bad: [] });
  });
});

describe('editor context', () => {
  it('reads and selects in the store', () => {
    const store = createStore({ blocks: [node('h1')], page: {}, readOnly: false });
    const notify = vi.fn();
    const editor = createEditorContext({
      store,
      entry: { id: 'e1', type: 'page', locale: 'en' },
      canvas: () => null,
      notify,
    });
    expect(editor.entry).toEqual({ id: 'e1', type: 'page', locale: 'en' });
    expect(editor.readOnly()).toBe(false);
    expect(editor.node('h1')?.id).toBe('h1');
    expect(editor.node('nope')).toBeNull();
    editor.select('h1');
    expect(editor.selected()).toBe('h1');
    editor.notify('hi', 'info');
    expect(notify).toHaveBeenCalledWith('hi', 'info');
    expect(editor.refresh).toBe(refreshExtensions);
  });
});
