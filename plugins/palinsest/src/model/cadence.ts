/**
 * Cadences of Palinsest's rules and the slots they give, in the site's time
 * zone: twice a day, once a day, or once every 2, 3, 7, 10 or 15 days.
 * Pure functions, tested on their own.
 */

export const CADENCES = ['twice-daily', 'daily', '2', '3', '7', '10', '15'] as const;
export type Cadence = (typeof CADENCES)[number];

export interface RuleTiming {
  cadence: Cadence;
  /** `HH:MM` in the site's time zone: two for `twice-daily`, one otherwise. */
  times: string[];
  /** `YYYY-MM-DD`: the first day of an every-N-days rule. */
  startsOn: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A rule's timing, cleaned: unknown values become the defaults. */
export function cleanTiming(input: Partial<RuleTiming>, today: string): RuleTiming {
  const cadence = CADENCES.includes(input.cadence as Cadence)
    ? (input.cadence as Cadence)
    : 'daily';
  const wanted = cadence === 'twice-daily' ? 2 : 1;
  const given = (Array.isArray(input.times) ? input.times : [])
    .map((t) => String(t).trim())
    .filter((t) => TIME_RE.test(t));
  const defaults = ['09:00', '18:00'];
  const times = [...new Set([...given, ...defaults])].slice(0, wanted).sort();
  const startsOn =
    typeof input.startsOn === 'string' && DATE_RE.test(input.startsOn) ? input.startsOn : today;
  return { cadence, times, startsOn };
}

/** The offset of a time zone at an instant, in minutes (Europe/Rome in summer: 120). */
export function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((local - instant) / 60_000);
}

/** The instant of a day and time in a time zone (`2026-03-29`, `09:00`, `Europe/Rome`). */
export function zonedInstant(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // Twice: the offset may change between the naive guess and the answer (DST days).
  let instant = naive - zoneOffset(naive, timeZone) * 60_000;
  instant = naive - zoneOffset(instant, timeZone) * 60_000;
  return new Date(instant);
}

/** The day (`YYYY-MM-DD`) of an instant in a time zone. */
export function zonedDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

const dayNumber = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
const dayOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Whether a rule has slots on a day. */
export function onDay(timing: RuleTiming, day: string): boolean {
  const offset = dayNumber(day) - dayNumber(timing.startsOn);
  if (offset < 0) return false;
  if (timing.cadence === 'twice-daily' || timing.cadence === 'daily') return true;
  return offset % Number(timing.cadence) === 0;
}

/** The slots of a rule from a day for some days, in time order. */
export function slotsOf(
  timing: RuleTiming,
  fromDay: string,
  days: number,
  timeZone: string,
): Date[] {
  const start = dayNumber(fromDay);
  const result: Date[] = [];
  for (let i = 0; i < days; i++) {
    const day = dayOf(start + i);
    if (!onDay(timing, day)) continue;
    for (const time of timing.times) result.push(zonedInstant(day, time, timeZone));
  }
  return result.sort((a, b) => a.getTime() - b.getTime());
}
