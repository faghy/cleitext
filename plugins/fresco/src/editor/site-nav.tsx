/**
 * Site navigation from the page's title in the top bar (as Elementor's):
 * the recent pages and posts to switch to, new ones, the page's settings,
 * the page on the site, and "Copy and share" (the page's preview link).
 */
import { api as coreApi, useT, type EditorHost } from '@cleitext/admin-sdk';
import { useEffect, useRef, useState } from 'react';
import { Svg } from './controls.js';
import { confirmAction, notify } from './dialogs.js';
import type { Store } from './store.js';

interface Recent {
  id: string;
  type: string;
  title: string;
  status: string;
  updatedAt?: string;
}

const PAGE = 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6';

/** The latest changed pages and posts of the site, without the one being edited. */
export async function recentEntries(locale: string, exclude: string): Promise<Recent[]> {
  const list = (type: string) =>
    coreApi<{ items: Recent[] }>(
      'GET',
      `/entries?type=${type}&locale=${encodeURIComponent(locale)}&sort=updated&limit=6`,
    )
      .then((r) => r.items)
      .catch(() => [] as Recent[]);
  const [pages, posts] = await Promise.all([list('page'), list('article')]);
  return [...pages, ...posts]
    .filter((e) => e.id !== exclude && e.status !== 'trashed')
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .slice(0, 8);
}

/** A new empty page or post made with Fresco; returns its id. */
export async function createEntry(type: 'page' | 'article', title: string, locale: string) {
  const entry = await coreApi<{ id: string }>('POST', '/entries', {
    type,
    title,
    locale,
    document: { schema: 1, blocks: [], editor: { id: 'fresco' } },
  });
  return entry.id;
}

export function SiteNav({
  store,
  host,
  navigate,
  viewUrl,
  copyShare,
}: {
  store: Store;
  host: EditorHost;
  navigate: (to: string) => void;
  viewUrl: string | null;
  copyShare: () => Promise<void>;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const entry = store.get().entry;
  useEffect(() => {
    if (!open) return;
    let live = true;
    void recentEntries(entry.locale, entry.id).then((list) => live && setRecent(list));
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      live = false;
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open, entry.locale, entry.id]);
  /** Leaves the page: after asking, when it has changes not saved yet. */
  const leave = (go: () => void, title: string) => {
    setOpen(false);
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
      createEntry(type, title, entry.locale)
        .then((id) => navigate(`/entries/${id}`))
        .catch((error: unknown) =>
          notify(String(error instanceof Error ? error.message : error), 'error'),
        );
    }, title);
  };
  return (
    <div className="fre-sitenav" ref={ref}>
      <button
        type="button"
        className={`fre-bar__btn fre-sitenav__toggle${open ? ' is-on' : ''}`}
        aria-label={t('Site navigation')}
        title={t('Site navigation')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Svg path="M6 9l6 6 6-6" size={14} />
      </button>
      {open && (
        <div className="fre-dropdown fre-dropdown--center fre-sitenav__menu" role="menu">
          <p className="fre-dropdown__title">{t('Recent')}</p>
          {recent === null && <p className="fre-dropdown__note">{t('Loading…')}</p>}
          {recent?.length === 0 && <p className="fre-dropdown__note">{t('Nothing found.')}</p>}
          {recent?.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() =>
                leave(() => navigate(`/entries/${item.id}`), item.title || t('(no title)'))
              }
            >
              <Svg path={PAGE} size={16} />
              <span>{item.title || t('(no title)')}</span>
              <small>{item.type === 'page' ? t('Page') : t('Post')}</small>
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={() => create('page')}>
            <Svg path="M12 5v14 M5 12h14" size={16} />
            <span>{t('Add new page')}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => create('article')}>
            <Svg path="M12 5v14 M5 12h14" size={16} />
            <span>{t('Add new post')}</span>
          </button>
          <hr />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              store.actions.setView('page');
            }}
          >
            <Svg path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" size={16} />
            <span>{t('Page settings')}</span>
          </button>
          {viewUrl && (
            <a role="menuitem" href={viewUrl} target="_blank" rel="noopener noreferrer">
              <Svg path="M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6" size={16} />
              <span>{t('View page')}</span>
            </a>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void copyShare();
            }}
          >
            <Svg
              path="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4"
              size={16}
            />
            <span>{t('Copy and share')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
