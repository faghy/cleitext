import { useT } from '@cleitext/admin-sdk';
import { useState, type ReactNode } from 'react';
import {
  DATE_RE,
  PRESETS,
  type Compare,
  type DateRange,
  type Interval,
  type Preset,
} from '../analytics-dates';
import { toCsv } from '../csv';

/** What the reports share: the date controls, the number tiles, sortable tables and CSV. */

export const PRESET_LABEL: Record<Preset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Week to date',
  last_week: 'Last week',
  month: 'Month to date',
  last_month: 'Last month',
  quarter: 'Quarter to date',
  last_quarter: 'Last quarter',
  year: 'Year to date',
  last_year: 'Last year',
};

export interface ReportParams {
  period: Preset | 'custom';
  after: string | null;
  before: string | null;
  compare: Compare | 'none';
  /** Null: the server's choice for the range. */
  interval: Interval | null;
}

/** The range of the address (`?period=…&compare=…`); WooCommerce's default: month to date against last year. */
export function readParams(params: URLSearchParams): ReportParams {
  const after = params.get('after') ?? '';
  const before = params.get('before') ?? '';
  const custom = params.get('period') === 'custom' && DATE_RE.test(after) && DATE_RE.test(before);
  const period = (PRESETS as readonly string[]).includes(params.get('period') ?? '')
    ? (params.get('period') as Preset)
    : 'month';
  const compare = params.get('compare');
  const interval = params.get('interval');
  return {
    period: custom ? 'custom' : period,
    after: custom ? (after <= before ? after : before) : null,
    before: custom ? (after <= before ? before : after) : null,
    compare: compare === 'previous_period' || compare === 'none' ? compare : 'previous_year',
    interval: interval === 'day' || interval === 'week' || interval === 'month' ? interval : null,
  };
}

export function reportQuery(p: ReportParams): string {
  const query = new URLSearchParams({ period: p.period, compare: p.compare });
  if (p.after && p.before) {
    query.set('after', p.after);
    query.set('before', p.before);
  }
  if (p.interval) query.set('interval', p.interval);
  return query.toString();
}

