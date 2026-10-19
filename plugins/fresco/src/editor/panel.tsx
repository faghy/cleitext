/** The side panel: elements, the selected element's settings, navigator, page and site settings. */
import { t as tr, useT, type EditorMedia } from '@cleitext/admin-sdk';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { conditionMet, withDefaults } from '../core/css.js';
import {
  DEFAULT_KIT,
  GOOGLE_FONTS,
  SYSTEM_FONTS,
  type Kit,
  type KitColor,
  type KitFont,
} from '../core/kit.js';
import type { Control, ElementCategory, FrescoNode, Settings, Tab } from '../core/model.js';
import { getElement, listElements } from '../core/registry.js';
import { ColorPicker, ControlField, Svg, type ControlEnv } from './controls.js';
import { AtomicStyle } from './atomic-style.js';
import { controlsOf, extensions } from '../core/extensions.js';
import { LibraryView } from './library.js';
import { HistoryView } from './history.js';
import { confirmAction } from './dialogs.js';
import {
  ButtonSettings,
  FieldSettings,
  IdentitySettings,
  ImageSettings,
  LightboxSettings,
  SITE_MENU,
  TypographySettings,
} from './site-settings.js';
import { PluginBlockFields, pluginBlockTitle } from './plugin-blocks.js';
import { useStore, type Store } from './store.js';
import { find, pathTo } from './tree.js';

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
  canManageKit: boolean;
  onSaveKit: () => Promise<void>;
  /** The site settings are saved with the page (Publish), not with their own button. */
  savesWithPage?: boolean;
  /** The user may change the site's title and tagline. */
  canManageSettings?: boolean;
}

