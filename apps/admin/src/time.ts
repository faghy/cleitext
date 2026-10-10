/**
 * Wall-clock time in a time zone (e.g. "2026-03-29T02:30" in Europe/Rome) →
 * ISO instant. Scheduling uses the site's time zone, not the browser's
 * (RF-CNT-08).
 */
export function zonedTimeToIso(local: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) throw new Error(`Invalid date and time: ${local}`);
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  // Start from the wall time read as UTC, then correct by the zone offset
  // (twice, for times close to a daylight-saving change).
  let instant = wanted;
  for (let i = 0; i < 2; i++) instant = wanted - offsetOf(instant, timeZone);
  return new Date(instant).toISOString();
}

/** ISO instant → "YYYY-MM-DDTHH:mm" in a time zone (for datetime-local inputs). */
export function isoToZonedTime(iso: string, timeZone: string): string {
  const parts = partsOf(new Date(iso).getTime(), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function offsetOf(instant: number, timeZone: string): number {
  const p = partsOf(instant, timeZone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(instant / 60_000) * 60_000
  );
}

function partsOf(instant: number, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values as { year: number; month: number; day: number; hour: number; minute: number };
}
