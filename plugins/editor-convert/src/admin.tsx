/**
 * Convert Editors in the admin: a page under Tools that lists entries with
 * the editor that made each one, and converts the chosen ones to another
 * editor, in place (a new revision) or as new drafts.
 */
import {
  Alert,
  Button,
  Card,
  adminUrl,
  api as coreApi,
  defineAdminPlugin,
  errorMessage,
  labelText,
  type AdminPageProps,
  type SiteEditor,
} from '@cleitext/admin-sdk';
import type { CxdDocument } from '@cleitext/blocks';
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { copyTitle, editorOf, planConversion, type ConversionPlan } from './convert.js';
import { fill, strings, type Strings } from './strings.js';

// ---- Core API shapes (the parts used here) ------------------------------------------------

interface ContentType {
  slug: string;
  name: Record<string, string>;
  supports: string[];
}

type Status = 'draft' | 'pending' | 'scheduled' | 'published' | 'private' | 'trashed';

interface EntryRow {
  id: string;
  type: string;
  title: string;
  status: Status;
  updatedAt: string;
}

interface EntryDetail extends EntryRow {
  revision: { id: string; document: unknown } | null;
  autosave: unknown;
  permissions: { edit: boolean };
}

interface LockView {
  lockedBy: { id: string; displayName: string } | null;
}

const input =
  'rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600';

const documentOf = (entry: EntryDetail): CxdDocument =>
  (entry.revision?.document as CxdDocument | undefined) ?? { schema: 1, blocks: [] };

type Mode = 'in-place' | 'copy';

interface Outcome {
  ok: boolean;
  /** The entry that has the new content (the copy, in copy mode). */
  id?: string;
  error?: string;
}

function ConvertPage(props: AdminPageProps) {
  const { user } = props;
  const t = strings(user.locale);
  if (!props.editors) return <Alert>{t.oldSite}</Alert>;
  return <Converter {...props} editors={props.editors} t={t} />;
}

