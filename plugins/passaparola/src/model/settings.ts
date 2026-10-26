/** The program's settings (Passaparola → Settings), normalized. */

/** Where conversions come from: the plugins that announce them. */
export const SOURCES = ['shop', 'agenda', 'store', 'forms'] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_NAMES: Record<Source, { en: string; it: string }> = {
  shop: { en: 'Cleishop (orders)', it: 'Cleishop (ordini)' },
  agenda: { en: 'Agenda (bookings)', it: 'Agenda (prenotazioni)' },
  store: { en: 'Store (licenses)', it: 'Store (licenze)' },
  forms: { en: 'Forms (contacts)', it: 'Forms (contatti)' },
};

export const CATEGORIES = ['marketing', 'statistics', 'preferences'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface EmailSwitches {
  /** To the administrators: a new application. */
  application: boolean;
  /** To the affiliate: approved. */
  approved: boolean;
  /** To the affiliate: a new referral. */
  referral: boolean;
  /** To the affiliate: a payout was made. */
  payout: boolean;
}

export interface Settings {
  /** The link's parameter: `https://site/?ref=<code>`. */
  param: string;
  /** How long a visitor stays credited to the affiliate, in days. */
  cookieDays: number;
  /** `last`: the latest link wins; `first`: the first one. */
  model: 'first' | 'last';
  /** The consent category the referral cookie needs (Privacy & GDPR). */
  category: Category;
  /** Applications: approved by hand or at once. */
  approval: 'manual' | 'auto';
  commissionType: 'percent' | 'fixed';
  /** Percent (0–100) or a fixed amount in `currency` per conversion. */
  commissionValue: number;
  /** Currency of fixed commissions and of the payout threshold. */
  currency: string;
  /** Days a commission waits before it is approved: the refund window. */
  refundDays: number;
  /** Address of the program's terms page (shown with the application form). */
  termsUrl: string;
  /** The source whose conversions count (one in the free version). */
  source: Source;
  /** Payouts start from this amount (in `currency`); 0 for any. */
  minPayout: number;
  /** Notifications of applications; empty: the site's administrators. */
  notifyEmail: string;
  emails: EmailSwitches;
}

export const DEFAULT_SETTINGS: Settings = {
  param: 'ref',
  cookieDays: 30,
  model: 'last',
  category: 'marketing',
  approval: 'manual',
  commissionType: 'percent',
  commissionValue: 10,
  currency: 'EUR',
  refundDays: 30,
  termsUrl: '',
  source: 'shop',
  minPayout: 50,
  notifyEmail: '',
  emails: { application: true, approved: true, referral: true, payout: true },
};

/** Parameters the core keeps for itself, or that pages use. */
const RESERVED = new Set(['page', 'p', 's', 'q', 'preview', 'frame', 'token', 'redirect', 'error']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly unknown[]).includes(value) ? (value as T) : fallback;

/** A local address (`/terms`) or an https one; anything else is dropped. */
export function cleanUrl(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().slice(0, 500) : '';
  if (/^\/(?![/\\])[^\s]*$/.test(text)) return text;
  if (/^https?:\/\/[^\s]+$/i.test(text)) return text;
  return '';
}

/** Settings from storage or the admin, with defaults for what is missing or invalid. */
export function normalizeSettings(input: unknown): Settings {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const param = typeof v.param === 'string' ? v.param.trim().toLowerCase() : '';
  const emails = (v.emails && typeof v.emails === 'object' ? v.emails : {}) as Record<
    string,
    unknown
  >;
  const percent = oneOf(v.commissionType, ['percent', 'fixed'] as const, d.commissionType);
  const notify =
    typeof v.notifyEmail === 'string'
      ? v.notifyEmail
          .split(/[,;\s]+/)
          .filter((e) => EMAIL_RE.test(e))
          .slice(0, 5)
          .join(', ')
      : '';
  return {
    param: /^[a-z][a-z0-9_-]{0,19}$/.test(param) && !RESERVED.has(param) ? param : d.param,
    cookieDays: Math.round(num(v.cookieDays, d.cookieDays, 1, 365)),
    model: oneOf(v.model, ['first', 'last'] as const, d.model),
    category: oneOf(v.category, CATEGORIES, d.category),
    approval: oneOf(v.approval, ['manual', 'auto'] as const, d.approval),
    commissionType: percent,
    commissionValue:
      Math.round(
        num(v.commissionValue, d.commissionValue, 0, percent === 'percent' ? 100 : 1e6) * 100,
      ) / 100,
    currency:
      typeof v.currency === 'string' && /^[A-Za-z]{3}$/.test(v.currency.trim())
        ? v.currency.trim().toUpperCase()
        : d.currency,
    refundDays: Math.round(num(v.refundDays, d.refundDays, 0, 365)),
    termsUrl: cleanUrl(v.termsUrl),
    source: oneOf(v.source, SOURCES, d.source),
    minPayout: Math.round(num(v.minPayout, d.minPayout, 0, 1e6) * 100) / 100,
    notifyEmail: notify,
    emails: {
      application: emails.application !== false,
      approved: emails.approved !== false,
      referral: emails.referral !== false,
      payout: emails.payout !== false,
    },
  };
}
