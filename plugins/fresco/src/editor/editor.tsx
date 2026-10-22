/**
 * Fresco's editor (an `editors` entry of the admin): the panel on the left,
 * the page on the right in an iframe of the site, both reading one store.
 * Every change is handed to Cleitext (`onChange`), which saves, autosaves and
 * publishes the entry as usual.
 */
import { api as coreApi, t as translate, useT, type EditorProps } from '@cleitext/admin-sdk';
import type { CxdDocument } from '@cleitext/blocks';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setIconData, iconDataLoaded, type IconData } from '../core/icons.js';
import { extensions } from '../core/extensions.js';
import { normalizeKit } from '../core/kit.js';
import type { FrescoNode, MenuItem, RenderMediaItem, Settings } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { Canvas, startDrag, type CanvasApi } from './canvas.js';
import { activeDevices } from '../core/model.js';
import { DEVICE_ICONS, DEVICE_NAMES, Svg } from './controls.js';
import { saveTemplate } from './library.js';
import { Panel } from './panel.js';
import { loadPluginBlocks } from './plugin-blocks.js';
import { createStore, setTextTranslator, useStore, type PanelView, type Store } from './store.js';
import { EDITOR_CSS } from './styles.js';
import { find, placeOf } from './tree.js';
import { TopBar } from './topbar.js';
import { NavigatorWindow } from './navigator.js';
import { Finder, ShortcutsDialog } from './finder.js';
import { askText, confirmAction, Dialogs, notify } from './dialogs.js';
import './i18n.js';
import { nextDevice } from './frame-css.js';

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

/** The most limited access the extensions give this user. */
function accessOf(user: EditorProps['user']): 'full' | 'content' | 'none' {
  let access: 'full' | 'content' | 'none' = 'full';
  for (const fn of extensions().editorAccess) {
    try {
      const result = fn(user);
      if (result === 'none') return 'none';
      if (result === 'content') access = 'content';
    } catch {
      // A failing extension changes nothing.
    }
  }
  return access;
}

