import { z } from 'zod';

/**
 * Coupons (WooCommerce's): a percentage or a fixed amount off the cart or off
 * each product, with their restrictions and usage limits. The discount is
 * split over the lines it applies to, so taxes follow each line's rate.
 * Pure: the cart, the checkout and the admin use it.
 */

const amount = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => v === '' || /^\d{1,8}(\.\d{1,2})?$/.test(v), 'Not an amount');
const ids = z.array(z.string().uuid()).max(500).default([]);

export const couponInputSchema = z
  .object({
    /** Case-insensitive; stored in lower case. */
    code: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[^\s,]+$/, 'No spaces or commas')
      .transform((v) => v.toLowerCase()),
    description: z.string().trim().max(500).default(''),
    kind: z.enum(['percent', 'fixed_cart', 'fixed_product']).default('percent'),
    /** Percent, or an amount as entered (with or without taxes, like prices). */
    amount: amount.refine((v) => v !== '', 'Required'),
    freeShipping: z.boolean().default(false),
    /** ISO date-time; the coupon works until then. */
    expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
    minSpend: amount.default(''),
    maxSpend: amount.default(''),
    /** Not together with other coupons. */
    individualUse: z.boolean().default(false),
    excludeSaleItems: z.boolean().default(false),
    productIds: ids,
    excludedProductIds: ids,
    categoryIds: ids,
    excludedCategoryIds: ids,
    /** Customers' emails allowed, `*` as a wildcard (`*@example.com`); empty: anybody. */
    emails: z.array(z.string().trim().toLowerCase().min(3).max(200)).max(200).default([]),
    usageLimit: z.number().int().positive().nullable().default(null),
    usageLimitPerUser: z.number().int().positive().nullable().default(null),
    /** Percent and product coupons: on this many items at most. */
    limitItems: z.number().int().positive().nullable().default(null),
  })
  .refine((c) => c.kind !== 'percent' || Number(c.amount) <= 100, {
    path: ['amount'],
    message: 'At most 100%',
  });
export type CouponInput = z.output<typeof couponInputSchema>;

export interface Coupon extends CouponInput {
  id: string;
  usageCount: number;
}

export interface CouponLine {
  key: string;
  productId: string;
  categoryIds: string[];
  onSale: boolean;
  /** Cents, as entered. */
  unitPrice: number;
  quantity: number;
}

export type CouponProblem =
  | 'expired'
  | 'used_up'
  | 'used_up_by_you'
  | 'min_spend'
  | 'max_spend'
  | 'not_applicable'
  | 'email'
  | 'individual'
  | 'already';

const cents = (value: string) => Math.round(Number(value) * 100);

/** Whether a coupon applies to a line, by products, categories and sale. */
export function lineEligible(coupon: CouponInput, line: CouponLine): boolean {
  if (coupon.excludeSaleItems && line.onSale) return false;
  if (coupon.excludedProductIds.includes(line.productId)) return false;
  if (line.categoryIds.some((c) => coupon.excludedCategoryIds.includes(c))) return false;
  const restricted = coupon.productIds.length > 0 || coupon.categoryIds.length > 0;
  if (!restricted) return true;
  return (
    coupon.productIds.includes(line.productId) ||
    line.categoryIds.some((c) => coupon.categoryIds.includes(c))
  );
}

