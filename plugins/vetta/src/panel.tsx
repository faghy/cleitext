/**
 * The analysis in the editor: a Google preview, the score out of 100 for
 * each keyword and the checklist, following the page as it is written (the
 * unsaved draft, API 1.24). It shows in Vetta's box, under the keywords,
 * title and description (`box.tsx`); the editor panel gives the box the
 * draft, and shows the whole analysis itself only where there is no box.
 */
import type {
  AdminPageProps,
  EditorDraft,
  EditorEntry,
  EditorPanelProps,
} from '@cleitext/admin-sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  analyze,
  scoreLevel,
  type Analysis,
  type Group,
  type Status,
  type TestResult,
} from './analysis.js';
import { entrySeo, keywordsOf, moduleOn, text, typeValue, type Config } from './config.js';
import { plainDescription, replaceVariables } from './variables.js';

export const LEVEL_COLORS = { great: '#047857', good: '#b45309', bad: '#b91c1c' } as const;
export const STATUS_ICON: Record<Status, string> = {
  pass: '✓',
  good: '◐',
  ok: '◐',
  bad: '✕',
  fail: '✕',
  info: 'ℹ',
};
export const STATUS_COLOR: Record<Status, string> = {
  pass: '#047857',
  good: '#b45309',
  ok: '#b45309',
  bad: '#b91c1c',
  fail: '#b91c1c',
  info: '#475569',
};
const GROUPS: Record<Group, { en: string; it: string }> = {
  basic: { en: 'Basic SEO', it: 'SEO di base' },
  additional: { en: 'Additional', it: 'Altri controlli' },
  title: { en: 'Title readability', it: 'Leggibilità del titolo' },
  content: { en: 'Content readability', it: 'Leggibilità del contenuto' },
};

/** The draft, a moment after the last change: the analysis does not run on every key. */
function useSettled<T>(value: T, ms = 400): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function Score({ score, size = 44 }: { score: number; size?: number }) {
  const color = LEVEL_COLORS[scoreLevel(score)];
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `3px solid ${color}`,
        color,
        display: 'inline-grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: size / 3,
      }}
      role="img"
      aria-label={`${score}/100`}
    >
      {score}
    </span>
  );
}

// ---- The editor as the panel sees it, for Vetta's box -----------------------------------

/** What the editor panel knows and the box (a field, which gets only its values) does not. */
export interface EditorSnapshot {
  entry: EditorEntry;
  draft: EditorDraft;
  api: AdminPageProps['api'];
}

