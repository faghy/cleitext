import type { ConversionEvent } from '@cleitext/plugin-sdk';
import { toCents } from './money';
import type { Settings, Source } from './settings';

/**
 * The program's rules, without a database: who gets a conversion, how much
 * it earns, what a refund takes back, when a commission is approved, and
 * what is to be paid. The store applies them.
 */

export const AFFILIATE_STATUSES = ['pending', 'active', 'rejected', 'suspended'] as const;
export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number];
export const REFERRAL_STATUSES = ['pending', 'approved', 'paid', 'rejected'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** An affiliate as the rules need it. */
export interface AffiliateLite {
  id: string;
  userId: string;
  email: string;
  code: string;
  status: AffiliateStatus;
  /** Their own rate (percent or fixed amount, as the program's type); null: the program's. */
  rate: number | null;
}

// ---- Codes -------------------------------------------------------------------------------

export const CODE_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** A code from a name or a wish: lowercase letters, digits and dashes, 2–32 characters. */
export function codeFrom(text: string): string {
  const code = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return code.length >= 2 ? code : '';
}

/** The first code not taken: `anna`, then `anna-2`, `anna-3`… */
export function freeCode(wanted: string, taken: (code: string) => boolean): string {
  const base = codeFrom(wanted) || 'partner';
  if (!taken(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base.slice(0, 32 - String(n).length - 1)}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return `${base.slice(0, 20)}-${Date.now().toString(36)}`;
}

// ---- Attribution -------------------------------------------------------------------------

export type Attribution =
  | { ok: true; affiliate: AffiliateLite }
  | {
      ok: false;
      reason: 'source' | 'no-code' | 'unknown' | 'inactive' | 'self';
    };

/**
 * Whether a conversion goes to an affiliate: from the source that counts,
 * with this plugin's code, to an active affiliate who is not the customer.
 */
export function attribute(
  event: Pick<ConversionEvent, 'source' | 'customer' | 'referrals'>,
  slug: string,
  sourceCounts: boolean,
  affiliate: AffiliateLite | null,
): Attribution {
  if (!sourceCounts) return { ok: false, reason: 'source' };
  const code = event.referrals?.[slug];
  if (!code) return { ok: false, reason: 'no-code' };
  if (!affiliate) return { ok: false, reason: 'unknown' };
  if (affiliate.status !== 'active') return { ok: false, reason: 'inactive' };
  const email = event.customer.email.trim().toLowerCase();
  if (
    (event.customer.userId && event.customer.userId === affiliate.userId) ||
    (email && email === affiliate.email.trim().toLowerCase())
  )
    return { ok: false, reason: 'self' };
  return { ok: true, affiliate };
}

/** Whether a source counts: the one chosen, or every one with Passaparola Pro. */
export function sourceCounts(source: string, settings: Settings, allSources: boolean): boolean {
  return allSources || source === settings.source;
}

// ---- Commissions -------------------------------------------------------------------------

/**
 * What the commission is computed on: the items (Cleishop's products,
 * without shipping and taxes) when the conversion has them, its amount
 * otherwise.
 */
export function commissionBase(event: Pick<ConversionEvent, 'amount' | 'items'>): number {
  const items = event.items ?? [];
  return items.length > 0
    ? items.reduce((sum, item) => sum + toCents(item.amount), 0)
    : toCents(event.amount);
}

/** The commission of a conversion, in cents, with its currency. */
export function commissionFor(
  event: Pick<ConversionEvent, 'amount' | 'items' | 'currency'>,
  settings: Pick<Settings, 'commissionType' | 'commissionValue' | 'currency'>,
  affiliate: Pick<AffiliateLite, 'rate'>,
): { cents: number; currency: string; base: number } {
  const value = affiliate.rate ?? settings.commissionValue;
  const base = commissionBase(event);
  if (settings.commissionType === 'fixed')
    return { cents: Math.max(0, toCents(value)), currency: settings.currency, base };
  const percent = Math.min(Math.max(value, 0), 100);
  return {
    cents: Math.max(0, Math.round((base * percent) / 100)),
    currency: event.currency || settings.currency,
    base,
  };
}

// ---- Refunds and cancellations -----------------------------------------------------------

/** A referral as a reversal sees it. */
export interface ReversibleReferral {
  status: ReferralStatus;
  /** Its commission now (for a paid one: what was paid). */
  amountCents: number;
  /** Its commission when it was made. */
  originalCents: number;
  /** Adjustments made after it was paid (0 or less). */
  adjustedCents: number;
  /** What the customer paid, and what was given back so far. */
  conversionCents: number;
  reversedCents: number;
}

export interface ReversalPlan {
  status: ReferralStatus;
  amountCents: number;
  reversedCents: number;
  adjustedCents: number;
  /** A negative adjustment to record (a paid commission taken back), or 0. */
  adjustmentCents: number;
}

/**
 * What a refund or cancellation of `takeCents` (null: all that was left)
 * does to a referral: the commission shrinks in proportion, and a full
 * refund rejects it. A commission already paid stays as paid, and a
 * negative adjustment takes the difference off the next payout.
 */
export function reversalPlan(r: ReversibleReferral, takeCents: number | null): ReversalPlan {
  const left = Math.max(0, r.conversionCents - r.reversedCents);
  const take = takeCents === null ? left : Math.min(Math.max(0, takeCents), left);
  const reversedCents = r.reversedCents + take;
  const full = r.conversionCents <= 0 || reversedCents >= r.conversionCents || takeCents === null;
  const target = full
    ? 0
    : Math.round((r.originalCents * (r.conversionCents - reversedCents)) / r.conversionCents);
  if (r.status === 'rejected')
    return {
      status: 'rejected',
      amountCents: r.amountCents,
      reversedCents,
      adjustedCents: r.adjustedCents,
      adjustmentCents: 0,
    };
  if (r.status === 'paid') {
    const now = r.amountCents + r.adjustedCents;
    const adjustmentCents = Math.min(0, target - now);
    return {
      status: 'paid',
      amountCents: r.amountCents,
      reversedCents,
      adjustedCents: r.adjustedCents + adjustmentCents,
      adjustmentCents,
    };
  }
  return {
    status: full ? 'rejected' : r.status,
    amountCents: full ? r.amountCents : target,
    reversedCents,
    adjustedCents: r.adjustedCents,
    adjustmentCents: 0,
  };
}

// ---- Approval and payouts ----------------------------------------------------------------

/** A pending commission is approved once the refund window is over. */
export function isDue(createdAt: Date, refundDays: number, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= refundDays * 86_400_000;
}

/** A row of what is to be paid: approved commissions (and adjustments) not paid yet. */
export interface Payable {
  affiliateId: string;
  currency: string;
  amountCents: number;
}

export interface PayoutLine {
  affiliateId: string;
  currency: string;
  amountCents: number;
  count: number;
  /** At least the threshold: it can be paid. */
  due: boolean;
}

/** What each affiliate is owed, by currency, and whether it reached the threshold. */
export function toPay(rows: Payable[], minPayoutCents: number): PayoutLine[] {
  const lines = new Map<string, PayoutLine>();
  for (const row of rows) {
    const key = `${row.affiliateId}|${row.currency}`;
    const line = lines.get(key) ?? {
      affiliateId: row.affiliateId,
      currency: row.currency,
      amountCents: 0,
      count: 0,
      due: false,
    };
    line.amountCents += row.amountCents;
    line.count += 1;
    lines.set(key, line);
  }
  return [...lines.values()]
    .map((line) => ({
      ...line,
      due: line.amountCents > 0 && line.amountCents >= minPayoutCents,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

/** Totals of an affiliate's commissions by status (cents, one currency). */
export function earnings(
  rows: { status: ReferralStatus; amountCents: number; adjustedCents?: number }[],
): Record<'pending' | 'approved' | 'paid', number> {
  const totals = { pending: 0, approved: 0, paid: 0 };
  for (const row of rows) {
    if (row.status === 'rejected') continue;
    totals[row.status] += row.amountCents;
  }
  return totals;
}

export type { Source };
