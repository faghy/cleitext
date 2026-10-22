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
import { DEFAULT_PREFERENCES, normalizePreferences, type Preferences } from './prefs-model.js';

export type PanelView =
  'elements' | 'element' | 'page' | 'site' | 'navigator' | 'library' | 'history' | 'preferences';

export interface EditorState {
  blocks: FrescoNode[];
  /** Page settings (document.editor.data). */
  page: Settings;
  /** The primary selection: the element the panel edits (the last one clicked). */
  selected: string | null;
  /**
   * Every selected element (⌘/Ctrl-click adds and removes), the primary last.
   * Delete, Duplicate and Copy act on all of them.
   */
  selection: string[];
  hovered: string | null;
  device: Device;
  view: PanelView;
  tab: Tab;
  kit: Kit;
  kitDirty: boolean;
  /** Copied elements (in this tab; also in localStorage for other pages). */
  clipboard: FrescoNode[] | null;
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
  /** The Structure window is docked to the right edge (the canvas makes room). */
  navigatorDocked: boolean;
  /** Elements hidden in the editor only (the eye of the Structure window). */
  hidden: Record<string, true>;
  /** The panel of Site settings shown ('' for its menu). */
  siteSection: string;
  /** Saves of other plugins' Site settings panels, run with the page's save. */
  sitePending: Record<string, () => Promise<void>>;
  /**
   * A global widget being edited in place: the element showing it was
   * replaced by its content (`editId`) until saved or cancelled.
   */
  globalEdit: { id: string; title: string; node: FrescoNode; editId: string } | null;
  /** The user's preferences (theme, exit, favorites…). */
  prefs: Preferences;
  /** Elements switched off in the Element manager: not offered in the panel. */
  disabledElements: string[];
  /**
   * Safe mode, for troubleshooting: other plugins' blocks and the styles of
   * the theme and of other plugins are off in the editor.
   */
  safeMode: boolean;
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
  /** The setting changed (its key), for edits. */
  setting?: string;
  at: number;
}

const HISTORY = 100;

const CLIPBOARD_KEY = 'fresco:clipboard';
const DOCK_KEY = 'fresco:navigator-docked';

/** The copied elements: one (as older versions stored it) or several. */
export function readClipboard(raw: unknown): FrescoNode[] | null {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const nodes = list.filter(
    (node): node is FrescoNode =>
      !!node &&
      typeof node === 'object' &&
      typeof (node as FrescoNode).id === 'string' &&
      typeof (node as FrescoNode).type === 'string',
  );
  return nodes.length ? nodes : null;
}

/**
 * The selected elements that are not inside another selected one, in the
 * order of the page (acting on a container already acts on its children).
 */
export function topmost(blocks: FrescoNode[], ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const out: string[] = [];
  const visit = (nodes: FrescoNode[]) => {
    for (const node of nodes) {
      if (wanted.has(node.id)) out.push(node.id);
      else if (node.children) visit(node.children);
    }
  };
  visit(blocks);
  return out;
}

const PREFS_KEY = 'fresco:prefs';

