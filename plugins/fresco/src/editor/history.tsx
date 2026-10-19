/**
 * History (Ctrl+Shift+H): the steps of this session, to go back to any of
 * them, and the saved revisions of the entry, shown on the page before they
 * are kept.
 */
import { api as coreApi, useT } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import type { FrescoNode, Settings } from '../core/model.js';
import { getElement } from '../core/registry.js';
import { useStore, type StepLabel, type Store } from './store.js';

const LABELS: Record<StepLabel['kind'], string> = {
  add: 'Added {element}',
  remove: 'Removed {element}',
  duplicate: 'Duplicated {element}',
  move: 'Moved {element}',
  edit: 'Edited {element}',
  paste: 'Pasted {element}',
  pasteStyle: 'Pasted the style of {element}',
  resetStyle: 'Reset the style of {element}',
  page: 'Changed the page settings',
  item: 'Added an item to {element}',
  all: 'Replaced the content',
};

interface Revision {
  id: string;
  kind: string;
  title: string;
  author: { id: string; displayName: string } | null;
  createdAt: string;
  current: boolean;
  published: boolean;
}

export function HistoryView({ store }: { store: Store }) {
  const { t, language } = useT();
  const [tab, setTab] = useState<'actions' | 'revisions'>('actions');
  // Re-render on every change of the page.
  useStore(store, (s) => s.blocks);
  useStore(store, (s) => s.page);
  const entryId = useStore(store, (s) => s.entry.id);
  const { done, undone } = store.history();
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'revisions' || revisions) return;
    void coreApi<Revision[]>('GET', `/entries/${entryId}/revisions`)
      .then(setRevisions)
      .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  }, [tab, revisions, entryId]);

  const text = (step: StepLabel) =>
    t(LABELS[step.kind], {
      element: step.type ? t(getElement(step.type)?.title ?? step.type) : '',
    });
  const time = (at: number | string) =>
    new Date(at).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });

  const preview = async (revision: Revision) => {
    setError(null);
    try {
      const full = await coreApi<{
        document: { blocks: unknown[]; editor?: { id: string; data?: Settings } };
      }>('GET', `/entries/${entryId}/revisions/${revision.id}`);
      if (full.document.editor?.id !== 'fresco') {
        setError(
          t('This revision was made with another editor: restore it from the entry settings.'),
        );
        return;
      }
      // One step of the history: Discard is an undo.
      store.actions.replaceAll(
        full.document.blocks as unknown as FrescoNode[],
        full.document.editor.data ?? {},
      );
      setPreviewing(revision.id);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="fre-history">
      <div className="fre-subtabs" role="tablist">
        {(['actions', 'revisions'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'is-on' : ''}
            onClick={() => setTab(id)}
          >
            {id === 'actions' ? t('Actions') : t('Revisions')}
          </button>
        ))}
      </div>
      {error && <p className="fre-error">{error}</p>}
      {tab === 'actions' ? (
        <ol className="fre-history__list">
          {[...undone].reverse().map((step, i) => (
            <li key={`u${i}`}>
              <button
                type="button"
                className="fre-history__item is-undone"
                onClick={() => store.actions.goTo(done.length + undone.length - i)}
              >
                <span>{text(step)}</span>
                <small>{time(step.at)}</small>
              </button>
            </li>
          ))}
          {[...done].reverse().map((step, i) => (
            <li key={`d${i}`}>
              <button
                type="button"
                className={`fre-history__item${i === 0 ? ' is-current' : ''}`}
                onClick={() => store.actions.goTo(done.length - i)}
              >
                <span>{text(step)}</span>
                <small>{time(step.at)}</small>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={`fre-history__item${done.length === 0 ? ' is-current' : ''}`}
              onClick={() => store.actions.goTo(0)}
            >
              <span>{t('Editing started')}</span>
            </button>
          </li>
        </ol>
      ) : (
        <>
          {previewing && (
            <div className="fre-history__apply">
              <span>{t('The revision is shown on the page.')}</span>
              <button
                type="button"
                className="fre-button fre-button--primary"
                onClick={() => setPreviewing(null)}
              >
                {t('Apply')}
              </button>
              <button
                type="button"
                className="fre-button"
                onClick={() => {
                  store.actions.undo();
                  setPreviewing(null);
                }}
              >
                {t('Discard')}
              </button>
            </div>
          )}
          {!revisions && !error && <p className="fre-empty-note">{t('Loading…')}</p>}
          <ul className="fre-history__list">
            {revisions?.map((revision) => (
              <li key={revision.id}>
                <button
                  type="button"
                  className={`fre-history__rev${previewing === revision.id ? ' is-current' : ''}`}
                  disabled={previewing !== null && previewing !== revision.id}
                  onClick={() => void preview(revision)}
                >
                  <span className="fre-history__avatar" aria-hidden="true">
                    {(revision.author?.displayName ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>
                      {new Date(revision.createdAt).toLocaleString(language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </strong>
                    <small>
                      {[
                        revision.author?.displayName,
                        revision.kind === 'autosave' ? t('Autosave') : '',
                        revision.published ? t('Published') : '',
                        revision.current ? t('Current') : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