let snapshot: EditorSnapshot | null = null;
let boxes = 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The entry being edited, as the editor panel last saw it (null without one). */
export function useEditorSnapshot(): EditorSnapshot | null {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** Vetta's box is on screen: the panel then leaves the analysis to it. */
export function useBoxMounted(): void {
  useEffect(() => {
    boxes++;
    notify();
    return () => {
      boxes--;
      notify();
    };
  }, []);
}

const useBoxShown = () => useSyncExternalStore(subscribe, () => boxes > 0);

/** Asks the box to open and scroll into view. */
export const OPEN_BOX_EVENT = 'vetta:open-box';

// ---- The analysis -----------------------------------------------------------------------

export interface AnalysisState {
  /** False when the analysis module is switched off. */
  enabled: boolean;
  preview: { title: string; description: string; path: string } | null;
  result: Analysis | null;
}

/**
 * The analysis of the entry being edited. `values` are Vetta's fields as
 * typed (the box has them before the draft does).
 */
export function useAnalysis(
  source: EditorSnapshot | null,
  values?: Record<string, unknown>,
): AnalysisState {
  const draft = useSettled(source?.draft);
  // As typed, a moment after the last key: the analysis does not run on every key.
  const typed = useSettled(values);
  const entry = source?.entry;
  const api = source?.api;
  const editorConfig = useQuery({
    queryKey: ['vetta', 'editor-config'],
    queryFn: () => api!<{ config: Config; siteName: string }>('GET', '/editor-config'),
    enabled: Boolean(api),
    staleTime: 60_000,
  });
  const fields = useMemo(
    () => (typed ? { ...draft?.fields, vetta: typed } : draft?.fields),
    [draft?.fields, typed],
  );
  const seo = entrySeo(fields);
  const keywords = keywordsOf(seo);
  const keywordsKey = keywords.join(',');
  const main = keywords[0] ?? '';
  const used = useQuery({
    queryKey: ['vetta', 'keyword-used', main, entry?.id],
    queryFn: () =>
      api!<{ title: string; url: string } | null>(
        'GET',
        `/keyword-used?keyword=${encodeURIComponent(main)}&id=${encodeURIComponent(entry!.id)}&locale=${encodeURIComponent(entry!.locale)}`,
      ),
    enabled: Boolean(main && api && entry),
    staleTime: 60_000,
  });

  const config = editorConfig.data?.config;
  const siteName = editorConfig.data?.siteName ?? '';
  const preview = useMemo(() => {
    if (!draft || !entry) return null;
    const c = config ?? {};
    const vars = {
      sep: text(c, 'separator') || '–',
      sitename: siteName,
      title: draft.title,
      excerpt: plainDescription(draft.excerpt ?? ''),
      keywords: keywordsKey ? keywordsKey.split(',') : [],
      locale: entry.locale,
    };
    const title =
      replaceVariables(seo.title || String(typeValue(c, entry.type, 'title') ?? ''), vars) ||
      draft.title;
    const description = plainDescription(
      replaceVariables(
        seo.description || String(typeValue(c, entry.type, 'description') ?? ''),
        vars,
      ),
    );
    return { title, description, path: `/${draft.slug}` };
  }, [draft, entry, config, siteName, seo.title, seo.description, keywordsKey]);

  const result = useMemo(() => {
    if (!draft || !preview || !entry || !keywordsKey) return null;
    return analyze({
      keywords: keywordsKey.split(','),
      title: preview.title,
      description: preview.description,
      url: preview.path,
      document: draft.document as never,
      featuredImage: draft.featuredMediaId ? { alt: '' } : null,
      locale: entry.locale,
      host: window.location.host,
      usedBy: used.data ?? null,
    });
  }, [draft, preview, keywordsKey, entry, used.data]);

  return { enabled: !config || moduleOn(config, 'analysis'), preview, result };
}

/** The Google preview, the score of each keyword and the checklist. */
export function AnalysisView({
  analysis,
  locale,
  showScore = true,
}: {
  analysis: AnalysisState;
  locale: string;
  /** The box shows the score in its header already. */
  showScore?: boolean;
}) {
  const it = locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const [open, setOpen] = useState<Group | null>('basic');
  const { preview, result } = analysis;
  if (!analysis.enabled) {
    return (
      <p className="text-sm text-slate-600">
        {tr(
          'The content analysis is switched off in Vetta SEO.',
          'L’analisi dei contenuti è spenta in Vetta SEO.',
        )}
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      {preview && (
        <div
          className="rounded border border-slate-200 bg-white p-2"
          aria-label={tr('Preview in Google', 'Anteprima su Google')}
        >
          <div className="truncate text-xs text-slate-600">
            {window.location.host}
            {preview.path}
          </div>
          <div className="truncate" style={{ color: '#1a0dab', fontSize: 16 }}>
            {preview.title}
          </div>
          <div
            className="text-xs text-slate-700"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {preview.description ||
              tr(
                'No description: search engines will pick some text of the page.',
                'Nessuna descrizione: i motori sceglieranno del testo della pagina.',
              )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {preview.title.length}/60 · {preview.description.length}/160
          </div>
        </div>
      )}
      {!result && (
        <p className="text-slate-600">
          {tr(
            'Write the keywords (the first is the main one): the analysis checks the page against them.',
            'Scrivi le parole chiave (la prima è la principale): l’analisi controlla la pagina su queste.',
          )}
        </p>
      )}
      {result && (
        <>
          {showScore && (
            <div className="flex items-center gap-3">
              <Score score={result.score} />
              <div>
                <div className="font-medium">{tr('SEO score', 'Punteggio SEO')}</div>
                <div className="text-xs text-slate-600">
                  {result.words} {tr('words', 'parole')}
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {result.keywords.map((k, i) => (
              <span
                key={k.keyword}
                className="rounded-full border bg-white px-2 py-0.5 text-xs"
                style={{
                  borderColor: LEVEL_COLORS[scoreLevel(k.score)],
                  color: LEVEL_COLORS[scoreLevel(k.score)],
                }}
                title={i === 0 ? tr('Main keyword', 'Parola chiave principale') : undefined}
              >
                {i === 0 ? '★ ' : ''}
                {k.keyword} · {k.score}
              </span>
            ))}
          </div>
          {(['basic', 'additional', 'title', 'content'] as Group[]).map((group) => {
            const tests = result.tests.filter((t) => t.group === group);
            if (tests.length === 0) return null;
            const failing = tests.filter((t) => t.status !== 'pass' && t.status !== 'info').length;
            return (
              <div key={group} className="rounded border border-slate-200 bg-white">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-2 py-1.5 text-left font-medium"
                  aria-expanded={open === group}
                  onClick={() => setOpen(open === group ? null : group)}
                >
                  <span>{tr(GROUPS[group].en, GROUPS[group].it)}</span>
                  <span className="text-xs" style={{ color: failing ? '#b91c1c' : '#047857' }}>
                    {failing ? `${failing} ✕` : '✓'}
                  </span>
                </button>
                {open === group && <Checklist tests={tests} locale={locale} />}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export function Checklist({ tests, locale }: { tests: TestResult[]; locale: string }) {
  const it = locale.startsWith('it');
  return (
    <ul className="space-y-1 px-2 pb-2">
      {tests.map((t) => (
        <li key={t.id} className="flex gap-2">
          <span aria-hidden="true" style={{ color: STATUS_COLOR[t.status], fontWeight: 700 }}>
            {STATUS_ICON[t.status]}
          </span>
          <span>{it ? t.text.it : t.text.en}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The editor panel: it gives Vetta's box the draft; with the box on screen
 * it shows only the score and a link to the box, otherwise the analysis.
 */
export function AnalysisPanel(props: EditorPanelProps) {
  const it = props.user.locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const { entry, draft, api } = props;
  const source = useMemo(() => (draft ? { entry, draft, api } : null), [entry, draft, api]);
  useEffect(() => {
    snapshot = source;
    notify();
  }, [source]);
  useEffect(
    () => () => {
      snapshot = null;
      notify();
    },
    [],
  );
  const boxShown = useBoxShown();
  const analysis = useAnalysis(source);

  if (!draft) {
    return (
      <p className="text-sm text-slate-600">
        {tr(
          'Update Cleitext to see the analysis while you write.',
          'Aggiorna Cleitext per vedere l’analisi mentre scrivi.',
        )}
      </p>
    );
  }
  if (boxShown) {
    return (
      <div className="flex items-center gap-3 text-sm">
        {analysis.result && <Score score={analysis.result.score} size={32} />}
        <p className="flex-1 text-slate-600">
          {tr(
            'Keywords, titles and the whole analysis are in the Vetta SEO section.',
            'Parole chiave, titoli e l’analisi completa sono nella sezione Vetta SEO.',
          )}{' '}
          <button
            type="button"
            className="text-sky-700 hover:underline"
            onClick={() => window.dispatchEvent(new Event(OPEN_BOX_EVENT))}
          >
            {tr('Go there', 'Vai alla sezione')}
          </button>
        </p>
      </div>
    );
  }
  return <AnalysisView analysis={analysis} locale={props.user.locale} />;
}
