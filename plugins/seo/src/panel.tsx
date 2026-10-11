import { api as coreApi, type EditorPanelProps } from '@cleitext/admin-sdk';
import { useQuery } from '@tanstack/react-query';
import { overall, readabilityChecks, seoChecks, type Check, type Rating } from './analysis';

interface EntryData {
  slug: string;
  locale: string;
  revision: {
    title: string;
    document: { blocks?: unknown[] } | null;
    fields: { seo?: { title?: string; description?: string; keyphrase?: string } };
  } | null;
}

const COLORS: Record<Rating, string> = {
  good: 'bg-emerald-500',
  ok: 'bg-amber-400',
  bad: 'bg-red-500',
};

function Dot({ rating, label }: { rating: Rating; label: string }) {
  return (
    <span
      className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COLORS[rating]}`}
      role="img"
      aria-label={label}
    />
  );
}

const ORDER: Record<Rating, number> = { bad: 0, ok: 1, good: 2 };

function Checks({
  title,
  checks,
  it,
  labels,
}: {
  title: string;
  checks: Check[];
  it: boolean;
  labels: Record<Rating, string>;
}) {
  const score = overall(checks);
  return (
    <details open={score !== 'good'} className="rounded border border-slate-200">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 font-medium">
        <Dot rating={score} label={labels[score]} />
        {title}
        <span className="ml-auto text-xs font-normal text-slate-500">{labels[score]}</span>
      </summary>
      <ul className="space-y-1.5 border-t border-slate-100 px-2 py-2">
        {[...checks]
          .sort((a, b) => ORDER[a.rating] - ORDER[b.rating])
          .map((c) => (
            <li key={c.id} className="flex gap-2">
              <Dot rating={c.rating} label={labels[c.rating]} />
              <span>{it ? c.text.it : c.text.en}</span>
            </li>
          ))}
      </ul>
    </details>
  );
}

/** Editor sidebar → SEO analysis: Google preview, SEO and readability, like Yoast SEO. */
export function SeoAnalysisPanel({ entry, user, site }: EditorPanelProps) {
  const it = user.locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const labels: Record<Rating, string> = {
    good: tr('Good', 'Buono'),
    ok: tr('Could be better', 'Migliorabile'),
    bad: tr('Needs work', 'Da sistemare'),
  };
  // The saved version: the analysis follows each save.
  const data = useQuery({
    queryKey: ['seo', 'analysis', entry.id, entry.updatedAt],
    queryFn: () => coreApi<EntryData>('GET', `/entries/${entry.id}`),
  });
  const settings = useQuery({
    queryKey: ['seo', 'settings'],
    queryFn: () =>
      coreApi<{ values?: Record<string, unknown> } & Record<string, unknown>>(
        'GET',
        '/plugins/seo/settings',
      ),
    retry: false,
  });
  const revision = data.data?.revision;
  if (!revision) return <p className="text-sm text-slate-500">{tr('Loading…', 'Caricamento…')}</p>;

  const seo = revision.fields.seo ?? {};
  const values = (settings.data?.values ?? settings.data ?? {}) as Record<string, unknown>;
  const separator = typeof values.separator === 'string' ? values.separator : '–';
  const pageTitle = seo.title?.trim() || revision.title || tr('(no title)', '(senza titolo)');
  const fullTitle = `${pageTitle} ${separator} ${site.name}`;
  const description = seo.description?.trim() ?? '';
  const input = {
    title: revision.title,
    seoTitle: seo.title ?? '',
    description,
    slug: data.data?.slug ?? entry.slug,
    keyphrase: seo.keyphrase ?? '',
    document: revision.document,
    locale: entry.locale,
    host: window.location.host,
  };
  const url = `${window.location.host} › ${(data.data?.slug ?? entry.slug).replace(/-/g, ' ')}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-slate-200 bg-white p-3 font-[arial,sans-serif]">
        <p className="mb-1 text-xs text-slate-500">{tr('Google preview', 'Anteprima su Google')}</p>
        <p className="truncate text-xs text-slate-700">{url}</p>
        <p className="line-clamp-1 text-[1.05rem] leading-snug text-[#1a0dab]">{fullTitle}</p>
        <p className="line-clamp-2 text-xs leading-snug text-slate-600">
          {description ||
            tr(
              'Add a search description in the SEO fields.',
              'Aggiungi una descrizione nei campi SEO.',
            )}
        </p>
      </div>
      {!seo.keyphrase && (
        <p className="text-xs text-slate-600">
          {tr(
            'Set the Focus keyphrase in the SEO fields to get the keyphrase checks.',
            'Imposta la Frase chiave nei campi SEO per avere i controlli sulla frase chiave.',
          )}
        </p>
      )}
      <Checks title="SEO" checks={seoChecks(input)} it={it} labels={labels} />
      <Checks
        title={tr('Readability', 'Leggibilità')}
        checks={readabilityChecks(input)}
        it={it}
        labels={labels}
      />
      <p className="text-xs text-slate-500">
        {tr('Updated each time you save.', 'Si aggiorna a ogni salvataggio.')}
      </p>
    </div>
  );
}