function Converter({
  user,
  editors: listEditors,
  t,
}: AdminPageProps & { editors: NonNullable<AdminPageProps['editors']>; t: Strings }) {
  const locale = user.locale;
  const client = useQueryClient();
  const editors = listEditors();
  const editorTitle = (id: string) => {
    const editor = editors.find((e) => e.id === id);
    return editor ? labelText(editor.title, locale) : fill(t.unknownEditor, { editor: id });
  };

  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [editorFilter, setEditorFilter] = useState('');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<Mode>('in-place');
  const [publish, setPublish] = useState(false);
  const [plans, setPlans] = useState<{ entry: EntryDetail; plan: ConversionPlan }[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  const types = useQuery({
    queryKey: ['editor-convert', 'types'],
    queryFn: () => coreApi<ContentType[]>('GET', '/content-types'),
    staleTime: 60_000,
  });
  const editable = (types.data ?? []).filter(
    (ct) => ct.supports.includes('blocks') && !ct.supports.includes('private'),
  );
  const typeName = (slug: string) => {
    const found = types.data?.find((ct) => ct.slug === slug);
    return found ? labelText(found.name, locale) : slug;
  };

  const list = useInfiniteQuery({
    queryKey: ['editor-convert', 'entries', type, status, q],
    enabled: types.isSuccess,
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: '50' });
      if (type) query.set('type', type);
      if (status) query.set('status', status);
      if (q) query.set('q', q);
      if (pageParam) query.set('cursor', pageParam);
      return coreApi<{ items: EntryRow[]; nextCursor: string | null }>(
        'GET',
        `/entries?${query.toString()}`,
      );
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  // Types without blocks (forms, private records) have no content to convert.
  const rows = (list.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((row) => editable.some((ct) => ct.slug === row.type));

  // The editor of each entry is in its document: one read per entry, kept while unchanged.
  const details = useQueries({
    queries: rows.map((row) => ({
      queryKey: ['editor-convert', 'entry', row.id, row.updatedAt],
      queryFn: () => coreApi<EntryDetail>('GET', `/entries/${row.id}`),
      staleTime: Infinity,
    })),
  });
  const detailOf = useMemo(() => {
    const map = new Map<string, EntryDetail>();
    for (const d of details) if (d.data) map.set(d.data.id, d.data);
    return map;
  }, [details]);

  const shown = rows.filter((row) => {
    if (!editorFilter) return true;
    const detail = detailOf.get(row.id);
    return detail ? editorOf(documentOf(detail)) === editorFilter : false;
  });
  const usedEditors = [
    ...new Set([
      ...editors.map((e) => e.id),
      ...[...detailOf.values()].map((d) => editorOf(documentOf(d))),
    ]),
  ];
  const targets = editors.filter((e) => e.id === 'blocks' || e.fromBlocks);

  const toggle = (id: string) => {
    setPlans(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allShown = shown.length > 0 && shown.every((row) => selected.has(row.id));

  const plan = (entry: EntryDetail): ConversionPlan =>
    planConversion(documentOf(entry), entry.type, editors, target);

  const preview = () => {
    setOutcomes({});
    setExcluded(new Set());
    setPlans(
      [...selected].flatMap((id) => {
        const entry = detailOf.get(id);
        return entry ? [{ entry, plan: plan(entry) }] : [];
      }),
    );
  };

  /** Problems that keep an entry out, in words. */
  const problem = (entry: EntryDetail, p: ConversionPlan): string | null => {
    if (mode === 'in-place' && !entry.permissions.edit) return t.noPermission;
    if (!p.error) return null;
    return fill(t.errors[p.error], { editor: editorTitle(p.source), detail: p.detail ?? '' });
  };

  const run = async () => {
    if (!plans) return;
    const chosen = plans.filter(
      ({ entry, plan: p }) => !excluded.has(entry.id) && !problem(entry, p),
    );
    setProgress({ done: 0, total: chosen.length });
    const results: Record<string, Outcome> = {};
    for (const [index, { entry }] of chosen.entries()) {
      try {
        results[entry.id] = { ok: true, id: await apply(entry) };
      } catch (error) {
        results[entry.id] = { ok: false, error: errorMessage(error) };
      }
      setOutcomes({ ...results });
      setProgress({ done: index + 1, total: chosen.length });
    }
    setProgress(null);
    setSelected(new Set());
    await client.invalidateQueries({ queryKey: ['editor-convert', 'entries'] });
  };

  /** Converts one entry from its latest saved version; returns the entry that has the result. */
  const apply = async (planned: EntryDetail): Promise<string> => {
    // Read it again: it may have changed since the preview.
    const entry = await coreApi<EntryDetail>('GET', `/entries/${planned.id}`);
    const lock = await coreApi<LockView>('GET', `/entries/${entry.id}/lock`).catch(() => null);
    if (mode === 'in-place' && lock?.lockedBy && lock.lockedBy.id !== user.id) {
      throw new Error(fill(t.locked, { name: lock.lockedBy.displayName }));
    }
    const p = plan(entry);
    const why = problem(entry, p);
    if (why || !p.document) throw new Error(why ?? t.errors.failed);
    if (mode === 'copy') {
      const copy = await coreApi<EntryRow>('POST', `/entries/${entry.id}/duplicate`);
      await coreApi('PATCH', `/entries/${copy.id}`, {
        title: copyTitle(entry.title, editorTitle(target)),
        document: p.document,
      });
      return copy.id;
    }
    await coreApi('PATCH', `/entries/${entry.id}`, { document: p.document });
    if (publish && (entry.status === 'published' || entry.status === 'private')) {
      await coreApi('POST', `/entries/${entry.id}/publish`, {
        visibility: entry.status === 'private' ? 'private' : 'public',
      });
    }
    return entry.id;
  };

  if (editors.length < 2) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <Alert>{t.noEditors}</Alert>
      </div>
    );
  }

  const ready = plans?.filter(
    ({ entry, plan: p }) => !excluded.has(entry.id) && !problem(entry, p),
  );
  const doneCount = Object.values(outcomes).filter((o) => o.ok).length;
  const failedCount = Object.values(outcomes).filter((o) => !o.ok).length;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="max-w-3xl text-sm text-slate-600">{t.intro}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Select label={t.type} value={type} onChange={setType}>
            <option value="">{t.allTypes}</option>
            {editable.map((ct) => (
              <option key={ct.slug} value={ct.slug}>
                {labelText(ct.name, locale)}
              </option>
            ))}
          </Select>
          <Select label={t.editor} value={editorFilter} onChange={setEditorFilter}>
            <option value="">{t.anyEditor}</option>
            {usedEditors.map((id) => (
              <option key={id} value={id}>
                {editorTitle(id)}
              </option>
            ))}
          </Select>
          <Select label={t.status} value={status} onChange={setStatus}>
            <option value="">{t.anyStatus}</option>
            {(['draft', 'pending', 'scheduled', 'published', 'private'] as const).map((s) => (
              <option key={s} value={s}>
                {t.statuses[s]}
              </option>
            ))}
          </Select>
          <label className="block space-y-1">
            <span className="block text-sm font-medium text-slate-800">{t.search}</span>
            <input
              type="search"
              className={input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {editorFilter && <p className="mt-2 text-xs text-slate-500">{t.filterNote}</p>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    aria-label={t.selectAll}
                    checked={allShown}
                    onChange={() => {
                      setPlans(null);
                      setSelected((current) => {
                        const next = new Set(current);
                        for (const row of shown) {
                          if (allShown) next.delete(row.id);
                          else next.add(row.id);
                        }
                        return next;
                      });
                    }}
                  />
                </th>
                <th className="py-2 pr-3 font-medium">{t.colTitle}</th>
                <th className="py-2 pr-3 font-medium">{t.colType}</th>
                <th className="py-2 pr-3 font-medium">{t.colStatus}</th>
                <th className="py-2 pr-3 font-medium">{t.colEditor}</th>
                <th className="py-2 font-medium">{t.colUpdated}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const detail = detailOf.get(row.id);
                const outcome = outcomes[row.id];
                return (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        aria-label={row.title || row.id}
                        checked={selected.has(row.id)}
                        disabled={!detail}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <a className="text-sky-800 underline" href={adminUrl(`/entries/${row.id}`)}>
                        {row.title || '—'}
                      </a>
                      {outcome && (
                        <span
                          className={`ml-2 text-xs ${outcome.ok ? 'text-emerald-700' : 'text-red-700'}`}
                        >
                          {outcome.ok
                            ? mode === 'copy'
                              ? t.copied
                              : t.done
                            : fill(t.failed, { error: outcome.error ?? '' })}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{typeName(row.type)}</td>
                    <td className="py-2 pr-3">{t.statuses[row.status]}</td>
                    <td className="py-2 pr-3">
                      {detail ? editorTitle(editorOf(documentOf(detail))) : t.loading}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {new Date(row.updatedAt).toLocaleDateString(locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.isPending && <p className="py-3 text-sm text-slate-600">{t.loading}</p>}
          {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
          {list.isSuccess && shown.length === 0 && (
            <p className="py-3 text-sm text-slate-600">{t.empty}</p>
          )}
          {list.hasNextPage && (
            <div className="mt-3">
              <Button
                variant="secondary"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? t.loading : t.loadMore}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <p className="text-sm text-slate-700">{fill(t.selected, { count: selected.size })}</p>
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label={t.target}
              value={target}
              onChange={(value) => {
                setTarget(value);
                setPlans(null);
              }}
            >
              <option value="">—</option>
              {targets.map((editor: SiteEditor) => (
                <option key={editor.id} value={editor.id}>
                  {labelText(editor.title, locale)}
                </option>
              ))}
            </Select>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-slate-800">{t.mode}</legend>
            {(
              [
                ['in-place', t.inPlace],
                ['copy', t.copy],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="editor-convert-mode"
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    setPlans(null);
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {mode === 'in-place' && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
              />
              <span>
                {t.publish}
                <span className="block text-xs text-slate-500">{t.publishHelp}</span>
              </span>
            </label>
          )}
          <Button disabled={!target || selected.size === 0 || progress !== null} onClick={preview}>
            {t.preview}
          </Button>
        </div>
      </Card>

      {plans && (
        <Card title={t.previewTitle}>
          <p className="mb-3 text-sm text-slate-600">{t.previewIntro}</p>
          <ul className="space-y-3">
            {plans.map(({ entry, plan: p }) => {
              const why = problem(entry, p);
              const outcome = outcomes[entry.id];
              return (
                <li key={entry.id} className="rounded border border-slate-200 p-3 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={Boolean(why) || progress !== null}
                      checked={!why && !excluded.has(entry.id)}
                      onChange={() =>
                        setExcluded((current) => {
                          const next = new Set(current);
                          if (next.has(entry.id)) next.delete(entry.id);
                          else next.add(entry.id);
                          return next;
                        })
                      }
                    />
                    <span className="space-y-1">
                      <span className="block font-medium">
                        {entry.title || '—'}{' '}
                        <span className="font-normal text-slate-500">
                          {editorTitle(p.source)} → {editorTitle(p.target)}
                        </span>
                      </span>
                      {why ? (
                        <span className="block text-red-700">{why}</span>
                      ) : (
                        <PlanNotes plan={p} entry={entry} mode={mode} t={t} />
                      )}
                      {outcome && (
                        <span
                          className={`block ${outcome.ok ? 'text-emerald-700' : 'text-red-700'}`}
                        >
                          {outcome.ok ? (
                            <>
                              {mode === 'copy' ? t.copied : t.done}.{' '}
                              <a
                                className="text-sky-800 underline"
                                href={adminUrl(`/entries/${outcome.id}`)}
                              >
                                {t.open}
                              </a>{' '}
                              {mode === 'in-place' && t.revisions}
                            </>
                          ) : (
                            fill(t.failed, { error: outcome.error ?? '' })
                          )}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={!ready?.length || progress !== null} onClick={() => void run()}>
              {fill(mode === 'copy' ? t.copyAction : t.convert, { count: ready?.length ?? 0 })}
            </Button>
            <Button variant="secondary" disabled={progress !== null} onClick={() => setPlans(null)}>
              {t.close}
            </Button>
            {progress && (
              <span role="status" className="text-sm text-slate-600">
                {fill(t.working, progress)}
              </span>
            )}
            {!progress && doneCount + failedCount > 0 && (
              <span role="status" className="text-sm text-slate-700">
                {fill(t.summary, { ok: doneCount, failed: failedCount })}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function PlanNotes({
  plan: p,
  entry,
  mode,
  t,
}: {
  plan: ConversionPlan;
  entry: EntryDetail;
  mode: Mode;
  t: Strings;
}) {
  const notes: { text: string; warn?: boolean }[] = [
    { text: fill(t.elements, { before: p.before, after: p.after }) },
  ];
  if (p.leftover.length)
    notes.push({ text: fill(t.leftover, { types: p.leftover.join(', ') }), warn: true });
  if (p.keptAsBlocks.length)
    notes.push({ text: fill(t.keptAs, { types: p.keptAsBlocks.join(', ') }) });
  if (p.htmlBlocks) notes.push({ text: fill(t.html, { count: p.htmlBlocks }) });
  notes.push(
    p.missingWords.length
      ? {
          text: fill(t.textKept, {
            percent: Math.floor(p.textKept * 100),
            words: p.missingWords.join(', '),
          }),
          warn: true,
        }
      : { text: t.allText },
  );
  if (mode === 'in-place' && (entry.status === 'published' || entry.status === 'private')) {
    notes.push({ text: t.publishedNote });
  }
  if (entry.autosave) notes.push({ text: t.autosaveNote, warn: true });
  return (
    <>
      {notes.map((note) => (
        <span
          key={note.text}
          className={`block text-xs ${note.warn ? 'text-amber-800' : 'text-slate-600'}`}
        >
          {note.text}
        </span>
      ))}
    </>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Convert editors', it: 'Converti editor' },
      description: {
        en: 'Move pages and posts between the block editor and page builders, with a preview and revisions to undo.',
        it: 'Sposta pagine e articoli tra l’editor a blocchi e i page builder, con anteprima e revisioni per annullare.',
      },
      parent: '/tools',
      icon: 'M4 7h12l-3-3 M20 17H8l3 3 M4 7v4 M20 17v-4',
      capability: 'edit_entries',
      component: ConvertPage,
    },
  ],
});
