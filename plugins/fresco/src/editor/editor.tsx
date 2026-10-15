/**
 * Fresco's editor (an `editors` entry of the admin): the panel on the left,
 * the page on the right in an iframe of the site, both reading one store.
 * Every change is handed to Cleitext (`onChange`), which saves, autosaves and
 * publishes the entry as usual.
 */
import { api as coreApi, type EditorProps } from '@cleitext/admin-sdk';
import type { CxdDocument } from '@cleitext/blocks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setIconData, iconDataLoaded, type IconData } from '../core/icons.js';
import { normalizeKit } from '../core/kit.js';
import type { FrescoNode, MenuItem, RenderMediaItem, Settings } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { Canvas, startDrag, type CanvasApi } from './canvas.js';
import { DEVICE_ICONS, Svg } from './controls.js';
import { saveTemplate } from './library.js';
import { Panel } from './panel.js';
import { createStore, useStore, type PanelView, type Store } from './store.js';
import { EDITOR_CSS } from './styles.js';
import { find } from './tree.js';

const VIEWS: { view: PanelView; title: string; icon: string }[] = [
  {
    view: 'elements',
    title: 'Elements',
    icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  },
  { view: 'library', title: 'Templates', icon: 'M4 5h6v14H4z M12 5h3v14h-3z M17 6l3 1-3 12-3-1z' },
  {
    view: 'navigator',
    title: 'Navigator',
    icon: 'M12 3l9 4.5-9 4.5-9-4.5z M3 12l9 4.5 9-4.5 M3 16.5L12 21l9-4.5',
  },
  { view: 'page', title: 'Page settings', icon: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6' },
  {
    view: 'site',
    title: 'Site settings',
    icon: 'M12 3a9 9 0 0 0 0 18c1.2 0 1.9-1 1.5-2-.5-1.3.4-2.3 1.7-2.3H17a4 4 0 0 0 4-4C21 7.3 17 3 12 3z M7 11.5h.01 M10.5 7.5h.01 M15 9h.01',
  },
];

/** The elements of a document, as Fresco sees them. */
function toNodes(document: CxdDocument): FrescoNode[] {
  return document.blocks as unknown as FrescoNode[];
}

export function FrescoEditor(props: EditorProps) {
  const { document, onChange, readOnly, frameUrl, media, plugin, api, user, openSettings } = props;
  const store = useMemo(
    () =>
      createStore({
        blocks: toNodes(document),
        page: (document.editor?.data ?? {}) as Settings,
        readOnly,
        entry: { id: props.entry.id, type: props.entry.type, locale: props.entry.locale },
      }),
    // The editor is mounted again when the document is replaced from outside.
    [],
  );
  const canvas = useRef<CanvasApi>({ frame: null, doc: null, root: null });
  const [mediaMap] = useState(() => new Map<string, RenderMediaItem>());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [iconsReady, setIconsReady] = useState(iconDataLoaded());
  const [menus, setMenus] = useState<Record<string, MenuItem[]>>({});
  const assetsBase = `/plugin-assets/fresco/${encodeURIComponent(plugin.version)}`;
  const canManageKit = user.capabilities.includes('manage_fresco');

  // The editor's own styles, in the admin page.
  useEffect(() => {
    const style = window.document.createElement('style');
    style.id = 'fresco-editor';
    style.textContent = EDITOR_CSS;
    window.document.head.append(style);
    return () => style.remove();
  }, []);

  // Icons and the site's kit.
  useEffect(() => {
    if (!iconDataLoaded()) {
      void fetch(`${assetsBase}/icons.json`)
        .then((r) => r.json())
        .then((data: IconData) => {
          setIconData(data);
          setIconsReady(true);
        })
        .catch(() => {});
    }
    // The site's menus, for Nav menu widgets (only users who manage menus can read them).
    type Node = {
      id: string;
      label: string | null;
      displayLabel: string;
      url: string | null;
      target: '_blank' | null;
      children: Node[];
    };
    const toItems = (nodes: Node[]): MenuItem[] =>
      nodes.map((n) => ({
        id: n.id,
        label: n.label ?? n.displayLabel,
        url: n.url ?? '#',
        ...(n.target ? { target: n.target } : {}),
        current: false,
        children: toItems(n.children),
      }));
    void coreApi<{ location: string | null; items: Node[] }[]>(
      'GET',
      `/menus?locale=${encodeURIComponent(props.entry.locale)}`,
    )
      .then((list) =>
        setMenus(
          Object.fromEntries(
            list.filter((m) => m.location).map((m) => [m.location!, toItems(m.items)]),
          ),
        ),
      )
      .catch(() => {});
    void api<unknown>('GET', '/kit')
      .then((kit) => store.actions.setKit(normalizeKit(kit), false))
      .catch(() => {});
    // Once: `api` is a new function on every render of the host.
  }, []);

  // Changes go to Cleitext, which saves them with the entry.
  useEffect(
    () =>
      store.onChange((state) => {
        const data = state.page;
        onChange({
          schema: 1,
          blocks: state.blocks as unknown as CxdDocument['blocks'],
          editor: { id: 'fresco', ...(Object.keys(data).length ? { data } : {}) },
        });
      }),
    [onChange, store],
  );

  // Keyboard shortcuts (also from the canvas).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const primary = event.ctrlKey || event.metaKey;
      const state = store.get();
      if (primary && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault();
        if (event.shiftKey) store.actions.redo();
        else store.actions.undo();
      } else if (primary && event.key.toLowerCase() === 'y' && !typing) {
        event.preventDefault();
        store.actions.redo();
      } else if (primary && event.key.toLowerCase() === 'd' && state.selected && !typing) {
        event.preventDefault();
        store.actions.duplicate(state.selected);
      } else if (
        primary &&
        event.key.toLowerCase() === 'c' &&
        state.selected &&
        !typing &&
        !window.getSelection()?.toString()
      ) {
        store.actions.copy(state.selected);
      } else if (primary && event.key.toLowerCase() === 'v' && !typing) {
        store.actions.paste(state.selected);
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        state.selected &&
        !typing
      ) {
        event.preventDefault();
        store.actions.remove(state.selected);
      } else if (event.key === 'Escape' && !typing) {
        setMenu(null);
        store.actions.select(null);
      }
    };
    const frameWindow = () => canvas.current.frame?.contentWindow;
    window.addEventListener('keydown', handler);
    const attach = setInterval(() => {
      const win = frameWindow();
      if (win && !(win as unknown as { __frescoKeys?: boolean }).__frescoKeys) {
        (win as unknown as { __frescoKeys?: boolean }).__frescoKeys = true;
        win.addEventListener('keydown', handler);
      }
    }, 500);
    return () => {
      window.removeEventListener('keydown', handler);
      clearInterval(attach);
      frameWindow()?.removeEventListener('keydown', handler);
    };
  }, [store]);

  const onDragStart = useCallback(
    (event: React.PointerEvent, type: string, label: string) => {
      if (event.button !== 0 || readOnly || !canvas.current.frame) return;
      startDrag(event, canvas.current.frame, store, { kind: 'new', type, label });
    },
    [readOnly, store],
  );

  const saveKit = useCallback(async () => {
    const saved = await api<unknown>('PUT', '/kit', store.get().kit);
    store.actions.setKit(normalizeKit(saved), false);
  }, [api, store]);

  return (
    <div className="fre-root" data-icons={iconsReady ? 'ready' : 'loading'}>
      <aside className="fre-panel" aria-label="Fresco">
        <Toolbar store={store} openSettings={openSettings} />
        <Panel
          store={store}
          media={media}
          onDragStart={onDragStart}
          canManageKit={canManageKit}
          onSaveKit={saveKit}
        />
      </aside>
      <main className="fre-main">
        <DeviceBar store={store} />
        <Canvas
          store={store}
          frameUrl={frameUrl}
          assetsBase={assetsBase}
          context={{ media: mediaMap, locale: props.entry.locale, menus }}
          onContextMenu={(id, position) => setMenu({ id, ...position })}
          api={canvas}
        />
      </main>
      {menu && <ContextMenu store={store} menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function Toolbar({ store, openSettings }: { store: Store; openSettings: () => void }) {
  const view = useStore(store, (s) => s.view);
  // Re-render on every change so undo/redo know whether they can act.
  useStore(store, (s) => s.blocks);
  useStore(store, (s) => s.page);
  return (
    <div className="fre-toolbar">
      <span className="fre-brand">Fresco</span>
      {VIEWS.map((item) => (
        <button
          key={item.view}
          type="button"
          className={`fre-iconbtn${view === item.view ? ' is-on' : ''}`}
          title={item.title}
          aria-label={item.title}
          aria-pressed={view === item.view}
          onClick={() => store.actions.setView(item.view)}
        >
          <Svg path={item.icon} size={17} />
        </button>
      ))}
      <span className="fre-toolbar__gap" />
      <button
        type="button"
        className="fre-iconbtn"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        disabled={!store.canUndo()}
        onClick={() => store.actions.undo()}
      >
        <Svg path="M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3" size={17} />
      </button>
      <button
        type="button"
        className="fre-iconbtn"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        disabled={!store.canRedo()}
        onClick={() => store.actions.redo()}
      >
        <Svg path="M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3" size={17} />
      </button>
      <button
        type="button"
        className="fre-iconbtn"
        title="Entry settings: status, fields, revisions"
        aria-label="Entry settings"
        onClick={openSettings}
      >
        <Svg
          path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4L7 17 M17 7l1.4-1.4"
          size={17}
        />
      </button>
    </div>
  );
}

function DeviceBar({ store }: { store: Store }) {
  const device = useStore(store, (s) => s.device);
  return (
    <div className="fre-devicebar" role="group" aria-label="Preview device">
      {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
        <button
          key={d}
          type="button"
          className={`fre-iconbtn${device === d ? ' is-on' : ''}`}
          title={d[0]!.toUpperCase() + d.slice(1)}
          aria-pressed={device === d}
          onClick={() => store.actions.setDevice(d)}
        >
          <Svg path={DEVICE_ICONS[d]} size={17} />
        </button>
      ))}
    </div>
  );
}