export function emailAllowed(patterns: string[], email: string): boolean {
  if (patterns.length === 0) return true;
  const address = email.trim().toLowerCase();
  return patterns.some((p) => {
    const regex = new RegExp(
      `^${p
        .split('*')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    );
    return regex.test(address);
  });
}

/**
 * Why a coupon cannot go on the cart, or null. `email` and `usesByCustomer`
 * are known only at checkout: the cart leaves them undefined.
 */
export function couponProblem(
  coupon: Coupon,
  cart: {
    lines: CouponLine[];
    /** Codes already applied. */
    applied: Pick<Coupon, 'code' | 'individualUse'>[];
    email?: string;
    usesByCustomer?: number;
    now?: Date;
  },
): CouponProblem | null {
  const now = cart.now ?? new Date();
  const others = cart.applied.filter((c) => c.code !== coupon.code);
  if (others.length !== cart.applied.length) return 'already';
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) return 'expired';
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) return 'used_up';
  if (
    coupon.usageLimitPerUser !== null &&
    cart.usesByCustomer !== undefined &&
    cart.usesByCustomer >= coupon.usageLimitPerUser
  )
    return 'used_up_by_you';
  const subtotal = cart.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  if (coupon.minSpend && subtotal < cents(coupon.minSpend)) return 'min_spend';
  if (coupon.maxSpend && subtotal > cents(coupon.maxSpend)) return 'max_spend';
  if (!cart.lines.some((l) => lineEligible(coupon, l))) {
    // A cart coupon without restrictions that only gives free shipping still applies.
    const restricted =
      coupon.productIds.length || coupon.categoryIds.length || coupon.excludeSaleItems;
    if (restricted || coupon.kind !== 'fixed_cart') return 'not_applicable';
  }
  if (cart.email !== undefined && !emailAllowed(coupon.emails, cart.email)) return 'email';
  if (others.some((c) => c.individualUse)) return 'individual';
  return null;
}

/** Splits `total` over `weights` in proportion, the cents left over to the largest parts. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || weights[b.index]! - weights[a.index]!);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index]! += 1;
    left--;
  }
  return parts;
}

export interface Applied {
  /** Cents off each line, as entered (with or without taxes). */
  discounts: Record<string, number>;
  /** Cents each coupon took off. */
  byCoupon: Record<string, number>;
  freeShipping: boolean;
}

/**
 * The discounts of the coupons on the lines, one after the other in
 * WooCommerce's order (product, percent, then cart coupons), each on what the
 * previous ones left.
 */
export function applyCoupons(coupons: CouponInput[], lines: CouponLine[]): Applied {
  const left = new Map(lines.map((l) => [l.key, l.unitPrice * l.quantity]));
  const discounts: Record<string, number> = {};
  const byCoupon: Record<string, number> = {};
  const rank = { fixed_product: 0, percent: 1, fixed_cart: 2 } as const;
  const sorted = [...coupons].sort((a, b) => rank[a.kind] - rank[b.kind]);
  const take = (code: string, key: string, value: number) => {
    const off = Math.min(value, left.get(key) ?? 0);
    if (off <= 0) return;
    left.set(key, left.get(key)! - off);
    discounts[key] = (discounts[key] ?? 0) + off;
    byCoupon[code] = (byCoupon[code] ?? 0) + off;
  };
  for (const coupon of sorted) {
    byCoupon[coupon.code] ??= 0;
    const eligible = lines.filter((l) => lineEligible(coupon, l));
    if (coupon.kind === 'fixed_cart') {
      const weights = eligible.map((l) => left.get(l.key) ?? 0);
      const total = Math.min(
        cents(coupon.amount),
        weights.reduce((a, b) => a + b, 0),
      );
      allocate(total, weights).forEach((part, i) => take(coupon.code, eligible[i]!.key, part));
      continue;
    }
    // Per item: the most expensive items first when the coupon is limited to some.
    let items = coupon.limitItems ?? Infinity;
    const byPrice = [...eligible].sort((a, b) => b.unitPrice - a.unitPrice);
    for (const line of byPrice) {
      const quantity = Math.min(line.quantity, items);
      if (quantity <= 0) break;
      items -= quantity;
      const value =
        coupon.kind === 'fixed_product'
          ? cents(coupon.amount) * quantity
          : Math.round(
              ((left.get(line.key) ?? 0) * (quantity / line.quantity) * Number(coupon.amount)) /
                100,
            );
      take(coupon.code, line.key, value);
    }
  }
  return { discounts, byCoupon, freeShipping: coupons.some((c) => c.freeShipping) };
}
