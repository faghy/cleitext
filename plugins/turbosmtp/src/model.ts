/** The plugin's settings and turboSMTP's statistics, as plain data. */
import { SMTP_HOSTS, SMTP_PORTS, type SmtpHost } from './config';

export type Mode = 'api' | 'smtp';
export type Security = 'tls' | 'starttls' | 'none';

export interface Settings {
  /** Off: the site sends its emails as it did before the plugin. */
  enabled: boolean;
  /** By turboSMTP's sending API (the default, as in WordPress) or by its SMTP servers. */
  mode: Mode;
  /** The sender; empty keeps the site's. */
  fromEmail: string;
  fromName: string;
  host: SmtpHost;
  port: number;
  security: Security;
  /** The SMTP user, usually the account's email; the password is a secret. */
  smtpUser: string;
  /** The connected account, as turboSMTP names it. */
  account: string;
}

export const DEFAULTS: Settings = {
  enabled: true,
  mode: 'api',
  fromEmail: '',
  fromName: '',
  host: 'pro.eu.turbo-smtp.com',
  port: 587,
  security: 'starttls',
  smtpUser: '',
  account: '',
};

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export const isEmail = (value: string) => value.length <= 254 && EMAIL_RE.test(value);

/** One line, at most `max` characters. */
export function line(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max)
  );
}

/** The security a port uses by default: 465 is encrypted from the start, the others upgrade. */
export const securityFor = (port: number): Security => (port === 465 ? 'tls' : 'starttls');

/** Saved or sent settings, made valid: anything unknown falls back to the defaults. */
export function normalizeSettings(input: unknown): Settings {
  const v = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const port =
    typeof v.port === 'number' && (SMTP_PORTS as readonly number[]).includes(v.port)
      ? v.port
      : DEFAULTS.port;
  const fromEmail = line(v.fromEmail, 254).toLowerCase();
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULTS.enabled,
    mode: v.mode === 'smtp' ? 'smtp' : 'api',
    fromEmail: isEmail(fromEmail) ? fromEmail : '',
    fromName: line(v.fromName, 100).replace(/["<>\\]/g, ''),
    host: typeof v.host === 'string' && v.host in SMTP_HOSTS ? (v.host as SmtpHost) : DEFAULTS.host,
    port,
    security:
      v.security === 'tls' || v.security === 'starttls' || v.security === 'none'
        ? v.security
        : securityFor(port),
    smtpUser: line(v.smtpUser, 254),
    account: line(v.account, 200),
  };
}

/** `"Name" <address>`, or the address alone. */
export function sender(email: string, name: string): string {
  return name ? `"${name}" <${email}>` : email;
}

/**
 * The sender from the settings, or null to keep the site's. A name alone
 * goes with the site's address.
 */
export function chosenSender(settings: Settings, siteFrom: string): string | null {
  if (!settings.fromEmail && !settings.fromName) return null;
  const address = settings.fromEmail || (/<([^<>]+)>\s*$/.exec(siteFrom)?.[1] ?? siteFrom).trim();
  return sender(address, settings.fromName);
}

// ---- Statistics --------------------------------------------------------------------------

/**
 * The statistics' groups, as turboSMTP's own plugin shows them: each is
 * one or more statuses of turboSMTP. An open message counts as delivered,
 * a click as opened and delivered.
 */
export const GROUPS = {
  delivered: ['SUCCESS', 'OPEN', 'CLICK', 'UNSUB', 'REPORT'],
  opens: ['OPEN', 'CLICK', 'UNSUB', 'REPORT'],
  clicks: ['CLICK'],
  queued: ['NEW', 'DEFER'],
  bounce: ['FAIL'],
  unsubscribes: ['UNSUB'],
  spam: ['REPORT'],
  drop: ['SYSFAIL'],
} as const;
export type Group = keyof typeof GROUPS;

export const isGroup = (value: unknown): value is Group =>
  typeof value === 'string' && Object.hasOwn(GROUPS, value);

/** The statuses to ask for a group, comma-separated; empty for every message. */
export const statusesOf = (group: unknown): string =>
  isGroup(group) ? GROUPS[group].join(',') : '';

/** A group's name for a message's status (the narrowest one). */
export function groupOf(status: string): Group | null {
  for (const group of [
    'clicks',
    'unsubscribes',
    'spam',
    'opens',
    'delivered',
    'queued',
    'bounce',
    'drop',
  ] as Group[]) {
    if ((GROUPS[group] as readonly string[]).includes(status)) return group;
  }
  return null;
}

export interface DaySeries {
  /** The series' names, e.g. `all`, `delivered`, `opens`. */
  keys: string[];
  /** One row per day with data, oldest first. */
  days: { day: string; counts: Record<string, number> }[];
  totals: Record<string, number>;
}

/**
 * Unpacks the day series of `/analytics` (`aggs`): first the series' names,
 * then the largest value, then for each day its number (days since 1970),
 * one value per series, and -1.
 */
export function decodeAggs(aggs: unknown[]): DaySeries {
  const keys: string[] = [];
  const rows = new Map<number, Record<string, number>>();
  let max: number | null = null;
  let day: number | null = null;
  let index = 0;
  for (const value of aggs) {
    if (typeof value === 'string') {
      keys.push(value);
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (max === null) {
      max = value;
    } else if (day === null) {
      day = value;
      index = 0;
    } else if (value === -1) {
      day = null;
    } else {
      const key = keys[index++];
      if (key === undefined) continue;
      const row = rows.get(day) ?? {};
      row[key] = (row[key] ?? 0) + value;
      rows.set(day, row);
    }
  }
  const totals: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  const days = [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, counts]) => {
      for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + v;
      return { day: new Date(n * 86_400_000).toISOString().slice(0, 10), counts };
    });
  return { keys, days, totals };
}

/** A message of the list, with only what the admin shows. */
export interface MessageRow {
  sentAt: string;
  status: string;
  group: Group | null;
  to: string;
  from: string;
  subject: string;
  error: string;
}

export function messageRow(item: Record<string, unknown>): MessageRow {
  const text = (key: string, max = 300) =>
    typeof item[key] === 'string' ? (item[key] as string).slice(0, max) : '';
  const status = text('status', 20).toUpperCase();
  return {
    sentAt: text('send_time', 40),
    status,
    group: groupOf(status),
    to: text('recipient'),
    from: text('sender'),
    subject: text('subject'),
    error: text('error', 500),
  };
}

/** `YYYY-MM-DD`, or null. */
export function isoDay(value: unknown): string | null {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}
