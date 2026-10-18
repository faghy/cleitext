import { adminUrl } from '@cleitext/shared';
import { documentStats, type CxdDocument } from '@cleitext/blocks';
import type { EditorInstance, EditorServices, EmbedPreview, MediaRef } from '@cleitext/editor-core';
import { FieldsForm, useT } from '@cleitext/admin-sdk';
import {
  labelText,
  type ContentTypeView,
  type EntryListResponse,
  type EntryView,
  type FieldDefinition,
  type FieldValues,
  type MediaListResponse,
  type MediaView,
  type PatternView,
  type RevisionSummary,
  type RevisionView,
  type EntryLockView,
} from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage, uploadFile } from '../api';
import { editorExtensions } from '../editor-plugins';
import { useMe } from '../auth';
import { Alert, Button } from '../components/ui';
import { EntryStates } from '../components/entry-states';
import { formatDate, STATUS_LABELS } from './entries-list';
import { EntryTerms } from './entry-terms';
import {
  contentTypesQuery,
  PluginEditor,
  PluginEditorPanels,
  usePluginEditors,
  type AvailableEditor,
} from '../plugins';
import { descendantsOf, entryTree } from '../entry-tree';
import { diffWords, documentLines, type DiffPart } from '../diff';
import { zonedTimeToIso } from '../time';

