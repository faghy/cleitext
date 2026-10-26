import { randomBytes } from 'node:crypto';
import type { PluginTransaction } from '@cleitext/plugin-sdk';
import { and, eq, sql } from 'drizzle-orm';
import type { Address, Invoice } from './address';
import type { CartLine } from './cart';
import { stockStatusOf } from './pricing';
import { sameProductGroup, sameVariationGroup } from './translations';
import {
  counters,
  couponUses,
  coupons,
  orderItems,
  orderNotes,
  orders,
  products,
  variations,
  type OrderRow,
  type OrderStatus,
} from './schema';
import { decimal, type Totals } from './totals';

/** Orders: made at checkout, with their stock taken in the same transaction. */

export class StockError extends Error {
  constructor(readonly productName: string) {
    super(`Not enough stock of ${productName}`);
  }
}

export class CouponError extends Error {
  constructor(readonly code: string) {
    super(`The coupon ${code} cannot be used any more`);
  }
}

export interface NewOrder {
  locale: string;
  currency: string;
  pricesIncludeTax: boolean;
  lines: CartLine[];
  totals: Totals;
  email: string;
  billing: Address;
  shipping: Address;
  invoice: Invoice | null;
  customerNote: string;
  customerId: string | null;
  payment: { method: string; title: string };
  /** The shipping rate chosen (src/shipping.ts), null when nothing is shipped. */
  shippingRate: { id: string; title: string } | null;
  /** Coupons applied, with the cents each took off. */
  coupons: { id: string; code: string; discount: number }[];
  /** The status once placed: on-hold for bank transfers (waiting for the money). */
  status: OrderStatus;
  ip: string;
  userAgent: string;
  /** Referral codes the customer came with (`request.referrals`, plugin API 1.58). */
  referrals?: Record<string, string>;
}

/** The next number of a counter of the site (orders: 1, 2, 3…), safe under concurrent checkouts. */
async function next(tx: PluginTransaction, siteId: string, name: string): Promise<number> {
  const [row] = await tx
    .insert(counters)
    .values({ siteId, name, value: 1 })
    .onConflictDoUpdate({
      target: [counters.siteId, counters.name],
      set: { value: sql`${counters.value} + 1` },
    })
    .returning({ value: counters.value });
  return row!.value;
}

/**
 * Takes a line's quantity from the stock it counts on (the variation's or the
 * product's), refusing it when there is not enough and backorders are not
 * allowed. The row is locked by the update: two checkouts cannot both take
 * the last piece.
 */
async function takeStock(
  tx: PluginTransaction,
  line: CartLine,
): Promise<{ from: number; to: number } | null> {
  if (!line.manageStock) return null;
  const status = (stock: number, backorders: 'no' | 'notify' | 'yes') =>
    stockStatusOf({ manageStock: true, stock, backorders, stockStatus: 'instock' });
  let row: { stock: number | null; backorders: 'no' | 'notify' | 'yes' } | undefined;
  // The stock of the product's versions in other languages moves with it.
  if (line.variationId) {
    const rows = await tx
      .update(variations)
      .set({ stock: sql`${variations.stock} - ${line.quantity}` })
      .where(
        and(
          sameVariationGroup(line.variationId),
          eq(variations.manageStock, true),
          sql`(${variations.backorders} <> 'no' OR ${variations.stock} >= ${line.quantity})`,
        ),
      )
      .returning({ id: variations.id, stock: variations.stock, backorders: variations.backorders });
    row = rows.find((r) => r.id === line.variationId);
    if (row)
      await tx
        .update(variations)
        .set({ stockStatus: status(row.stock ?? 0, row.backorders) })
        .where(sameVariationGroup(line.variationId));
  } else {
    const rows = await tx
      .update(products)
      .set({ stock: sql`${products.stock} - ${line.quantity}` })
      .where(
        and(
          sameProductGroup(line.productId),
          eq(products.manageStock, true),
          sql`(${products.backorders} <> 'no' OR ${products.stock} >= ${line.quantity})`,
        ),
      )
      .returning({ id: products.entryId, stock: products.stock, backorders: products.backorders });
    row = rows.find((r) => r.id === line.productId);
    if (row)
      await tx
        .update(products)
        .set({ stockStatus: status(row.stock ?? 0, row.backorders) })
        .where(sameProductGroup(line.productId));
  }
  if (!row) throw new StockError(line.title);
  const to = row.stock ?? 0;
  return { from: to + line.quantity, to };
}

