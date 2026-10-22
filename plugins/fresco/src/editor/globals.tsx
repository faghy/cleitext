/**
 * Global widgets in the editor, as in Elementor: the list under Globals
 * (click or drag one onto the page), "Unlink" (the element becomes a copy of
 * the widget's content, changed on this page only) and editing in place
 * (the content shows in the page; saving it changes every page that shows
 * the widget). The widgets themselves are kept by a plugin (Fresco Pro).
 */
import { t as tr, useT } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { extensions, type GlobalWidgets } from '../core/extensions.js';
import type { FrescoNode } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { Svg } from './controls.js';
import { notify } from './dialogs.js';
import { create, useStore, type Store } from './store.js';
import { cloneWithNewIds, find, placeOf } from './tree.js';

/** The plugin keeping the global widgets, if any. */
export function globalWidgets(): GlobalWidgets | null {
  return extensions().globalWidgets[0] ?? null;
}

/** The global widget an element shows, and the plugin keeping it. */
export function globalOf(node: FrescoNode): { id: string; provider: GlobalWidgets } | null {
  for (const provider of extensions().globalWidgets) {
    try {
      const id = provider.idOf(node);
      if (id) return { id, provider };
    } catch {
      // A failing plugin changes nothing.
    }
  }
  return null;
}

/** A widget's content as one element: its only element, or a container holding them all. */
export function contentNode(nodes: FrescoNode[]): FrescoNode | null {
  const copies = nodes.filter((node) => getElement(node.type));
  if (copies.length === 1) return copies[0]!;
  if (copies.length === 0) return null;
  const holder = create('fresco/container');
  if (!holder) return null;
  return { ...holder, attrs: { ...holder.attrs, content_width: 'full' }, children: copies };
}

/** Unlink: the element becomes a copy of the widget's content, on this page only. */
export async function unlinkGlobal(store: Store, nodeId: string): Promise<void> {
  const node = find(store.get().blocks, nodeId);
  const global = node && globalOf(node);
  if (!node || !global) return;
  const content = contentNode(await global.provider.load(global.id));
  if (!content) {
    notify(tr('The global widget is empty.'), 'error');
    return;
  }
  const copy = cloneWithNewIds(content);
  const place = placeOf(store.get().blocks, nodeId);
  if (!place) return;
  store.actions.remove(nodeId);
  store.actions.insertNodes([copy], place);
  store.actions.select(copy.id);
}

/** Edit in place: the widget's content takes the element's place until saved or cancelled. */
export async function editGlobal(store: Store, nodeId: string, title: string): Promise<void> {
  const node = find(store.get().blocks, nodeId);
  const global = node && globalOf(node);
  if (!node || !global) return;
  const content = contentNode(await global.provider.load(global.id));
  if (!content) return;
  store.actions.beginGlobalEdit(nodeId, { id: global.id, title }, content);
}

/** Saves the global widget being edited in place, and shows its element again. */
export async function saveGlobal(store: Store): Promise<void> {
  const edit = store.get().globalEdit;
  if (!edit) return;
  const global = globalOf(edit.node);
  const content = find(store.get().blocks, edit.editId);
  if (!global || !content) {
    store.actions.endGlobalEdit();
    return;
  }
  await global.provider.save(global.id, [content]);
  store.actions.endGlobalEdit();
}

/** The Globals tab of the panel: the site's global widgets. */
export function GlobalsTab({
  store,
  onDragNode,
}: {
  store: Store;
  onDragNode?: (event: React.PointerEvent, make: () => FrescoNode, label: string) => void;
}) {
  const { t } = useT();
  const provider = globalWidgets();
  const [items, setItems] = useState<{ id: string; title: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const readOnly = useStore(store, (s) => s.readOnly || s.contentOnly);
  useEffect(() => {
    if (!provider) return;
    let live = true;
    provider
      .list()
      .then((list) => live && setItems(list))
      .catch((e: unknown) => live && setError(String(e instanceof Error ? e.message : e)));
    return () => {
      live = false;
    };
  }, [provider]);
  if (!provider) {
    return (
      <p className="fre-empty-note">
        {t(
          'Global widgets are saved once and used on many pages: change one and every copy changes. They come with Fresco Pro.',
        )}
      </p>
    );
  }
  const add = (id: string) => {
    const state = store.get();
    const node = provider.node(id);
    const selected = state.selected ? find(state.blocks, state.selected) : null;
    if (selected && getElement(selected.type)?.container) {
      store.actions.addNode(node, { parent: selected.id, index: selected.children?.length ?? 0 });
    } else {
      store.actions.addNode(node, { parent: null, index: state.blocks.length });
    }
  };
  const q = search.trim().toLowerCase();
  const shown = (items ?? []).filter((item) => !q || item.title.toLowerCase().includes(q));
  return (
    <div className="fre-globalslist">
      <div className="fre-searchbox">
        <Svg path="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3" size={14} />
        <input
          placeholder={t('Search global widgets…')}
          aria-label={t('Search global widgets')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {error && <p className="fre-error">{error}</p>}
      {!items && !error && <p className="fre-empty-note">{t('Loading…')}</p>}
      {items && shown.length === 0 && (
        <p className="fre-empty-note">
          {items.length === 0
            ? t('No global widgets yet: right-click an element and choose “Save as global widget”.')
            : t('No global widgets found.')}
        </p>
      )}
      <div className="fre-tiles">
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            className="fre-tile fre-tile--global"
            disabled={readOnly}
            title={t('{element}: drag it onto the page, or click to add it', {
              element: item.title,
            })}
            onPointerDown={(e) => onDragNode?.(e, () => provider.node(item.id), item.title)}
            onClick={() => add(item.id)}
          >
            <Svg
              path="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18"
              size={28}
            />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
      <p className="fre-help">
        {t('Right-click an element and choose “Save as global widget” to add one.')}
      </p>
    </div>
  );
}
