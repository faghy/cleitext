/**
 * Finder (Ctrl+E): one search box for the elements of the page, the
 * elements to add, the site's other pages and posts, the editor's panels
 * and actions. And the keyboard shortcuts window (Shift+?).
 */
import { api as coreApi, useT, type EditorHost } from '@cleitext/admin-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FrescoNode } from '../core/model.js';
import { getElement, listElements } from '../core/registry.js';
import { offered } from './availability.js';
import { Svg } from './controls.js';
import { confirmAction } from './dialogs.js';
import type { Store } from './store.js';
import { siteMenu } from './site-settings.js';
import { createEntry } from './site-nav.js';

const PAGE_ICON = 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6';

interface FoundEntry {
  id: string;
  type: string;
  title: string;
  status: string;
}

/** The site's pages and posts matching a search (the most recently changed when empty). */
function useEntries(query: string, locale: string, exclude: string): FoundEntry[] {
  const [found, setFound] = useState<FoundEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const q = query.trim();
      const search = (type: string) =>
        coreApi<{ items: FoundEntry[] }>(
          'GET',
          `/entries?type=${type}&locale=${encodeURIComponent(locale)}&limit=${q ? 8 : 4}${
            q ? `&q=${encodeURIComponent(q)}` : ''
          }`,
        )
          .then((list) => list.items)
          .catch(() => [] as FoundEntry[]);
      void Promise.all([search('page'), search('article')]).then(([pages, posts]) => {
        if (!cancelled)
          setFound([...pages, ...posts].filter((e) => e.id !== exclude && e.status !== 'trashed'));
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, locale, exclude]);
  return found;
}

interface Result {
  group: string;
  title: string;
  hint?: string;
  icon: string;
  run: () => void;
}

const ACTION_ICON = 'M5 12h14 M13 6l6 6-6 6';

/** Groups in a stable order (as Elementor's Finder): this page, recent pages, then the rest. */
function groupOrder(a: Result, b: Result, t: (s: string) => string): number {
  const order = [
    t('On this page'),
    t('Pages'),
    t('Create'),
    t('Site'),
    t('Settings'),
    t('Tools'),
    t('Add element'),
    t('Actions'),
  ];
  return order.indexOf(a.group) - order.indexOf(b.group);
}

function flatten(nodes: FrescoNode[], out: FrescoNode[] = []): FrescoNode[] {
  for (const node of nodes) {
    out.push(node);
    if (node.children && node.type !== 'fresco/block') flatten(node.children, out);
  }
  return out;
}

