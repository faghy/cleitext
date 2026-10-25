/**
 * The free version's limit. Agenda Pro lifts it through the `bookingLimit`
 * providers of the server API (`pro.ts`).
 */
import type { Source } from './types';

/** Bookings a site may take without Agenda Pro. */
export const FREE_BOOKINGS = 30;
/** From here the admin shows a warning next to the counter. */
export const WARN_FROM = 25;

/**
 * THE COUNTING RULE (the owner's decision, pending confirmation; change it
 * only here): every booking made on the site or by an administrator counts,
 * whatever its status (cancelled ones too) and date (past ones too).
 * Bookings brought in by the importers (Simply Schedule Appointments,
 * Booking Calendar) never count. Nothing is ever deleted to make room, and
 * the bookings already made keep working: cancelling and moving them are
 * always allowed.
 *
 * `COUNTED_SOURCES` is the same rule as the database query uses it.
 */
export const COUNTED_SOURCES: readonly Source[] = ['site', 'admin'];
export function countsTowardLimit(booking: { source: Source }): boolean {
  return COUNTED_SOURCES.includes(booking.source);
}

export interface LimitState {
  used: number;
  /** Null: no limit (Agenda Pro). */
  limit: number | null;
  /** New bookings are refused. */
  reached: boolean;
  /** The counter shows a warning. */
  warning: boolean;
}

export function limitState(used: number, limit: number): LimitState {
  const finite = Number.isFinite(limit);
  return {
    used,
    limit: finite ? limit : null,
    reached: finite && used >= limit,
    warning: finite && used >= Math.min(WARN_FROM, limit),
  };
}
