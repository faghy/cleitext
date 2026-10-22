/**
 * The editor's side of the extension hooks of Fresco 2.5 (top bar items,
 * shortcuts, canvas overlays, right-click menu items): the editor context
 * they get, and the rules that need no browser (which key is which, what a
 * failing extension gives). A failing extension never breaks the editor.
 */
import { useSyncExternalStore } from 'react';
import {
  extensions,
  type ContextMenuItem,
  type EditorContext,
  type EditorShortcut,
  type TopbarItem,
} from '../core/extensions.js';
import type { FrescoNode } from '../core/model.js';
import type { Store } from './store.js';
import { find } from './tree.js';

/** Calls an extension's function; its error gives `fallback`. */
export function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    console.error('Fresco: an extension failed', error);
    return fallback;
  }
}

// What `editor.refresh()` changes: the parts drawn by extensions read it.
let version = 0;
const listeners = new Set<() => void>();

export function refreshExtensions(): void {
  version += 1;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Draws the component again on `editor.refresh()`. */
export function useExtensionsVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
}

export interface EditorContextInput {
  store: Store;
  entry: { id: string; type: string; locale: string };
  canvas: () => Document | null;
  notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

export function createEditorContext(input: EditorContextInput): EditorContext {
  const { store, canvas } = input;
  const element = (id: string) =>
    canvas()?.querySelector<HTMLElement>(`[data-fr-id="${CSS.escape(id)}"]`) ?? null;
  return {
    entry: { ...input.entry },
    readOnly: () => store.get().readOnly,
    selected: () => store.get().selected,
    select: (id) => store.actions.select(id),
    node: (id) => find(store.get().blocks, id),
    canvas,
    reveal: (id) => element(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    refresh: refreshExtensions,
    notify: input.notify,
  };
}

/** The keys of a shortcut (`Ctrl+Shift+C`), read once. */
export interface ParsedKeys {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** The key, lower case (`c`, `?`, `escape`, `f2`). */
  key: string;
}

const NAMES: Record<string, string> = {
  esc: 'escape',
  del: 'delete',
  space: ' ',
  return: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
};

export function parseKeys(keys: string): ParsedKeys | null {
  // `Ctrl++` is Ctrl and the + key.
  const parts = keys.trim().replace(/\+\+$/, '+plus').split('+');
  const out: ParsedKeys = { ctrl: false, shift: false, alt: false, key: '' };
  for (const [i, raw] of parts.entries()) {
    const part = raw.trim().toLowerCase();
    if (i < parts.length - 1) {
      if (part === 'ctrl' || part === 'cmd' || part === 'meta' || part === 'mod') out.ctrl = true;
      else if (part === 'shift') out.shift = true;
      else if (part === 'alt' || part === 'option') out.alt = true;
      else return null;
    } else {
      out.key = part === 'plus' ? '+' : (NAMES[part] ?? part);
    }
  }
  return out.key ? out : null;
}

type KeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** True when the event is the shortcut's keys (Ctrl is ⌘ too). */
export function matchesKeys(keys: string, event: KeyEvent): boolean {
  const parsed = parseKeys(keys);
  if (!parsed) return false;
  if (parsed.ctrl !== (event.ctrlKey || event.metaKey)) return false;
  if (parsed.alt !== event.altKey) return false;
  const key = event.key.toLowerCase();
  // A letter or digit: also by its place (Alt changes the character on a Mac).
  const code =
    parsed.key.length === 1 && /[a-z]/.test(parsed.key)
      ? `Key${parsed.key.toUpperCase()}`
      : parsed.key.length === 1 && /[0-9]/.test(parsed.key)
        ? `Digit${parsed.key}`
        : null;
  const sameKey = key === parsed.key || (code !== null && event.code === code);
  if (!sameKey) return false;
  // A character typed with Shift (`?`) needs Shift only when it says so.
  const shifted = parsed.key.length === 1 && !/[a-z0-9]/.test(parsed.key);
  return shifted ? !parsed.shift || event.shiftKey : parsed.shift === event.shiftKey;
}

/** The extension shortcut of a key, if any. */
export function shortcutFor(
  event: KeyEvent,
  typing: boolean,
  list: readonly EditorShortcut[] = extensions().shortcuts,
): EditorShortcut | null {
  return (
    list.find((item) => (!typing || item.whileTyping) && matchesKeys(item.keys, event)) ?? null
  );
}

/**
 * Runs the extension shortcut of a key (after Fresco's own): true when one
 * ran, and the key was then kept from the browser.
 */
export function runExtensionShortcut(
  event: KeyboardEvent,
  typing: boolean,
  editor: EditorContext | null,
): boolean {
  if (!editor) return false;
  const shortcut = shortcutFor(event, typing);
  if (!shortcut) return false;
  const result = safely(() => shortcut.run(editor, event), false as void | boolean);
  if (result === false) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

/** The extensions' shortcuts by group, for the Keyboard shortcuts window. */
export function shortcutGroups(
  list: readonly EditorShortcut[] = extensions().shortcuts,
): { group: string; items: [string, string][] }[] {
  const groups = new Map<string, [string, string][]>();
  for (const item of list) {
    const group = item.group || 'Plugins';
    groups.set(group, [...(groups.get(group) ?? []), [item.label, item.keys]]);
  }
  return [...groups].map(([group, items]) => ({ group, items }));
}

/** A top bar item as drawn: its badge (text, or '' for none) and state. */
export interface ShownTopbarItem {
  item: TopbarItem;
  badge: string;
  active: boolean;
}

export function topbarItemsOf(
  editor: EditorContext,
  list: readonly TopbarItem[] = extensions().topbarItems,
): ShownTopbarItem[] {
  return list
    .filter((item) => !item.when || safely(() => item.when!(editor), false))
    .map((item) => {
      const badge = item.badge ? safely(() => item.badge!(editor), null) : null;
      return {
        item,
        badge:
          typeof badge === 'number'
            ? badge > 0
              ? badge > 99
                ? '99+'
                : String(badge)
              : ''
            : typeof badge === 'string'
              ? badge.slice(0, 4)
              : '',
        active: item.active ? safely(() => item.active!(editor), false) : false,
      };
    });
}

/** The extensions' items of an element's right-click menu. */
export function contextMenuItemsOf(
  node: FrescoNode,
  editor: EditorContext,
  list: readonly ContextMenuItem[] = extensions().contextMenuItems,
): { item: ContextMenuItem; disabled: boolean }[] {
  return list
    .filter((item) => !item.when || safely(() => item.when!(node, editor), false))
    .map((item) => ({
      item,
      disabled: item.disabled ? safely(() => item.disabled!(node, editor), true) : false,
    }));
}

/** The ids every canvas overlay asks the boxes of. */
export function overlayIds(
  editor: EditorContext,
  list = extensions().canvasOverlays,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const overlay of list) {
    const ids = safely(() => overlay.elements(editor), [] as string[]);
    out[overlay.id] = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  }
  return out;
}