export function Finder({
  store,
  host,
  onClose,
  navigate,
  exit,
  themeBuilderUrl = null,
  copyShare,
  canManageKit = true,
  capabilities = [],
}: {
  store: Store;
  host: EditorHost;
  onClose: () => void;
  /** Opens an admin address (another entry: in Fresco when it is a Fresco page). */
  navigate: (to: string) => void;
  /** Where "Exit" goes (User preferences). */
  exit?: { url: string; label: string };
  themeBuilderUrl?: string | null;
  copyShare?: () => Promise<void>;
  canManageKit?: boolean;
  capabilities?: readonly string[];
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const entry = store.get().entry;
  const entries = useEntries(query, entry.locale, entry.id);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const has = (...texts: string[]) => !q || texts.some((x) => x.toLowerCase().includes(q));
    const titleOf = (node: FrescoNode) =>
      (typeof node.attrs._title === 'string' && node.attrs._title) ||
      t(getElement(node.type)?.title ?? node.type);
    const exitTo = exit ?? {
      url: host.back.url,
      label: t('Exit to {list}', { list: host.back.label }),
    };
    /** Leaves for another entry, after asking when there are unsaved changes. */
    const leave = (go: () => void, title: string) => {
      if (!host.dirty) return go();
      void confirmAction({
        title: t('Open “{title}”?', { title }),
        text: t('The changes to this page that are not saved yet will be lost.'),
        action: t('Open'),
      }).then((ok) => ok && go());
    };
    const create = (type: 'page' | 'article') => {
      const title = type === 'page' ? t('New page') : t('New post');
      leave(() => {
        void createEntry(type, title, entry.locale).then((id) => navigate(`/entries/${id}`));
      }, title);
    };
    const createGroup: Result[] = [
      { title: t('Add new page'), run: () => create('page') },
      { title: t('Add new post'), run: () => create('article') },
    ].map((a) => ({ ...a, group: t('Create'), icon: 'M12 5v14 M5 12h14' }));
    // Site: every panel of Site settings, and the theme builder.
    const siteGroup: Result[] = canManageKit
      ? [
          ...siteMenu(capabilities)
            .flatMap((group) => group.items)
            .map((item) => ({
              title: t(item.title),
              hint: t('Site settings'),
              icon: item.icon,
              run: () => store.actions.openSite(item.id),
            })),
          ...(themeBuilderUrl
            ? [
                {
                  title: t('Theme builder'),
                  icon: 'M4 4h16v5H4z M4 11h7v9H4z M13 11h7v9h-7z',
                  run: () => window.open(themeBuilderUrl, '_blank', 'noopener'),
                },
              ]
            : []),
        ].map((a) => ({ ...a, group: t('Site') }))
      : [];
    const settingsGroup: Result[] = [
      { title: t('Site settings'), run: () => store.actions.openSite('') },
      { title: t('Page settings'), run: () => store.actions.setView('page') },
      { title: t('User preferences'), run: () => store.actions.setView('preferences') },
    ].map((a) => ({ ...a, group: t('Settings'), icon: ACTION_ICON }));
    const toolsGroup: Result[] = [
      { title: t('Structure'), run: () => store.actions.toggleNavigator(true) },
      { title: t('History'), run: () => store.actions.setView('history') },
      { title: t('Templates'), run: () => store.actions.setView('library') },
      {
        title: t('Keyboard shortcuts'),
        run: () => window.dispatchEvent(new Event('fresco:shortcuts')),
      },
      ...(copyShare ? [{ title: t('Copy and share'), run: () => void copyShare() }] : []),
    ].map((a) => ({ ...a, group: t('Tools'), icon: ACTION_ICON }));
    const actions: Result[] = [
      { title: t('Save'), run: () => void host.save() },
      { title: t('Preview changes'), run: () => void host.preview() },
      { title: exitTo.label, run: () => window.location.assign(exitTo.url) },
    ].map((a) => ({ ...a, group: t('Actions'), icon: ACTION_ICON }));
    const onPage: Result[] = flatten(store.get().blocks).map((node) => ({
      group: t('On this page'),
      title: titleOf(node),
      hint: t(getElement(node.type)?.title ?? node.type),
      icon: getElement(node.type)?.icon ?? ACTION_ICON,
      run: () => store.actions.select(node.id),
    }));
    // Other pages (the recent ones without text): they open in their own editor.
    const pages: Result[] = entries.map((found) => ({
      group: t('Pages'),
      title: found.title || t('(no title)'),
      hint: `${found.type === 'page' ? t('Page') : t('Post')} · ${t(found.status)}`,
      icon: PAGE_ICON,
      run: () => leave(() => navigate(`/entries/${found.id}`), found.title || t('(no title)')),
    }));
    const { disabledElements, safeMode } = store.get();
    const toAdd: Result[] = listElements()
      .filter((e) => offered(e, { disabled: disabledElements, safeMode }))
      .map((element) => ({
        group: t('Add element'),
        title: t(element.title),
        hint: t(element.category[0]!.toUpperCase() + element.category.slice(1)),
        icon: element.icon,
        run: () => {
          const state = store.get();
          store.actions.add(element.type, { parent: null, index: state.blocks.length });
        },
      }));
    // Without text: a few of this page's elements, the recent pages, and the
    // editor's places; elements to add once something is typed.
    const tools = [...createGroup, ...siteGroup, ...settingsGroup, ...toolsGroup, ...actions];
    // The pages are already searched by the server.
    return [
      ...(q
        ? [...onPage, ...toAdd, ...tools].filter((r) => has(r.title, r.hint ?? ''))
        : [...onPage.slice(0, 6), ...tools]),
      ...pages,
    ]
      .sort((a, b) => groupOrder(a, b, t))
      .slice(0, q ? 70 : 60);
  }, [
    query,
    store,
    host,
    t,
    entries,
    navigate,
    exit,
    themeBuilderUrl,
    copyShare,
    canManageKit,
    capabilities,
    entry.locale,
  ]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    result.run();
  };

  let lastGroup = '';
  return (
    <div className="fre-modalbg" onPointerDown={onClose}>
      <div
        className="fre-finder"
        role="dialog"
        aria-label={t('Finder')}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="fre-finder__search">
          <Svg path="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3" size={16} />
          <input
            autoFocus
            placeholder={t('Type to find anything in the editor')}
            aria-label={t('Find')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                choose(results[active]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
          />
        </div>
        <div className="fre-finder__list" ref={listRef} role="listbox">
          {results.length === 0 && <p className="fre-finder__none">{t('Nothing found.')}</p>}
          {results.map((result, i) => {
            const heading = result.group !== lastGroup ? result.group : null;
            lastGroup = result.group;
            return (
              <div key={`${result.group}:${i}`}>
                {heading && <p className="fre-finder__group">{heading}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`fre-finder__item${i === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(result)}
                >
                  <Svg path={result.icon} size={15} />
                  <span>{result.title}</span>
                  {result.hint && result.hint !== result.title && <small>{result.hint}</small>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Editing',
    items: [
      ['Undo', 'Ctrl+Z'],
      ['Redo', 'Ctrl+Shift+Z'],
      ['Copy', 'Ctrl+C'],
      ['Paste', 'Ctrl+V'],
      ['Paste style', 'Ctrl+Shift+V'],
      ['Duplicate', 'Ctrl+D'],
      ['Delete', 'Del'],
      ['Save', 'Ctrl+S'],
    ],
  },
  {
    group: 'Panels',
    items: [
      ['Finder', 'Ctrl+E'],
      ['Structure', 'Ctrl+I'],
      ['History', 'Ctrl+Shift+H'],
      ['Responsive mode', 'Ctrl+Shift+M'],
      ['Site settings', 'Ctrl+K'],
      ['Page settings', 'Ctrl+Shift+Y'],
      ['Templates', 'Ctrl+Shift+L'],
      ['User preferences', 'Ctrl+Shift+U'],
      ['Hide the panel', 'Ctrl+P'],
    ],
  },
  {
    group: 'Other',
    items: [
      ['Keyboard shortcuts', 'Shift+?'],
      ['Close, deselect', 'Esc'],
      ['Back (Site settings)', 'Esc'],
      ['Revisions: previous, next', '↑/↓'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const keys = (combo: string) =>
    combo.split('+').map((k, i) => <kbd key={i}>{mac && k === 'Ctrl' ? '⌘' : t(k)}</kbd>);
  return (
    <div className="fre-modalbg" onPointerDown={onClose}>
      <div
        className="fre-shortcuts"
        role="dialog"
        aria-label={t('Keyboard shortcuts')}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="fre-shortcuts__head">
          <h2>{t('Keyboard shortcuts')}</h2>
          <button type="button" aria-label={t('Close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fre-shortcuts__cols">
          {SHORTCUTS.map((group) => (
            <section key={group.group}>
              <h3>{t(group.group)}</h3>
              {group.items.map(([label, combo]) => (
                <p key={label}>
                  <span>{t(label)}</span>
                  <span>{keys(combo)}</span>
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