export function FrescoEditor(props: EditorProps) {
  const { document, onChange, readOnly, frameUrl, media, plugin, api, user, openSettings } = props;
  const access = accessOf(user);
  const store = useMemo(
    () =>
      createStore({
        blocks: toNodes(document),
        page: (document.editor?.data ?? {}) as Settings,
        readOnly: readOnly || access === 'none',
        contentOnly: access === 'content',
        entry: { id: props.entry.id, type: props.entry.type, locale: props.entry.locale },
      }),
    // The editor is mounted again when the document is replaced from outside.
    [],
  );
  // New elements get their sample texts in the editor's language.
  useEffect(() => {
    setTextTranslator((text) => translate(text));
    return () => setTextTranslator(null);
  }, []);
  const canvas = useRef<CanvasApi>({ frame: null, doc: null, root: null });
  const [panelWidth, setPanelWidth] = usePanelWidth();
  const [finder, setFinder] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [panelHidden, setPanelHidden] = useState(false);
  useEffect(() => {
    const open = () => setShortcuts(true);
    window.addEventListener('fresco:shortcuts', open);
    return () => window.removeEventListener('fresco:shortcuts', open);
  }, []);
  const hostRef = useRef(props.host);
  const { t } = useT();
  const [mediaMap] = useState(() => new Map<string, RenderMediaItem>());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [iconsReady, setIconsReady] = useState(iconDataLoaded());
  const [menus, setMenus] = useState<Record<string, MenuItem[]>>({});
  // Bumped when the other plugins' blocks are known: the panel shows their tiles.
  const [, setPluginBlocks] = useState(0);
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
    // Blocks of the other plugins, offered in the panel.
    void loadPluginBlocks(props.entry.locale)
      .then(() => setPluginBlocks((n) => n + 1))
      .catch(() => {});
    void api<unknown>('GET', '/kit')
      .then((kit) => store.actions.setKit(normalizeKit(kit), false))
      .catch(() => {});
    // Once: `api` is a new function on every render of the host.
  }, []);

  // A panel asked by the address (`#fresco-site` from Fresco's overview page).
  useEffect(() => {
    const view = /^#fresco-(\w+)$/.exec(window.location.hash)?.[1];
    if (view && ['site', 'page', 'history', 'library', 'elements'].includes(view)) {
      store.actions.setView(view as PanelView);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [store]);

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
      const many = state.selection.length > 1 ? state.selection : null;
      if (primary && event.key.toLowerCase() === 's' && !event.shiftKey && !event.altKey) {
        // Handled by `saveKey` (capture phase), for the admin page and the canvas alike.
        return;
      } else if (primary && !event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setFinder(true);
      } else if (primary && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        store.actions.setView('site');
      } else if (primary && event.shiftKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        store.actions.setView('page');
      } else if (primary && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        // Every active device in turn, as in the top bar.
        store.actions.setDevice(nextDevice(state.device, state.kit.breakpoints));
      } else if (primary && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setPanelHidden((h) => !h);
      } else if (event.key === '?' && !typing) {
        event.preventDefault();
        setShortcuts(true);
      } else if (primary && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        store.actions.setView('history');
      } else if (primary && event.key.toLowerCase() === 'i' && !event.shiftKey) {
        event.preventDefault();
        store.actions.toggleNavigator();
      } else if (primary && event.shiftKey && event.key.toLowerCase() === 'v' && !typing) {
        event.preventDefault();
        if (state.selected) store.actions.pasteStyle(state.selected);
      } else if (primary && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault();
        if (event.shiftKey) store.actions.redo();
        else store.actions.undo();
      } else if (primary && event.key.toLowerCase() === 'y' && !typing) {
        event.preventDefault();
        store.actions.redo();
      } else if (primary && event.key.toLowerCase() === 'd' && state.selected && !typing) {
        event.preventDefault();
        if (many) store.actions.duplicateMany(many);
        else store.actions.duplicate(state.selected);
      } else if (
        primary &&
        event.key.toLowerCase() === 'c' &&
        state.selected &&
        !typing &&
        !window.getSelection()?.toString() &&
        !canvas.current.doc?.getSelection()?.toString()
      ) {
        if (many) store.actions.copyMany(many);
        else store.actions.copy(state.selected);
      } else if (primary && event.key.toLowerCase() === 'v' && !typing) {
        store.actions.paste(state.selected);
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        state.selected &&
        !typing
      ) {
        event.preventDefault();
        if (many) store.actions.removeMany(many);
        else store.actions.remove(state.selected);
      } else if (
        event.key === 'Escape' &&
        !typing &&
        // Escape closes an open popover (color, typography…) first.
        !window.document.querySelector('.fre-popover, .fre-popup')
      ) {
        setMenu(null);
        store.actions.select(null);
      }
    };
    /**
     * Ctrl/⌘+S saves once, wherever the focus is, and the browser's own Save
     * dialog never opens. With its own top bar Fresco saves (with the site
     * settings) and keeps the key from the admin's listener; in the admin's
     * bar, a key pressed in the canvas is passed on to the admin's page.
     */
    const saveKey = (event: KeyboardEvent) => {
      if (
        !event.isTrusted ||
        !(event.ctrlKey || event.metaKey) ||
        event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !== 's'
      )
        return;
      const host = hostRef.current;
      const fromFrame = event.view !== window;
      if (host) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat && !host.busy) void host.save();
      } else if (fromFrame) {
        event.preventDefault();
        window.document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    };
    const frameWindow = () => canvas.current.frame?.contentWindow;
    window.addEventListener('keydown', handler);
    // Capture, on the window: before the admin's listener on the document.
    window.addEventListener('keydown', saveKey, true);
    const attached = new WeakSet<Window>();
    let attachedTo: Window | null = null;
    const attach = setInterval(() => {
      const win = frameWindow();
      if (win && !attached.has(win)) {
        attached.add(win);
        attachedTo = win;
        win.addEventListener('keydown', handler);
        win.addEventListener('keydown', saveKey, true);
      }
    }, 500);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keydown', saveKey, true);
      clearInterval(attach);
      attachedTo?.removeEventListener('keydown', handler);
      attachedTo?.removeEventListener('keydown', saveKey, true);
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

  const saveAsTemplate = () => {
    void askText({
      title: t('Save the page as a template'),
      label: t('Name'),
      value: props.host?.title ?? '',
    }).then((name) => {
      if (!name) return;
      saveTemplate(name, 'page', store.get().blocks)
        .then(() => notify(t('Page saved as “{name}”.', { name }), 'success'))
        .catch((error: unknown) =>
          notify(String(error instanceof Error ? error.message : error), 'error'),
        );
    });
  };
  // Fresco Pro's theme builder, under the admin of this site.
  const themeBuilderUrl = user.capabilities.includes('manage_fresco_templates')
    ? `${window.location.pathname.split('/entries/')[0]}/ext/fresco-pro/theme-builder`
    : null;

  // The site settings are saved with the page, as in other builders.
  const kitDirty = useStore(store, (s) => s.kitDirty);
  const withKit = (action: () => Promise<void>) => async (): Promise<void> => {
    if (store.get().kitDirty && canManageKit) {
      try {
        await saveKit();
      } catch (error) {
        notify(String(error instanceof Error ? error.message : error), 'error');
        return;
      }
    }
    await action();
  };
  const host = props.host
    ? {
        ...props.host,
        dirty: props.host.dirty || kitDirty,
        save: withKit(props.host.save),
        publish: withKit(props.host.publish),
        submit: withKit(props.host.submit),
      }
    : undefined;
  hostRef.current = host;

  // The page's public address, for "View page" (once it is published).
  const published = props.host?.published === true;
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!published) {
      setViewUrl(null);
      return;
    }
    let cancelled = false;
    api<{ url: string }>('GET', `/entry-link?id=${encodeURIComponent(props.entry.id)}`)
      .then((link) => !cancelled && setViewUrl(link.url))
      .catch(() => !cancelled && setViewUrl(null));
    return () => {
      cancelled = true;
    };
    // `api` is a new function on every render of the host.
  }, [published, props.entry.id]);

  if (host) {
    return (
      <div
        className={`fre-root fre-root--full${panelHidden ? ' is-panel-hidden' : ''}`}
        data-icons={iconsReady ? 'ready' : 'loading'}
        style={{ '--fre-panel-width': `${panelWidth}px` } as React.CSSProperties}
      >
        <TopBar
          store={store}
          host={host}
          canManageKit={canManageKit}
          themeBuilderUrl={themeBuilderUrl}
          openSettings={openSettings}
          saveAsTemplate={saveAsTemplate}
          openFinder={() => setFinder(true)}
          viewUrl={viewUrl}
        />
        {host.error && (
          <div className="fre-hosterror" role="alert">
            {host.error}
          </div>
        )}
        <div className="fre-body">
          <aside className="fre-panel" aria-label="Fresco" hidden={panelHidden}>
            <PanelHeader store={store} />
            <Panel
              store={store}
              media={media}
              onDragStart={onDragStart}
              canManageKit={canManageKit}
              onSaveKit={saveKit}
              savesWithPage
              canManageSettings={user.capabilities.includes('manage_settings')}
              canManageTheme={user.capabilities.includes('edit_theme_settings')}
              host={host}
            />
            <PanelResizer width={panelWidth} onChange={setPanelWidth} />
          </aside>
          <main className="fre-main">
            <button
              type="button"
              className="fre-paneltoggle"
              title={panelHidden ? t('Show the panel (Ctrl+P)') : t('Hide the panel (Ctrl+P)')}
              aria-label={panelHidden ? t('Show the panel (Ctrl+P)') : t('Hide the panel (Ctrl+P)')}
              onClick={() => setPanelHidden((h) => !h)}
            >
              <Svg path={panelHidden ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} size={14} />
            </button>
            <Canvas
              store={store}
              frameUrl={frameUrl}
              assetsBase={assetsBase}
              context={{ media: mediaMap, locale: props.entry.locale, menus }}
              onContextMenu={(id, position) => setMenu({ id, ...position })}
              api={canvas}
              title={host.title}
              saved={!host.dirty && !host.busy}
            />
          </main>
          {/* Floating over the canvas, or docked to the right edge beside it. */}
          <NavigatorWindow store={store} />
        </div>
        {finder && (
          <Finder
            store={store}
            host={host}
            onClose={() => setFinder(false)}
            navigate={props.navigate}
          />
        )}
        {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
        <Dialogs />
        {menu && <ContextMenu store={store} menu={menu} onClose={() => setMenu(null)} />}
      </div>
    );
  }

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
      <Dialogs />
    </div>
  );
}

