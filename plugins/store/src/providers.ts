import { createHmac, timingSafeEqual } from 'node:crypto';

/** An order as the store needs it, whatever the payment provider. */
export interface OrderEvent {
  kind: 'paid' | 'refunded' | 'ignored';
  provider: string;
  orderRef: string;
  variantId: string;
  quantity: number;
  email: string;
  name: string;
  /** Renewals: the license id passed to the checkout as custom data. */
  licenseId: string | null;
  /** The partner's code passed to the checkout as custom data (`partner`). */
  partner: string | null;
  /** Amounts in cents, for the record: before and after discounts, without tax. */
  subtotalCents: number | null;
  discountCents: number | null;
  currency: string | null;
  /** What the customer paid, in cents (tax included), when the provider says. */
  totalCents: number | null;
  /**
   * Referral codes passed to the checkout as custom data, `ref_<plugin>`
   * (e.g. `checkout[custom][ref_passaparola]=anna`), by plugin slug (plugin API 1.58).
   */
  referrals: Record<string, string>;
}

/**
 * Lemon Squeezy (merchant of record: EU VAT and invoices are theirs). The
 * webhook is signed with HMAC-SHA256 of the raw body, hex, in `X-Signature`.
 */
export function verifyLemonSqueezy(
  secret: string,
  raw: Buffer | null,
  header: string | undefined,
): boolean {
  if (!raw || !header || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(header, 'hex'));
}

const str = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export function parseLemonSqueezy(payload: unknown): OrderEvent {
  const body = (payload ?? {}) as {
    meta?: { event_name?: unknown; custom_data?: Record<string, unknown> | null };
    data?: { id?: unknown; attributes?: Record<string, unknown> };
  };
  const event = str(body.meta?.event_name);
  const attributes = body.data?.attributes ?? {};
  const item = (attributes.first_order_item ?? {}) as Record<string, unknown>;
  const license = str(body.meta?.custom_data?.license);
  const partner = str(body.meta?.custom_data?.partner).trim().toLowerCase();
  const cents = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
  const currency = str(attributes.currency).toUpperCase();
  const kind =
    event === 'order_created' && attributes.status === 'paid'
      ? 'paid'
      : event === 'order_refunded'
        ? 'refunded'
        : 'ignored';
  const referrals: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.meta?.custom_data ?? {})) {
    const slug = /^ref_([a-z][a-z0-9_]{1,39})$/.exec(key)?.[1]?.replace(/_/g, '-');
    if (slug && typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value))
      referrals[slug] = value;
  }
  return {
    kind,
    provider: 'lemonsqueezy',
    orderRef: str(body.data?.id),
    variantId: str(item.variant_id),
    quantity: Math.max(1, Math.min(1000, Number(item.quantity) || 1)),
    email: str(attributes.user_email).trim().toLowerCase(),
    name: str(attributes.user_name).trim().slice(0, 200),
    licenseId: /^[0-9a-f-]{36}$/i.test(license) ? license.toLowerCase() : null,
    partner: /^[a-z0-9_-]{2,40}$/.test(partner) ? partner : null,
    subtotalCents: cents(attributes.subtotal),
    discountCents: cents(attributes.discount_total),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    totalCents: cents(attributes.total),
    referrals,
  };
}

/** The renewal checkout with the license id as custom data (Lemon Squeezy format). */
export function renewalUrl(base: string | null, licenseId: string): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set('checkout[custom][license]', licenseId);
    return url.href;
  } catch {
    return null;
  }
}
