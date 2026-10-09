import type { CxdDocument } from '@cleitext/blocks';
import type { EditorInstance } from '@cleitext/editor-core';
import type { EntryListResponse, EntryView, RevisionSummary } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button } from '../components/ui';
import { formatDate, STATUS_LABELS } from './entries-list';

const AUTOSAVE_INTERVAL_MS = 30_000;

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/** Full-screen editor for one entry (RF-EDT-01, RF-CNT-04…10). */
export function EntryEditorPage({ id }: { id: string }) {
  const entry = useQuery({
    queryKey: ['entry', id],
    queryFn: () => api<EntryView>('GET', `/entries/${id}`),
  });

  if (entry.isPending) return <EditorShell>Loading…</EditorShell>;
  if (entry.isError) {
    return (
      <EditorShell>
        <div className="p-6">
          <Alert>{errorMessage(entry.error)}</Alert>
        </div>
      </EditorShell>
    );
  }
  // Remount everything when switching entry (e.g. to a translation).
  return <Editor key={id} initial={entry.data} />;
}

function Editor({ initial }: { initial: EntryView }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [entry, setEntry] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<'document' | 'block'>('document');
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(initial.autosave);

  const canvasRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const documentRef = useRef<CxdDocument>(initial.revision?.document as CxdDocument);
  const dirtyRef = useRef(false);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState('dirty');
  }, []);

  // Mount the editor adapter (lazy: Gutenberg is loaded only here).
  useEffect(() => {
    let cancelled = false;
    void import('@cleitext/editor-gutenberg').then(({ gutenbergAdapter }) => {
      if (cancelled || !canvasRef.current) return;
      editorRef.current = gutenbergAdapter.mount({
        document: documentRef.current,
        targets: { canvas: canvasRef.current, inspector: inspectorRef.current },
        services: {},
        locale: initial.locale,
        onChange: (document) => {
          documentRef.current = document;
          markDirty();
        },
      });
    });
    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [initial.locale, markDirty]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Autosave every 30 seconds while there are unsaved changes (RF-CNT-06).
  useEffect(() => {
    const timer = setInterval(() => {
      if (!dirtyRef.current || !entry.permissions.edit) return;
      void api<{ savedAt: string }>('PUT', `/entries/${entry.id}/autosave`, {
        title,
        document: documentRef.current,
      })
        .then((r) => setAutosavedAt(r.savedAt))
        .catch(() => {});
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [entry.id, entry.permissions.edit, title]);

  const apply = (view: EntryView) => {
    setEntry(view);
    queryClient.setQueryData(['entry', view.id], view);
    void queryClient.invalidateQueries({ queryKey: ['entries'] });
    void queryClient.invalidateQueries({ queryKey: ['revisions', view.id] });
  };

  /** Saves pending changes; returns the updated entry. */
  const save = async (): Promise<EntryView> => {
    if (!dirtyRef.current && title === entry.title) return entry;
    setSaveState('saving');
    const view = await api<EntryView>('PATCH', `/entries/${entry.id}`, {
      title,
      document: editorRef.current?.getDocument() ?? documentRef.current,
    });
    dirtyRef.current = false;
    setSaveState('saved');
    apply(view);
    return view;
  };

  const action = useMutation({
    mutationFn: async (
      kind: 'save' | 'publish' | 'submit' | 'unpublish' | 'trash' | { schedule: string },
    ) => {
      setError(null);
      await save();
      if (kind === 'save') return;
      const path = typeof kind === 'object' ? 'schedule' : kind;
      const body =
        typeof kind === 'object'
          ? { scheduledAt: new Date(kind.schedule).toISOString() }
          : undefined;
      apply(await api<EntryView>('POST', `/entries/${entry.id}/${path}`, body));
    },
    onError: (e) => {
      setSaveState(dirtyRef.current ? 'dirty' : 'saved');
      setError(errorMessage(e));
    },
  });

  const readOnly = !entry.permissions.edit;
  const isPublished = entry.status === 'published';
  const backTo: string = entry.type === 'page' ? '/pages' : '/posts';

  return (
    <EditorShell>
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link
          to={backTo}
          className="text-sm text-sky-700 hover:underline"
          aria-label="Back to the list"
        >
          ← {entry.type === 'page' ? 'Pages' : 'Posts'}
        </Link>
        <label className="sr-only" htmlFor="entry-title">
          Title
        </label>
        <input
          id="entry-title"
          value={title}
          readOnly={readOnly}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          placeholder="Add title"
          className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-xl font-semibold hover:border-slate-200 focus:border-sky-600 focus:outline-none"
        />
        <span className="text-xs text-slate-500" role="status" aria-live="polite">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'dirty'
              ? autosavedAt
                ? `Autosaved ${new Date(autosavedAt).toLocaleTimeString()}`
                : 'Unsaved changes'
              : saveState === 'saved'
                ? 'Saved'
                : ''}
        </span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {STATUS_LABELS[entry.status]}
        </span>
        {!readOnly && !isPublished && (
          <Button
            variant="secondary"
            disabled={action.isPending}
            onClick={() => action.mutate('save')}
          >
            Save draft
          </Button>
        )}
        {!readOnly && !entry.permissions.publish && entry.status === 'draft' && (
          <Button disabled={action.isPending} onClick={() => action.mutate('submit')}>
            Submit for review
          </Button>
        )}
        {entry.permissions.publish && entry.status !== 'trashed' && (
          <Button disabled={action.isPending} onClick={() => action.mutate('publish')}>
            {isPublished ? 'Update' : 'Publish'}
          </Button>
        )}
      </header>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2">
          <Alert>{error}</Alert>
        </div>
      )}
      {readOnly && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          You can view this entry but not change it.
        </div>
      )}
      {recovery && (
        <div className="flex items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm">
          <span>There is an autosave of this entry newer than the saved version.</span>
          <Button
            variant="secondary"
            onClick={() => {
              editorRef.current?.setDocument(recovery.document as CxdDocument);
              documentRef.current = recovery.document as CxdDocument;
              setTitle(recovery.title);
              markDirty();
              setRecovery(null);
            }}
          >
            Restore the autosave
          </Button>
          <button
            type="button"
            className="text-sky-700 hover:underline"
            onClick={() => setRecovery(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div ref={canvasRef} className="min-w-0 flex-1" />
        <aside
          className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white"
          aria-label="Settings"
        >
          <div role="tablist" className="flex border-b border-slate-200 text-sm">
            {(['document', 'block'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2 ${tab === t ? 'border-b-2 border-sky-700 font-medium' : 'text-slate-600'}`}
              >
                {t === 'document' ? (entry.type === 'page' ? 'Page' : 'Post') : 'Block'}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'document' && (
              <DocumentPanel
                entry={entry}
                locales={me.site.locales}
                readOnly={readOnly}
                busy={action.isPending}
                onAction={(kind) => action.mutate(kind)}
                onSaved={apply}
                onRestored={(view) => {
                  apply(view);
                  editorRef.current?.setDocument(view.revision?.document as CxdDocument);
                  documentRef.current = view.revision?.document as CxdDocument;
                  setTitle(view.title);
                  dirtyRef.current = false;
                  setSaveState('saved');
                }}
              />
            )}
            {/* Gutenberg renders the selected block's settings here. */}
            <div ref={inspectorRef} hidden={tab !== 'block'} />
          </div>
        </aside>
      </div>
    </EditorShell>
  );
}

function DocumentPanel({
  entry,
  locales,
  readOnly,
  busy,
  onAction,
  onSaved,
  onRestored,
}: {
  entry: EntryView;
  locales: { code: string; name: string }[];
  readOnly: boolean;
  busy: boolean;
  onAction: (kind: 'unpublish' | 'trash' | { schedule: string }) => void;
  onSaved: (view: EntryView) => void;
  onRestored: (view: EntryView) => void;
}) {
  const navigate = useNavigate();
  const [slug, setSlug] = useState(entry.slug);
  const [scheduleAt, setScheduleAt] = useState('');
  useEffect(() => setSlug(entry.slug), [entry.slug]);

  const saveSettings = useMutation({
    mutationFn: (changes: { slug?: string; parentId?: string | null }) =>
      api<EntryView>('PATCH', `/entries/${entry.id}`, changes),
    onSuccess: onSaved,
  });

  const revisions = useQuery({
    queryKey: ['revisions', entry.id],
    queryFn: () => api<RevisionSummary[]>('GET', `/entries/${entry.id}/revisions`),
  });
  const restore = useMutation({
    mutationFn: (revisionId: string) =>
      api<EntryView>('POST', `/entries/${entry.id}/revisions/${revisionId}/restore`),
    onSuccess: onRestored,
  });

  const pages = useQuery({
    queryKey: ['entries', 'page', 'parents', entry.locale],
    queryFn: () =>
      api<EntryListResponse>('GET', `/entries?type=page&locale=${entry.locale}&limit=100`),
    enabled: entry.type === 'page',
  });

  const translate = useMutation({
    mutationFn: (locale: string) =>
      api<EntryView>('POST', `/entries/${entry.id}/translations`, { locale }),
    onSuccess: (view) => navigate({ to: '/entries/$id', params: { id: view.id } }),
  });

  const missingLocales = locales.filter(
    (l) => l.code !== entry.locale && !entry.translations.some((t) => t.locale === l.code),
  );
  const panelError = saveSettings.error ?? restore.error ?? translate.error;

  return (
    <div className="space-y-5 p-4 text-sm">
      {panelError && <Alert>{errorMessage(panelError)}</Alert>}

      <section className="space-y-1">
        <h3 className="font-medium">Status</h3>
        <p>
          {STATUS_LABELS[entry.status]}
          {entry.publishedAt &&
            entry.status === 'published' &&
            ` · ${formatDate(entry.publishedAt)}`}
          {entry.scheduledAt && ` · ${formatDate(entry.scheduledAt)}`}
        </p>
        {entry.hasUnpublishedChanges && (
          <p className="text-amber-700">The public version is older than the saved one.</p>
        )}
        {entry.permissions.publish && ['published', 'scheduled'].includes(entry.status) && (
          <button
            type="button"
            className="text-sky-700 hover:underline"
            disabled={busy}
            onClick={() => onAction('unpublish')}
          >
            Switch to draft
          </button>
        )}
      </section>

      {entry.permissions.publish && ['draft', 'pending', 'scheduled'].includes(entry.status) && (
        <section className="space-y-2">
          <h3 className="font-medium">Schedule</h3>
          <label className="block">
            <span className="sr-only">Publication date and time</span>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <Button
            variant="secondary"
            disabled={!scheduleAt || busy}
            onClick={() => onAction({ schedule: scheduleAt })}
          >
            Schedule
          </Button>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-medium">Permalink</h3>
        <label className="block">
          <span className="text-xs text-slate-600">Slug</span>
          <input
            value={slug}
            readOnly={readOnly}
            onChange={(e) => setSlug(e.target.value)}
            onBlur={() => slug !== entry.slug && saveSettings.mutate({ slug })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
      </section>

      {entry.type === 'page' && (
        <section className="space-y-2">
          <h3 className="font-medium">Parent page</h3>
          <select
            value={entry.parentId ?? ''}
            disabled={readOnly}
            onChange={(e) => saveSettings.mutate({ parentId: e.target.value || null })}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="">(no parent)</option>
            {pages.data?.items
              .filter((p) => p.id !== entry.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || '(no title)'}
                </option>
              ))}
          </select>
        </section>
      )}

      {locales.length > 1 && (
        <section className="space-y-2">
          <h3 className="font-medium">Language</h3>
          <p className="uppercase">{entry.locale}</p>
          <ul className="space-y-1">
            {entry.translations.map((t) => (
              <li key={t.id}>
                <Link
                  to="/entries/$id"
                  params={{ id: t.id }}
                  className="text-sky-700 hover:underline"
                >
                  <span className="uppercase">{t.locale}</span>: {t.title || '(no title)'}
                </Link>{' '}
                <span className="text-slate-500">({STATUS_LABELS[t.status]})</span>
              </li>
            ))}
          </ul>
          {missingLocales.length > 0 && (
            <select
              value=""
              disabled={translate.isPending}
              onChange={(e) => e.target.value && translate.mutate(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1"
              aria-label="Add translation"
            >
              <option value="">Add translation…</option>
              {missingLocales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-medium">Revisions</h3>
        <ul className="space-y-1">
          {revisions.data?.map((revision) => (
            <li key={revision.id} className="flex items-center justify-between gap-2">
              <span>
                {formatDate(revision.createdAt)}
                <span className="block text-xs text-slate-500">
                  {revision.author?.displayName ?? '—'}
                  {revision.current && ' · current'}
                  {revision.published && ' · published'}
                </span>
              </span>
              {!revision.current && !readOnly && (
                <button
                  type="button"
                  className="text-sky-700 hover:underline"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(revision.id)}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {entry.permissions.delete && entry.status !== 'trashed' && (
        <section>
          <button
            type="button"
            className="text-red-700 hover:underline"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Move this entry to the trash?')) onAction('trash');
            }}
          >
            Move to trash
          </button>
        </section>
      )}
    </div>
  );
}

function EditorShell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen flex-col bg-slate-100 text-slate-900">{children}</div>;
}