/** The preferences kept in this browser (the server's arrive later), with older keys. */
function storedPrefs(): Preferences {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return normalizePreferences(JSON.parse(stored));
    // Before the preferences: the favorites and the panel's width were kept alone.
    const favorites = JSON.parse(localStorage.getItem('fresco:favorites') ?? '[]') as unknown;
    const width = Number(localStorage.getItem('fresco:panel-width'));
    return normalizePreferences({ favorites, ...(width ? { panelWidth: width } : {}) });
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function storedDock(): boolean {
  try {
    return localStorage.getItem(DOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function createStore(initial: {
  blocks: FrescoNode[];
  page: Settings;
  readOnly: boolean;
  contentOnly?: boolean;
  entry?: { id: string; type: string; locale: string };
  safeMode?: boolean;
}) {
  let state: EditorState = {
    blocks: initial.blocks,
    page: initial.page,
    selected: null,
    selection: [],
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
    navigatorDocked: storedDock(),
    hidden: {},
    siteSection: '',
    sitePending: {},
    globalEdit: null,
    prefs: storedPrefs(),
    disabledElements: [],
    safeMode: initial.safeMode === true,
  };
  const past: Snapshot[] = [];
  const future: Snapshot[] = [];
  // Labels of the steps: pastLabels[i] took the page from past[i] to the next state.
  const pastLabels: StepLabel[] = [];
  const futureLabels: StepLabel[] = [];
  let pending: Omit<StepLabel, 'at'> | null = null;
  const typeOf = (id: string) => tree.find(state.blocks, id)?.type;
  const label = (kind: StepLabel['kind'], type?: string, setting?: string) => {
    pending = { kind, ...(type ? { type } : {}), ...(setting ? { setting } : {}) };
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
    patch: Partial<Pick<EditorState, 'blocks' | 'page' | 'selected' | 'selection'>>,
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
    // A new primary selection alone replaces the others; ids no longer there leave it.
    const blocks = patch.blocks ?? state.blocks;
    let selected = patch.selected !== undefined ? patch.selected : state.selected;
    if (selected && !tree.find(blocks, selected)) selected = null;
    const selection = (
      patch.selection ??
      (patch.selected !== undefined && patch.selected !== state.selected
        ? selected
          ? [selected]
          : []
        : state.selection)
    ).filter((id) => tree.find(blocks, id));
    set({ ...patch, selected, selection });
    for (const listener of changeListeners) listener(state);
  };
  const restore = (snapshot: Snapshot) => {
    set({
      blocks: snapshot.blocks,
      page: snapshot.page,
      selected: snapshot.selected,
      selection: snapshot.selected ? [snapshot.selected] : [],
      // Undone back to before a global widget was opened: its editing is over.
      ...(state.globalEdit && !tree.find(snapshot.blocks, state.globalEdit.editId)
        ? { globalEdit: null }
        : {}),
    });
    for (const listener of changeListeners) listener(state);
  };
  /** The copied elements, also for other pages (one is stored alone, as before). */
  const writeClipboard = (nodes: FrescoNode[]) => {
    set({ clipboard: nodes });
    try {
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(nodes.length === 1 ? nodes[0] : nodes));
    } catch {
      // Private windows: the copy stays in this page.
    }
  };

  const actions = {
    /** Opens (or closes, with null) the "add" area at a top-level index. */
    setAdding(adding: EditorState['adding']) {
      set({ adding });
    },
    select(id: string | null) {
      if (
        id === state.selected &&
        state.selection.length === (id ? 1 : 0) &&
        state.view === (id ? 'element' : state.view)
      )
        return;
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
        selection: id ? [id] : [],
        active,
        view: id ? 'element' : state.view === 'element' ? 'elements' : state.view,
      });
    },
    /**
     * ⌘/Ctrl-click: adds an element to the selection (it becomes the one the
     * panel edits), or takes it out.
     */
    toggleSelect(id: string) {
      if (!tree.find(state.blocks, id)) return;
      if (state.selection.includes(id)) {
        const selection = state.selection.filter((s) => s !== id);
        const selected = selection.at(-1) ?? null;
        set({
          selection,
          selected,
          view: selected ? 'element' : state.view === 'element' ? 'elements' : state.view,
        });
        return;
      }
      set({ selection: [...state.selection, id], selected: id, view: 'element' });
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
    /**
     * Edits a global widget in place: the element showing it (`nodeId`) gives
     * way to the widget's content until `endGlobalEdit`. The page keeps the
     * element: what is saved is never the content.
     */
    beginGlobalEdit(nodeId: string, global: { id: string; title: string }, content: FrescoNode) {
      const node = tree.find(state.blocks, nodeId);
      if (!node || state.globalEdit || state.readOnly) return;
      const blocks = tree.update(state.blocks, nodeId, () => content);
      set({
        blocks,
        globalEdit: { ...global, node, editId: content.id },
        selected: content.id,
        selection: [content.id],
        view: 'element',
      });
    },
    /** Ends the editing of a global widget: the element showing it is back (also in the history). */
    endGlobalEdit() {
      const edit = state.globalEdit;
      if (!edit) return;
      const back = (blocks: FrescoNode[]) =>
        tree.find(blocks, edit.editId) ? tree.update(blocks, edit.editId, () => edit.node) : blocks;
      for (const list of [past, future])
        for (const snapshot of list) snapshot.blocks = back(snapshot.blocks);
      set({
        blocks: back(state.blocks),
        globalEdit: null,
        selected: edit.node.id,
        selection: [edit.node.id],
      });
    },
    /** Changes the user's preferences (kept in the browser; the editor saves them for the user). */
    setPrefs(patch: Partial<Preferences>) {
      const prefs = normalizePreferences({ ...state.prefs, ...patch });
      set({ prefs });
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch {
        // Private mode: kept until the page closes.
      }
    },
    /** The elements switched off in the Element manager. */
    setDisabledElements(types: string[]) {
      set({ disabledElements: types });
    },
    /** Opens Site settings at a panel ('' for the menu). */
    openSite(section = '') {
      set({ view: 'site', siteSection: section });
    },
    /** A plugin's Site settings panel has changes to save (null: no more). */
    setSitePending(id: string, save: (() => Promise<void>) | null) {
      const sitePending = { ...state.sitePending };
      if (save) sitePending[id] = save;
      else delete sitePending[id];
      set({ sitePending });
    },
    toggleNavigator(open?: boolean) {
      set({ navigator: open ?? !state.navigator });
    },
    /** Docks the Structure window to the right edge, or lets it float again (remembered). */
    setNavigatorDocked(docked: boolean) {
      set({ navigatorDocked: docked });
      try {
        localStorage.setItem(DOCK_KEY, docked ? '1' : '0');
      } catch {
        // Private mode: kept until the page closes.
      }
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
      label('edit', typeOf(id), Object.keys(changes)[0]);
      change({ blocks: tree.setSettings(state.blocks, id, changes) }, merge && `${id}:${merge}`);
    },
    /** Changes page settings; several edits of the same one in a row (`merge`) are one undo step. */
    setPage(changes: Settings, merge?: string) {
      const page = { ...state.page };
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === null || value === '') delete page[key];
        else page[key] = value;
      }
      label('page');
      change({ page }, merge && `page:${merge}`);
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
    /** Adds a ready-made element (a global widget); at the top it gets a container. */
    addNode(node: FrescoNode, place: tree.Place) {
      if (state.contentOnly) return;
      label('add', node.type);
      const wrapped =
        place.parent === null && !getElement(node.type)?.container
          ? { ...create('fresco/container')!, children: [node] }
          : node;
      change({ blocks: tree.insert(state.blocks, wrapped, place), selected: node.id });
      set({ view: 'element', tab: 'content' });
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
    /** Removes several elements in one step (the selection). */
    removeMany(ids: readonly string[]) {
      if (state.contentOnly) return;
      const list = topmost(state.blocks, ids);
      if (list.length === 0) return;
      if (list.length === 1) return actions.remove(list[0]!);
      label('remove', typeOf(list[0]!));
      let blocks = state.blocks;
      for (const id of list) blocks = tree.remove(blocks, id);
      change({ blocks, selected: null, selection: [] });
      if (state.view === 'element') set({ view: 'elements' });
    },
    duplicate(id: string) {
      if (state.contentOnly) return;
      label('duplicate', typeOf(id));
      const result = tree.duplicate(state.blocks, id);
      if (result.id) change({ blocks: result.tree, selected: result.id });
    },
    /** Duplicates several elements in one step; the copies become the selection. */
    duplicateMany(ids: readonly string[]) {
      if (state.contentOnly) return;
      const list = topmost(state.blocks, ids);
      if (list.length === 0) return;
      if (list.length === 1) return actions.duplicate(list[0]!);
      label('duplicate', typeOf(list[0]!));
      let blocks = state.blocks;
      const copies: string[] = [];
      for (const id of list) {
        const result = tree.duplicate(blocks, id);
        blocks = result.tree;
        if (result.id) copies.push(result.id);
      }
      change({ blocks, selected: copies.at(-1) ?? null, selection: copies });
    },
    copy(id: string) {
      const node = tree.find(state.blocks, id);
      if (node) writeClipboard([node]);
    },
    /** Copies several elements (the selection, or the whole page), in the page's order. */
    copyMany(ids: readonly string[]) {
      const nodes = topmost(state.blocks, ids)
        .map((id) => tree.find(state.blocks, id))
        .filter((node): node is FrescoNode => !!node);
      if (nodes.length) writeClipboard(nodes);
    },
    /** Pastes after an element (or at the end of the page). */
    paste(after: string | null) {
      if (state.contentOnly) return;
      let nodes = state.clipboard;
      try {
        const stored = localStorage.getItem(CLIPBOARD_KEY);
        if (stored) nodes = readClipboard(JSON.parse(stored)) ?? nodes;
      } catch {
        // Keep the in-page copy.
      }
      actions.pasteNodes(nodes ?? [], after);
    },
    /** Pastes given elements (from the system clipboard) after an element, as copies. */
    pasteNodes(nodes: FrescoNode[], after: string | null) {
      if (state.contentOnly) return;
      const copies = nodes
        .filter((node) => getElement(node.type))
        .map((node) => tree.cloneWithNewIds(node));
      if (copies.length === 0) return;
      label('paste', copies[0]!.type);
      const place = after ? tree.placeOf(state.blocks, after) : null;
      let target = place
        ? { parent: place.parent, index: place.index + 1 }
        : { parent: null as string | null, index: state.blocks.length };
      let blocks = state.blocks;
      const pasted: string[] = [];
      for (const copy of copies) {
        // A widget pasted at the top level gets a container.
        let node = copy;
        if (target.parent === null && !getElement(copy.type)?.container) {
          node = create('fresco/container')!;
          node.children = [copy];
        }
        blocks = tree.insert(blocks, node, target);
        pasted.push(copy.id);
        target = { parent: target.parent, index: target.index + 1 };
      }
      change({ blocks, selected: pasted.at(-1) ?? null, selection: pasted });
    },
    /** Applies the copied element's style (not its content) to another of the same type. */
    pasteStyle(id: string) {
      if (state.contentOnly) return;
      const source = state.clipboard?.[0];
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

/** The page's elements as they are saved: a global widget being edited is its element again. */
export function blocksToSave(state: Pick<EditorState, 'blocks' | 'globalEdit'>): FrescoNode[] {
  const edit = state.globalEdit;
  if (!edit || !tree.find(state.blocks, edit.editId)) return state.blocks;
  return tree.update(state.blocks, edit.editId, () => edit.node);
}

/** Translates the sample texts of new elements into the editor's language. */
let translateText: ((text: string) => string) | null = null;

/** Set by the editor: new elements get their sample texts in its language. */
export function setTextTranslator(fn: ((text: string) => string) | null): void {
  translateText = fn;
}

const TEXT_CONTROLS = new Set(['text', 'textarea', 'richtext']);

/**
 * The sample texts of a new element in the editor's language: the defaults
 * of its content texts (and of its list items) are stored translated, so the
 * page shows what the editor showed. In English nothing is stored.
 */
function localizeDefaults(node: FrescoNode): FrescoNode {
  const translate = translateText;
  const definition = getElement(node.type);
  if (!translate || !definition) return node;
  const attrs = { ...node.attrs };
  const local = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const translated = translate(value);
    return translated && translated !== value ? translated : null;
  };
  // Items of tabs and accordions: "Tab 1" → "Scheda 1".
  const numbered = typeof attrs._title === 'string' ? /^(.+?) (\d+)$/.exec(attrs._title) : null;
  if (numbered) {
    const word = local(numbered[1]);
    if (word !== null) attrs._title = `${word} ${numbered[2]}`;
  }
  for (const control of definition.controls) {
    if (control.tab !== 'content' || attrs[control.name] !== undefined) continue;
    if (TEXT_CONTROLS.has(control.type)) {
      const value = local(control.default);
      if (value !== null) attrs[control.name] = value;
    } else if (control.type === 'repeater' && Array.isArray(control.default)) {
      let changed = false;
      const items = (control.default as Settings[]).map((item) => {
        const next = { ...item };
        for (const field of control.fields ?? []) {
          if (!TEXT_CONTROLS.has(field.type)) continue;
          const value = local(item[field.name] ?? field.default);
          if (value !== null) {
            next[field.name] = value;
            changed = true;
          }
        }
        return next;
      });
      if (changed) attrs[control.name] = structuredClone(items);
    }
  }
  return {
    ...node,
    attrs,
    ...(node.children ? { children: node.children.map(localizeDefaults) } : {}),
  };
}

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
  if (made) return localizeDefaults(withIds(made));
  return localizeDefaults({
    id: newId(),
    type,
    v: 1,
    attrs: {},
    ...(definition.container ? { children: [] } : {}),
  });
}

export function useStore<T>(store: Store, selector: (state: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
