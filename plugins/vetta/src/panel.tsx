/**
 * The analysis in the editor's sidebar: a Google preview, the score out of
 * 100 for each keyword and the checklist, following the page as it is
 * written (the unsaved draft, API 1.24).
 */
import type { EditorPanelProps } from '@cleitext/admin-sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { analyze, scoreLevel, type Group, type Status, type TestResult } from './analysis.js';
import { entrySeo, keywordsOf, moduleOn, text, typeValue, type Config } from './config.js';
import { plainDescription, replaceVariables } from './variables.js';

const LEVEL_COLORS = { great: '#047857', good: '#b45309', bad: '#b91c1c' } as const;
const STATUS_ICON: Record<Status, string> = {
  pass: '✓',
  good: '◐',
  ok: '◐',
  bad: '✕',
  fail: '✕',
  info: 'ℹ',
};
const STATUS_COLOR: Record<Status, string> = {
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

function Score({ score, size = 44 }: { score: number; size?: number }) {
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

export function AnalysisPanel(props: EditorPanelProps) {
  const { entry } = props;
  const it = props.user.locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const draft = useSettled(props.draft);
  const editorConfig = useQuery({
    queryKey: ['vetta', 'editor-config'],
    queryFn: () => props.api<{ config: Config; siteName: string }>('GET', '/editor-config'),
    staleTime: 60_000,
  });
  const seo = entrySeo(draft?.fields);
  const keywords = keywordsOf(seo);
  const main = keywords[0] ?? '';
  const used = useQuery({
    queryKey: ['vetta', 'keyword-used', main, entry.id],
    queryFn: () =>
      props.api<{ title: string; url: string } | null>(
        'GET',
        `/keyword-used?keyword=${encodeURIComponent(main)}&id=${encodeURIComponent(entry.id)}&locale=${encodeURIComponent(entry.locale)}`,
      ),
    enabled: Boolean(main),
    staleTime: 60_000,
  });
  const [open, setOpen] = useState<Group | null>('basic');

  const config = editorConfig.data?.config ?? {};
  const siteName = editorConfig.data?.siteName ?? '';
  const preview = useMemo(() => {
    if (!draft) return null;
    const vars = {
      sep: text(config, 'separator') || '–',
      sitename: siteName,
      title: draft.title,
      excerpt: plainDescription(draft.excerpt ?? ''),
      keywords,
      locale: entry.locale,
    };
    const title =
      replaceVariables(seo.title || String(typeValue(config, entry.type, 'title') ?? ''), vars) ||
      draft.title;
    const description = plainDescription(
      replaceVariables(
        seo.description || String(typeValue(config, entry.type, 'description') ?? ''),
        vars,
      ),
    );
    const path = `/${draft.slug}`;
    return { title, description, path };
  }, [draft, config, siteName, seo.title, seo.description, keywords, entry.locale, entry.type]);

  const result = useMemo(() => {
    if (!draft || !preview || keywords.length === 0) return null;
    return analyze({
      keywords,
      title: preview.title,
      description: preview.description,
      url: preview.path,
      document: draft.document as never,
      featuredImage: draft.featuredMediaId ? { alt: '' } : null,
      locale: entry.locale,
      host: window.location.host,
      usedBy: used.data ?? null,
    });
  }, [draft, preview, keywords, entry.locale, used.data]);

  if (!props.draft) {
    return (
      <p className="text-sm text-slate-600">
        {tr(
          'Update Cleitext to see the analysis while you write.',
          'Aggiorna Cleitext per vedere l’analisi mentre scrivi.',
        )}
      </p>
    );
  }
  if (editorConfig.data && !moduleOn(config, 'analysis')) {
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
          className="rounded border border-slate-200 p-2"
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
            'Write the keywords in the SEO fields of this page (the first is the main one): the analysis checks the page against them.',
            'Scrivi le parole chiave nei campi SEO di questa pagina (la prima è la principale): l’analisi controlla la pagina su queste.',
          )}
        </p>
      )}
      {result && (
        <>
          <div className="flex items-center gap-3">
            <Score score={result.score} />
            <div>
              <div className="font-medium">{tr('SEO score', 'Punteggio SEO')}</div>
              <div className="text-xs text-slate-600">
                {result.words} {tr('words', 'parole')}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {result.keywords.map((k, i) => (
              <span
                key={k.keyword}
                className="rounded-full border px-2 py-0.5 text-xs"
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
              <div key={group} className="rounded border border-slate-200">
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
                {open === group && (
                  <ul className="space-y-1 px-2 pb-2">
                    {tests.map((t: TestResult) => (
                      <li key={t.id} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          style={{ color: STATUS_COLOR[t.status], fontWeight: 700 }}
                        >
                          {STATUS_ICON[t.status]}
                        </span>
                        <span>{it ? t.text.it : t.text.en}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
