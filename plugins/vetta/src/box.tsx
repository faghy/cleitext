/**
 * Vetta's box (`vetta/box`, a layout field of plugin API 1.49): Vetta's
 * fields as one section of their own, with a tinted background, that opens
 * and closes. Keywords, search title and description first, then the
 * analysis (entries) or the quick checks (terms), then Advanced and Social
 * networks, closed until opened. It draws the fields with the form's own
 * `layout.render`, so labels, help, errors and saving stay the core's.
 */
import {
  labelText,
  type AdminFieldTypeDefinition,
  type FieldControlProps,
} from '@cleitext/admin-sdk';
import type { FieldDefinition } from '@cleitext/plugin-sdk';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { BOX_TYPE } from './fields.js';
import {
  AnalysisView,
  Checklist,
  OPEN_BOX_EVENT,
  Score,
  useAnalysis,
  useBoxMounted,
  useEditorSnapshot,
} from './panel.js';
import { termChecks } from './term-checks.js';

const STORAGE_KEY = 'vetta.box.open';

/** Remembered per browser; open the first time. */
function useRemembered(key: string, initial: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : stored === '1';
    } catch {
      return initial;
    }
  });
  return [
    open,
    (next) => {
      setOpen(next);
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
      } catch {
        // Private windows: kept for this page only.
      }
    },
  ];
}

/** A value the user set (not empty, not off, not the default structured data). */
const isSet = (field: FieldDefinition, value: unknown) =>
  value !== undefined &&
  value !== null &&
  value !== '' &&
  value !== false &&
  !(field.name === 'schema' && value === 'auto');

interface Section {
  key: string;
  title: string;
  fields: FieldDefinition[];
}

/** The fields by their `group` (Advanced, Social networks), without it: the box shows the titles. */
export function splitFields(
  fields: readonly FieldDefinition[],
  locale: string,
): { main: FieldDefinition[]; sections: Section[] } {
  const main: FieldDefinition[] = [];
  const sections: Section[] = [];
  for (const field of fields) {
    if (field.group === undefined) {
      main.push(field);
      continue;
    }
    const key = labelText(field.group, 'en');
    let section = sections.find((s) => s.key === key);
    if (!section) {
      section = { key, title: labelText(field.group, locale), fields: [] };
      sections.push(section);
    }
    const rest = { ...field } as Partial<FieldDefinition>;
    delete rest.group;
    section.fields.push(rest as FieldDefinition);
  }
  return { main, sections };
}

const tint = {
  background: 'var(--color-sky-50, #f0f9ff)',
  border: '1px solid var(--color-sky-200, #bae6fd)',
  borderLeft: '4px solid var(--color-sky-700, #0369a1)',
  borderRadius: 6,
} as const;

function SubSection({
  section,
  values,
  render,
  locale,
}: {
  section: Section;
  values: Record<string, unknown>;
  render: (fields: readonly FieldDefinition[]) => ReactNode;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const it = locale.startsWith('it');
  const count = section.fields.filter((f) => isSet(f, values[f.name])).length;
  return (
    <div className="rounded border border-slate-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left font-medium"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>{section.title}</span>
        <span className="text-xs font-normal text-slate-500">
          {count > 0 && (it ? `${count} impostat${count === 1 ? 'o' : 'i'} ` : `${count} set `)}
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </span>
      </button>
      {open && (
        <div id={id} className="px-2 pb-2">
          {render(section.fields)}
        </div>
      )}
    </div>
  );
}

/** The score in the header, and what the box shows under the description. */
function EntryAnalysis({
  values,
  locale,
  onScore,
}: {
  values: Record<string, unknown>;
  locale: string;
  onScore: (score: number | null) => void;
}) {
  const source = useEditorSnapshot();
  const analysis = useAnalysis(source, values);
  const score = analysis.enabled ? (analysis.result?.score ?? null) : null;
  useEffect(() => onScore(score), [score, onScore]);
  // No editor panel (an older core, or the panel is not allowed): the fields only.
  if (!source) return null;
  return <AnalysisView analysis={analysis} locale={locale} showScore={false} />;
}

function TermAnalysis({
  values,
  locale,
  onScore,
}: {
  values: Record<string, unknown>;
  locale: string;
  onScore: (score: number | null) => void;
}) {
  const it = locale.startsWith('it');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const checks = useMemo(
    () =>
      termChecks({
        keywords: str(values.keywords),
        title: str(values.title),
        description: str(values.description),
        locale,
      }),
    [values.keywords, values.title, values.description, locale],
  );
  const score = checks?.score ?? null;
  useEffect(() => onScore(score), [score, onScore]);
  if (!checks) {
    return (
      <p className="text-sm text-slate-600">
        {it
          ? 'Scrivi la parola chiave principale: i controlli guardano titolo e descrizione.'
          : 'Write the main keyword: the checks look at the title and the description.'}
      </p>
    );
  }
  return (
    <div className="rounded border border-slate-200 bg-white pt-2 text-sm">
      <Checklist tests={checks.tests} locale={locale} />
    </div>
  );
}

export function VettaBox({ field, layout, locale }: FieldControlProps) {
  useBoxMounted();
  const kind = field.settings?.kind === 'term' ? 'term' : 'entry';
  const it = locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const [open, setOpen] = useRemembered(`${STORAGE_KEY}.${kind}`, true);
  const [score, setScore] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const bodyId = useId();

  // "Go there" in the editor panel.
  useEffect(() => {
    const show = () => {
      setOpen(true);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener(OPEN_BOX_EVENT, show);
    return () => window.removeEventListener(OPEN_BOX_EVENT, show);
  });

  if (!layout) return null;
  const { main, sections } = splitFields(layout.fields, locale);
  const values = layout.values as Record<string, unknown>;
  const Analysis = kind === 'term' ? TermAnalysis : EntryAnalysis;

  return (
    <div ref={ref} className="vetta-box text-sm" style={tint}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        {score !== null && <Score score={score} size={28} />}
        <span className="flex-1 font-medium">
          {score !== null
            ? kind === 'term'
              ? tr(`Title and description: ${score}/100`, `Titolo e descrizione: ${score}/100`)
              : tr(`SEO score: ${score}/100`, `Punteggio SEO: ${score}/100`)
            : tr('Keywords, title and description', 'Parole chiave, titolo e descrizione')}
        </span>
        <span className="text-xs text-slate-600">
          {open ? tr('Close', 'Chiudi') : tr('Open', 'Apri')}{' '}
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </span>
      </button>
      {/* Kept mounted while closed: the score in the header keeps following the page. */}
      <div id={bodyId} hidden={!open} className="space-y-3 px-3 pb-3">
        {layout.render(main)}
        <Analysis values={values} locale={locale} onScore={setScore} />
        {sections.map((section) => (
          <SubSection
            key={section.key}
            section={section}
            values={values}
            render={layout.render}
            locale={locale}
          />
        ))}
      </div>
    </div>
  );
}

/** The admin side of the box: it groups every field after it. */
export const boxFieldType: AdminFieldTypeDefinition = {
  type: BOX_TYPE,
  component: VettaBox,
  layout: true,
  groups: (_field, following) => following.length,
};
