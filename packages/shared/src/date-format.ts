/**
 * Dates written with a format of PHP's letters, as WordPress's `date_format`
 * (`F j, Y` → "October 24, 2025"), in a language and a time zone: names of
 * months and days come from `Intl`, the rest from the letters (core 0.82).
 */

/**
 * Languages whose WordPress translation writes month names with a capital
 * letter where the language itself does not (Italian sites show "Ottobre 24,
 * 2025"): imported sites keep the dates they had.
 */
const CAPITALIZED_MONTHS = new Set(['it']);

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th';
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 (Sunday) to 6. */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function partsIn(date: Date, timeZone: string): Parts {
  const values: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: Math.max(0, WEEKDAYS.indexOf(values.weekday ?? 'Sun')),
  };
}

/** The offset of the zone at that moment, in minutes east of UTC. */
function offsetMinutes(date: Date, p: Parts): number {
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

function isoWeek(p: Parts): { week: number; year: number } {
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return {
    week: Math.ceil(((date.getTime() - start) / 86_400_000 + 1) / 7),
    year: date.getUTCFullYear(),
  };
}

/**
 * A date in a format of PHP's letters (`date()`), e.g. `F j, Y` or
 * `d/m/Y`; `\` writes the next letter as it is. Unknown letters stay as
 * they are.
 */
export function formatPhpDate(
  value: Date | string,
  format: string,
  locale: string,
  timeZone = 'UTC',
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
  } catch {
    zone = 'UTC';
  }
  const p = partsIn(date, zone);
  const named = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: zone }).format(date);
    } catch {
      return new Intl.DateTimeFormat('en', { ...options, timeZone: zone }).format(date);
    }
  };
  const month = (style: 'long' | 'short') => {
    const name = named({ month: style }).replace(/\.$/, '');
    return CAPITALIZED_MONTHS.has(locale.split('-')[0]!.toLowerCase())
      ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
      : name;
  };
  const offset = () => offsetMinutes(date, p);
  const zoneOffset = (colon: boolean) => {
    const minutes = offset();
    const sign = minutes < 0 ? '-' : '+';
    const abs = Math.abs(minutes);
    return `${sign}${pad(Math.floor(abs / 60))}${colon ? ':' : ''}${pad(abs % 60)}`;
  };
  const hour12 = p.hour % 12 || 12;
  const leap = (p.year % 4 === 0 && p.year % 100 !== 0) || p.year % 400 === 0;
  const letters: Record<string, () => string> = {
    d: () => pad(p.day),
    D: () => named({ weekday: 'short' }),
    j: () => String(p.day),
    l: () => named({ weekday: 'long' }),
    N: () => String(p.weekday || 7),
    S: () => ordinal(p.day),
    w: () => String(p.weekday),
    z: () =>
      String(
        Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / 86_400_000),
      ),
    W: () => pad(isoWeek(p).week),
    F: () => month('long'),
    M: () => month('short'),
    m: () => pad(p.month),
    n: () => String(p.month),
    t: () => String(new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()),
    L: () => (leap ? '1' : '0'),
    o: () => String(isoWeek(p).year),
    Y: () => String(p.year),
    y: () => pad(p.year % 100),
    a: () => (p.hour < 12 ? 'am' : 'pm'),
    A: () => (p.hour < 12 ? 'AM' : 'PM'),
    g: () => String(hour12),
    G: () => String(p.hour),
    h: () => pad(hour12),
    H: () => pad(p.hour),
    i: () => pad(p.minute),
    s: () => pad(p.second),
    e: () => zone,
    T: () => zone,
    O: () => zoneOffset(false),
    P: () => zoneOffset(true),
    Z: () => String(offset() * 60),
    U: () => String(Math.floor(date.getTime() / 1000)),
  };
  letters.c = () =>
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${zoneOffset(true)}`;
  letters.r = () =>
    `${WEEKDAYS[p.weekday]}, ${pad(p.day)} ${new Intl.DateTimeFormat('en', { month: 'short', timeZone: zone }).format(date)} ${p.year} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)} ${zoneOffset(false)}`;
  let out = '';
  for (let i = 0; i < format.length; i++) {
    const ch = format[i]!;
    if (ch === '\\') {
      out += format[i + 1] ?? '';
      i++;
      continue;
    }
    const letter = letters[ch];
    out += letter ? letter() : ch;
  }
  return out;
}
