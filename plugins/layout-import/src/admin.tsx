/**
 * Layout Import in the admin: a page under Tools that converts pages laid out
 * with `[av_…]` shortcodes into native blocks, from a WordPress export read
 * in the browser or from entries of this site that still hold the shortcodes
 * as text. It uses only the core content API, with the user's permissions.
 */
import {
  Alert,
  Button,
  Card,
  adminUrl,
  api as coreApi,
  defineAdminPlugin,
  errorMessage,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import type { CxdBlock } from '@cleitext/blocks';
import { useMemo, useState } from 'react';
import {
  convertAny,
  countBlocks,
  mediaKey,
  type ImportMaps,
  type LayoutResult,
  type Warning,
  type WarningKind,
} from './convert.js';
import { countElements } from './shortcodes.js';
import { blocksHaveLayout, blocksToSource } from './source.js';
import { fill, strings, type Strings } from './strings.js';
import { readExport } from './wxr.js';

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
  locale: string;
  slug: string;
  title: string;
  status: Status;
}

interface EntryDetail extends EntryRow {
  revision: { id: string; document: unknown } | null;
  permissions: { edit: boolean };
}

interface MediaRow {
  id: string;
  url: string;
  filename: string;
}

interface LockView {
  lockedBy: { id: string; displayName: string } | null;
}

/** A layout to convert and the entry of this site that gets it. */
interface Job {
  key: string;
  title: string;
  type: string;
  content: string;
  elements: number;
  target: EntryRow | null;
}

interface Outcome {
  ok: boolean;
  published?: boolean;
  error?: string;
}

const input =
  'rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600';

