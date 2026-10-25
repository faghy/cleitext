/** What the importers make of another plugin's data, before it is stored. */
import type { EmailKind, EmailText, Exception, Service, Status } from '../model/types';

export interface ImportedService {
  /** e.g. `ssa:type:3`, so importing twice updates instead of adding. */
  externalId: string;
  service: Service;
}

export interface ImportedAppointment {
  externalId: string;
  serviceExternalId: string;
  start: number;
  end: number;
  status: Status;
  name: string;
  email: string;
  phone: string;
  fields: { name: string; label: string; value: string }[];
  timezone: string;
  locale: string;
  createdAt: number | null;
  /** Private notes (e.g. why it was cancelled). */
  notes?: string;
}

/**
 * A line of the import report: what was read (`info`), what was left out
 * (`skipped`) and what to check after importing (`review`). `text` is an
 * English sentence with `{placeholders}` (translated in the admin, see
 * `NOTE_TEXTS`), filled with `values`.
 */
export interface ImportNote {
  kind: 'info' | 'skipped' | 'review';
  text: string;
  values?: Record<string, string | number>;
}

/** The other plugin's settings that Agenda has too. */
export interface ImportedSettings {
  /** Addresses to notify of bookings (the administrator's). */
  notify: string[];
  /** One calendar for every service (`false`: each its own). */
  shared?: boolean;
  /** The customers' email texts, in `locale` (null: the site's default language). */
  emails: Partial<Record<EmailKind, EmailText>>;
  locale: string | null;
}

export interface ImportPlan {
  source: 'ssa' | 'wpbc';
  /** The other plugin's zone, when the data say it. */
  timezone: string | null;
  services: ImportedService[];
  exceptions: Omit<Exception, 'id'>[];
  appointments: ImportedAppointment[];
  settings?: ImportedSettings;
  notes: ImportNote[];
}

export const note = (
  kind: ImportNote['kind'],
  text: string,
  values?: ImportNote['values'],
): ImportNote => (values ? { kind, text, values } : { kind, text });

export const obj = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
    try {
      return obj(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
};

export const list = (v: unknown): unknown[] => {
  if (typeof v === 'string' && /^\s*\[/.test(v)) {
    try {
      return list(JSON.parse(v));
    } catch {
      return [];
    }
  }
  if (Array.isArray(v)) return v;
  // PHP arrays exported as objects keyed by index.
  if (v && typeof v === 'object') return Object.values(v);
  return [];
};

/** `YYYY-MM-DD HH:MM:SS` in UTC → milliseconds. */
export function utcOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  return Number.isNaN(ms) || m[1] === '0000' ? null : ms;
}
