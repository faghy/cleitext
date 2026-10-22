/** The side panel: elements, the selected element's settings, navigator, page and site settings. */
import { t as tr, useT, type EditorHost, type EditorMedia } from '@cleitext/admin-sdk';
import { useEffect, useState, type ComponentType } from 'react';
import { conditionMet, withDefaults } from '../core/css.js';
import {
  activeDevices,
  type Control,
  type ElementCategory,
  type FrescoNode,
  type Settings,
  type Tab,
} from '../core/model.js';
import { getElement, listElements } from '../core/registry.js';
import { ControlField, DragHandle, Svg, useDragReorder, type ControlEnv } from './controls.js';
import { PAGE_STYLE_CONTROLS, pageStyleSettings } from '../core/page-css.js';
import { AtomicStyle } from './atomic-style.js';
import { controlsOf, extensions } from '../core/extensions.js';
import { LibraryView } from './library.js';
import { documentKind } from './document-kind.js';
import { HistoryView } from './history.js';
import { MediaIdField, SiteView } from './site-settings.js';
import { elementSource, PluginBlockFields, pluginBlockTitle, pluginName } from './plugin-blocks.js';
import { PreferencesView } from './preferences.js';
import { GlobalsTab } from './globals.js';
import { useStore, type Store } from './store.js';
import { find, pathTo } from './tree.js';
import { controlShown, hasHoverView, parentLayout } from './panel-filter.js';

const CATEGORIES: { id: ElementCategory; title: string }[] = [
  { id: 'layout', title: 'Layout' },
  { id: 'basic', title: 'Basic' },
  { id: 'general', title: 'General' },
  { id: 'media', title: 'Media' },
  { id: 'site', title: 'Site' },
  { id: 'plugins', title: 'Plugins' },
  { id: 'pro', title: 'Pro' },
  { id: 'atomic', title: 'Atomic' },
];

export interface PanelProps {
  store: Store;
  media: {
    upload: (file: File) => Promise<EditorMedia>;
    list: (query: { kind?: 'image'; search?: string }) => Promise<EditorMedia[]>;
  };
  onDragStart: (event: React.PointerEvent, type: string, label: string) => void;
  /** Drags ready-made elements (a global widget) onto the page. */
  onDragNode?: (event: React.PointerEvent, make: () => FrescoNode, label: string) => void;
  canManageKit: boolean;
  onSaveKit: () => Promise<void>;
  /** The site settings are saved with the page (Publish), not with their own button. */
  savesWithPage?: boolean;
  /** The user may change the site's title and tagline. */
  canManageSettings?: boolean;
  /** The user may change the theme's settings (logo, site icon). */
  canManageTheme?: boolean;
  /** The entry editor's actions (full screen): title, status, featured image. */
  host?: EditorHost;
  /** The user's capabilities. */
  capabilities?: readonly string[];
  /** The page in the canvas (live previews of Site settings panels). */
  canvas?: () => Document | null;
}

export function Panel(props: PanelProps) {
  const view = useStore(props.store, (s) => s.view);
  const contentOnly = useStore(props.store, (s) => s.contentOnly);
  if (contentOnly && ['elements', 'library', 'site'].includes(view)) {
    return (
      <div className="fre-panel__body">
        <p className="fre-empty-note">
          {tr(
            'You can change the texts, images and links of this page: select an element on the page.',
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="fre-panel__body">
      {view === 'elements' && <ElementsView {...props} />}
      {view === 'element' && <ElementView {...props} />}
      {view === 'navigator' && <Navigator store={props.store} />}
      {view === 'library' && <LibraryView store={props.store} />}
      {view === 'history' && <HistoryView store={props.store} />}
      {view === 'page' && <PageView {...props} />}
      {view === 'site' && <SiteView {...props} />}
      {view === 'preferences' && <PreferencesView store={props.store} />}
    </div>
  );
}

// ---- Elements ----------------------------------------------------------------------------

/** Kept in the browser: favorites and closed categories of the elements panel. */
function useStored<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Private mode: kept until the page closes.
    }
  };
  return [value, set];
}