/** Every page of a cursor-paged list of the core API (up to `max` pages). */
async function everything<T>(path: string, max = 100): Promise<T[]> {
  const out: T[] = [];
  let cursor = '';
  for (let page = 0; page < max; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const result = await coreApi<{ items: T[]; nextCursor: string | null }>(
      'GET',
      `${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    out.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return out;
}

/** This site's media library by file name (empty when the user may not list it). */
async function mediaLibrary(): Promise<NonNullable<ImportMaps['library']>> {
  const library: NonNullable<ImportMaps['library']> = {};
  const items = await everything<MediaRow>('/media').catch(() => [] as MediaRow[]);
  // The oldest first, so the first copy of a file wins.
  for (const m of items.reverse()) {
    library[mediaKey(m.filename)] ??= { id: m.id, url: m.url };
    library[mediaKey(m.url)] ??= { id: m.id, url: m.url };
  }
  return library;
}

/** Runs tasks a few at a time, reporting progress. */
async function pool<T, R>(
  items: T[],
  task: (item: T) => Promise<R>,
  progress: (done: number) => void,
  size = 4,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await task(items[i]!);
        progress(++done);
      }
    }),
  );
  return results;
}

function LayoutImportPage(props: AdminPageProps) {
  const { user, site } = props;
  const t = strings(user.locale);
  const [mode, setMode] = useState<'export' | 'site'>('export');
  const [headingColor, setHeadingColor] = useState('');
  const [uppercase, setUppercase] = useState(false);
  const [origin, setOrigin] = useState('');
  const [publish, setPublish] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [baseMaps, setBaseMaps] = useState<ImportMaps>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  const maps = useMemo<ImportMaps>(() => {
    const color = headingColor.trim();
    const own = origin.trim().replace(/\/$/, '');
    return {
      ...baseMaps,
      ...(own ? { origin: own } : {}),
      headings: { ...(color ? { color } : {}), ...(uppercase ? { uppercase: true } : {}) },
    };
  }, [baseMaps, headingColor, uppercase, origin]);

  const reset = () => {
    setJobs(null);
    setOutcomes({});
    setError(null);
  };

  const editableTypes = async () =>
    (await coreApi<ContentType[]>('GET', '/content-types')).filter(
      (ct) => ct.supports.includes('blocks') && !ct.supports.includes('private'),
    );

  const readFile = async (file: File) => {
    reset();
    setBusy(t.readingSite);
    try {
      const xml = await file.text();
      if (!/<rss\b[\s\S]*<channel\b/i.test(xml.slice(0, 20_000))) throw new Error(t.notXml);
      const parsed = readExport(xml);
      const types = new Set((await editableTypes()).map((ct) => ct.slug));
      // Entries of this site by type and slug; the site's main language first.
      const wanted = [...new Set(parsed.entries.map((e) => e.type))].filter((ty) => types.has(ty));
      const bySlug = new Map<string, EntryRow>();
      for (const type of wanted) {
        const rows = await everything<EntryRow>(`/entries?type=${encodeURIComponent(type)}`);
        rows.sort(
          (a, b) =>
            Number(b.locale === site.defaultLocale) - Number(a.locale === site.defaultLocale),
        );
        for (const row of rows) {
          const key = `${row.type}:${row.slug}`;
          if (!bySlug.has(key)) bySlug.set(key, row);
        }
      }
      const library = await mediaLibrary();
      setBaseMaps({ ...parsed.maps, library });
      if (parsed.maps.origin && !origin) setOrigin(parsed.maps.origin);
      setJobs(
        parsed.entries.map((e) => ({
          key: `${e.wpType}:${e.id}`,
          title: e.title || e.slug,
          type: e.type,
          content: e.content,
          elements: e.elements,
          target: bySlug.get(`${e.type}:${e.slug}`) ?? null,
        })),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const scanSite = async () => {
    reset();
    setBusy(t.readingSite);
    try {
      const types = await editableTypes();
      const rows = (
        await Promise.all(
          types.map((ct) => everything<EntryRow>(`/entries?type=${encodeURIComponent(ct.slug)}`)),
        )
      ).flat();
      const found: Job[] = [];
      await pool(
        rows,
        async (row) => {
          const entry = await coreApi<EntryDetail>('GET', `/entries/${row.id}`).catch(() => null);
          const doc = entry?.revision?.document as { blocks?: CxdBlock[] } | undefined;
          if (!entry || !blocksHaveLayout(doc?.blocks)) return;
          const content = blocksToSource(doc?.blocks ?? []);
          found.push({
            key: row.id,
            title: row.title || row.slug,
            type: row.type,
            content,
            elements: countElements(content),
            target: row,
          });
        },
        (done) => setBusy(fill(t.scanning, { done, total: rows.length })),
      );
      setBaseMaps({ library: await mediaLibrary() });
      found.sort((a, b) => a.title.localeCompare(b.title));
      setJobs(found);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const results = useMemo(() => {
    const map = new Map<string, LayoutResult>();
    for (const job of jobs ?? []) map.set(job.key, convertAny(job.content, maps));
    return map;
  }, [jobs, maps]);

  /** Converts one layout into its entry; the outcome in words. */
  const apply = async (job: Job): Promise<Outcome> => {
    if (!job.target) return { ok: false, error: t.notFound };
    try {
      const entry = await coreApi<EntryDetail>('GET', `/entries/${job.target.id}`);
      if (!entry.permissions.edit) throw new Error(t.noPermission);
      const lock = await coreApi<LockView>('GET', `/entries/${entry.id}/lock`).catch(() => null);
      if (lock?.lockedBy && lock.lockedBy.id !== user.id) {
        throw new Error(fill(t.locked, { name: lock.lockedBy.displayName }));
      }
      // Fresh blocks (new ids) from the latest options.
      const { blocks } = convertAny(job.content, maps);
      if (!blocks.length) throw new Error(t.nothing);
      await coreApi('PATCH', `/entries/${entry.id}`, { document: { schema: 1, blocks } });
      if (publish && (entry.status === 'published' || entry.status === 'private')) {
        await coreApi('POST', `/entries/${entry.id}/publish`, {
          visibility: entry.status === 'private' ? 'private' : 'public',
        });
        return { ok: true, published: true };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  };

  const convertOne = async (job: Job) => {
    setBusy(fill(t.working, { done: 0, total: 1 }));
    const outcome = await apply(job);
    setOutcomes((o) => ({ ...o, [job.key]: outcome }));
    setBusy(null);
  };

  const pending = (jobs ?? []).filter((j) => j.target && !outcomes[j.key]?.ok);
  const convertAll = async () => {
    const list = pending;
    setBusy(fill(t.working, { done: 0, total: list.length }));
    for (const [i, job] of list.entries()) {
      const outcome = await apply(job);
      setOutcomes((o) => ({ ...o, [job.key]: outcome }));
      setBusy(fill(t.working, { done: i + 1, total: list.length }));
    }
    setBusy(null);
  };

  const okCount = Object.values(outcomes).filter((o) => o.ok).length;
  const failedCount = Object.values(outcomes).filter((o) => !o.ok).length;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="max-w-3xl text-sm text-slate-600">{t.intro}</p>
      </div>

      <Card title={t.options}>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-slate-800">{t.headingColor}</span>
            <input
              type="color"
              aria-label={t.headingColor}
              value={/^#[0-9a-f]{6}$/i.test(headingColor) ? headingColor : '#000000'}
              onChange={(e) => setHeadingColor(e.target.value)}
            />
            <input
              className={`${input} w-32`}
              value={headingColor}
              placeholder={t.asTheme}
              onChange={(e) => setHeadingColor(e.target.value)}
            />
            <span className="w-full text-xs text-slate-500">{t.headingColorHelp}</span>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={uppercase}
              onChange={(e) => setUppercase(e.target.checked)}
            />
            {t.uppercase}
          </label>
          <label className="block space-y-1">
            <span className="block font-medium text-slate-800">{t.origin}</span>
            <input
              className={`${input} w-full max-w-md`}
              value={origin}
              placeholder="https://www.example.com"
              onChange={(e) => setOrigin(e.target.value)}
            />
            <span className="block text-xs text-slate-500">{t.originHelp}</span>
          </label>
          <label className="flex items-start gap-2">
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
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['export', t.fromExport],
                ['site', t.fromSite],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={mode === value ? 'primary' : 'secondary'}
                disabled={busy !== null}
                onClick={() => {
                  setMode(value);
                  reset();
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {mode === 'export' ? (
            <div className="space-y-2 text-sm">
              <p className="max-w-3xl text-slate-600">{t.exportHelp}</p>
              <label className="block space-y-1">
                <span className="block font-medium text-slate-800">{t.chooseFile}</span>
                <input
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void readFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="max-w-3xl text-slate-600">{t.siteHelp}</p>
              <Button disabled={busy !== null} onClick={() => void scanSite()}>
                {t.scan}
              </Button>
            </div>
          )}
          {busy && (
            <p role="status" className="text-sm text-slate-600">
              {busy}
            </p>
          )}
          {error && <Alert>{error}</Alert>}
        </div>
      </Card>

      {jobs && jobs.length === 0 && (
        <Alert>{mode === 'export' ? t.noLayouts : t.noSiteLayouts}</Alert>
      )}
      {jobs && jobs.length > 0 && (
        <Card title={fill(t.found, { count: jobs.length })}>
          <p className="mb-3 text-sm text-slate-600">{t.revisions}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 pr-3 font-medium">{t.colEntry}</th>
                  {mode === 'export' && <th className="py-2 pr-3 font-medium">{t.colTarget}</th>}
                  <th className="py-2 pr-3 font-medium">{t.colNotes}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const result = results.get(job.key);
                  const outcome = outcomes[job.key];
                  return (
                    <tr key={job.key} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3">
                        {mode === 'site' && job.target ? (
                          <a
                            className="font-medium text-sky-800 underline"
                            href={adminUrl(`/entries/${job.target.id}`)}
                          >
                            {job.title}
                          </a>
                        ) : (
                          <span className="font-medium">{job.title}</span>
                        )}{' '}
                        <span className="text-slate-500">({t.types[job.type] ?? job.type})</span>
                      </td>
                      {mode === 'export' && (
                        <td className="py-2 pr-3">
                          {job.target ? (
                            <a
                              className="text-sky-800 underline"
                              href={adminUrl(`/entries/${job.target.id}`)}
                            >
                              {job.target.title || job.target.slug}
                            </a>
                          ) : (
                            <span className="text-slate-500">{t.notFound}</span>
                          )}
                        </td>
                      )}
                      <td className="py-2 pr-3">
                        <span className="block text-xs text-slate-600">
                          {fill(t.elements, {
                            elements: job.elements,
                            blocks: countBlocks(result?.blocks),
                          })}
                        </span>
                        <Warnings warnings={result?.warnings ?? []} t={t} />
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {outcome?.ok ? (
                          <span className="text-emerald-700">
                            {outcome.published ? t.donePublished : t.done}{' '}
                            <a
                              className="underline"
                              href={adminUrl(`/entries/${job.target?.id ?? ''}`)}
                            >
                              {t.open}
                            </a>
                          </span>
                        ) : (
                          <>
                            {outcome && (
                              <span className="mr-2 block text-red-700">
                                {fill(t.failed, { error: outcome.error ?? '' })}
                              </span>
                            )}
                            {job.target && (
                              <Button
                                variant="secondary"
                                disabled={busy !== null}
                                onClick={() => void convertOne(job)}
                              >
                                {t.convert}
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              disabled={busy !== null || pending.length === 0}
              onClick={() => void convertAll()}
            >
              {fill(t.convertAll, { count: pending.length })}
            </Button>
            {!busy && okCount + failedCount > 0 && (
              <span role="status" className="text-sm text-slate-700">
                {fill(t.summary, { ok: okCount, failed: failedCount })}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

const ORDER: WarningKind[] = [
  'unknown',
  'skipped',
  'simplified',
  'background',
  'media',
  'shortcode',
];

function Warnings({ warnings, t }: { warnings: Warning[]; t: Strings }) {
  if (!warnings.length) return <span className="block text-xs text-emerald-700">{t.allKept}</span>;
  return (
    <>
      {ORDER.map((kind) => {
        const list = warnings.filter((w) => w.kind === kind);
        if (!list.length) return null;
        const shown = list.slice(0, 8).map((w) => {
          const name = kind === 'media' || kind === 'shortcode' ? w.tag : `[${w.tag}]`;
          return w.count > 1 ? `${name} ×${w.count}` : name;
        });
        const tags = list.length > 8 ? `${shown.join(', ')}…` : shown.join(', ');
        return (
          <span
            key={kind}
            className={`block text-xs ${kind === 'simplified' ? 'text-slate-600' : 'text-amber-800'}`}
          >
            {fill(t.warnings[kind], { tags })}
          </span>
        );
      })}
    </>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Layout import', it: 'Importa layout' },
      description: {
        en: 'Turn pages laid out with [av_…] shortcodes of an old WordPress theme into native blocks of the block editor.',
        it: 'Trasforma le pagine impaginate con gli shortcode [av_…] di un vecchio tema WordPress in blocchi nativi dell’editor a blocchi.',
      },
      parent: '/tools',
      icon: 'M4 4h16v6H4z M4 14h7v6H4z M14 14h6v6h-6z',
      capability: 'edit_entries',
      component: LayoutImportPage,
    },
  ],
});