export function DateControls({
  params,
  shown,
  go,
}: {
  params: ReportParams;
  /** The range and interval of the report shown. */
  shown: { range: DateRange; interval: Interval } | undefined;
  go: (p: Record<string, string | null>, replace?: boolean) => void;
}) {
  const { t } = useT();
  const [after, setAfter] = useState(params.after ?? shown?.range.after ?? '');
  const [before, setBefore] = useState(params.before ?? shown?.range.before ?? '');
  return (
    <div className="sh-filters">
      <label className="sh-field">
        <span>{t('Date range')}</span>
        <select
          value={params.period}
          onChange={(e) =>
            go(
              e.target.value === 'custom'
                ? {
                    period: 'custom',
                    after: after || shown?.range.after || null,
                    before: before || shown?.range.before || null,
                    interval: null,
                  }
                : { period: e.target.value, after: null, before: null, interval: null },
              true,
            )
          }
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(PRESET_LABEL[p])}
            </option>
          ))}
          <option value="custom">{t('Custom')}</option>
        </select>
      </label>
      {params.period === 'custom' && (
        <>
          <label className="sh-field">
            <span>{t('From')}</span>
            <input
              type="date"
              value={after || shown?.range.after || ''}
              max={before}
              onChange={(e) => setAfter(e.target.value)}
            />
          </label>
          <label className="sh-field">
            <span>{t('To')}</span>
            <input
              type="date"
              value={before || shown?.range.before || ''}
              min={after}
              onChange={(e) => setBefore(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="sh-btn"
            disabled={!DATE_RE.test(after) || !DATE_RE.test(before)}
            onClick={() => go({ period: 'custom', after, before, interval: null }, true)}
          >
            {t('Apply')}
          </button>
        </>
      )}
      <label className="sh-field">
        <span>{t('Compare with')}</span>
        <select value={params.compare} onChange={(e) => go({ compare: e.target.value }, true)}>
          <option value="previous_year">{t('Previous year')}</option>
          <option value="previous_period">{t('Previous period')}</option>
          <option value="none">{t('No comparison')}</option>
        </select>
      </label>
      <div className="sh-field">
        <span>{t('Show by')}</span>
        <div className="sh-seg" role="group" aria-label={t('Show by')}>
          {(['day', 'week', 'month'] as const).map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={(params.interval ?? shown?.interval) === i}
              onClick={() => go({ interval: i }, true)}
            >
              {t(i === 'day' ? 'Day' : i === 'week' ? 'Week' : 'Month')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** "12 Mar" for days and weeks, "Mar 2026" for months, in the admin's language. */
export function dateLabeller(locale: string, interval: Interval) {
  return (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(
      locale,
      interval === 'month'
        ? { month: 'short', year: 'numeric', timeZone: 'UTC' }
        : { day: 'numeric', month: 'short', timeZone: 'UTC' },
    );
}

export function rangeLabel(locale: string, range: DateRange): string {
  const f = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  return range.after === range.before ? f(range.after) : `${f(range.after)} – ${f(range.before)}`;
}

/** The change from one value to another, in percent; null when there was nothing before. */
export function change(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

export function Delta({
  now,
  before,
  lowerIsBetter = false,
  locale,
}: {
  now: number;
  before: number | undefined;
  lowerIsBetter?: boolean;
  locale: string;
}) {
  const pct = change(now, before);
  if (pct === null) return <span className="sh-delta sh-muted">—</span>;
  const rounded = Math.round(pct * 10) / 10;
  const good = lowerIsBetter ? rounded < 0 : rounded > 0;
  const arrow = rounded > 0 ? '↑' : rounded < 0 ? '↓' : '';
  return (
    <span
      className={`sh-delta ${rounded === 0 ? 'sh-muted' : good ? 'sh-delta-up' : 'sh-delta-down'}`}
    >
      {arrow} {Math.abs(rounded).toLocaleString(locale, { maximumFractionDigits: 1 })}%
    </span>
  );
}

export interface Metric<T> {
  key: keyof T & string;
  label: string;
  kind: 'money' | 'number';
  lowerIsBetter?: boolean;
}

/** Number tiles with the change from the compared period; the selected one is charted. */
export function Tiles<T>({
  metrics,
  current,
  previous,
  selected,
  onSelect,
  format,
  locale,
}: {
  metrics: Metric<T>[];
  current: T;
  previous: T | null | undefined;
  selected?: string;
  onSelect?: (key: string) => void;
  format: (value: number, kind: 'money' | 'number') => string;
  locale: string;
}) {
  const { t } = useT();
  return (
    <div className="sh-tiles">
      {metrics.map((m) => {
        const now = Number(current[m.key] ?? 0);
        const before = previous ? Number(previous[m.key] ?? 0) : undefined;
        const body = (
          <>
            <span className="sh-tile-label">{t(m.label)}</span>
            <span className="sh-tile-value">{format(now, m.kind)}</span>
            {previous && (
              <span className="sh-small sh-muted">
                <Delta now={now} before={before} lowerIsBetter={m.lowerIsBetter} locale={locale} />{' '}
                {t('was {value}', { value: format(before ?? 0, m.kind) })}
              </span>
            )}
          </>
        );
        return onSelect ? (
          <button
            key={m.key}
            type="button"
            className="sh-tile"
            aria-pressed={selected === m.key}
            onClick={() => onSelect(m.key)}
          >
            {body}
          </button>
        ) : (
          <div key={m.key} className="sh-tile">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export interface Column<R> {
  key: string;
  label: string;
  /** What is sorted and exported. */
  value: (row: R) => string | number | null;
  render?: (row: R) => ReactNode;
  num?: boolean;
}

/** Saves rows as a CSV file (with a BOM, so spreadsheets read the accents). */
export function downloadCsv(filename: string, rows: (string | number | null)[][]): void {
  const blob = new Blob([`\uFEFF${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A table sorted by any column (click its heading), with a CSV export of what it shows. */
export function DataTable<R>({
  title,
  columns,
  rows,
  initialSort,
  filename,
  rowKey,
  empty,
}: {
  title: string;
  columns: Column<R>[];
  rows: R[];
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  filename: string;
  rowKey: (row: R) => string;
  empty?: string;
}) {
  const { t } = useT();
  const [sort, setSort] = useState(initialSort ?? { key: columns[0]!.key, dir: 'desc' as const });
  const column = columns.find((c) => c.key === sort.key) ?? columns[0]!;
  const sorted = [...rows].sort((a, b) => {
    const x = column.value(a);
    const y = column.value(b);
    // Empty values last, whichever way.
    if (x === null || x === '' || y === null || y === '')
      return Number(x === null || x === '') - Number(y === null || y === '');
    const order =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
    return sort.dir === 'asc' ? order : -order;
  });
  const exportCsv = () =>
    downloadCsv(filename, [
      columns.map((c) => t(c.label)),
      ...sorted.map((row) => columns.map((c) => c.value(row))),
    ]);
  return (
    <div className="sh-card" style={{ padding: 0 }}>
      <div className="sh-row sh-between" style={{ padding: '.75rem 1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h2>
        <button type="button" className="sh-btn" disabled={rows.length === 0} onClick={exportCsv}>
          {t('Download CSV')}
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="sh-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? 'num' : undefined}
                  aria-sort={
                    sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort({
                        key: c.key,
                        dir: sort.key === c.key && sort.dir === 'desc' ? 'asc' : 'desc',
                      })
                    }
                  >
                    {t(c.label)}
                    {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={rowKey(row)} style={{ cursor: 'default' }}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : undefined}>
                    {c.render ? c.render(row) : (c.value(row) ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="sh-muted" style={{ padding: '1rem' }}>
            {empty ?? t('Nothing in this period.')}
          </p>
        )}
      </div>
    </div>
  );
}