function ElementsView({ store, onDragStart, onDragNode }: PanelProps) {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'elements' | 'globals'>('elements');
  // The user's favorites (User preferences, kept for the user).
  const favorites = useStore(store, (s) => s.prefs.favorites);
  const setFavorites = (next: string[]) => store.actions.setPrefs({ favorites: next });
  const [closed, setClosed] = useStored<string[]>('fresco:closed-categories', []);
  const [source, setSource] = useStored<string>('fresco:element-source', '');
  const [tileMenu, setTileMenu] = useState<{ type: string; x: number; y: number } | null>(null);
  const elements = listElements();
  // The plugins the elements come from: a filter when there are others than Fresco.
  const sources = [...new Set(elements.filter((e) => !e.hidden).map((e) => elementSource(e.type)))];
  const shownSource = sources.includes(source) ? source : '';
  const q = search.trim().toLowerCase();
  const matches = (title: string, keywords: string[] = [], plugin = '') =>
    !q ||
    title.toLowerCase().includes(q) ||
    t(title).toLowerCase().includes(q) ||
    keywords.some((k) => k.includes(q)) ||
    pluginName(plugin).toLowerCase().includes(q);
  const addAtEnd = (type: string) => {
    const state = store.get();
    // After the selected element, or at the end of the page.
    const selected = state.selected ? find(state.blocks, state.selected) : null;
    if (selected && getElement(selected.type)?.container) {
      store.actions.add(type, { parent: selected.id, index: selected.children?.length ?? 0 });
    } else {
      store.actions.add(type, { parent: null, index: state.blocks.length });
    }
  };
  useEffect(() => {
    if (!tileMenu) return;
    const close = () => setTileMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [tileMenu]);
  const visible = elements.filter(
    (e) =>
      !e.hidden &&
      matches(e.title, e.keywords, elementSource(e.type)) &&
      (!shownSource || elementSource(e.type) === shownSource),
  );
  const groups = [
    ...(favorites.length
      ? [
          {
            id: 'favorites',
            title: 'Favorites',
            list: visible.filter((e) => favorites.includes(e.type)),
          },
        ]
      : []),
    ...CATEGORIES.map((category) => ({
      id: category.id as string,
      title: category.title,
      list: visible.filter((e) => e.category === category.id),
    })),
  ].filter((group) => group.list.length > 0);
  const tile = (element: (typeof elements)[number]) => {
    // Blocks of other plugins carry the plugin's name (they may share titles with Fresco's).
    const from = elementSource(element.type);
    const badge = from === 'fresco' || from === 'fresco-pro' ? null : pluginName(from);
    return (
      <button
        key={element.type}
        type="button"
        className={`fre-tile${badge ? ' fre-tile--plugin' : ''}`}
        data-source={from}
        title={
          (badge ? `${badge} · ` : '') +
          t('{element}: drag it onto the page, or click to add it', {
            element: t(element.title),
          })
        }
        onPointerDown={(e) => onDragStart(e, element.type, t(element.title))}
        onClick={() => addAtEnd(element.type)}
        onContextMenu={(e) => {
          e.preventDefault();
          setTileMenu({ type: element.type, x: e.clientX, y: e.clientY });
        }}
      >
        <Svg path={element.icon} size={28} />
        <span>{t(element.title)}</span>
        {badge && <em className="fre-tile__badge">{badge}</em>}
      </button>
    );
  };
  return (
    <div className="fre-elements">
      <div className="fre-subtabs" role="tablist">
        {(['elements', 'globals'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'is-on' : ''}
            onClick={() => setTab(id)}
          >
            {id === 'elements' ? t('Elements') : t('Globals')}
          </button>
        ))}
      </div>
      {tab === 'globals' ? (
        <GlobalsTab store={store} onDragNode={onDragNode} />
      ) : (
        <>
          <div className="fre-searchbox">
            <Svg path="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3" size={14} />
            <input
              placeholder={t('Search elements…')}
              aria-label={t('Search elements')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {sources.length > 1 && (
            <div className="fre-sourcefilter">
              <select
                className="fre-input"
                aria-label={t('Elements of')}
                value={shownSource}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">{t('All plugins')}</option>
                {sources.map((slug) => (
                  <option key={slug} value={slug}>
                    {pluginName(slug)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {groups.map((group) => {
            const isClosed = !q && closed.includes(group.id);
            return (
              <section key={group.id} className={`fre-category${isClosed ? ' is-closed' : ''}`}>
                <button
                  type="button"
                  className="fre-category__head"
                  aria-expanded={!isClosed}
                  onClick={() =>
                    setClosed(
                      isClosed ? closed.filter((c) => c !== group.id) : [...closed, group.id],
                    )
                  }
                >
                  <span>{t(group.title)}</span>
                  <Svg path="M9 6l6 6-6 6" size={12} />
                </button>
                {!isClosed && <div className="fre-tiles">{group.list.map(tile)}</div>}
              </section>
            );
          })}
          {groups.length === 0 && <p className="fre-empty-note">{t('No elements found.')}</p>}
        </>
      )}
      {tileMenu && (
        <div
          className="fre-menu"
          role="menu"
          style={{ left: tileMenu.x, top: tileMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setFavorites(
                favorites.includes(tileMenu.type)
                  ? favorites.filter((f) => f !== tileMenu.type)
                  : [...favorites, tileMenu.type],
              );
              setTileMenu(null);
            }}
          >
            <span>
              {favorites.includes(tileMenu.type)
                ? t('Remove from favorites')
                : t('Add to favorites')}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Element settings -----------------------------------------------------------------------

const TAB_ICONS: Record<Tab, string> = {
  content: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z M13.5 6.5l3 3',
  style: 'M12 3a9 9 0 1 0 0 18V3z M12 3a9 9 0 0 1 0 18',
  advanced:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 2v3 M12 19v3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1L7 17 M17 7l2.1-2.1',
};

function ElementView({ store, media, canManageKit }: PanelProps) {
  const { t: tr } = useT();
  const selected = useStore(store, (s) => s.selected);
  const blocks = useStore(store, (s) => s.blocks);
  const tab = useStore(store, (s) => s.tab);
  const device = useStore(store, (s) => s.device);
  const kit = useStore(store, (s) => s.kit);
  const readOnly = useStore(store, (s) => s.readOnly);
  const contentOnly = useStore(store, (s) => s.contentOnly);
  const locale = useStore(store, (s) => s.entry.locale);
  const selectionCount = useStore(store, (s) => s.selection.length);
  const [hover, setHover] = useState<Record<string, boolean>>({});
  const [openSection, setOpenSection] = useState<Record<string, string | null>>({});
  const node = selected ? find(blocks, selected) : null;
  const definition = node ? getElement(node.type) : null;
  if (!node || !definition) {
    return <p className="fre-empty-note">{tr('Select an element on the page to edit it.')}</p>;
  }
  const settings = withDefaults(definition, node.attrs);
  const allControls = controlsOf(definition);
  const shownTab = contentOnly ? 'content' : tab;
  // "Hide on <device>" only for the devices in use.
  const devices: readonly string[] = activeDevices(kit.breakpoints);
  // Item fields of the parent's layout only: flex (align self, size) or grid (spans).
  const parentPath = pathTo(blocks, node.id);
  const layout = parentLayout(
    parentPath.length > 1 ? find(blocks, parentPath[parentPath.length - 2]!) : null,
  );
  const controls = allControls.filter(
    (c) =>
      c.tab === shownTab &&
      conditionMet(c, settings) &&
      !(c.name.startsWith('_hide_') && !devices.includes(c.name.slice(6))) &&
      (controlShown(c, { hover: false, layout }) || controlShown(c, { hover: true, layout })),
  );
  const sections = [...new Set(controls.map((c) => c.section))];
  const sectionKey = `${node.type}:${tab}`;
  const current = openSection[sectionKey] === undefined ? sections[0] : openSection[sectionKey];
  const path = pathTo(blocks, node.id);
  return (
    <div className="fre-element">
      {selectionCount > 1 && (
        <p className="fre-multinote" role="status">
          <strong>{tr('{count} elements selected', { count: selectionCount })}</strong>
          <span>
            {tr(
              'The panel edits the last one you clicked. Delete, Duplicate and Copy act on all of them.',
            )}
          </span>
          <button type="button" onClick={() => store.actions.select(node.id)}>
            {tr('Select only this one')}
          </button>
        </p>
      )}
      <nav className="fre-crumbs" aria-label={tr('Element path')}>
        {path.map((id, i) => {
          const item = find(blocks, id);
          const title = item ? elementTitle(item, locale) : id;
          return (
            <span key={id}>
              {i > 0 && <span aria-hidden="true"> › </span>}
              {id === node.id ? (
                <strong>{title}</strong>
              ) : (
                <button type="button" onClick={() => store.actions.select(id)}>
                  {title}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <div className="fre-tabs" role="tablist">
        {(contentOnly ? (['content'] as Tab[]) : (['content', 'style', 'advanced'] as Tab[])).map(
          (t) =>
            allControls.some((c) => c.tab === t) || (definition.atomic && t === 'style') ? (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={shownTab === t}
                className={shownTab === t ? 'is-on' : ''}
                onClick={() => store.actions.setTab(t)}
              >
                <Svg path={TAB_ICONS[t]} size={16} />
                <span>
                  {tr(t === 'content' ? 'Content' : t === 'style' ? 'Style' : 'Advanced')}
                </span>
              </button>
            ) : null,
        )}
      </div>
      {definition.atomic && shownTab === 'style' && (
        <AtomicStyle store={store} node={node} canManageKit={canManageKit} />
      )}
      {sections.map((section) => {
        const inSection = controls.filter((c) => c.section === section);
        const hoverable = hasHoverView(inSection);
        const key = `${node.type}:${tab}:${section}`;
        const isHover = hover[key] === true;
        const env: ControlEnv = {
          attrs: node.attrs,
          settings,
          device,
          hover: isHover,
          kit,
          readOnly,
          setDevice: (d) => store.actions.setDevice(d),
          set: (changes, merge) => store.actions.setSettings(node.id, changes, merge),
          media,
        };
        const open = current === section;
        return (
          <section key={section} className={`fre-section${open ? ' is-open' : ''}`}>
            <button
              type="button"
              className="fre-section__head"
              aria-expanded={open}
              onClick={() => setOpenSection((s) => ({ ...s, [sectionKey]: open ? null : section }))}
            >
              <span>{tr(section)}</span>
              <Svg path={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={12} />
            </button>
            {open && (
              <div className="fre-section__body">
                {hoverable && (
                  <div className="fre-states" role="tablist">
                    <button
                      type="button"
                      className={!isHover ? 'is-on' : ''}
                      onClick={() => setHover((h) => ({ ...h, [key]: false }))}
                    >
                      {tr('Normal')}
                    </button>
                    <button
                      type="button"
                      className={isHover ? 'is-on' : ''}
                      onClick={() => setHover((h) => ({ ...h, [key]: true }))}
                    >
                      {tr('Hover')}
                    </button>
                  </div>
                )}
                {inSection
                  .filter((c) => controlShown(c, { hover: hoverable && isHover, layout }))
                  .map((control) =>
                    control.type === 'pluginBlock' ? (
                      <PluginBlockFields
                        key={control.name}
                        store={store}
                        node={node}
                        locale={locale}
                        readOnly={readOnly}
                      />
                    ) : control.type === 'children' ? (
                      <ItemsList
                        key={control.name}
                        store={store}
                        node={node}
                        label={definition.itemsLabel ?? 'Item'}
                      />
                    ) : (
                      <ControlField key={control.name} control={control} env={env} />
                    ),
                  )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---- Items of tabs and accordions ------------------------------------------------------

function ItemsList({ store, node, label }: { store: Store; node: FrescoNode; label: string }) {
  const active = useStore(store, (s) => s.active[node.id]);
  const readOnly = useStore(store, (s) => s.readOnly || s.contentOnly);
  const kids = node.children ?? [];
  const order = useDragReorder((from, to) => {
    const child = kids[from];
    if (!child) return;
    store.actions.move(child.id, { parent: node.id, index: to });
    store.actions.setActive(node.id, to > from ? to - 1 : to);
    store.actions.select(node.id);
  });
  return (
    <div className="fre-control">
      <div className={`fre-repeater${order.dragging ? ' is-sorting' : ''}`} ref={order.listRef}>
        {kids.map((child, index) => (
          <div
            key={child.id}
            data-reorder=""
            className={`fre-repeater__item${active === index ? ' is-on' : ''}${order.classOf(index, kids.length)}`}
          >
            <div className="fre-repeater__head">
              <DragHandle
                label={tr('Drag to reorder (or use the arrow keys)')}
                onPointerDown={(e) => {
                  if (!readOnly) order.start(e, index);
                }}
                onKeyDown={(e) => !readOnly && order.keyDown(e, index, kids.length)}
              />
              <input
                className="fre-input fre-repeater__name"
                value={typeof child.attrs._title === 'string' ? child.attrs._title : ''}
                placeholder={`${tr(label)} ${index + 1}`}
                aria-label={tr('{item} title', { item: `${tr(label)} ${index + 1}` })}
                onFocus={() => store.actions.setActive(node.id, index)}
                onChange={(e) =>
                  store.actions.setSettings(child.id, { _title: e.target.value }, '_title')
                }
              />
              <button
                type="button"
                className="fre-iconbtn"
                title={tr('Edit its content')}
                onClick={() => store.actions.select(child.id)}
              >
                <Svg path="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" size={12} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={tr('Duplicate')}
                onClick={() => store.actions.duplicate(child.id)}
              >
                <Svg path="M8 8h12v12H8z M4 16V4h12" size={12} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={tr('Remove')}
                disabled={kids.length <= 1}
                onClick={() => {
                  store.actions.remove(child.id);
                  store.actions.select(node.id);
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="fre-button"
          onClick={() => store.actions.addItem(node.id, tr(label))}
        >
          {tr('+ Add {item}', { item: tr(label).toLowerCase() })}
        </button>
      </div>
    </div>
  );
}

// ---- Navigator -------------------------------------------------------------------------------

/** An element's name in the panel; a plugin block goes by the block it holds. */
function elementTitle(node: FrescoNode, locale: string): string {
  const inner = node.type === 'fresco/block' ? node.children?.[0] : undefined;
  if (inner) return pluginBlockTitle(inner.type, locale);
  const title = getElement(node.type)?.title;
  return title ? tr(title) : node.type;
}

function Navigator({ store }: { store: Store }) {
  const blocks = useStore(store, (s) => s.blocks);
  const selection = useStore(store, (s) => s.selection);
  const locale = useStore(store, (s) => s.entry.locale);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const item = (node: FrescoNode, depth: number) => {
    const definition = getElement(node.type);
    const title =
      (typeof node.attrs._title === 'string' && node.attrs._title) || elementTitle(node, locale);
    // The block inside a plugin block is not an element of its own.
    const kids = node.type === 'fresco/block' ? [] : (node.children ?? []);
    return (
      <li key={node.id}>
        <div
          className={`fre-nav__row${selection.includes(node.id) ? ' is-on' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onMouseEnter={() => store.actions.hover(node.id)}
          onMouseLeave={() => store.actions.hover(null)}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              className="fre-iconbtn"
              aria-label={closed[node.id] ? tr('Expand') : tr('Collapse')}
              onClick={() => setClosed((c) => ({ ...c, [node.id]: !c[node.id] }))}
            >
              <Svg path={closed[node.id] ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'} size={11} />
            </button>
          ) : (
            <span className="fre-nav__spacer" />
          )}
          <button
            type="button"
            className="fre-nav__title"
            onClick={(e) =>
              e.metaKey || e.ctrlKey
                ? store.actions.toggleSelect(node.id)
                : store.actions.select(node.id)
            }
          >
            {definition && <Svg path={definition.icon} size={13} />}
            {title}
          </button>
        </div>
        {kids.length > 0 && !closed[node.id] && (
          <ul>{kids.map((child) => item(child, depth + 1))}</ul>
        )}
      </li>
    );
  };
  return (
    <div className="fre-nav">
      <h3 className="fre-view-title">{tr('Navigator')}</h3>
      {blocks.length === 0 ? (
        <p className="fre-empty-note">{tr('The page is empty.')}</p>
      ) : (
        <ul>{blocks.map((node) => item(node, 0))}</ul>
      )}
    </div>
  );
}

// ---- Page settings ------------------------------------------------------------------------------

type PageTab = 'settings' | 'style' | 'advanced';

const PAGE_TABS: { id: PageTab; label: string; icon: string }[] = [
  { id: 'settings', label: 'Settings', icon: TAB_ICONS.advanced },
  { id: 'style', label: 'Style', icon: TAB_ICONS.style },
  { id: 'advanced', label: 'Advanced', icon: 'M8 6l-6 6 6 6 M16 6l6 6-6 6' },
];

/** Where a section of the extensions goes (`pageTab` on the component; Advanced by default). */
function pageTabOf(section: unknown): PageTab {
  const tab = (section as { pageTab?: unknown }).pageTab;
  return tab === 'settings' || tab === 'style' ? tab : 'advanced';
}

/** The page settings, in tabs as in other builders: Settings, Style, Advanced. */
function PageView({ store, media, host }: PanelProps) {
  const [tab, setTab] = useState<PageTab>('settings');
  const extra = extensions().pageSettings.filter((section) => pageTabOf(section) === tab);
  return (
    <div className="fre-element fre-pageview">
      <div className="fre-tabs" role="tablist">
        {PAGE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-on' : ''}
            onClick={() => setTab(item.id)}
          >
            <Svg path={item.icon} size={16} />
            <span>{tr(item.label)}</span>
          </button>
        ))}
      </div>
      <div className="fre-pageview__body">
        {tab === 'settings' && <PageSettingsTab store={store} media={media} host={host} />}
        {tab === 'style' && <PageStyleTab store={store} media={media} />}
        {tab === 'advanced' && extra.length === 0 && (
          <p className="fre-help">
            {tr('Custom CSS and more options of the page come with Fresco Pro.')}
          </p>
        )}
        {extra.map((section, n) => {
          const Section = section as ComponentType<{ store: Store }>;
          return <Section key={n} store={store} />;
        })}
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending review',
  scheduled: 'Scheduled',
  published: 'Published',
  private: 'Private',
  trashed: 'Trashed',
};

function PageSettingsTab({
  store,
  media,
  host,
}: {
  store: Store;
  media: PanelProps['media'];
  host: EditorHost | undefined;
}) {
  const page = useStore(store, (s) => s.page);
  const readOnly = useStore(store, (s) => s.readOnly);
  // The site's default layout (Site settings → Layout), for pages that keep it.
  const siteLayout = useStore(store, (s) => s.kit.layout?.pageLayout);
  const layoutNames: Record<string, string> = {
    full: tr('Full width'),
    canvas: tr('Canvas (no header and footer)'),
  };
  const effective = page.layout === 'theme' ? '' : (page.layout as string) || siteLayout || '';
  const wide = effective === 'full' || effective === 'canvas';
  // Some documents (popups) have none of the theme's page settings.
  const pageFields =
    documentKind(
      useStore(store, (s) => s.entry.type),
      page,
    ).pageFields !== false;
  return (
    <>
      {host && (
        <>
          <div className="fre-control">
            <div className="fre-control__head">
              <span className="fre-control__label">{tr('Title')}</span>
            </div>
            <input
              className="fre-input"
              value={host.title}
              readOnly={readOnly}
              onChange={(e) => host.setTitle(e.target.value)}
            />
          </div>
          <div className="fre-control fre-control--inline">
            <div className="fre-control__head">
              <span className="fre-control__label">{tr('Status')}</span>
            </div>
            <div className="fre-control__body">
              <span className={`fre-status fre-status--${host.status}`}>
                {tr(STATUS_LABELS[host.status] ?? host.status)}
              </span>
            </div>
          </div>
          <p className="fre-help">
            {tr('Publish, update or save a draft with the button at the top right.')}
          </p>
          {host.setFeaturedMediaId && pageFields && (
            <MediaIdField
              label={tr('Featured image')}
              help={tr('Saved with the page; shown in lists and social previews.')}
              id={host.featuredMediaId ?? null}
              onChange={host.setFeaturedMediaId}
              media={media}
              readOnly={readOnly}
            />
          )}
        </>
      )}
      {pageFields && (
        <>
          <label className="fre-checks">
            <input
              type="checkbox"
              checked={page.hideTitle === true}
              onChange={(e) => store.actions.setPage({ hideTitle: e.target.checked || undefined })}
            />
            {tr('Hide the page title')}
          </label>
          <p className="fre-help">
            {tr(
              "Hides the theme's title of this page (Site settings → Layout says which element that is).",
            )}
          </p>
          <div className="fre-control fre-control--inline">
            <div className="fre-control__head">
              <span className="fre-control__label">{tr('Layout')}</span>
            </div>
            <div className="fre-control__body">
              <select
                className="fre-input"
                value={typeof page.layout === 'string' ? page.layout : ''}
                onChange={(e) => store.actions.setPage({ layout: e.target.value || undefined })}
              >
                <option value="">
                  {siteLayout
                    ? tr('Site default ({layout})', { layout: layoutNames[siteLayout]! })
                    : tr('Theme default')}
                </option>
                {siteLayout && <option value="theme">{tr('Theme default')}</option>}
                <option value="full">{tr('Full width')}</option>
                <option value="canvas">{tr('Canvas (no header and footer)')}</option>
              </select>
            </div>
          </div>
          <p className="fre-help">
            {tr(
              'Full width: top-level containers span the whole window. Canvas: also without the theme’s header and footer. Seen on the page after saving.',
            )}
          </p>
          <label className="fre-checks">
            <input
              type="checkbox"
              checked={page.hideFeatured === true || wide}
              disabled={wide}
              onChange={(e) =>
                store.actions.setPage({ hideFeatured: e.target.checked || undefined })
              }
            />
            {tr('Hide the featured image')}
          </label>
          <p className="fre-help">
            {wide
              ? tr('Full width and Canvas pages never show the theme’s featured image.')
              : tr(
                  'The theme does not show it above the page; archives, loops and social previews still use it.',
                )}
          </p>
        </>
      )}
    </>
  );
}

/** Background (solid or gradient) and padding of the page, live in the canvas. */
function PageStyleTab({ store, media }: { store: Store; media: PanelProps['media'] }) {
  const page = useStore(store, (s) => s.page);
  const kit = useStore(store, (s) => s.kit);
  const device = useStore(store, (s) => s.device);
  const readOnly = useStore(store, (s) => s.readOnly);
  const settings = pageStyleSettings(page);
  // The single color of older pages becomes the Background group's on the first change.
  const legacy = settings !== page;
  const env: ControlEnv = {
    attrs: settings,
    settings,
    device,
    hover: false,
    kit,
    readOnly,
    setDevice: (d) => store.actions.setDevice(d),
    set: (changes, merge) =>
      store.actions.setPage(
        legacy
          ? {
              bg_type: settings.bg_type,
              bg_color: settings.bg_color,
              ...changes,
              background: undefined,
            }
          : changes,
        merge,
      ),
    media,
  };
  const sections = [...new Set(PAGE_STYLE_CONTROLS.map((c) => c.section))];
  return (
    <>
      {sections.map((section) => (
        <section key={section} className="fre-pageview__section">
          <h4 className="fre-subheading">{tr(section)}</h4>
          {PAGE_STYLE_CONTROLS.filter((c) => c.section === section).map((control) => (
            <ControlField key={control.name} control={control} env={env} />
          ))}
        </section>
      ))}
      <p className="fre-help">
        {tr('The background covers the whole page; the padding is around the content.')}
      </p>
    </>
  );
}

export type { Control, Settings };