/** Places an order: number, lines, stock taken, sales counted, a note of what changed. */
export async function placeOrder(
  tx: PluginTransaction,
  siteId: string,
  order: NewOrder,
): Promise<OrderRow> {
  const changes: string[] = [];
  const reduced = new Map<string, number>();
  for (const line of order.lines) {
    const taken = await takeStock(tx, line);
    if (taken) {
      reduced.set(line.key, line.quantity);
      changes.push(`${line.title}${line.sku ? ` (${line.sku})` : ''} ${taken.from}→${taken.to}`);
    }
    await tx
      .update(products)
      .set({ totalSales: sql`${products.totalSales} + ${line.quantity}` })
      .where(sameProductGroup(line.productId));
  }

  const { totals } = order;
  const [row] = await tx
    .insert(orders)
    .values({
      siteId,
      number: await next(tx, siteId, 'order'),
      key: `order_${randomBytes(12).toString('base64url')}`,
      status: order.status,
      locale: order.locale,
      currency: order.currency,
      pricesIncludeTax: order.pricesIncludeTax,
      subtotal: decimal(totals.subtotalNet),
      discountTotal: decimal(totals.discountNet),
      shippingTotal: decimal(totals.shippingNet),
      shippingTax: decimal(totals.shippingTax),
      feeTotal: decimal(totals.fees.reduce((sum, f) => sum + f.net, 0)),
      taxTotal: decimal(totals.taxTotal),
      total: decimal(totals.total),
      taxes: totals.taxes.map((t) => ({ rate: t.rate, amount: decimal(t.amount) })),
      paymentMethod: order.payment.method,
      paymentTitle: order.payment.title,
      shippingMethod: order.shippingRate?.title ?? '',
      shippingRate: order.shippingRate?.id ?? '',
      coupons: order.coupons.map((c) => ({ code: c.code, discount: decimal(c.discount) })),
      customerId: order.customerId,
      email: order.email,
      billing: order.billing,
      shipping: order.shipping,
      invoice: order.invoice,
      customerNote: order.customerNote,
      ip: order.ip,
      userAgent: order.userAgent.slice(0, 500),
      referrals: order.referrals ?? {},
      stockReduced: reduced.size > 0,
    })
    .returning();
  const placed = row!;

  const items: (typeof orderItems.$inferInsert)[] = order.lines.map((line, position) => {
    const computed = totals.lines.find((l) => l.key === line.key)!;
    return {
      siteId,
      orderId: placed.id,
      position,
      kind: 'product',
      productId: line.productId,
      variationId: line.variationId,
      name: line.title,
      sku: line.sku,
      attributes: line.attributes,
      quantity: line.quantity,
      subtotal: decimal(computed.subtotalNet),
      subtotalTax: decimal(computed.subtotalGross - computed.subtotalNet),
      total: decimal(computed.net),
      tax: decimal(computed.tax),
      taxRate: String(computed.rate),
      stockReduced: reduced.get(line.key) ?? 0,
    };
  });
  if (totals.shippingNet > 0 || order.lines.some((l) => !l.virtual)) {
    items.push({
      siteId,
      orderId: placed.id,
      position: items.length,
      kind: 'shipping',
      productId: null,
      variationId: null,
      name: order.shippingRate?.title || 'Shipping',
      sku: '',
      attributes: [],
      quantity: 1,
      subtotal: decimal(totals.shippingNet),
      total: decimal(totals.shippingNet),
      tax: decimal(totals.shippingTax),
      taxRate: '0',
      stockReduced: 0,
    });
  }
  for (const fee of totals.fees) {
    items.push({
      siteId,
      orderId: placed.id,
      position: items.length,
      kind: 'fee',
      productId: null,
      variationId: null,
      name: fee.name,
      sku: '',
      attributes: [],
      quantity: 1,
      subtotal: decimal(fee.net),
      total: decimal(fee.net),
      tax: decimal(fee.tax),
      taxRate: '0',
      stockReduced: 0,
    });
  }
  await tx.insert(orderItems).values(items);
  for (const coupon of order.coupons) {
    // Counted in the same update that checks the limit: two checkouts cannot both take the last use.
    const [counted] = await tx
      .update(coupons)
      .set({ usageCount: sql`${coupons.usageCount} + 1` })
      .where(
        and(
          eq(coupons.id, coupon.id),
          sql`(${coupons.usageLimit} IS NULL OR ${coupons.usageCount} < ${coupons.usageLimit})`,
        ),
      )
      .returning({ id: coupons.id });
    if (!counted) throw new CouponError(coupon.code);
    await tx.insert(couponUses).values({
      siteId,
      couponId: coupon.id,
      orderId: placed.id,
      email: order.email.toLowerCase(),
      userId: order.customerId,
    });
  }
  if (changes.length > 0) {
    await tx
      .insert(orderNotes)
      .values({ siteId, orderId: placed.id, note: `Stock reduced: ${changes.join(', ')}` });
  }
  return placed;
}

export async function orderByNumber(tx: PluginTransaction, number: number) {
  const [order] = await tx.select().from(orders).where(eq(orders.number, number));
  if (!order) return null;
  const items = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(orderItems.position);
  return { order, items };
}
