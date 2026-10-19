/**
 * The editor's state: the page (elements and page settings), the selection,
 * the device being edited, the panel, and the undo history. A tiny store
 * read with `useEditor(selector)`; components re-render only when what they
 * select changes.
 */
import { useSyncExternalStore } from 'react';
import { newId } from '../core/ids.js';
import { DEFAULT_KIT, type Kit } from '../core/kit.js';
import type { Device, FrescoNode, NewNode, Settings, Tab } from '../core/model.js';
import { getElement } from '../core/registry.js';
import * as tree from './tree.js';

export type PanelView =
  'elements' | 'element' | 'page' | 'site' | 'navigator' | 'library' | 'history';

export interface EditorState {
  blocks: FrescoNode[];
  /** Page settings (document.editor.data). */
  page: Settings;
  selected: string | null;
  hovered: string | null;
  device: Device;
  view: PanelView;
  tab: Tab;
  kit: Kit;
  kitDirty: boolean;
  /** Copied element (in this tab; also in localStorage for other pages). */
  clipboard: FrescoNode | null;
  readOnly: boolean;
  /** Content only (role manager of Fresco Pro): texts and media, no structure or style. */
  contentOnly: boolean;
  /** Editor only: the item shown by tabs and accordions, by element id (-1: none). */
  active: Record<string, number>;
  /** The entry being edited. */
  entry: { id: string; type: string; locale: string };
  /** The "add" area opened between top-level containers (index), and its step. */
  adding: { index: number; step: 'flex' | 'grid' | 'choose' } | null;
  /** The floating Structure window is open. */
  navigator: boolean;
  /** Elements hidden in the editor only (the eye of the Structure window). */
  hidden: Record<string, true>;
}

interface Snapshot {
  blocks: FrescoNode[];
  page: Settings;
  selected: string | null;
}

/** What a step of the history did, shown in the History panel. */
export interface StepLabel {
  kind:
    | 'add'
    | 'remove'
    | 'duplicate'
    | 'move'
    | 'edit'
    | 'paste'
    | 'pasteStyle'
    | 'resetStyle'
    | 'page'
    | 'item'
    | 'all';
  /** Element type, when the step is about one. */
  type?: string;
  at: number;
}

const HISTORY = 100;