export function Panel(props: PanelProps) {
  const view = useStore(props.store, (s) => s.view);
  const contentOnly = useStore(props.store, (s) => s.contentOnly);
  if (contentOnly && ['elements', 'library', 'site'].includes(view)) {
    return (
      <div className="fre-panel__body">
        <p className="fre-empty-note">
          You can change the texts, images and links of this page: select an element on the page.
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
      {view === 'page' && <PageView store={props.store} />}
      {view === 'site' && <SiteView {...props} />}
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

function ElementsView({ store, onDragStart }: PanelProps) {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'elements' | 'globals'>('elements');
  const [favorites, setFavorites] = useStored<string[]>('fresco:favorites', []);
  const [closed, setClosed] = useStored<string[]>('fresco:closed-categories', []);
  const [tileMenu, setTileMenu] = useState<{ type: string; x: number; y: number } | null>(null);
  const elements = listElements();
  const q = search.trim().toLowerCase();
  const matches = (title: string, keywords: string[] = []) =>
    !q ||
    title.toLowerCase().includes(q) ||
    t(title).toLowerCase().includes(q) ||
    keywords.some((k) => k.includes(q));
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
  const visible = elements.filter((e) => !e.hidden && matches(e.title, e.keywords));
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
  const tile = (element: (typeof elements)[number]) => (
    <button
      key={element.type}
      type="button"
      className="fre-tile"
      title={t('{element}: drag it onto the page, or click to add it', {
        element: t(element.title),
      })}
      onPointerDown={(e) => onDragStart(e, element.type, t(element.title))}
      onClick={() => addAtEnd(element.type)}
      onContextMenu={(e) => {
        e.preventDefault();
        setTileMenu({ type: element.type, x: e.clientX, y: e.clientY });
      }}
    >
      <Svg path={element.icon} size={28} />
      <span>{t(element.title)}</span>
      {element.pro && <em className="fre-pro">Pro</em>}
    </button>
  );
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
        <p className="fre-empty-note">
          {t(
            'Global elements are saved once and used on many pages: change one and every copy changes. Right-click an element on the page and choose “Save as template”, then add it from Templates.',
          )}
        </p>
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
  const controls = allControls.filter((c) => c.tab === shownTab && conditionMet(c, settings));
  const sections = [...new Set(controls.map((c) => c.section))];
  const sectionKey = `${node.type}:${tab}`;
  const current = openSection[sectionKey] === undefined ? sections[0] : openSection[sectionKey];
  const path = pathTo(blocks, node.id);
  return (
    <div className="fre-element">
      <nav className="fre-crumbs" aria-label="Element path">
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
        const hoverable = inSection.some((c) => c.hover);
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
                  .filter((c) => !isHover || c.hover)
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
  const kids = node.children ?? [];
  return (
    <div className="fre-control">
      <div className="fre-repeater">
        {kids.map((child, index) => (
          <div key={child.id} className={`fre-repeater__item${active === index ? ' is-on' : ''}`}>
            <div className="fre-repeater__head">
              <input
                className="fre-input fre-repeater__name"
                value={typeof child.attrs._title === 'string' ? child.attrs._title : ''}
                placeholder={`${label} ${index + 1}`}
                aria-label={`${label} ${index + 1} title`}
                onFocus={() => store.actions.setActive(node.id, index)}
                onChange={(e) =>
                  store.actions.setSettings(child.id, { _title: e.target.value }, '_title')
                }
              />
              <button
                type="button"
                className="fre-iconbtn"
                title="Edit its content"
                onClick={() => store.actions.select(child.id)}
              >
                <Svg path="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" size={12} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title="Move up"
                disabled={index === 0}
                onClick={() => store.actions.move(child.id, { parent: node.id, index: index - 1 })}
              >
                <Svg path="M12 19V5 M6 11l6-6 6 6" size={12} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title="Duplicate"
                onClick={() => store.actions.duplicate(child.id)}
              >
                <Svg path="M8 8h12v12H8z M4 16V4h12" size={12} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title="Remove"
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
          onClick={() => store.actions.addItem(node.id, label)}
        >
          + Add {label.toLowerCase()}
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
  return getElement(node.type)?.title ?? node.type;
}

function Navigator({ store }: { store: Store }) {
  const blocks = useStore(store, (s) => s.blocks);
  const selected = useStore(store, (s) => s.selected);
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
          className={`fre-nav__row${selected === node.id ? ' is-on' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onMouseEnter={() => store.actions.hover(node.id)}
          onMouseLeave={() => store.actions.hover(null)}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              className="fre-iconbtn"
              aria-label={closed[node.id] ? 'Expand' : 'Collapse'}
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
            onClick={() => store.actions.select(node.id)}
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
      <h3 className="fre-view-title">Navigator</h3>
      {blocks.length === 0 ? (
        <p className="fre-empty-note">The page is empty.</p>
      ) : (
        <ul>{blocks.map((node) => item(node, 0))}</ul>
      )}
    </div>
  );
}

// ---- Page settings ------------------------------------------------------------------------------

function PageView({ store }: { store: Store }) {
  const page = useStore(store, (s) => s.page);
  const kit = useStore(store, (s) => s.kit);
  const wide = page.layout === 'full' || page.layout === 'canvas';
  return (
    <div className="fre-site">
      <h3 className="fre-view-title">Page settings</h3>
      <div className="fre-control fre-control--inline">
        <div className="fre-control__head">
          <span className="fre-control__label">Layout</span>
        </div>
        <div className="fre-control__body">
          <select
            className="fre-input"
            value={typeof page.layout === 'string' ? page.layout : ''}
            onChange={(e) => store.actions.setPage({ layout: e.target.value || undefined })}
          >
            <option value="">Theme default</option>
            <option value="full">Full width</option>
            <option value="canvas">Canvas (no header and footer)</option>
          </select>
        </div>
      </div>
      <p className="fre-help">
        Full width: top-level containers span the whole window. Canvas: also without the theme’s
        header and footer. Seen on the page after saving.
      </p>
      <label className="fre-checks">
        <input
          type="checkbox"
          checked={page.hideTitle === true}
          onChange={(e) => store.actions.setPage({ hideTitle: e.target.checked || undefined })}
        />
        Hide the page title
      </label>
      <p className="fre-help">
        Hides the theme's title of this page (Site settings → Layout says which element that is).
      </p>
      <label className="fre-checks">
        <input
          type="checkbox"
          checked={page.hideFeatured === true || wide}
          disabled={wide}
          onChange={(e) => store.actions.setPage({ hideFeatured: e.target.checked || undefined })}
        />
        Hide the featured image
      </label>
      <p className="fre-help">
        {wide
          ? 'Full width and Canvas pages never show the theme’s featured image.'
          : 'The theme does not show it above the page; archives, loops and social previews still use it.'}
      </p>
      <div className="fre-control fre-control--inline">
        <div className="fre-control__head">
          <span className="fre-control__label">Page background</span>
        </div>
        <div className="fre-control__body">
          <ColorPicker
            value={typeof page.background === 'string' ? page.background : ''}
            kit={kit}
            onChange={(v) => store.actions.setPage({ background: v })}
          />
        </div>
      </div>
      {extensions().pageSettings.map((section, n) => {
        const Section = section as ComponentType<{ store: Store }>;
        return <Section key={n} store={store} />;
      })}
    </div>
  );
}

// ---- Site settings (kit) ---------------------------------------------------------------------------

function SiteView({
  store,
  canManageKit,
  onSaveKit,
  savesWithPage,
  canManageSettings,
}: PanelProps) {
  const { t: tx } = useT();
  const kit = useStore(store, (s) => s.kit);
  const dirty = useStore(store, (s) => s.kitDirty);
  const [section, setSection] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Kit>) => store.actions.setKit({ ...kit, ...patch });
  const fonts = useMemo(() => [...SYSTEM_FONTS, ...[...GOOGLE_FONTS].sort()], []);
  // As in other builders: a menu, and each entry its own panel with the way back.
  const sectionHead = (_id: string, _title: string) => null;
  const setTheme = (theme: Kit['theme']) => set({ theme });
  const current = SITE_MENU.flatMap((g) => g.items).find((item) => item.id === section);
  if (!current) {
    return (
      <div className="fre-site fre-site--menu">
        <p className="fre-help">
          {tx('They apply to every Fresco page of the site.')}
          {!canManageKit && ` ${tx('Only administrators can save them.')}`}
        </p>
        {SITE_MENU.map((group) => (
          <section key={group.group} className="fre-sitemenu">
            <h4>{tx(group.group)}</h4>
            {group.items.map((item) => (
              <button key={item.id} type="button" onClick={() => setSection(item.id)}>
                <Svg path={item.icon} size={16} />
                <span>{tx(item.title)}</span>
                <Svg path="M9 6l6 6-6 6" size={12} />
              </button>
            ))}
          </section>
        ))}
      </div>
    );
  }
  return (
    <div className="fre-site">
      <button type="button" className="fre-site__back" onClick={() => setSection('')}>
        <Svg path="M15 6l-6 6 6 6" size={14} />
        <span>{tx(current.title)}</span>
      </button>
      {section === 'typography' && <TypographySettings kit={kit} setTheme={setTheme} />}
      {section === 'buttons' && <ButtonSettings kit={kit} setTheme={setTheme} />}
      {section === 'images' && <ImageSettings kit={kit} setTheme={setTheme} />}
      {section === 'fields' && <FieldSettings kit={kit} setTheme={setTheme} />}
      {section === 'lightbox' && <LightboxSettings kit={kit} setTheme={setTheme} />}
      {section === 'identity' && <IdentitySettings canManage={canManageSettings === true} />}
      <section className={`fre-section${section === 'colors' ? ' is-open' : ''}`}>
        {sectionHead('colors', 'Global colors')}
        {section === 'colors' && (
          <div className="fre-section__body">
            {kit.colors.map((color, index) => (
              <ColorRow
                key={color.id}
                color={color}
                kit={kit}
                system={index < 4}
                onChange={(next) =>
                  set({ colors: kit.colors.map((c) => (c.id === color.id ? next : c)) })
                }
                onRemove={() => set({ colors: kit.colors.filter((c) => c.id !== color.id) })}
              />
            ))}
            <button
              type="button"
              className="fre-button"
              onClick={() => {
                const id = `c${Math.random().toString(36).slice(2, 8)}`;
                set({ colors: [...kit.colors, { id, title: 'New color', value: '#64748b' }] });
              }}
            >
              + Add color
            </button>
          </div>
        )}
      </section>
      <section className={`fre-section${section === 'fonts' ? ' is-open' : ''}`}>
        {sectionHead('fonts', 'Global fonts')}
        {section === 'fonts' && (
          <div className="fre-section__body">
            {kit.fonts.map((font, index) => (
              <FontRow
                key={font.id}
                font={font}
                fonts={fonts}
                system={index < 4}
                onChange={(next) =>
                  set({ fonts: kit.fonts.map((f) => (f.id === font.id ? next : f)) })
                }
                onRemove={() => set({ fonts: kit.fonts.filter((f) => f.id !== font.id) })}
              />
            ))}
            <button
              type="button"
              className="fre-button"
              onClick={() => {
                const id = `f${Math.random().toString(36).slice(2, 8)}`;
                set({
                  fonts: [...kit.fonts, { id, title: 'New font', family: 'Inter', weight: '400' }],
                });
              }}
            >
              + Add font
            </button>
          </div>
        )}
      </section>
      <section className={`fre-section${section === 'layout' ? ' is-open' : ''}`}>
        {sectionHead('layout', 'Layout')}
        {section === 'layout' && (
          <div className="fre-section__body">
            <NumberRow
              label="Content width (px)"
              value={Number(kit.containerWidth.size)}
              min={300}
              max={2400}
              onChange={(v) => set({ containerWidth: { size: v, unit: 'px' } })}
            />
            <NumberRow
              label="Gap between elements (px)"
              value={Number(kit.gap.size)}
              min={0}
              max={200}
              onChange={(v) => set({ gap: { size: v, unit: 'px' } })}
            />
            <NumberRow
              label="Tablet up to (px)"
              value={kit.breakpoints.tablet}
              min={600}
              max={2400}
              onChange={(v) => set({ breakpoints: { ...kit.breakpoints, tablet: v } })}
            />
            <NumberRow
              label="Mobile up to (px)"
              value={kit.breakpoints.mobile}
              min={320}
              max={1200}
              onChange={(v) => set({ breakpoints: { ...kit.breakpoints, mobile: v } })}
            />
            <div className="fre-control">
              <div className="fre-control__head">
                <span className="fre-control__label">Page title selector</span>
              </div>
              <input
                className="fre-input fre-mono"
                value={kit.titleSelector ?? ''}
                placeholder={DEFAULT_KIT.titleSelector}
                onChange={(e) => set({ titleSelector: e.target.value || undefined })}
              />
              <p className="fre-help">
                What "Hide the page title" hides, as a CSS selector of your theme.
              </p>
            </div>
          </div>
        )}
      </section>
      <section className={`fre-section${section === 'variables' ? ' is-open' : ''}`}>
        {sectionHead('variables', 'Variables')}
        {section === 'variables' && (
          <div className="fre-section__body">
            <p className="fre-help">
              Named colors, fonts and sizes for the Style tab of atomic elements.
            </p>
            {kit.variables.map((variable) => (
              <div key={variable.id} className="fre-kitrow">
                <input
                  className="fre-input"
                  value={variable.label}
                  aria-label="Name"
                  onChange={(e) =>
                    set({
                      variables: kit.variables.map((v) =>
                        v.id === variable.id ? { ...v, label: e.target.value } : v,
                      ),
                    })
                  }
                />
                {variable.type === 'color' && (
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(variable.value) ? variable.value : '#000000'}
                    aria-label="Color"
                    onChange={(e) =>
                      set({
                        variables: kit.variables.map((v) =>
                          v.id === variable.id ? { ...v, value: e.target.value } : v,
                        ),
                      })
                    }
                  />
                )}
                <input
                  className="fre-input fre-mono"
                  value={variable.value}
                  aria-label="Value"
                  onChange={(e) =>
                    set({
                      variables: kit.variables.map((v) =>
                        v.id === variable.id ? { ...v, value: e.target.value } : v,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="fre-iconbtn"
                  aria-label={`Remove ${variable.label}`}
                  onClick={() =>
                    set({ variables: kit.variables.filter((v) => v.id !== variable.id) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <div className="fre-library__save">
              {(
                [
                  ['color', '#c2410c', 'Color'],
                  ['font', 'Inter', 'Font'],
                  ['size', '24px', 'Size'],
                ] as const
              ).map(([type, value, label]) => (
                <button
                  key={type}
                  type="button"
                  className="fre-button"
                  onClick={() => {
                    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
                    set({
                      variables: [
                        ...kit.variables,
                        { id, label: `New ${label.toLowerCase()}`, type, value },
                      ],
                    });
                  }}
                >
                  + {label}
                </button>
              ))}
            </div>
            {kit.classes.length > 0 && (
              <>
                <h4 className="fre-subheading">Global classes</h4>
                {kit.classes.map((c) => (
                  <div key={c.id} className="fre-kitrow">
                    <input
                      className="fre-input"
                      value={c.label}
                      aria-label="Class name"
                      onChange={(e) =>
                        set({
                          classes: kit.classes.map((x) =>
                            x.id === c.id ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <code className="fre-mono">.fr-g-{c.id}</code>
                    <button
                      type="button"
                      className="fre-iconbtn"
                      aria-label={`Delete the class ${c.label}`}
                      onClick={() =>
                        void confirmAction({
                          title: tr('Delete the class “{name}”?', { name: c.label }),
                          text: tr('Elements keep the name but lose its style.'),
                          action: tr('Delete'),
                          danger: true,
                        }).then((ok) => {
                          if (ok) set({ classes: kit.classes.filter((x) => x.id !== c.id) });
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </section>
      <section className={`fre-section${section === 'style' ? ' is-open' : ''}`}>
        {sectionHead('style', 'Theme style')}
        {section === 'style' && (
          <div className="fre-section__body">
            {(
              [
                ['text', 'Text color'],
                ['link', 'Link color'],
                ['linkHover', 'Link color on hover'],
                ['background', 'Page background'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="fre-control fre-control--inline">
                <div className="fre-control__head">
                  <span className="fre-control__label">{label}</span>
                </div>
                <div className="fre-control__body">
                  <ColorPicker
                    value={kit.style[key] ?? ''}
                    kit={kit}
                    onChange={(v) => set({ style: { ...kit.style, [key]: v } })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {canManageKit && !savesWithPage && (
        <div className="fre-site__save">
          {error && <p className="fre-error">{error}</p>}
          <button
            type="button"
            className="fre-button fre-button--primary"
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSaveKit();
              } catch (e) {
                setError(String(e instanceof Error ? e.message : e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : dirty ? 'Save site settings' : 'Site settings saved'}
          </button>
        </div>
      )}
    </div>
  );
}

function ColorRow({
  color,
  kit,
  system,
  onChange,
  onRemove,
}: {
  color: KitColor;
  kit: Kit;
  system: boolean;
  onChange: (c: KitColor) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fre-kitrow">
      <ColorPicker
        value={color.value}
        kit={{ ...kit, colors: [] }}
        onChange={(v) => v && !v.startsWith('var(') && onChange({ ...color, value: v })}
      />
      <input
        className="fre-input"
        value={color.title}
        aria-label="Name"
        onChange={(e) => onChange({ ...color, title: e.target.value })}
      />
      <code className="fre-mono">{color.value}</code>
      {!system && (
        <button
          type="button"
          className="fre-iconbtn"
          aria-label={`Remove ${color.title}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

function FontRow({
  font,
  fonts,
  system,
  onChange,
  onRemove,
}: {
  font: KitFont;
  fonts: string[];
  system: boolean;
  onChange: (f: KitFont) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fre-kitfont">
      <div className="fre-kitrow">
        <input
          className="fre-input"
          value={font.title}
          aria-label="Name"
          onChange={(e) => onChange({ ...font, title: e.target.value })}
        />
        {!system && (
          <button
            type="button"
            className="fre-iconbtn"
            aria-label={`Remove ${font.title}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      <div className="fre-kitrow">
        <select
          className="fre-input"
          value={font.family}
          aria-label="Family"
          onChange={(e) => onChange({ ...font, family: e.target.value })}
        >
          {fonts.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          className="fre-input"
          value={font.weight}
          aria-label="Weight"
          onChange={(e) => onChange({ ...font, weight: e.target.value })}
        >
          {['300', '400', '500', '600', '700', '800'].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <input
          className="fre-input fre-input--number"
          type="number"
          placeholder="Size"
          aria-label="Size (px)"
          value={typeof font.size?.size === 'number' ? font.size.size : ''}
          onChange={(e) => {
            const rest = { ...font };
            delete rest.size;
            onChange(
              e.target.value
                ? { ...rest, size: { size: Number(e.target.value), unit: 'px' } }
                : rest,
            );
          }}
        />
      </div>
      <p className="fre-preview-font" style={{ fontFamily: font.family, fontWeight: font.weight }}>
        The quick brown fox
      </p>
    </div>
  );
}

function NumberRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="fre-control fre-control--inline">
      <div className="fre-control__head">
        <span className="fre-control__label">{label}</span>
      </div>
      <div className="fre-control__body">
        <input
          className="fre-input fre-input--number"
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
        />
      </div>
    </div>
  );
}

export type { Control, Settings };
