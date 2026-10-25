/**
 * The free times of a service: its weekly hours (fixed start times or a
 * slot every few minutes inside windows), the exceptions (closures, days
 * with other hours), the notice (how soon and how far ahead), the
 * appointments already made (places of a group slot, buffers kept free
 * around each appointment) and busy times given by extensions. Pure: the
 * same function answers the calendar and checks a booking inside the
 * locked transaction that stores it.
 */
import { addDays, daysBetween, localToUtc, weekday } from './time';
import type { DayHours, Exception, Service } from './types';

const MINUTE = 60_000;

/** An appointment holding a place (confirmed or pending). */
export interface Busy {
  id?: string;
  serviceId: string;
  start: number;
  end: number;
  seats: number;
  bufferBefore: number;
  bufferAfter: number;
}

export interface Slot {
  start: number;
  end: number;
  /** Places still free (1 for individual services). */
  left: number;
}

export interface SlotInput {
  service: Service;
  exceptions: Exception[];
  busy: Busy[];
  /** Times nobody can book (e.g. an external calendar's, from Agenda Pro). */
  blocked?: { start: number; end: number }[];
  /** Local dates, both included. */
  from: string;
  to: string;
  now: number;
  timeZone: string;
  /** Appointments of every service block each other (one person or room). */
  shared: boolean;
  /** An appointment left out (the one being moved). */
  ignoreId?: string;
  /** The administrator books: the notice does not apply. */
  ignoreNotice?: boolean;
}

/** The hours of a service on a local date, after the exceptions; null when closed. */
export function hoursOn(service: Service, exceptions: Exception[], date: string): DayHours | null {
  const relevant = exceptions.filter(
    (e) => date >= e.from && date <= e.to && (e.serviceId === null || e.serviceId === service.id),
  );
  // The service's own exception wins over one for every service.
  const own = relevant.find((e) => e.serviceId === service.id) ?? relevant[0];
  if (own) return own.closed ? null : own.hours;
  return service.schedule.days[weekday(date)] ?? null;
}

/** Start times (minutes from midnight) a day's hours offer. */
export function startsOf(service: Service, hours: DayHours): number[] {
  if (service.schedule.mode === 'fixed') return hours.times;
  const step = service.schedule.step || service.duration;
  const out: number[] = [];
  for (const w of hours.windows) {
    for (let t = w.start; t + service.duration <= w.end; t += step) out.push(t);
  }
  return out;
}

/**
 * Whether a new appointment of `service` at [start, end) clashes with an
 * existing one: the free time between them must be at least the larger of
 * the buffers that face each other (the new one's "before" and the old
 * one's "after", and the other way round).
 */
export function clashes(
  start: number,
  end: number,
  service: Pick<Service, 'bufferBefore' | 'bufferAfter'>,
  other: Pick<Busy, 'start' | 'end' | 'bufferBefore' | 'bufferAfter'>,
): boolean {
  const before = Math.max(service.bufferBefore, other.bufferAfter) * MINUTE;
  const after = Math.max(service.bufferAfter, other.bufferBefore) * MINUTE;
  return start - before < other.end && other.start - after < end;
}

/**
 * Places left for `service` at `start` given the appointments: 0 when it
 * clashes with another appointment, else the capacity minus the seats of
 * the appointments of the same service at the same time (a group).
 */
export function placesLeft(
  service: Service,
  start: number,
  busy: Busy[],
  shared: boolean,
  blocked: { start: number; end: number }[] = [],
  ignoreId?: string,
): number {
  const end = start + service.duration * MINUTE;
  let taken = 0;
  for (const b of busy) {
    if (ignoreId && b.id === ignoreId) continue;
    if (b.serviceId === service.id && b.start === start) {
      taken += b.seats;
      continue;
    }
    if (!shared && b.serviceId !== service.id) continue;
    if (clashes(start, end, service, b)) return 0;
  }
  for (const b of blocked) {
    if (start < b.end && b.start < end) return 0;
  }
  return Math.max(0, service.capacity - taken);
}

/** The free slots of a service between two local dates (at most 62 days). */
export function freeSlots(input: SlotInput): Slot[] {
  const { service, now, timeZone } = input;
  const days = Math.min(daysBetween(input.from, input.to), 62);
  const earliest = input.ignoreNotice ? -Infinity : now + service.minNotice * MINUTE;
  const latest =
    input.ignoreNotice || service.maxNotice === 0 ? Infinity : now + service.maxNotice * MINUTE;
  const out: Slot[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(input.from, i);
    const hours = hoursOn(service, input.exceptions, date);
    if (!hours) continue;
    for (const minutes of startsOf(service, hours)) {
      const start = localToUtc(date, minutes, timeZone);
      // Skipped by the change to summer time.
      if (start === null) continue;
      if (start < earliest || start > latest || (!input.ignoreNotice && start <= now)) continue;
      const left = placesLeft(
        service,
        start,
        input.busy,
        input.shared,
        input.blocked,
        input.ignoreId,
      );
      if (left > 0) out.push({ start, end: start + service.duration * MINUTE, left });
    }
  }
  return out;
}

/** Whether `start` is one of the free slots (the check made when booking). */
export function isFree(
  input: Omit<SlotInput, 'from' | 'to'> & { start: number; date: string },
): Slot | null {
  return (
    freeSlots({ ...input, from: input.date, to: input.date }).find(
      (s) => s.start === input.start,
    ) ?? null
  );
}
