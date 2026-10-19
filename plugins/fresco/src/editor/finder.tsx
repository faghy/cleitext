/**
 * Finder (Ctrl+E): one search box for the elements of the page, the
 * elements to add, the editor's panels and actions. And the keyboard
 * shortcuts window (Shift+?).
 */
import { useT, type EditorHost } from '@cleitext/admin-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FrescoNode } from '../core/model.js';
import { getElement, listElements } from '../core/registry.js';
import { Svg } from './controls.js';
import type { Store } from './store.js';

interface Result {
  group: string;
  title: string;
  hint?: string;
  icon: string;
  run: () => void;
}

const ACTION_ICON = 'M5 12h14 M13 6l6 6-6 6';

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
}: {
  store: Store;
  host: EditorHost;
  onClose: () => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const has = (...texts: string[]) => !q || texts.some((x) => x.toLowerCase().includes(q));
    const titleOf = (node: FrescoNode) =>
      (typeof node.attrs._title === 'string' && node.attrs._title) ||
      t(getElement(node.type)?.title ?? node.type);
    const actions: Result[] = [
      { title: t('Site settings'), run: () => store.actions.setView('site') },
      { title: t('Page settings'), run: () => store.actions.setView('page') },
      { title: t('Structure'), run: () => store.actions.toggleNavigator(true) },
      { title: t('History'), run: () => store.actions.setView('history') },
      { title: t('Templates'), run: () => store.actions.setView('library') },
      { title: t('Save'), run: () => void host.save() },
      { title: t('Preview changes'), run: () => void host.preview() },
      {
        title: t('Keyboard shortcuts'),
        run: () => window.dispatchEvent(new Event('fresco:shortcuts')),
      },
      {
        title: t('Exit to {list}', { list: host.back.label }),
        run: () => window.location.assign(host.back.url),
      },
    ].map((a) => ({ ...a, group: t('Actions'), icon: ACTION_ICON }));
    const onPage: Result[] = flatten(store.get().blocks).map((node) => ({
      group: t('On this page'),
      title: titleOf(node),
      hint: t(getElement(node.type)?.title ?? node.type),
      icon: getElement(node.type)?.icon ?? ACTION_ICON,
      run: () => store.actions.select(node.id),
    }));
    const toAdd: Result[] = listElements()
      .filter((e) => !e.hidden)
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
    return [...onPage, ...toAdd, ...actions]
      .filter((r) => has(r.title, r.hint ?? ''))
      .slice(0, q ? 60 : 30);
  }, [query, store, host, t]);

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
      ['Hide the panel', 'Ctrl+P'],
    ],
  },
  {
    group: 'Other',
    items: [
      ['Keyboard shortcuts', 'Shift+?'],
      ['Close, deselect', 'Esc'],
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
