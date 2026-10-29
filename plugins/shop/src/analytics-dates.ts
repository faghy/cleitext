/**
 * Date ranges of the shop's reports, as WooCommerce's Analytics has them:
 * presets (today, last week, quarter to date…), the period they are compared
 * with (the one before, or the same dates a year earlier) and the intervals
 * of their charts. Dates are calendar days (`YYYY-MM-DD`) of the site's time
 * zone; weeks start on Monday, as Postgres's `date_trunc` has them. Pure:
 * the server and the admin share it.
 */

export type Interval = 'day' | 'week' | 'month';
export type Compare = 'previous_period' | 'previous_year';
export interface DateRange {
  /** First day, included. */
  after: string;
  /** Last day, included. */
  before: string;
}

export const PRESETS = [
  'today',
  'yesterday',
  'week',
  'last_week',
  'month',
  'last_month',
  'quarter',
  'last_quarter',
  'year',
  'last_year',
] as const;
export type Preset = (typeof PRESETS)[number];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
}

/** The same day some months away; the 31st becomes the month's last day. */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return toDay(first);
}

/** Days from one date to another (0 for the same day). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

/** Today in a time zone (`Europe/Rome`); UTC when the zone is unknown. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return toDay(now);
  }
}

/** The first day of the interval a day falls in. */
export function startOf(day: string, interval: Interval | 'quarter' | 'year'): string {
  const [y, m] = day.split('-').map(Number) as [number, number, number];
  switch (interval) {
    case 'day':
      return day;
    case 'week':
      // Monday: getUTCDay() is 0 on Sunday.
      return addDays(day, -((toDate(day).getUTCDay() + 6) % 7));
    case 'month':
      return `${day.slice(0, 7)}-01`;
    case 'quarter':
      return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
    case 'year':
      return `${y}-01-01`;
  }
}

/** The days of a preset, up to today for the "to date" ones. */
export function presetRange(preset: Preset, today: string): DateRange {
  const whole = (start: string, months: number) => ({
    after: start,
    before: addDays(addMonths(start, months), -1),
  });
  switch (preset) {
    case 'today':
      return { after: today, before: today };
    case 'yesterday':
      return { after: addDays(today, -1), before: addDays(today, -1) };
    case 'week':
      return { after: startOf(today, 'week'), before: today };
    case 'last_week': {
      const start = addDays(startOf(today, 'week'), -7);
      return { after: start, before: addDays(start, 6) };
    }
    case 'month':
      return { after: startOf(today, 'month'), before: today };
    case 'last_month':
      return whole(addMonths(startOf(today, 'month'), -1), 1);
    case 'quarter':
      return { after: startOf(today, 'quarter'), before: today };
    case 'last_quarter':
      return whole(addMonths(startOf(today, 'quarter'), -3), 3);
    case 'year':
      return { after: startOf(today, 'year'), before: today };
    case 'last_year':
      return whole(addMonths(startOf(today, 'year'), -12), 12);
  }
}

/** The period a range is compared with. */
export function previousRange(range: DateRange, compare: Compare): DateRange {
  if (compare === 'previous_year')
    return { after: addMonths(range.after, -12), before: addMonths(range.before, -12) };
  const length = daysBetween(range.after, range.before) + 1;
  return { after: addDays(range.after, -length), before: addDays(range.after, -1) };
}

/** The interval that suits a range: days up to two months, then weeks, then months. */
export function defaultInterval(range: DateRange): Interval {
  const days = daysBetween(range.after, range.before) + 1;
  return days <= 62 ? 'day' : days <= 190 ? 'week' : 'month';
}

/** The intervals of a range, by their first day (the first may start before the range). */
export function intervalsOf(range: DateRange, interval: Interval): string[] {
  const days: string[] = [];
  for (
    let day = startOf(range.after, interval);
    day <= range.before && days.length < 1200;
    day =
      interval === 'day'
        ? addDays(day, 1)
        : interval === 'week'
          ? addDays(day, 7)
          : addMonths(day, 1)
  )
    days.push(day);
  return days;
}