function ContextMenu({
  store,
  menu,
  onClose,
}: {
  store: Store;
  menu: { id: string; x: number; y: number };
  onClose: () => void;
}) {
  const node = find(store.get().blocks, menu.id);
  const title = node ? (getElement(node.type)?.title ?? node.type) : '';
  const hasClipboard = (() => {
    try {
      return Boolean(store.get().clipboard ?? localStorage.getItem('fresco:clipboard'));
    } catch {
      return Boolean(store.get().clipboard);
    }
  })();
  const item = (label: string, action: () => void, disabled = false, shortcut?: string) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        action();
        onClose();
      }}
    >
      <span>{label}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
  useEffect(() => {
    const close = () => onClose();
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', close, { once: true });
      canvasWindowClose(close);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', close);
    };
  }, [onClose, store]);
  return (
    <div
      className="fre-menu"
      role="menu"
      aria-label={title}
      style={{
        left: Math.min(menu.x, window.innerWidth - 220),
        top: Math.min(menu.y, window.innerHeight - 320),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="fre-menu__title">{title}</p>
      {item('Edit', () => store.actions.select(menu.id))}
      {item('Duplicate', () => store.actions.duplicate(menu.id), false, 'Ctrl+D')}
      {item('Copy', () => store.actions.copy(menu.id), false, 'Ctrl+C')}
      {item('Paste', () => store.actions.paste(menu.id), !hasClipboard, 'Ctrl+V')}
      {item(
        'Paste style',
        () => store.actions.pasteStyle(menu.id),
        store.get().clipboard?.type !== node?.type,
      )}
      {item('Reset style', () => store.actions.resetStyle(menu.id))}
      {item('Save as template', () => {
        const node = find(store.get().blocks, menu.id);
        const name =
          node && window.prompt('Name of the template', getElement(node.type)?.title ?? '');
        if (node && name) void saveTemplate(name, 'section', [node]).catch(() => {});
      })}
      {item('Navigator', () => store.actions.setView('navigator'))}
      {item('Delete', () => store.actions.remove(menu.id), false, 'Del')}
    </div>
  );
}

/** Closes the menu on a click in the canvas too. */
function canvasWindowClose(close: () => void) {
  const frame = window.document.querySelector<HTMLIFrameElement>('.fre-iframe');
  frame?.contentWindow?.addEventListener('pointerdown', close, { once: true });
}
