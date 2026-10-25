/**
 * How other plugins (Agenda Pro) extend Agenda on the server: lists kept on
 * `globalThis` under `Symbol.for('cleitext.agenda')`, set up again whenever
 * plugins reload. Agenda Pro requires Agenda, so it loads after it and
 * finds the API in its own `setup`. A failing extension is logged and left
 * out: it never breaks the calendar or a booking.
 */
import { API_KEY, UPGRADE_URL } from './config';
import { FREE_BOOKINGS } from './model/limit';
import type { Appointment, Service } from './model/types';

export interface BookingEvent {
  siteId: string;
  appointment: Appointment;
  service: Service;
}

export interface AgendaServerApi {
  version: 1;
  /**
   * How many bookings a site may take (see `model/limit.ts` for what
   * counts): the largest answer wins, `null` means "no opinion". Agenda
   * answers 30; Agenda Pro, with a valid license, `Infinity`.
   */
  bookingLimit: ((siteId: string) => number | null | Promise<number | null>)[];
  /**
   * Times nobody can book, e.g. the busy times of an external calendar
   * (Google Calendar, in Agenda Pro), for a service and a range of instants.
   */
  blocked: ((input: {
    siteId: string;
    service: Service;
    from: number;
    to: number;
  }) => Promise<{ start: number; end: number }[]>)[];
  /** After a booking is stored (e.g. a video call link, a payment, a calendar event). */
  booked: ((event: BookingEvent) => void | Promise<void>)[];
  /** After a status or a time changes (cancelled, confirmed, moved, no-show). */
  changed: ((event: BookingEvent & { previous: Appointment }) => void | Promise<void>)[];
  /** The address of the Agenda Pro page shown in the invitations. */
  upgradeUrl: string;
}

const KEY = Symbol.for(API_KEY);

export function installServerApi(): AgendaServerApi {
  const api: AgendaServerApi = {
    version: 1,
    bookingLimit: [() => FREE_BOOKINGS],
    blocked: [],
    booked: [],
    changed: [],
    upgradeUrl: UPGRADE_URL,
  };
  (globalThis as unknown as Record<symbol, unknown>)[KEY] = api;
  return api;
}

export function serverApi(): AgendaServerApi | undefined {
  return (globalThis as unknown as Record<symbol, AgendaServerApi | undefined>)[KEY];
}

/** The number of bookings the site may take (at least the free ones). */
export async function bookingLimit(
  api: AgendaServerApi,
  siteId: string,
  log?: (message: string) => void,
): Promise<number> {
  let limit = FREE_BOOKINGS;
  for (const provider of api.bookingLimit) {
    try {
      const value = await provider(siteId);
      if (typeof value === 'number' && !Number.isNaN(value) && value > limit) limit = value;
    } catch (error) {
      log?.(`A booking limit provider failed: ${String(error)}`);
    }
  }
  return limit;
}

/** Runs extension callbacks, each on its own: a failure is logged and skipped. */
export async function notify<T>(
  list: ((event: T) => void | Promise<void>)[],
  event: T,
  log: (message: string) => void,
): Promise<void> {
  for (const fn of list) {
    try {
      await fn(event);
    } catch (error) {
      log(`An Agenda extension failed: ${String(error)}`);
    }
  }
}