const AUTOSAVE_INTERVAL_MS = 30_000;

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/** Full-screen editor for one entry (RF-EDT-01, RF-CNT-04…10). */
export function EntryEditorPage({ id }: { id: string }) {
  const { t } = useT();
  const entry = useQuery({
    queryKey: ['entry', id],
    queryFn: () => api<EntryView>('GET', `/entries/${id}`),
  });

  if (entry.isPending) return <EditorShell>{t('Loading…')}</EditorShell>;
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
  const { t } = useT();
  const me = useMe();
  const userLocale = me.user.locale;
  const queryClient = useQueryClient();
  const [entry, setEntry] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<'document' | 'block'>('document');
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(initial.autosave);
  const [visibility, setVisibility] = useState<'public' | 'private'>(
    initial.status === 'private' ? 'private' : 'public',
  );
  const [fields, setFields] = useState<FieldValues>(initial.revision?.fields ?? {});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldsRef = useRef<FieldValues>(fields);
  // Excerpt and featured image (RF-CNT-12), saved with the entry.
  const [summary, setSummary] = useState<FieldValues>({
    excerpt: initial.revision?.excerpt ?? null,
    featuredMediaId: initial.revision?.featuredMediaId ?? null,
  });
  const summaryRef = useRef<FieldValues>(summary);
  const types = useQuery(contentTypesQuery);
  const contentType = types.data?.find((t) => t.slug === initial.type);

  const canvasRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const documentRef = useRef<CxdDocument>(initial.revision?.document as CxdDocument);
  const [statsDocument, setStatsDocument] = useState<CxdDocument>(documentRef.current);
  const statsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyRef = useRef(false);
  // Editor of the document: null for the block editor, else a plugin editor's id.
  const [editorId, setEditorId] = useState<string | null>(editorIdOf(documentRef.current));
  // Settings the block editor keeps for the theme (`editor.data`, e.g. hideFeatured).
  const blockEditorMeta = useRef(blockEditorMetaOf(documentRef.current));
  /** A document from the block editor, with the settings it keeps for the theme. */
  const withMeta = (document: CxdDocument): CxdDocument =>
    blockEditorMeta.current ? { ...document, editor: blockEditorMeta.current } : document;
  // Changes to remount a plugin editor with new content (revision, autosave, switch).
  const [editorMount, setEditorMount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pluginEditors = usePluginEditors(initial.type);
  const activeEditor: AvailableEditor | undefined = editorId
    ? pluginEditors.editors.find((e) => e.definition.id === editorId)
    : undefined;

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveState('dirty');
  }, []);

  const changeSummary = (values: FieldValues) => {
    summaryRef.current = values;
    setSummary(values);
    markDirty();
  };

  const changeFields = (values: FieldValues) => {
    fieldsRef.current = values;
    setFields(values);
    markDirty();
  };

  /** Validation messages of custom fields (`fields.<name>` or `fields.<group>.<name>`). */
  const showFieldErrors = (error: unknown) => {
    const errors: Record<string, string> = {};
    if (error instanceof ApiError) {
      for (const e of error.problem.errors ?? []) {
        if (e.path.startsWith('fields.')) errors[e.path.slice('fields.'.length)] = e.message;
        else if (e.path === 'featuredMediaId' || e.path === 'excerpt') errors[e.path] = e.message;
      }
    }
    setFieldErrors(errors);
  };

  // Mount the editor adapter (lazy: Gutenberg is loaded only here).
  useEffect(() => {
    // Documents of a plugin editor never open in the block editor.
    if (editorId !== null) return;
    let cancelled = false;
    void Promise.all([
      import('@cleitext/editor-gutenberg'),
      // Blocks of the plugins active on the site, and their editor entries.
      editorExtensions(userLocale),
      // The theme's styles for the canvas.
      api<{ css: string }>('GET', '/themes/active/editor-styles').catch(() => ({ css: '' })),
    ]).then(([{ gutenbergAdapter }, extensions, styles]) => {
      if (cancelled || !canvasRef.current) return;
      editorRef.current = gutenbergAdapter.mount({
        styles: styles.css,
        document: documentRef.current,
        targets: { canvas: canvasRef.current, inspector: inspectorRef.current },
        services: mediaServices(initial.locale),
        locale: initial.locale,
        fieldBlocks: extensions.fieldBlocks,
        styleUrls: extensions.styleUrls,
        hostShortcuts: [{ description: 'Save your changes.', modifier: 'primary', character: 's' }],
        // Like WordPress: a selected block shows its settings, none shows the page's.
        onSelectionChange: (selected) => setTab(selected ? 'block' : 'document'),
        onChange: (document) => {
          documentRef.current = withMeta(document);
          markDirty();
          // Statistics follow the text, at most a few times a second.
          clearTimeout(statsTimer.current);
          statsTimer.current = setTimeout(() => setStatsDocument(document), 400);
        },
      });
    });
    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [initial.locale, markDirty, userLocale, editorId]);

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
        fields: fieldsRef.current,
        ...summaryRef.current,
      })
        .then((r) => setAutosavedAt(r.savedAt))
        .catch(() => {});
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [entry.id, entry.permissions.edit, title]);

  /** New content from outside the editor (autosave, revision): remounts the right editor. */
  const replaceDocument = (document: CxdDocument) => {
    documentRef.current = document;
    blockEditorMeta.current = blockEditorMetaOf(document);
    const next = editorIdOf(document);
    if (next === null && editorId === null) editorRef.current?.setDocument(document);
    setEditorId(next);
    setEditorMount((n) => n + 1);
  };

  /** Switches between the block editor and a plugin editor (`null`: block editor). */
  const switchEditor = (target: AvailableEditor | null) => {
    const current = editorRef.current?.getDocument() ?? documentRef.current;
    const from = activeEditor?.definition;
    const convert = target ? target.definition.fromBlocks : from?.toBlocks;
    // From an editor whose plugin is not active: its blocks stay, shown as they are.
    const keep = !target && !activeEditor;
    if (current.blocks.length > 0 && !convert && !keep) {
      const ok = window.confirm(
        target
          ? t(
              'The page will start empty in {editor}. The current content stays in the revisions.',
              { editor: labelText(target.definition.title, userLocale) },
            )
          : t(
              'The page will start empty in the block editor. The current content stays in the revisions.',
            ),
      );
      if (!ok) return;
    }
    const converted: CxdDocument = convert
      ? convert(current)
      : keep
        ? current
        : { schema: 1, blocks: [] };
    const rest: CxdDocument = { schema: converted.schema, blocks: converted.blocks };
    documentRef.current = target
      ? { ...rest, editor: { ...converted.editor, id: target.definition.id } }
      : rest;
    setEditorId(target ? target.definition.id : null);
    setEditorMount((n) => n + 1);
    setSettingsOpen(false);
    setTab('document');
    markDirty();
  };

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
      document: editorRef.current ? withMeta(editorRef.current.getDocument()) : documentRef.current,
      fields: fieldsRef.current,
      ...summaryRef.current,
    });
    setFieldErrors({});
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
          ? { scheduledAt: zonedTimeToIso(kind.schedule, me.site.timezone) }
          : kind === 'publish'
            ? { visibility }
            : undefined;
      apply(await api<EntryView>('POST', `/entries/${entry.id}/${path}`, body));
    },
    onError: (e) => {
      setSaveState(dirtyRef.current ? 'dirty' : 'saved');
      setError(errorMessage(e));
      showFieldErrors(e);
    },
  });

  /** Saves, then opens the signed preview link (RF-CNT-09). */
  const preview = useMutation({
    mutationFn: async () => {
      setError(null);
      // Opened right away, so the browser does not treat it as a pop-up.
      const tab = window.open('about:blank', '_blank');
      try {
        await save();
        const { url } = await api<{ url: string }>('POST', `/entries/${entry.id}/preview`);
        if (tab) tab.location.href = url;
        else window.location.href = url;
      } catch (e) {
        tab?.close();
        throw e;
      }
    },
    onError: (e) => {
      setSaveState(dirtyRef.current ? 'dirty' : 'saved');
      setError(errorMessage(e));
      showFieldErrors(e);
    },
  });

  const canEdit = entry.permissions.edit;
  // Editing lock (RF-CNT-15): while someone else holds it, this editor only shows.
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const readOnly = !canEdit || lockedBy !== null;
  // Lock requests run one after the other: a release must not overtake the
  // next acquisition (React mounts components twice in development).
  const lockQueue = useRef<Promise<unknown>>(Promise.resolve());
  const acquireLock = useCallback(
    (takeover = false) => {
      lockQueue.current = lockQueue.current.then(async () => {
        try {
          await api<EntryLockView>(
            'POST',
            `/entries/${entry.id}/lock${takeover ? '?takeover=1' : ''}`,
          );
          setLockedBy(null);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) return;
          const status = await api<EntryLockView>('GET', `/entries/${entry.id}/lock`).catch(
            () => null,
          );
          setLockedBy(status?.lockedBy?.displayName || t('Someone'));
        }
      });
      return lockQueue.current;
    },
    [entry.id, t],
  );
  useEffect(() => {
    if (!canEdit) return;
    void acquireLock();
    // The lock lasts two minutes: refresh it while the editor stays open.
    const timer = setInterval(() => void acquireLock(), 60_000);
    return () => {
      clearInterval(timer);
      lockQueue.current = lockQueue.current.then(() =>
        api<void>('DELETE', `/entries/${entry.id}/lock`).catch(() => undefined),
      );
    };
  }, [canEdit, acquireLock, entry.id]);

  // Ctrl/Cmd+S saves (also from the editor canvas, whose keys bubble up).
  const saveShortcut = useRef<() => void>(() => {});
  saveShortcut.current = () => {
    if (!readOnly && entry.status !== 'trashed' && !action.isPending) action.mutate('save');
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key === 's'
      ) {
        event.preventDefault();
        saveShortcut.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const isPublished = entry.status === 'published' || entry.status === 'private';
  const backTo: string =
    entry.type === 'page'
      ? '/pages'
      : entry.type === 'article'
        ? '/posts'
        : `/content/${entry.type}`;
  const typeName = contentType
    ? labelText(contentType.name, userLocale)
    : entry.type === 'page'
      ? t('Pages')
      : t('Posts');

  const editorEntry = {
    id: entry.id,
    type: entry.type,
    locale: entry.locale,
    title: entry.title,
    slug: entry.slug,
    status: entry.status,
    updatedAt: entry.updatedAt,
  };

  return (
    <EditorShell>
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link
          to={backTo}
          className="text-sm text-sky-700 hover:underline"
          aria-label={t('Back to the list')}
        >
          ← {typeName}
        </Link>
        <label className="sr-only" htmlFor="entry-title">
          {t('Title')}
        </label>
        <input
          id="entry-title"
          value={title}
          readOnly={readOnly}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          placeholder={t('Add title')}
          className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-xl font-semibold hover:border-slate-200 focus:border-sky-600 focus:outline-none"
        />
        <EntryStates states={initial.states} />
        <span className="text-xs text-slate-500" role="status" aria-live="polite">
          {saveState === 'saving'
            ? t('Saving…')
            : saveState === 'dirty'
              ? autosavedAt
                ? t('Autosaved {time}', { time: new Date(autosavedAt).toLocaleTimeString() })
                : t('Unsaved changes')
              : saveState === 'saved'
                ? t('Saved')
                : ''}
        </span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {t(STATUS_LABELS[entry.status])}
        </span>
        {editorId === null &&
          !readOnly &&
          pluginEditors.editors.map((editor) => (
            <Button
              key={editor.definition.id}
              variant="secondary"
              onClick={() => switchEditor(editor)}
            >
              {t('Edit with {editor}', {
                editor: labelText(editor.definition.title, userLocale),
              })}
            </Button>
          ))}
        {editorId !== null && (
          <Button
            variant="secondary"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            {t('Settings')}
          </Button>
        )}
        {!readOnly && !isPublished && (
          <Button
            variant="secondary"
            disabled={action.isPending}
            onClick={() => action.mutate('save')}
          >
            {t('Save draft')}
          </Button>
        )}
        {!readOnly && entry.status !== 'trashed' && (
          <Button
            variant="secondary"
            disabled={action.isPending || preview.isPending}
            onClick={() => preview.mutate()}
          >
            {t('Preview')}
          </Button>
        )}
        {!readOnly && !entry.permissions.publish && entry.status === 'draft' && (
          <Button disabled={action.isPending} onClick={() => action.mutate('submit')}>
            {t('Submit for review')}
          </Button>
        )}
        {entry.permissions.publish && entry.status !== 'trashed' && (
          <Button disabled={action.isPending} onClick={() => action.mutate('publish')}>
            {isPublished ? t('Update') : t('Publish')}
          </Button>
        )}
      </header>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2">
          <Alert>{error}</Alert>
        </div>
      )}
      {lockedBy !== null && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>
            {t('{name} is editing this entry: saving is off to keep their changes.', {
              name: lockedBy,
            })}
          </span>
          <Button variant="secondary" onClick={() => void acquireLock(true)}>
            {t('Take over')}
          </Button>
        </div>
      )}
      {!canEdit && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {t('You can view this entry but not change it.')}
        </div>
      )}
      {recovery && (
        <div className="flex items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm">
          <span>{t('There is an autosave of this entry newer than the saved version.')}</span>
          <Button
            variant="secondary"
            onClick={() => {
              replaceDocument(recovery.document as CxdDocument);
              setTitle(recovery.title);
              fieldsRef.current = recovery.fields;
              setFields(recovery.fields);
              changeSummary({
                excerpt: recovery.excerpt,
                featuredMediaId: recovery.featuredMediaId,
              });
              markDirty();
              setRecovery(null);
            }}
          >
            {t('Restore the autosave')}
          </Button>
          <button
            type="button"
            className="text-sky-700 hover:underline"
            onClick={() => setRecovery(null)}
          >
            {t('Dismiss')}
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Distinct keys: the block editor's container is never reused (its teardown empties it). */}
        {editorId === null ? (
          <div key="blocks" ref={canvasRef} className="min-w-0 flex-1" />
        ) : (
          <div key="plugin" className="flex min-w-0 flex-1 flex-col">
            {pluginEditors.loading ? (
              <p className="p-6 text-sm text-slate-600">{t('Loading…')}</p>
            ) : !activeEditor ? (
              <div className="space-y-3 p-6">
                <Alert>
                  {t(
                    'This page was made with the {editor} editor, which is not active on the site. Activate its plugin to edit the page.',
                    { editor: editorId },
                  )}
                </Alert>
                {!readOnly && (
                  <Button variant="secondary" onClick={() => switchEditor(null)}>
                    {t('Use the block editor')}
                  </Button>
                )}
              </div>
            ) : (
              <PluginEditor
                key={editorMount}
                editor={activeEditor}
                entry={editorEntry}
                document={documentRef.current}
                readOnly={readOnly}
                onChange={(document) => {
                  documentRef.current = document;
                  markDirty();
                  clearTimeout(statsTimer.current);
                  statsTimer.current = setTimeout(() => setStatsDocument(document), 400);
                }}
                frameUrl={async () => {
                  const { url } = await api<{ url: string }>(
                    'POST',
                    `/entries/${entry.id}/preview`,
                  );
                  return `${url}&frame=1`;
                }}
                media={pluginMedia(initial.locale)}
                openSettings={() => setSettingsOpen(true)}
              />
            )}
          </div>
        )}
        <aside
          className={
            editorId === null
              ? 'flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white'
              : settingsOpen
                ? 'absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-slate-200 bg-white shadow-xl'
                : 'hidden'
          }
          aria-label={t('Settings')}
        >
          {editorId !== null && (
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm">
              {!readOnly ? (
                <button
                  type="button"
                  className="text-sky-700 hover:underline"
                  onClick={() => switchEditor(null)}
                >
                  {t('Use the block editor')}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                aria-label={t('Close')}
                onClick={() => setSettingsOpen(false)}
              >
                ✕
              </button>
            </div>
          )}
          <div role="tablist" className="flex border-b border-slate-200 text-sm">
            {(editorId === null ? (['document', 'block'] as const) : (['document'] as const)).map(
              (name) => (
                <button
                  key={name}
                  role="tab"
                  type="button"
                  aria-selected={tab === name}
                  onClick={() => setTab(name)}
                  className={`flex-1 px-3 py-2 ${tab === name ? 'border-b-2 border-sky-700 font-medium' : 'text-slate-600'}`}
                >
                  {name === 'block'
                    ? t('Block')
                    : entry.type === 'page'
                      ? t('Page')
                      : entry.type === 'article'
                        ? t('Post')
                        : t('Entry')}
                </button>
              ),
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'document' && contentType && (
              <SummaryPanel
                supports={contentType.supports}
                values={summary}
                errors={fieldErrors}
                locale={userLocale}
                readOnly={readOnly}
                onChange={changeSummary}
              />
            )}
            {tab === 'document' && contentType?.supports.includes('comments') && entry && (
              <DiscussionPanel entryId={entry.id} comments={entry.comments} readOnly={readOnly} />
            )}
            {tab === 'document' && contentType && (
              <FieldsPanel
                type={contentType}
                values={fields}
                errors={fieldErrors}
                locale={userLocale}
                readOnly={readOnly}
                onChange={changeFields}
              />
            )}
            {tab === 'document' && statsDocument && <StatsPanel document={statsDocument} />}
            {tab === 'document' && (
              <DocumentPanel
                visibility={visibility}
                onVisibility={(value) => {
                  setVisibility(value);
                  markDirty();
                }}
                entry={entry}
                readOnly={readOnly}
                busy={action.isPending}
                onAction={(kind) => action.mutate(kind)}
                onSaved={apply}
                onRestored={(view) => {
                  apply(view);
                  replaceDocument(view.revision?.document as CxdDocument);
                  setTitle(view.title);
                  fieldsRef.current = view.revision?.fields ?? {};
                  setFields(view.revision?.fields ?? {});
                  summaryRef.current = {
                    excerpt: view.revision?.excerpt ?? null,
                    featuredMediaId: view.revision?.featuredMediaId ?? null,
                  };
                  setSummary(summaryRef.current);
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

/** Comments of the entry: open or closed, and how many (RF-COM). */
function DiscussionPanel({
  entryId,
  comments,
  readOnly,
}: {
  entryId: string;
  comments: { status: 'open' | 'closed'; count: number } | undefined;
  readOnly: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(comments?.status !== 'closed');
  const change = useMutation({
    mutationFn: (next: boolean) =>
      api<void>('PATCH', `/entries/${entryId}/comments`, { status: next ? 'open' : 'closed' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entry', entryId] }),
  });
  return (
    <div className="space-y-2 border-b border-slate-200 p-4 text-sm">
      <p className="font-medium text-slate-800">{t('Discussion')}</p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={open}
          disabled={readOnly || change.isPending}
          onChange={(e) => {
            setOpen(e.target.checked);
            change.mutate(e.target.checked);
          }}
        />
        {t('Allow comments')}
      </label>
      {(comments?.count ?? 0) > 0 && (
        <a className="text-sky-700 hover:underline" href={adminUrl(`/comments?entry=${entryId}`)}>
          {t('{count} comments', { count: comments!.count })}
        </a>
      )}
      {change.error && <p className="text-red-700">{errorMessage(change.error)}</p>}
    </div>
  );
}

/** Featured image and excerpt, when the content type supports them. */
function SummaryPanel({
  supports,
  values,
  errors,
  locale,
  readOnly,
  onChange,
}: {
  supports: string[];
  values: FieldValues;
  errors: Record<string, string>;
  locale: string;
  readOnly: boolean;
  onChange: (values: FieldValues) => void;
}) {
  const fields: FieldDefinition[] = [
    ...(supports.includes('featured_image')
      ? [
          {
            name: 'featuredMediaId',
            type: 'media',
            label: { en: 'Featured image', it: 'Immagine in evidenza' },
          } as const,
        ]
      : []),
    ...(supports.includes('excerpt')
      ? [
          {
            name: 'excerpt',
            type: 'text',
            multiline: true,
            maxLength: 1000,
            label: { en: 'Excerpt', it: 'Riassunto' },
            help: {
              en: 'Shown in lists and search results. The first lines of the text when empty.',
              it: 'Mostrato negli elenchi e nei risultati di ricerca. Se vuoto, le prime righe del testo.',
            },
          } as const,
        ]
      : []),
  ];
  if (fields.length === 0) return null;
  // Errors arrive as `fields.<name>` only for custom fields; these come with their own path.
  return (
    <div className="border-b border-slate-200 p-4 text-sm">
      <FieldsForm
        fields={fields}
        values={values}
        errors={errors}
        locale={locale}
        disabled={readOnly}
        onChange={onChange}
      />
    </div>
  );
}

/** Custom fields of the content type and plugin field groups. */
function FieldsPanel({
  type,
  values,
  errors,
  locale,
  readOnly,
  onChange,
}: {
  type: ContentTypeView;
  values: FieldValues;
  errors: Record<string, string>;
  locale: string;
  readOnly: boolean;
  onChange: (values: FieldValues) => void;
}) {
  const { t } = useT();
  if (type.fields.length === 0 && type.fieldGroups.length === 0) return null;
  const nested = (prefix: string) =>
    Object.fromEntries(
      Object.entries(errors)
        .filter(([path]) => path.startsWith(`${prefix}.`))
        .map(([path, message]) => [path.slice(prefix.length + 1), message]),
    );
  return (
    <div className="space-y-5 border-b border-slate-200 p-4 text-sm">
      {type.fields.length > 0 && (
        <section className="space-y-2" aria-label={t('Details')}>
          <h3 className="font-medium">{t('Details')}</h3>
          <FieldsForm
            fields={type.fields}
            values={values}
            errors={errors}
            locale={locale}
            disabled={readOnly}
            onChange={onChange}
          />
        </section>
      )}
      {type.fieldGroups.map((group) => (
        <section key={group.id} className="space-y-2" aria-label={labelText(group.title, locale)}>
          <h3 className="font-medium">{labelText(group.title, locale)}</h3>
          <FieldsForm
            fields={group.fields}
            values={(values[group.id] as FieldValues | undefined) ?? {}}
            errors={nested(group.id)}
            locale={locale}
            disabled={readOnly}
            onChange={(groupValues) => onChange({ ...values, [group.id]: groupValues })}
          />
        </section>
      ))}
    </div>
  );
}

/** Word count, reading time and heading outline (RF-EDT-10). */
function StatsPanel({ document }: { document: CxdDocument }) {
  const { t } = useT();
  const stats = documentStats(document);
  return (
    <section
      className="space-y-2 border-b border-slate-200 p-4 text-sm"
      aria-label={t('Statistics')}
    >
      <p>
        {t('{words} words · {characters} characters · {minutes} min read', {
          words: stats.words,
          characters: stats.characters,
          minutes: stats.readingMinutes,
        })}
      </p>
      {stats.headings.length > 0 && (
        <details>
          <summary className="cursor-pointer">{t('Outline')}</summary>
          <ul className="mt-1 space-y-0.5">
            {stats.headings.map((heading) => (
              <li key={heading.id} style={{ paddingLeft: `${(heading.level - 2) * 0.75}rem` }}>
                <span className="text-xs text-slate-500">H{heading.level}</span>{' '}
                {heading.text || t('(empty heading)')}
                {heading.problem && (
                  <span className="block text-xs text-amber-700">
                    {heading.problem === 'h1'
                      ? t('The title is already the H1: use H2 here.')
                      : t('A heading level is skipped.')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** A saved revision compared with the current one (word by word). */
function RevisionDiff({
  entry,
  revisionId,
  onClose,
}: {
  entry: EntryView;
  revisionId: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const revision = useQuery({
    queryKey: ['revision', entry.id, revisionId],
    queryFn: () => api<RevisionView>('GET', `/entries/${entry.id}/revisions/${revisionId}`),
  });
  const current = entry.revision;
  const render = (parts: DiffPart[]) =>
    parts.map((part, index) =>
      part.change === 'same' ? (
        <span key={index}>{part.text}</span>
      ) : part.change === 'added' ? (
        <ins key={index} className="bg-emerald-100 text-emerald-900 no-underline">
          {part.text}
        </ins>
      ) : (
        <del key={index} className="bg-red-100 text-red-900">
          {part.text}
        </del>
      ),
    );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Compare revisions')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded bg-white p-5 text-sm shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('Compare revisions')}</h2>
          <button
            type="button"
            className="text-sky-700 hover:underline"
            onClick={onClose}
            autoFocus
          >
            {t('Close')}
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-600">
          {t('From the selected revision to the current one:')}{' '}
          <del className="bg-red-100">{t('removed')}</del>{' '}
          <ins className="bg-emerald-100 no-underline">{t('added')}</ins>
        </p>
        {revision.error && <Alert>{errorMessage(revision.error)}</Alert>}
        {revision.data && current && (
          <div className="space-y-3">
            <p className="text-base font-semibold">
              {render(diffWords(revision.data.title, current.title))}
            </p>
            <div className="leading-relaxed whitespace-pre-wrap">
              {render(
                diffWords(
                  documentLines(revision.data.document as CxdDocument).join('\n'),
                  documentLines(current.document as CxdDocument).join('\n'),
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentPanel({
  visibility,
  onVisibility,
  entry,
  readOnly,
  busy,
  onAction,
  onSaved,
  onRestored,
}: {
  visibility: 'public' | 'private';
  onVisibility: (value: 'public' | 'private') => void;
  entry: EntryView;
  readOnly: boolean;
  busy: boolean;
  onAction: (kind: 'unpublish' | 'trash' | { schedule: string }) => void;
  onSaved: (view: EntryView) => void;
  onRestored: (view: EntryView) => void;
}) {
  const { t } = useT();
  const siteTimezone = useMe().site.timezone;
  const [slug, setSlug] = useState(entry.slug);
  const [scheduleAt, setScheduleAt] = useState('');
  const [comparing, setComparing] = useState<string | null>(null);
  useEffect(() => setSlug(entry.slug), [entry.slug]);

  const saveSettings = useMutation({
    mutationFn: (changes: { slug?: string; parentId?: string | null; position?: number }) =>
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

  const types = useQuery(contentTypesQuery);
  const hierarchical = types.data?.find((ct) => ct.slug === entry.type)?.hierarchical ?? false;
  const pages = useQuery({
    queryKey: ['entries', entry.type, 'parents', entry.locale],
    queryFn: () =>
      api<EntryListResponse>(
        'GET',
        `/entries?type=${entry.type}&locale=${entry.locale}&sort=order&limit=100`,
      ),
    enabled: hierarchical,
  });
  const [position, setPosition] = useState(String(entry.position));
  useEffect(() => setPosition(String(entry.position)), [entry.position]);

  const panelError = saveSettings.error ?? restore.error;

  return (
    <div className="space-y-5 p-4 text-sm">
      {panelError && <Alert>{errorMessage(panelError)}</Alert>}

      <section className="space-y-1">
        <h3 className="font-medium">{t('Status')}</h3>
        <p>
          {t(STATUS_LABELS[entry.status])}
          {entry.publishedAt &&
            entry.status === 'published' &&
            ` · ${formatDate(entry.publishedAt)}`}
          {entry.scheduledAt && ` · ${formatDate(entry.scheduledAt)}`}
        </p>
        {entry.permissions.publish && (
          <label className="mt-2 block">
            <span className="text-xs text-slate-600">{t('Visibility')}</span>
            <select
              value={visibility}
              onChange={(e) => onVisibility(e.target.value as 'public' | 'private')}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1"
            >
              <option value="public">{t('Public')}</option>
              <option value="private">{t('Private (signed-in editors only)')}</option>
            </select>
            {visibility !== (entry.status === 'private' ? 'private' : 'public') &&
              ['published', 'private'].includes(entry.status) && (
                <span className="text-xs text-amber-700">
                  {t('Applied when you click Update.')}
                </span>
              )}
          </label>
        )}
        {entry.hasUnpublishedChanges && (
          <p className="text-amber-700">{t('The public version is older than the saved one.')}</p>
        )}
        {entry.permissions.publish && ['published', 'scheduled'].includes(entry.status) && (
          <button
            type="button"
            className="text-sky-700 hover:underline"
            disabled={busy}
            onClick={() => onAction('unpublish')}
          >
            {t('Switch to draft')}
          </button>
        )}
      </section>

      {entry.permissions.publish && ['draft', 'pending', 'scheduled'].includes(entry.status) && (
        <section className="space-y-2">
          <h3 className="font-medium">{t('Schedule')}</h3>
          <label className="block">
            <span className="sr-only">{t('Publication date and time')}</span>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1"
            />
            <span className="text-xs text-slate-500">
              {t('Site time zone: {timezone}', { timezone: siteTimezone })}
            </span>
          </label>
          <Button
            variant="secondary"
            disabled={!scheduleAt || busy}
            onClick={() => onAction({ schedule: scheduleAt })}
          >
            {t('Schedule')}
          </Button>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-medium">{t('Permalink')}</h3>
        <label className="block">
          <span className="text-xs text-slate-600">{t('Slug')}</span>
          <input
            value={slug}
            readOnly={readOnly}
            onChange={(e) => setSlug(e.target.value)}
            onBlur={() => slug !== entry.slug && saveSettings.mutate({ slug })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
        </label>
      </section>

      {hierarchical && (
        <section className="space-y-2">
          <h3 className="font-medium">{t('Page attributes')}</h3>
          <label className="block">
            <span className="text-xs text-slate-600">{t('Parent page')}</span>
            <select
              value={entry.parentId ?? ''}
              disabled={readOnly}
              onChange={(e) => saveSettings.mutate({ parentId: e.target.value || null })}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1"
            >
              <option value="">{t('(no parent)')}</option>
              {(() => {
                const items = pages.data?.items ?? [];
                // An entry cannot be moved under itself or its own children.
                const excluded = descendantsOf(items, entry.id);
                return entryTree(items)
                  .filter((row) => !excluded.has(row.entry.id))
                  .map((row) => (
                    <option key={row.entry.id} value={row.entry.id}>
                      {'\u2014 '.repeat(row.depth)}
                      {row.entry.title || t('(no title)')}
                    </option>
                  ));
              })()}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-600">{t('Order')}</span>
            <input
              type="number"
              min={0}
              value={position}
              readOnly={readOnly}
              onChange={(e) => setPosition(e.target.value)}
              onBlur={() => {
                const next = Math.max(0, Math.trunc(Number(position) || 0));
                if (next !== entry.position) saveSettings.mutate({ position: next });
              }}
              aria-describedby="entry-order-help"
              className="w-full rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <p id="entry-order-help" className="text-xs text-slate-500">
            {t('Pages with a lower number come first among their siblings.')}
          </p>
        </section>
      )}

      <EntryTerms entry={entry} readOnly={readOnly} onSaved={onSaved} />

      {/* Sections of plugins, e.g. the translations of the language plugin. */}
      <PluginEditorPanels
        entry={{
          id: entry.id,
          type: entry.type,
          locale: entry.locale,
          title: entry.title,
          slug: entry.slug,
          status: entry.status,
          updatedAt: entry.updatedAt,
        }}
      />

      <section className="space-y-2">
        <h3 className="font-medium">{t('Revisions')}</h3>
        <ul className="space-y-1">
          {revisions.data?.map((revision) => (
            <li key={revision.id} className="flex items-center justify-between gap-2">
              <span>
                {formatDate(revision.createdAt)}
                <span className="block text-xs text-slate-500">
                  {revision.author?.displayName ?? '—'}
                  {revision.current && ` · ${t('current')}`}
                  {revision.published && ` · ${t('published')}`}
                </span>
              </span>
              {!revision.current && (
                <span className="flex gap-2">
                  <button
                    type="button"
                    className="text-sky-700 hover:underline"
                    onClick={() => setComparing(revision.id)}
                  >
                    {t('Compare')}
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      className="text-sky-700 hover:underline"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(revision.id)}
                    >
                      {t('Restore')}
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
        {comparing && (
          <RevisionDiff entry={entry} revisionId={comparing} onClose={() => setComparing(null)} />
        )}
      </section>

      {entry.permissions.delete && entry.status !== 'trashed' && (
        <section>
          <button
            type="button"
            className="text-red-700 hover:underline"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('Move this entry to the trash?'))) onAction('trash');
            }}
          >
            {t('Move to trash')}
          </button>
        </section>
      )}
    </div>
  );
}

function EditorShell({ children }: { children: React.ReactNode }) {
  // The editor keeps the light palette: its canvas is a white page.
  return (
    <div className="light-palette flex h-screen flex-col bg-slate-100 text-slate-900">
      {children}
    </div>
  );
}

/** Media services given to the editor adapter (upload and library). */
/** The media library for plugin editors (`EditorProps.media`). */
function pluginMedia(locale: string) {
  const services = mediaServices(locale);
  return { upload: services.uploadMedia!, list: services.listMedia! };
}

export function mediaServices(locale: string): EditorServices {
  const toRef = (m: MediaView): MediaRef => ({
    id: m.id,
    url: m.url,
    alt: m.alt[locale] ?? '',
    mime: m.mime,
    ...(m.width ? { width: m.width } : {}),
    ...(m.height ? { height: m.height } : {}),
    thumbnailUrl:
      m.variants.find((v) => v.variant === 'thumb' && v.format === 'webp')?.url ?? m.url,
  });
  return {
    uploadMedia: async (file) => toRef(await uploadFile<MediaView>(file)),
    listMedia: async ({ kind, search }) => {
      const params = new URLSearchParams({ limit: '60' });
      if (kind) params.set('kind', kind);
      if (search) params.set('q', search);
      return (await api<MediaListResponse>('GET', `/media?${params}`)).items.map(toRef);
    },
    listPatterns: async () =>
      (await api<PatternView[]>('GET', '/patterns'))
        // Templates of other editors (page builders) are theirs only.
        .filter((pattern) => !(pattern.document as CxdDocument | null)?.editor)
        .map((pattern) => ({
          id: pattern.id,
          title: pattern.title,
          document: pattern.document as CxdDocument,
          synced: pattern.synced,
        })),
    savePattern: async (input) => {
      const pattern = await api<PatternView>('POST', '/patterns', input);
      return { ...input, id: pattern.id };
    },
    oembed: async (url) => {
      try {
        return await api<EmbedPreview>('GET', `/oembed?${new URLSearchParams({ url })}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}

/** The editor of a document: null for the block editor (also when it names itself `blocks`). */
function editorIdOf(document: CxdDocument | undefined): string | null {
  const id = document?.editor?.id;
  return id && id !== 'blocks' ? id : null;
}

/** What a block editor document keeps in `editor` for the theme (e.g. hide the featured image). */
function blockEditorMetaOf(document: CxdDocument | undefined): CxdDocument['editor'] | undefined {
  const editor = document?.editor;
  return editor && editorIdOf(document) === null && editor.data ? editor : undefined;
}
