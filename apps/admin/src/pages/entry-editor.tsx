import type { CxdDocument } from '@cleitext/blocks';
import type { EditorInstance, EditorServices, EmbedPreview, MediaRef } from '@cleitext/editor-core';
import { FieldsForm, useT } from '@cleitext/admin-sdk';
import type { FieldBlockDefinition } from '@cleitext/editor-core';
import {
  labelText,
  type ContentTypeView,
  type EntryListResponse,
  type EntryView,
  type FieldDefinition,
  type FieldValues,
  type MediaListResponse,
  type MediaView,
  type PluginBlockView,
  type RevisionSummary,
} from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage, uploadFile } from '../api';
import { useMe } from '../auth';
import { Alert, Button } from '../components/ui';
import { formatDate, STATUS_LABELS } from './entries-list';
import { EntryTerms } from './entry-terms';
import { contentTypesQuery } from '../plugins';
import { descendantsOf, entryTree } from '../entry-tree';
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
  const dirtyRef = useRef(false);

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
    let cancelled = false;
    void Promise.all([
      import('@cleitext/editor-gutenberg'),
      // Blocks of the plugins active on the site.
      api<PluginBlockView[]>('GET', '/blocks').catch(() => [] as PluginBlockView[]),
    ]).then(([{ gutenbergAdapter }, blocks]) => {
      if (cancelled || !canvasRef.current) return;
      editorRef.current = gutenbergAdapter.mount({
        document: documentRef.current,
        targets: { canvas: canvasRef.current, inspector: inspectorRef.current },
        services: mediaServices(initial.locale),
        locale: initial.locale,
        fieldBlocks: blocks.map((block) => toFieldBlock(block, userLocale)),
        hostShortcuts: [{ description: 'Save your changes.', modifier: 'primary', character: 's' }],
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
  }, [initial.locale, markDirty, userLocale]);

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

  const readOnly = !entry.permissions.edit;

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
      {readOnly && (
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
              editorRef.current?.setDocument(recovery.document as CxdDocument);
              documentRef.current = recovery.document as CxdDocument;
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

      <div className="flex min-h-0 flex-1">
        <div ref={canvasRef} className="min-w-0 flex-1" />
        <aside
          className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white"
          aria-label={t('Settings')}
        >
          <div role="tablist" className="flex border-b border-slate-200 text-sm">
            {(['document', 'block'] as const).map((name) => (
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
            ))}
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
            {tab === 'document' && (
              <DocumentPanel
                visibility={visibility}
                onVisibility={(value) => {
                  setVisibility(value);
                  markDirty();
                }}
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

function toFieldBlock(block: PluginBlockView, locale: string): FieldBlockDefinition {
  return {
    type: block.type,
    title: labelText(block.title, locale),
    ...(block.description ? { description: labelText(block.description, locale) } : {}),
    ...(block.icon ? { icon: block.icon } : {}),
    category: block.category,
    version: block.version,
    attributes: block.attributes,
  };
}

function DocumentPanel({
  visibility,
  onVisibility,
  entry,
  locales,
  readOnly,
  busy,
  onAction,
  onSaved,
  onRestored,
}: {
  visibility: 'public' | 'private';
  onVisibility: (value: 'public' | 'private') => void;
  entry: EntryView;
  locales: { code: string; name: string }[];
  readOnly: boolean;
  busy: boolean;
  onAction: (kind: 'unpublish' | 'trash' | { schedule: string }) => void;
  onSaved: (view: EntryView) => void;
  onRestored: (view: EntryView) => void;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const siteTimezone = useMe().site.timezone;
  const [slug, setSlug] = useState(entry.slug);
  const [scheduleAt, setScheduleAt] = useState('');
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

  const translate = useMutation({
    mutationFn: (locale: string) =>
      api<EntryView>('POST', `/entries/${entry.id}/translations`, { locale }),
    onSuccess: (view) => navigate({ to: '/entries/$id', params: { id: view.id } }),
  });

  const missingLocales = locales.filter(
    (l) => l.code !== entry.locale && !entry.translations.some((tr) => tr.locale === l.code),
  );
  const panelError = saveSettings.error ?? restore.error ?? translate.error;

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

      {locales.length > 1 && (
        <section className="space-y-2">
          <h3 className="font-medium">{t('Language')}</h3>
          <p className="uppercase">{entry.locale}</p>
          <ul className="space-y-1">
            {entry.translations.map((tr) => (
              <li key={tr.id}>
                <Link
                  to="/entries/$id"
                  params={{ id: tr.id }}
                  className="text-sky-700 hover:underline"
                >
                  <span className="uppercase">{tr.locale}</span>: {tr.title || t('(no title)')}
                </Link>{' '}
                <span className="text-slate-500">({t(STATUS_LABELS[tr.status])})</span>
              </li>
            ))}
          </ul>
          {missingLocales.length > 0 && (
            <select
              value=""
              disabled={translate.isPending}
              onChange={(e) => e.target.value && translate.mutate(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1"
              aria-label={t('Add translation')}
            >
              <option value="">{t('Add translation…')}</option>
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
              {!revision.current && !readOnly && (
                <button
                  type="button"
                  className="text-sky-700 hover:underline"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(revision.id)}
                >
                  {t('Restore')}
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
  return <div className="flex h-screen flex-col bg-slate-100 text-slate-900">{children}</div>;
}

/** Media services given to the editor adapter (upload and library). */
function mediaServices(locale: string): EditorServices {
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
