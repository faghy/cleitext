/** Agenda's data, as the server, the admin and the tests share it. */

export const STATUSES = ['confirmed', 'pending', 'cancelled', 'no_show'] as const;
export type Status = (typeof STATUSES)[number];
/** Statuses that hold a place in the calendar. */
export const HOLDING: readonly Status[] = ['confirmed', 'pending'];

/** Where a booking comes from (the free limit counts some of them, see `limit.ts`). */
export const SOURCES = ['site', 'admin', 'import'] as const;
export type Source = (typeof SOURCES)[number];

/** A time window of a day, in minutes from midnight (`end` up to 1440). */
export interface Window {
  start: number;
  end: number;
}

/** What a weekday offers: windows (intervals mode) or start times (fixed mode). */
export interface DayHours {
  windows: Window[];
  times: number[];
}

export interface Schedule {
  /** `intervals`: a slot every `step` minutes inside the windows; `fixed`: the start times. */
  mode: 'intervals' | 'fixed';
  /** Minutes between two starts in intervals mode (0: the service's duration). */
  step: number;
  /** Sunday first (0) … Saturday (6). */
  days: DayHours[];
}

export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';

/** Whether a field of the booking form must be filled in, may be, or is not asked. */
export const FIELD_STATES = ['required', 'optional', 'hidden'] as const;
export type FieldState = (typeof FIELD_STATES)[number];

/**
 * The fields every service has (they cannot be removed, only hidden):
 * name and email are always required, the booking needs them. Their label
 * is the visitors' standard text unless one is written.
 */
export const STANDARD_FIELDS = ['name', 'email', 'phone', 'notes'] as const;
export type StandardField = (typeof STANDARD_FIELDS)[number];

/** A field's texts in another language. */
export interface FieldText {
  label?: string;
  help?: string;
}

/**
 * A field of the booking form: a standard one (`name`, `email`, `phone`,
 * `notes`) or a question of the service. The list's order is the form's.
 */
export interface CustomField {
  name: string;
  /** In the site's language (a standard field: empty for the standard text). */
  label: string;
  /** A short explanation under the field. */
  help: string;
  type: FieldType;
  state: FieldState;
  /** `state === 'required'`, kept for whoever read it before 1.0.1. */
  required: boolean;
  /** Choices of a select, one per line in the admin. */
  options: string[];
  /** Label and help in the site's other languages. */
  translations: Record<string, FieldText>;
}

export interface ServiceText {
  name?: string;
  description?: string;
  price?: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  /** Minutes. */
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  /** Minutes before the start a booking must be made (0: up to the start). */
  minNotice: number;
  /** Minutes ahead a booking may be made (0: no limit). */
  maxNotice: number;
  /** Shown as written ("€ 60", "Free"): no payments. */
  price: string;
  /** Places per slot: 1 = individual, more = a group. */
  capacity: number;
  /** New bookings wait for the administrator's confirmation. */
  approval: boolean;
  status: 'active' | 'hidden' | 'archived';
  schedule: Schedule;
  fields: CustomField[];
  /** Name, description and price in the site's other languages. */
  translations: Record<string, ServiceText>;
  position: number;
  /** Data of extensions (Agenda Pro) and of imports. */
  data: Record<string, unknown>;
}

/** A closure or a day with other hours, for one service or all. */
export interface Exception {
  id: string;
  serviceId: string | null;
  from: string;
  to: string;
  /** Closed, or open with these hours instead of the weekly ones. */
  closed: boolean;
  hours: DayHours;
  note: string;
}

export interface Appointment {
  id: string;
  serviceId: string;
  /** ISO instants. */
  start: string;
  end: string;
  seats: number;
  status: Status;
  name: string;
  email: string;
  phone: string;
  fields: { name: string; label: string; value: string }[];
  notes: string;
  locale: string;
  /** The visitor's zone when they booked, if known. */
  timezone: string;
  source: Source;
  externalId: string | null;
  bufferBefore: number;
  bufferAfter: number;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  anonymized: boolean;
}

export const EMAIL_KINDS = [
  'confirmed',
  'pending',
  'cancelled',
  'rescheduled',
  'reminder',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export interface EmailText {
  subject: string;
  body: string;
}

export interface Settings {
  /** Addresses notified of new bookings and cancellations, comma separated. */
  notify: string;
  /** Shown when online booking is not possible (the free limit): a phone, an email… */
  contact: string;
  /** A zone (`Europe/Rome`), empty: the site's. */
  timezone: string;
  /** One person (or room) for every service: an appointment blocks the others' overlapping times. */
  shared: boolean;
  /** Customers may cancel or move up to this many hours before the start. */
  changeNoticeHours: number;
  allowCancel: boolean;
  allowReschedule: boolean;
  reminders: boolean;
  reminderHours: number;
  /** Personal data of appointments are erased this many months after them (0: kept). */
  retentionMonths: number;
  privacyUrl: string;
  phone: 'required' | 'optional' | 'off';
  /** Texts of the customers' emails, by language and kind (empty: the defaults). */
  emails: Record<string, Partial<Record<EmailKind, EmailText>>>;
  /** The first-run wizard was completed or skipped. */
  setupDone: boolean;
}