export function createStore(initial: {
  blocks: FrescoNode[];
  page: Settings;
  readOnly: boolean;
  contentOnly?: boolean;
  entry?: { id: string; type: string; locale: string };
}) {
  let state: EditorState = {
    blocks: initial.blocks,
    page: initial.page,
    selected: null,
    hovered: null,
    device: 'desktop',
    view: 'elements',
    tab: 'content',
    kit: DEFAULT_KIT,
    kitDirty: false,
    clipboard: null,
    readOnly: initial.readOnly,
    contentOnly: initial.contentOnly === true,
    active: {},
    entry: initial.entry ?? { id: '', type: 'page', locale: 'en' },
    adding: null,
    navigator: false,
    hidden: {},
  };
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  // Labels of the steps: pastLabels[i] took the page from past[i] to the next state.
  const pastLabels: StepLabel[] = [];
  const futureLabels: StepLabel[] = [];
  let pending: Omit<StepLabel, 'at'> | null = null;
  const typeOf = (id: string) => tree.find(state.blocks, id)?.type;
  const label = (kind: StepLabel['kind'], type?: string) => {
    pending = { kind, ...(type ? { type } : {}) };
  };
  const listeners = new Set<() => void>();
  const changeListeners = new Set<(state: EditorState) => void>();
  // Several edits of the same control in a row are one undo step.
  let lastMerge: { key: string; at: number } | null = null;

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const set = (patch: Partial<EditorState>) => {
    state = { ...state, ...patch };
    emit();
  };
  /** A change of the page: recorded for undo, then reported. */
  const change = (
    patch: Partial<Pick<EditorState, 'blocks' | 'page' | 'selected'>>,
    merge?: string,
  ) => {
    if (state.readOnly) return;
    const now = Date.now();
    const merging = merge !== undefined && lastMerge?.key === merge && now - lastMerge.at < 1200;
    if (!merging) {
      past.push({ blocks: state.blocks, page: state.page, selected: state.selected });
      pastLabels.push({ ...(pending ?? { kind: 'edit' }), at: now });
      if (past.length > HISTORY) {
        past.shift();
        pastLabels.shift();
      }
    } else if (pastLabels.length) {
      pastLabels[pastLabels.length - 1]!.at = now;
    }
    pending = null;
    futureLabels.length = 0;
    lastMerge = merge !== undefined ? { key: merge, at: now } : null;
    future.length = 0;
    set(patch);
    for (const listener of changeListeners) listener(state);
  };
  const restore = (snapshot: Snapshot) => {
    set({ blocks: snapshot.blocks, page: snapshot.page, selected: snapshot.selected });
    for (const listener of changeListeners) listener(state);
  };

  const actions = {
    /** Opens (or closes, with null) the "add" area at a top-level index. */
    setAdding(adding: EditorState['adding']) {
      set({ adding });
    },
    select(id: string | null) {
      if (id === state.selected && state.view === (id ? 'element' : state.view)) return;
      // Inside tabs or an accordion, the item holding the element is shown.
      let active = state.active;
      if (id) {
        const path = tree.pathTo(state.blocks, id);
        for (let i = 0; i < path.length - 1; i++) {
          const parent = tree.find(state.blocks, path[i]!);
          if (parent && getElement(parent.type)?.itemsLabel) {
            const index = (parent.children ?? []).findIndex((c) => c.id === path[i + 1]);
            if (index >= 0 && active[parent.id] !== index)
              active = { ...active, [parent.id]: index };
          }
        }
      }
      set({
        selected: id,
        active,
        view: id ? 'element' : state.view === 'element' ? 'elements' : state.view,
      });
    },
    setActive(id: string, index: number) {
      set({ active: { ...state.active, [id]: index } });
    },
    /** Adds an item (a container with a title) to tabs-like elements. */
    addItem(id: string, label: string) {
      const parent = tree.find(state.blocks, id);
      if (!parent) return;
      const count = parent.children?.length ?? 0;
      const child = create('fresco/container')!;
      child.attrs = { _title: `${label} ${count + 1}`, content_width: 'full' };
      pending = { kind: 'item', type: parent.type };
      change({ blocks: tree.insert(state.blocks, child, { parent: id, index: count }) });
      set({ active: { ...state.active, [id]: count } });
    },
    hover(id: string | null) {
      if (id !== state.hovered) set({ hovered: id });
    },
    setDevice(device: Device) {
      set({ device });
    },
    setView(view: PanelView) {
      // The structure is a floating window over the canvas, not a view of the panel.
      if (view === 'navigator') set({ navigator: true });
      else set({ view });
    },
    toggleNavigator(open?: boolean) {
      set({ navigator: open ?? !state.navigator });
    },
    toggleHidden(id: string) {
      const hidden = { ...state.hidden };
      if (hidden[id]) delete hidden[id];
      else hidden[id] = true;
      set({ hidden });
    },
    setTab(tab: Tab) {
      set({ tab });
    },
    setKit(kit: Kit, dirty = true) {
      set({ kit, kitDirty: dirty });
    },
    setSettings(id: string, changes: Settings, merge?: string) {
      label('edit', typeOf(id));
      change({ blocks: tree.setSettings(state.blocks, id, changes) }, merge && `${id}:${merge}`);
    },
    setPage(changes: Settings) {
      const page = { ...state.page };
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === null || value === '') delete page[key];
        else page[key] = value;
      }
      label('page');
      change({ page });
    },
    /** Adds a new element of a type; widgets dropped at the top get a container. */
    add(type: string, place: tree.Place): string | null {
      if (state.contentOnly) return null;
      const node = create(type);
      if (!node) return null;
      const definition = getElement(type);
      label('add', type);
      if (place.parent === null && !definition?.container) {
        const wrapper = create('fresco/container')!;
        wrapper.children = [node];
        change({ blocks: tree.insert(state.blocks, wrapper, place), selected: node.id });
      } else {
        change({ blocks: tree.insert(state.blocks, node, place), selected: node.id });
      }
      set({ view: 'element', tab: 'content' });
      return node.id;
    },
    insertNodes(nodes: FrescoNode[], place: tree.Place) {
      if (state.contentOnly) return;
      let blocks = state.blocks;
      label('add', nodes[0]?.type);
      nodes.forEach((node, i) => {
        blocks = tree.insert(blocks, node, { parent: place.parent, index: place.index + i });
      });
      change({ blocks, selected: nodes[0]?.id ?? state.selected });
    },
    move(id: string, place: tree.Place) {
      if (state.contentOnly) return;
      const node = tree.find(state.blocks, id);
      if (!node) return;
      label('move', node.type);
      if (place.parent === null && !getElement(node.type)?.container) {
        // A widget dragged to the top goes into a new container.
        const wrapper = create('fresco/container')!;
        const without = tree.remove(state.blocks, id);
        const from = tree.placeOf(state.blocks, id);
        const index =
          from?.parent === null && from.index < place.index ? place.index - 1 : place.index;
        wrapper.children = [node];
        change({ blocks: tree.insert(without, wrapper, { parent: null, index }), selected: id });
        return;
      }
      change({ blocks: tree.move(state.blocks, id, place), selected: id });
    },
    remove(id: string) {
      if (state.contentOnly) return;
      label('remove', typeOf(id));
      change({
        blocks: tree.remove(state.blocks, id),
        selected: state.selected === id ? null : state.selected,
      });
      if (state.view === 'element' && !state.selected) set({ view: 'elements' });
    },
    duplicate(id: string) {
      if (state.contentOnly) return;
      label('duplicate', typeOf(id));
      const result = tree.duplicate(state.blocks, id);
      if (result.id) change({ blocks: result.tree, selected: result.id });
    },
    copy(id: string) {
      const node = tree.find(state.blocks, id);
      if (!node) return;
      set({ clipboard: node });
      try {
        localStorage.setItem('fresco:clipboard', JSON.stringify(node));
      } catch {
        // Private windows: the copy stays in this page.
      }
    },
    /** Pastes after an element (or at the end of the page). */
    paste(after: string | null) {
      if (state.contentOnly) return;
      let node = state.clipboard;
      try {
        const stored = localStorage.getItem('fresco:clipboard');
        if (stored) node = JSON.parse(stored) as FrescoNode;
      } catch {
        // Keep the in-page copy.
      }
      if (!node || !getElement(node.type)) return;
      const copy = tree.cloneWithNewIds(node);
      label('paste', copy.type);
      const place = after ? tree.placeOf(state.blocks, after) : null;
      const target = place
        ? { parent: place.parent, index: place.index + 1 }
        : { parent: null, index: state.blocks.length };
      if (target.parent === null && !getElement(copy.type)?.container) {
        const wrapper = create('fresco/container')!;
        wrapper.children = [copy];
        change({ blocks: tree.insert(state.blocks, wrapper, target), selected: copy.id });
      } else change({ blocks: tree.insert(state.blocks, copy, target), selected: copy.id });
    },
    /** Applies the copied element's style (not its content) to another of the same type. */
    pasteStyle(id: string) {
      if (state.contentOnly) return;
      const source = state.clipboard;
      const target = tree.find(state.blocks, id);
      const definition = target && getElement(target.type);
      if (!source || !target || !definition || source.type !== target.type) return;
      const styleKeys = new Set(
        definition.controls.filter((c) => c.tab !== 'content').map((c) => c.name),
      );
      const isStyle = (key: string) =>
        styleKeys.has(key.split(/[@:]/)[0]!) || [...styleKeys].some((k) => key.startsWith(`${k}_`));
      const attrs: Settings = Object.fromEntries(
        Object.entries(target.attrs).filter(([key]) => !isStyle(key)),
      );
      for (const [key, value] of Object.entries(source.attrs))
        if (isStyle(key)) attrs[key] = structuredClone(value);
      label('pasteStyle', target.type);
      change({ blocks: tree.update(state.blocks, id, (node) => ({ ...node, attrs })) });
    },
    resetStyle(id: string) {
      if (state.contentOnly) return;
      const target = tree.find(state.blocks, id);
      const definition = target && getElement(target.type);
      if (!target || !definition) return;
      const contentKeys = new Set(
        definition.controls.filter((c) => c.tab === 'content').map((c) => c.name),
      );
      const attrs = Object.fromEntries(
        Object.entries(target.attrs).filter(([key]) => contentKeys.has(key.split(/[@:]/)[0]!)),
      );
      label('resetStyle', target.type);
      change({ blocks: tree.update(state.blocks, id, (node) => ({ ...node, attrs })) });
    },
    replaceAll(blocks: FrescoNode[], page: Settings) {
      label('all');
      change({ blocks, page, selected: null });
    },
    undo() {
      const snapshot = past.pop();
      if (!snapshot) return;
      future.push({ blocks: state.blocks, page: state.page, selected: state.selected });
      futureLabels.push(pastLabels.pop() ?? { kind: 'edit', at: Date.now() });
      lastMerge = null;
      restore(snapshot);
    },
    redo() {
      const snapshot = future.pop();
      if (!snapshot) return;
      past.push({ blocks: state.blocks, page: state.page, selected: state.selected });
      pastLabels.push(futureLabels.pop() ?? { kind: 'edit', at: Date.now() });
      lastMerge = null;
      restore(snapshot);
    },
    /** Goes to a step of the history: 0 is the page as it was opened. */
    goTo(step: number) {
      while (past.length > step && past.length > 0) actions.undo();
      while (past.length < step && future.length > 0) actions.redo();
    },
  };

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Called after every change of the page (not of the selection). */
    onChange(listener: (state: EditorState) => void) {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    /** Done steps (oldest first) and undone ones (next first). */
    history: () => ({ done: [...pastLabels], undone: [...futureLabels].reverse() }),
    actions,
  };
}

export type Store = ReturnType<typeof createStore>;

/** A new element of a type, with what its definition creates (children of tabs…). */
export function create(type: string): FrescoNode | null {
  const definition = getElement(type);
  if (!definition) return null;
  const made = definition.create?.();
  const withIds = (node: NewNode): FrescoNode => ({
    id: newId(),
    type: node.type,
    v: node.v,
    attrs: structuredClone(node.attrs),
    ...(node.children ? { children: node.children.map((child) => withIds(child)) } : {}),
  });
  if (made) return withIds(made);
  return { id: newId(), type, v: 1, attrs: {}, ...(definition.container ? { children: [] } : {}) };
}

export function useStore<T>(store: Store, selector: (state: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
