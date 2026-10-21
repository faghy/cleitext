/**
 * The font picker: a button with the chosen font and, open, a search box over
 * a list of every font (the site's, the system's and the whole Google Fonts
 * catalog). The list draws only the rows in view, so it stays fast.
 */
import { t } from '@cleitext/admin-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GOOGLE_FONTS, SYSTEM_FONTS, googleFontList } from '../core/kit.js';

export interface FontOption {
  value: string;
  label: string;
  /** Shown on the right, e.g. the Google Fonts category. */
  note?: string;
}

export interface FontGroup {
  label: string;
  options: FontOption[];
}

type Row = { kind: 'group'; label: string } | { kind: 'option'; option: FontOption };

const ROW = 28;
const HEIGHT = 280;

const CATEGORIES: Record<string, string> = {
  'sans-serif': 'Sans serif',
  serif: 'Serif',
  display: 'Decorative',
  handwriting: 'Handwriting',
  monospace: 'Monospace',
};

let google: FontGroup[] | null = null;

/** The Google Fonts groups: the popular families first, then all of them. */
function googleGroups(): FontGroup[] {
  google ??= [
    {
      label: 'Popular',
      options: [...GOOGLE_FONTS].sort().map((family) => ({ value: family, label: family })),
    },
    {
      label: 'Google Fonts',
      options: googleFontList().map(({ family, category }) => ({
        value: family,
        label: family,
        note: CATEGORIES[category] ?? category,
      })),
    },
  ];
  return google;
}

/** The system fonts, as a group. */
export const systemGroup = (): FontGroup => ({
  label: 'System',
  options: SYSTEM_FONTS.map((font) => ({ value: font, label: font })),
});

export function FontPicker({
  value,
  onChange,
  groups,
  emptyLabel,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string | undefined) => void;
  /** Groups before Google Fonts (global, custom and system fonts…). */
  groups: FontGroup[];
  /** The label of the empty choice (none when it cannot be empty). */
  emptyLabel?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);
  const all = [...groups, ...googleGroups()];
  const current =
    all.flatMap((g) => g.options).find((o) => o.value === value)?.label ??
    (value || emptyLabel || '');
  return (
    <div ref={ref} className={`fre-fontpick${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="fre-input fre-fontpick__value"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current}</span>
      </button>
      {open && (
        <FontList
          groups={all}
          value={value}
          emptyLabel={emptyLabel}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function FontList({
  groups,
  value,
  emptyLabel,
  onPick,
  onClose,
}: {
  groups: FontGroup[];
  value: string;
  emptyLabel: string | undefined;
  onPick: (value: string | undefined) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [top, setTop] = useState(0);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Row[] = [];
    if (emptyLabel && !q) out.push({ kind: 'option', option: { value: '', label: emptyLabel } });
    for (const group of groups) {
      // While searching, the popular ones are among all the others.
      if (q && group.label === 'Popular') continue;
      const options = q
        ? group.options.filter((o) => o.label.toLowerCase().includes(q))
        : group.options;
      if (options.length === 0) continue;
      out.push({ kind: 'group', label: group.label });
      for (const option of options) out.push({ kind: 'option', option });
    }
    return out;
  }, [groups, query, emptyLabel]);
  const options = rows.flatMap((r, i) => (r.kind === 'option' ? [i] : []));
  useEffect(() => {
    setActive(0);
    setTop(0);
    if (list.current) list.current.scrollTop = 0;
  }, [query]);
  // The chosen font in view when the list opens.
  useEffect(() => {
    const at = rows.findIndex((r) => r.kind === 'option' && r.option.value === value);
    if (at > 0 && list.current) {
      list.current.scrollTop = Math.max(0, at * ROW - HEIGHT / 2);
      setTop(list.current.scrollTop);
      setActive(Math.max(0, options.indexOf(at)));
    }
    // Once, on opening.
  }, []);
  const move = (step: number) => {
    const next = Math.max(0, Math.min(options.length - 1, active + step));
    setActive(next);
    const row = options[next];
    const box = list.current;
    if (row === undefined || !box) return;
    if (row * ROW < box.scrollTop) box.scrollTop = row * ROW;
    else if ((row + 1) * ROW > box.scrollTop + HEIGHT) box.scrollTop = (row + 1) * ROW - HEIGHT;
  };
  const first = Math.max(0, Math.floor(top / ROW) - 6);
  const last = Math.min(rows.length, Math.ceil((top + HEIGHT) / ROW) + 6);
  const activeRow = options[active];
  return (
    <div className="fre-fontpick__menu">
      <input
        className="fre-input"
        autoFocus
        value={query}
        placeholder={t('Search fonts')}
        aria-label={t('Search fonts')}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const row = activeRow === undefined ? undefined : rows[activeRow];
            if (row?.kind === 'option') onPick(row.option.value || undefined);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div
        ref={list}
        className="fre-fontpick__list"
        role="listbox"
        style={{ height: Math.min(HEIGHT, rows.length * ROW || ROW) }}
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      >
        {rows.length === 0 ? (
          <p className="fre-fontpick__none">{t('No font found.')}</p>
        ) : (
          <div style={{ height: rows.length * ROW, position: 'relative' }}>
            {rows.slice(first, last).map((row, i) => {
              const index = first + i;
              const style = { top: index * ROW, height: ROW };
              if (row.kind === 'group') {
                return (
                  <div key={`g${index}`} className="fre-fontpick__group" style={style}>
                    {t(row.label)}
                  </div>
                );
              }
              const { option } = row;
              return (
                <button
                  key={`o${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`fre-fontpick__option${option.value === value ? ' is-on' : ''}${index === activeRow ? ' is-active' : ''}`}
                  style={style}
                  onClick={() => onPick(option.value || undefined)}
                >
                  <span>{option.label}</span>
                  {option.note && <small>{t(option.note)}</small>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