/** The panel's title, with the way back to the elements (as in other builders). */
function PanelHeader({ store }: { store: Store }) {
  const { t } = useT();
  const view = useStore(store, (s) => s.view);
  const selected = useStore(store, (s) => s.selected);
  const blocks = useStore(store, (s) => s.blocks);
  const node = view === 'element' && selected ? find(blocks, selected) : null;
  const elementTitle = node ? (getElement(node.type)?.title ?? node.type) : '';
  const titles: Record<PanelView, string> = {
    elements: t('Elements'),
    element: t('Edit {element}', { element: t(elementTitle) }),
    navigator: t('Structure'),
    library: t('Templates'),
    history: t('History'),
    page: t('Page settings'),
    site: t('Site settings'),
  };
  return (
    <div className="fre-panel__head">
      <h2>{titles[view]}</h2>
      {view !== 'elements' && (
        <button
          type="button"
          className="fre-panel__headbtn"
          title={t('Elements')}
          aria-label={t('Back to the elements')}
          onClick={() => store.actions.setView('elements')}
        >
          <Svg path="M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z" size={18} />
        </button>
      )}
    </div>
  );
}

function Toolbar({ store, openSettings }: { store: Store; openSettings: () => void }) {
  const { t } = useT();
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
          title={t(item.title)}
          aria-label={t(item.title)}
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
        title={t('Undo (Ctrl+Z)')}
        aria-label={t('Undo')}
        disabled={!store.canUndo()}
        onClick={() => store.actions.undo()}
      >
        <Svg path="M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3" size={17} />
      </button>
      <button
        type="button"
        className="fre-iconbtn"
        title={t('Redo (Ctrl+Shift+Z)')}
        aria-label={t('Redo')}
        disabled={!store.canRedo()}
        onClick={() => store.actions.redo()}
      >
        <Svg path="M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3" size={17} />
      </button>
      <button
        type="button"
        className="fre-iconbtn"
        title={t('Entry settings: status, fields, revisions')}
        aria-label={t('Entry settings')}
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
  const { t } = useT();
  const device = useStore(store, (s) => s.device);
  const breakpoints = useStore(store, (s) => s.kit.breakpoints);
  return (
    <div className="fre-devicebar" role="group" aria-label={t('Preview device')}>
      {activeDevices(breakpoints).map((d) => (
        <button
          key={d}
          type="button"
          className={`fre-iconbtn${device === d ? ' is-on' : ''}`}
          title={t(DEVICE_NAMES[d])}
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
  const { t } = useT();
  const node = menu.id ? find(store.get().blocks, menu.id) : null;
  const title = node ? t(getElement(node.type)?.title ?? node.type) : t('Page');
  // On one of several selected elements, Duplicate, Copy and Delete act on all of them.
  const selection = store.get().selection;
  const many = node && selection.length > 1 && selection.includes(node.id) ? selection : null;
  const hasClipboard = (() => {
    try {
      return Boolean(store.get().clipboard ?? localStorage.getItem('fresco:clipboard'));
    } catch {
      return Boolean(store.get().clipboard);
    }
  })();
  const item = (
    label: string,
    action: () => void,
    options: { disabled?: boolean; shortcut?: string; danger?: boolean } = {},
  ) => (
    <button
      type="button"
      role="menuitem"
      className={options.danger ? 'is-danger' : ''}
      disabled={options.disabled}
      onClick={() => {
        action();
        onClose();
      }}
    >
      <span>{label}</span>
      {options.shortcut && <kbd>{options.shortcut}</kbd>}
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
  const pasteAtEnd = () => {
    const state = store.get();
    const last = state.blocks[state.blocks.length - 1];
    store.actions.paste(last?.id ?? null);
  };
  return (
    <div
      className="fre-menu"
      role="menu"
      aria-label={title}
      style={{
        left: Math.min(menu.x, window.innerWidth - 260),
        top: Math.min(menu.y, window.innerHeight - 380),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {node ? (
        <>
          <div className="fre-menu__group">
            {many && (
              <p className="fre-menu__note">
                {t('{count} elements selected', { count: many.length })}
              </p>
            )}
            {item(t('Edit {element}', { element: title }), () => store.actions.select(menu.id))}
            {item(
              t('Duplicate'),
              () => (many ? store.actions.duplicateMany(many) : store.actions.duplicate(menu.id)),
              { shortcut: 'Ctrl+D' },
            )}
          </div>
          <div className="fre-menu__group">
            {item(
              t('Copy'),
              () => (many ? store.actions.copyMany(many) : store.actions.copy(menu.id)),
              { shortcut: 'Ctrl+C' },
            )}
            {item(t('Paste'), () => store.actions.paste(menu.id), {
              disabled: !hasClipboard,
              shortcut: 'Ctrl+V',
            })}
            {item(t('Paste style'), () => store.actions.pasteStyle(menu.id), {
              disabled: store.get().clipboard?.[0]?.type !== node.type,
              shortcut: 'Ctrl+Shift+V',
            })}
            {item(t('Reset style'), () => store.actions.resetStyle(menu.id))}
          </div>
          <div className="fre-menu__group">
            {item(t('Structure'), () => store.actions.setView('navigator'), {
              shortcut: 'Ctrl+I',
            })}
            {item(t('Save as template'), () => {
              void askText({
                title: t('Save the section as a template'),
                label: t('Name'),
                value: title,
              }).then((name) => {
                if (!name) return;
                saveTemplate(name, 'section', [node])
                  .then(() => notify(t('Section saved as “{name}”.', { name }), 'success'))
                  .catch((error: unknown) =>
                    notify(String(error instanceof Error ? error.message : error), 'error'),
                  );
              });
            })}
            {extensions()
              .menuActions.filter((action) => !action.when || action.when(node))
              .map((action) => (
                <Fragment key={action.label}>
                  {item(t(action.label), () => {
                    void Promise.resolve(
                      action.run(node, {
                        replace: (next) => {
                          const place = placeOf(store.get().blocks, node.id);
                          if (!place) return;
                          store.actions.remove(node.id);
                          store.actions.insertNodes([next], place);
                          store.actions.select(next.id);
                        },
                      }),
                    ).catch((error: unknown) =>
                      notify(String(error instanceof Error ? error.message : error), 'error'),
                    );
                  })}
                </Fragment>
              ))}
          </div>
          <div className="fre-menu__group">
            {item(
              many ? t('Delete {count} elements', { count: many.length }) : t('Delete'),
              () => (many ? store.actions.removeMany(many) : store.actions.remove(menu.id)),
              { shortcut: 'Del', danger: true },
            )}
          </div>
        </>
      ) : (
        <>
          <div className="fre-menu__group">
            {item(t('Paste'), pasteAtEnd, { disabled: !hasClipboard, shortcut: 'Ctrl+V' })}
            {item(
              t('Copy all'),
              () => {
                const blocks = store.get().blocks;
                store.actions.copyMany(blocks.map((block) => block.id));
                notify(
                  t('The whole page was copied: paste it here or on another page.'),
                  'success',
                );
              },
              { disabled: store.get().blocks.length === 0 },
            )}
            {item(t('Structure'), () => store.actions.setView('navigator'), {
              shortcut: 'Ctrl+I',
            })}
          </div>
          <div className="fre-menu__group">
            {item(
              t('Delete all content'),
              () =>
                void confirmAction({
                  title: t('Delete all the content of this page?'),
                  text: t('You can bring it back with Undo or from the History.'),
                  action: t('Delete'),
                  danger: true,
                }).then((ok) => {
                  if (ok) store.actions.removeMany(store.get().blocks.map((block) => block.id));
                }),
              { disabled: store.get().blocks.length === 0, danger: true },
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Closes the menu on a click in the canvas too. */
function canvasWindowClose(close: () => void) {
  const frame = window.document.querySelector<HTMLIFrameElement>('.fre-iframe');
  frame?.contentWindow?.addEventListener('pointerdown', close, { once: true });
}

// ---- Width of the panel -------------------------------------------------------------------

const PANEL_KEY = 'fresco:panel-width';
export const PANEL_WIDTH = { min: 280, max: 600, initial: 300 } as const;

/** A width within the panel's limits. */
export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return PANEL_WIDTH.initial;
  return Math.round(Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, width)));
}

/** The panel's width, kept in the browser for this user. */
function usePanelWidth(): [number, (width: number | null) => void] {
  const [width, setWidth] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(PANEL_KEY));
      return stored ? clampPanelWidth(stored) : PANEL_WIDTH.initial;
    } catch {
      return PANEL_WIDTH.initial;
    }
  });
  const change = useCallback((next: number | null) => {
    const value = next === null ? PANEL_WIDTH.initial : clampPanelWidth(next);
    setWidth(value);
    try {
      if (next === null) localStorage.removeItem(PANEL_KEY);
      else localStorage.setItem(PANEL_KEY, String(value));
    } catch {
      // Private mode: kept until the page closes.
    }
  }, []);
  return [width, change];
}

/** The handle on the panel's right edge: drag to resize, double-click to reset. */
function PanelResizer({
  width,
  onChange,
}: {
  width: number;
  onChange: (width: number | null) => void;
}) {
  const { t } = useT();
  const start = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const from = { x: event.clientX, width };
    const root = (event.currentTarget as HTMLElement).closest('.fre-root');
    // The canvas iframe would swallow the pointer while dragging.
    root?.classList.add('is-resizing-panel');
    const move = (e: PointerEvent) => onChange(from.width + e.clientX - from.x);
    const up = () => {
      root?.classList.remove('is-resizing-panel');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      className="fre-panel__resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Panel width (double-click to reset)')}
      aria-valuemin={PANEL_WIDTH.min}
      aria-valuemax={PANEL_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      title={t('Panel width (double-click to reset)')}
      onPointerDown={start}
      onDoubleClick={() => onChange(null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(width - 10);
        else if (e.key === 'ArrowRight') onChange(width + 10);
        else return;
        e.preventDefault();
      }}
    />
  );
}
