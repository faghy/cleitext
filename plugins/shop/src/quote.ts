import type { PluginTransaction } from '@cleitext/plugin-sdk';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { CartLine } from './cart';
import {
  applyCoupons,
  couponProblem,
  type Coupon,
  type CouponLine,
  type CouponProblem,
} from './coupons';
import {
  couponUses,
  coupons as couponsTable,
  shippingMethods,
  shippingZones,
  taxRates,
  type CouponRow,
} from './schema';
import { rateFor, zoneFor, type Destination, type Rate } from './shipping';
import { ratesFor, type TaxRateInput } from './taxes';
import { computeTotals, type Totals } from './totals';

/**
 * A cart priced in full: coupons checked and applied, the shipping rates for
 * the address, taxes for it, the cash-on-delivery fee. The cart page, the
 * checkout and the order all use it, so they agree to the cent.
 */

export interface QuoteSettings {
  pricesIncludeTax: boolean;
  taxesEnabled: boolean;
  /** Cash on delivery: its fee as entered, when the customer pays that way. */
  cod: { enabled: boolean; fee: string; title: string };
}

export interface QuoteInput {
  lines: CartLine[];
  codes: string[];
  /** Where it goes (taxes depend on it): the shop's country until the customer says. */
  to: Destination;
  /** Price the shipping rates: at checkout, not on the cart page. */
  shipping: boolean;
  rateId?: string;
  payment?: string;
  /** Known at checkout: for the coupons' email and per-customer limits. */
  customer?: { email: string; userId: string | null };
  now?: Date;
}

export interface Quote {
  totals: Totals;
  needsShipping: boolean;
  /** The shop has shipping methods: without any, nothing is charged nor chosen. */
  shippingSetUp: boolean;
  /** The rates for the address (none without one). */
  rates: Rate[];
  rate: Rate | null;
  coupons: { coupon: Coupon; discount: number }[];
  rejected: { code: string; problem: CouponProblem | 'unknown' }[];
}

export function couponOf(row: CouponRow): Coupon {
  const settings = row.settings as Partial<Coupon>;
  return {
    description: '',
    freeShipping: false,
    minSpend: '',
    maxSpend: '',
    individualUse: false,
    excludeSaleItems: false,
    productIds: [],
    excludedProductIds: [],
    categoryIds: [],
    excludedCategoryIds: [],
    emails: [],
    usageLimitPerUser: null,
    limitItems: null,
    ...settings,
    id: row.id,
    code: row.code,
    kind: row.kind,
    amount: row.amount,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
  };
}

const couponLines = (lines: CartLine[]): CouponLine[] =>
  lines.map((l) => ({
    key: l.key,
    productId: l.productId,
    categoryIds: l.categoryIds,
    onSale: l.onSale,
    unitPrice: Math.round(Number(l.unitPrice) * 100),
    quantity: l.quantity,
  }));

export async function quote(
  tx: PluginTransaction,
  settings: QuoteSettings,
  input: QuoteInput,
): Promise<Quote> {
  const lines = couponLines(input.lines);

  // Coupons, each checked against those accepted before it.
  const codes = [...new Set(input.codes.map((c) => c.toLowerCase()))];
  const rows = codes.length
    ? await tx
        .select()
        .from(couponsTable)
        .where(and(inArray(couponsTable.code, codes), eq(couponsTable.enabled, true)))
    : [];
  const accepted: Coupon[] = [];
  const rejected: Quote['rejected'] = [];
  for (const code of codes) {
    const row = rows.find((r) => r.code === code);
    if (!row) {
      rejected.push({ code, problem: 'unknown' });
      continue;
    }
    const coupon = couponOf(row);
    const usesByCustomer =
      input.customer && coupon.usageLimitPerUser !== null
        ? await usesBy(tx, coupon.id, input.customer)
        : undefined;
    const problem = couponProblem(coupon, {
      lines,
      applied: accepted,
      ...(input.customer ? { email: input.customer.email } : {}),
      ...(usesByCustomer !== undefined ? { usesByCustomer } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
    if (problem) rejected.push({ code, problem });
    else accepted.push(coupon);
  }
  const applied = applyCoupons(accepted, lines);

  // Shipping, on what is left after the discounts.
  const shipped = input.lines.filter((l) => !l.virtual);
  const needsShipping = shipped.length > 0;
  let rates: Rate[] = [];
  const shippingSetUp =
    needsShipping &&
    (
      await tx
        .select({ id: shippingMethods.id })
        .from(shippingMethods)
        .where(eq(shippingMethods.enabled, true))
        .limit(1)
    ).length > 0;
  if (shippingSetUp && input.shipping) {
    const classes: Record<string, number> = {};
    for (const line of shipped)
      classes[line.shippingClass] = (classes[line.shippingClass] ?? 0) + line.quantity;
    const contents = lines.reduce(
      (sum, l) => sum + l.unitPrice * l.quantity - (applied.discounts[l.key] ?? 0),
      0,
    );
    const zones = await tx.select().from(shippingZones).orderBy(shippingZones.position);
    const zone = zoneFor(zones, input.to);
    const methods = await tx
      .select()
      .from(shippingMethods)
      .where(zone ? eq(shippingMethods.zoneId, zone.id) : isNull(shippingMethods.zoneId))
      .orderBy(shippingMethods.position);
    const pack = {
      contents,
      quantity: shipped.reduce((sum, l) => sum + l.quantity, 0),
      weight: shipped.reduce((sum, l) => sum + l.weight * l.quantity, 0),
      classes,
      freeShippingCoupon: applied.freeShipping,
    };
    rates = methods.flatMap((m) => rateFor(m.id, m, pack) ?? []);
  }
  const rate = rates.find((r) => r.id === input.rateId) ?? rates[0] ?? null;

  const taxRows: TaxRateInput[] = settings.taxesEnabled
    ? (await tx.select().from(taxRates)).map((r) => ({
        country: r.country,
        province: r.province,
        taxClass: r.taxClass as TaxRateInput['taxClass'],
        rate: Number(r.rate),
        name: r.name,
      }))
    : [];
  const totals = computeTotals({
    lines: input.lines.map((l) => ({
      key: l.key,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      taxStatus: l.taxStatus,
      taxClass: l.taxClass,
    })),
    pricesIncludeTax: settings.pricesIncludeTax,
    rates: ratesFor(taxRows, input.to),
    shipping: rate ? { cost: (rate.cost / 100).toFixed(2), taxable: rate.taxable } : null,
    fees:
      input.payment === 'cod' && settings.cod.enabled && Number(settings.cod.fee) > 0
        ? [{ name: settings.cod.title, amount: settings.cod.fee, taxable: true }]
        : [],
    discounts: applied.discounts,
  });
  return {
    totals,
    needsShipping,
    shippingSetUp,
    rates,
    rate,
    coupons: accepted.map((coupon) => ({ coupon, discount: applied.byCoupon[coupon.code] ?? 0 })),
    rejected,
  };
}

/** Orders of a customer with a coupon, by email or account. */
async function usesBy(
  tx: PluginTransaction,
  couponId: string,
  customer: { email: string; userId: string | null },
): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(couponUses)
    .where(
      and(
        eq(couponUses.couponId, couponId),
        customer.userId
          ? or(
              eq(couponUses.email, customer.email.toLowerCase()),
              eq(couponUses.userId, customer.userId),
            )
          : eq(couponUses.email, customer.email.toLowerCase()),
      ),
    );
  return row?.n ?? 0;
}
