/**
 * Wall-clock times of a time zone and instants (UTC milliseconds), with the
 * daylight saving changes handled: a local time that does not exist (the
 * hour skipped in spring) has no instant, one that happens twice (the hour
 * repeated in autumn) is its first occurrence. Only `Intl`, no library.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 64) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsOf(ms: number, timeZone: string): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour! % 24,
    minute: out.minute!,
    second: out.second!,
  };
}

/** The zone's offset from UTC at an instant, in milliseconds (Rome in summer: +7 200 000). */
export function offsetAt(ms: number, timeZone: string): number {
  const p = partsOf(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/**
 * The instant of a local date and time (minutes from midnight) in a zone;
 * null when that time is skipped by a daylight saving change.
 */
export function localToUtc(date: string, minutes: number, timeZone: string): number | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, minutes);
  const found: number[] = [];
  for (const probe of [naive - 14 * 3600_000, naive + 14 * 3600_000]) {
    const t = naive - offsetAt(probe, timeZone);
    if (t + offsetAt(t, timeZone) === naive && !found.includes(t)) found.push(t);
  }
  return found.length ? Math.min(...found) : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The local date (`YYYY-MM-DD`) of an instant in a zone. */
export function localDate(ms: number, timeZone: string): string {
  const p = partsOf(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes from local midnight of an instant in a zone. */
export function localMinutes(ms: number, timeZone: string): number {
  const p = partsOf(ms, timeZone);
  return p.hour * 60 + p.minute;
}

export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date)!;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  const m = DATE_RE.exec(date)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);
}

/** `HH:MM` → minutes, or null. `24:00` is allowed as the end of a day. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** A date and time as people read them, in the site's zone and a language. */
export function formatWhen(
  ms: number,
  timeZone: string,
  locale: string,
): { date: string; time: string } {
  const lang = locale.toLowerCase().startsWith('it') ? 'it-IT' : locale || 'en-GB';
  const safe = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(lang, { timeZone, ...options }).format(new Date(ms));
    } catch {
      return new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(new Date(ms));
    }
  };
  return {
    date: safe({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: safe({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  };
}
