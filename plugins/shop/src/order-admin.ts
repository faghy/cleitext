import type { PluginTransaction } from '@cleitext/plugin-sdk';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { stockStatusOf } from './pricing';
import {
  orderItems,
  orderNotes,
  orders,
  products,
  refunds,
  variations,
  type OrderItemRow,
  type OrderNoteRow,
  type OrderRow,
  type OrderStatus,
  type RefundRow,
} from './schema';

/**
 * The orders screen: lists, the order with its history, and what a shop
 * manager does with it — statuses (with the stock that goes with them),
 * notes, refunds.
 */

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'processing',
  'on-hold',
  'completed',
  'cancelled',
  'refunded',
  'failed',
];

/** Statuses whose order holds its products (the stock stays taken). */
const HOLDING: OrderStatus[] = ['processing', 'on-hold', 'completed'];
/** Statuses that give the stock back (WooCommerce's rule). */
const RELEASING: OrderStatus[] = ['cancelled', 'failed', 'pending'];

export const orderListSchema = z.object({
  status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(10).max(200).default(50),
});

export interface OrderListItem {
  id: string;
  number: number;
  status: OrderStatus;
  total: string;
  currency: string;
  email: string;
  name: string;
  city: string;
  paymentTitle: string;
  items: number;
  createdAt: string;
}

export async function listOrders(
  tx: PluginTransaction,
  query: z.output<typeof orderListSchema>,
): Promise<{ items: OrderListItem[]; total: number; statuses: Record<string, number> }> {
  const like = query.q ? `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const search: SQL | undefined = query.q
    ? or(
        /^\d+$/.test(query.q) ? eq(orders.number, Number(query.q)) : undefined,
        ilike(orders.email, like!),
        sql`(${orders.billing}->>'firstName') || ' ' || (${orders.billing}->>'lastName') ILIKE ${like}`,
        sql`${orders.billing}->>'company' ILIKE ${like}`,
      )
    : undefined;
  const where = and(search, query.status ? eq(orders.status, query.status) : undefined);
  const rows = await tx
    .select({
      order: orders,
      items: sql<number>`(SELECT coalesce(sum(i.quantity), 0)::int FROM order_items i
        WHERE i.site_id = orders.site_id AND i.order_id = orders.id AND i.kind = 'product')`,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.number))
    .limit(query.perPage)
    .offset((query.page - 1) * query.perPage);
  const [counted] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);
  const statusRows = await tx
    .select({ status: orders.status, n: sql<number>`count(*)::int` })
    .from(orders)
    .where(search)
    .groupBy(orders.status);
  return {
    items: rows.map(({ order, items }) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      total: order.total,
      currency: order.currency,
      email: order.email,
      name: `${order.billing.firstName} ${order.billing.lastName}`.trim() || order.billing.company,
      city: order.billing.city,
      paymentTitle: order.paymentTitle,
      items,
      createdAt: order.createdAt.toISOString(),
    })),
    total: counted?.n ?? 0,
    statuses: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
  };
}

export interface OrderDetail {
  order: OrderRow;
  items: OrderItemRow[];
  notes: OrderNoteRow[];
  refunds: RefundRow[];
  /** Already refunded, and what can still be. */
  refunded: string;
  refundable: string;
}

export async function orderDetail(tx: PluginTransaction, id: string): Promise<OrderDetail | null> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, id));
  if (!order) return null;
  const items = await tx
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id))
    .orderBy(asc(orderItems.position));
  const notes = await tx
    .select()
    .from(orderNotes)
    .where(eq(orderNotes.orderId, id))
    .orderBy(desc(orderNotes.createdAt));
  const refundRows = await tx
    .select()
    .from(refunds)
    .where(eq(refunds.orderId, id))
    .orderBy(desc(refunds.createdAt));
  const refundedCents = refundRows.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);
  const totalCents = Math.round(Number(order.total) * 100);
  return {
    order,
    items,
    notes,
    refunds: refundRows,
    refunded: (refundedCents / 100).toFixed(2),
    refundable: (Math.max(0, totalCents - refundedCents) / 100).toFixed(2),
  };
}

export class OrderError extends Error {}

/** Puts a quantity back in (or takes it from) the stock of an item's product or variation. */
async function moveStock(
  tx: PluginTransaction,
  item: OrderItemRow,
  delta: number,
): Promise<{ name: string; from: number; to: number } | null> {
  if (!item.productId || delta === 0) return null;
  const status = (stock: number, backorders: 'no' | 'notify' | 'yes') =>
    stockStatusOf({ manageStock: true, stock, backorders, stockStatus: 'instock' });
  if (item.variationId) {
    const [row] = await tx
      .update(variations)
      .set({ stock: sql`${variations.stock} + ${delta}` })
      .where(and(eq(variations.id, item.variationId), eq(variations.manageStock, true)))
      .returning({ stock: variations.stock, backorders: variations.backorders });
    if (!row) return null;
    await tx
      .update(variations)
      .set({ stockStatus: status(row.stock ?? 0, row.backorders) })
      .where(eq(variations.id, item.variationId));
    return { name: item.name, from: (row.stock ?? 0) - delta, to: row.stock ?? 0 };
  }
  const [row] = await tx
    .update(products)
    .set({ stock: sql`${products.stock} + ${delta}` })
    .where(and(eq(products.entryId, item.productId), eq(products.manageStock, true)))
    .returning({ stock: products.stock, backorders: products.backorders });
  if (!row) return null;
  await tx
    .update(products)
    .set({ stockStatus: status(row.stock ?? 0, row.backorders) })
    .where(eq(products.entryId, item.productId));
  return { name: item.name, from: (row.stock ?? 0) - delta, to: row.stock ?? 0 };
}

export async function note(
  tx: PluginTransaction,
  siteId: string,
  orderId: string,
  text: string,
  author: string,
  customer = false,
) {
  await tx.insert(orderNotes).values({ siteId, orderId, note: text, author, customer });
}

/**
 * Changes the status of an order. Cancelled, failed and pending orders give
 * their stock back; processing, on-hold and completed ones take it again
 * when it was given back. Returns the previous status and the products whose
 * stock changed (their pages refresh).
 */
export async function changeStatus(
  tx: PluginTransaction,
  siteId: string,
  id: string,
  to: OrderStatus,
  author: string,
): Promise<{ from: OrderStatus; productIds: string[] }> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, id));
  if (!order) throw new OrderError('This order does not exist.');
  const from = order.status;
  if (from === to) return { from, productIds: [] };
  const items = await tx
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, id), eq(orderItems.kind, 'product')));
  const changes: string[] = [];
  const productIds: string[] = [];
  let stockReduced = order.stockReduced;

  if (RELEASING.includes(to) && order.stockReduced) {
    for (const item of items.filter((i) => i.stockReduced > 0)) {
      const moved = await moveStock(tx, item, item.stockReduced);
      if (moved) changes.push(`${moved.name} ${moved.from}→${moved.to}`);
      await tx.update(orderItems).set({ stockReduced: 0 }).where(eq(orderItems.id, item.id));
      if (item.productId) productIds.push(item.productId);
    }
    stockReduced = false;
    if (changes.length)
      await note(tx, siteId, id, `Stock given back: ${changes.join(', ')}`, author);
  } else if (HOLDING.includes(to) && !order.stockReduced) {
    for (const item of items) {
      const moved = await moveStock(tx, item, -item.quantity);
      if (moved) {
        changes.push(`${moved.name} ${moved.from}→${moved.to}`);
        await tx
          .update(orderItems)
          .set({ stockReduced: item.quantity })
          .where(eq(orderItems.id, item.id));
      }
      if (item.productId) productIds.push(item.productId);
    }
    stockReduced = true;
    if (changes.length) await note(tx, siteId, id, `Stock reduced: ${changes.join(', ')}`, author);
  }

  const now = new Date();
  await tx
    .update(orders)
    .set({
      status: to,
      stockReduced,
      updatedAt: now,
      ...((to === 'processing' || to === 'completed') && !order.paidAt ? { paidAt: now } : {}),
      ...(to === 'completed' ? { completedAt: now } : {}),
    })
    .where(eq(orders.id, id));
  await note(tx, siteId, id, `Status changed from ${from} to ${to}.`, author);
  return { from, productIds };
}

export async function addNote(
  tx: PluginTransaction,
  siteId: string,
  id: string,
  text: string,
  customer: boolean,
  author: string,
): Promise<void> {
  const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, id));
  if (!order) throw new OrderError('This order does not exist.');
  await note(tx, siteId, id, text, author, customer);
}

export const refundSchema = z.object({
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => Number(String(v).replace(',', '.')))
    .pipe(z.number().positive().max(1_000_000_000)),
  reason: z.string().trim().max(500).default(''),
  /** Quantities to put back in stock, by order item. */
  restock: z
    .array(z.object({ item: z.uuid(), quantity: z.number().int().min(1).max(1_000_000) }))
    .max(500)
    .default([]),
  /** Online orders: give the money back through Stripe or PayPal too (default), or only record it. */
  gateway: z.boolean().default(true),
});

/**
 * A refund (full or partial): the money is given back by the shop manager
 * (bank transfer) or the payment provider; the order records it, puts the
 * chosen quantities back in stock and, once all is refunded, becomes refunded.
 */
export async function refund(
  tx: PluginTransaction,
  siteId: string,
  id: string,
  input: z.output<typeof refundSchema>,
  author: string,
  /** Gives the money back through the order's provider (online payments); its refund id. */
  gateway?: (order: OrderRow, amount: string) => Promise<string | null>,
): Promise<{ full: boolean; amount: string; productIds: string[] }> {
  const detail = await orderDetail(tx, id);
  if (!detail) throw new OrderError('This order does not exist.');
  const cents = Math.round(input.amount * 100);
  if (cents > Math.round(Number(detail.refundable) * 100))
    throw new OrderError(`At most ${detail.refundable} can still be refunded.`);
  const restocked: { item: string; quantity: number }[] = [];
  const changes: string[] = [];
  const productIds: string[] = [];
  for (const wanted of input.restock) {
    const item = detail.items.find((i) => i.id === wanted.item && i.kind === 'product');
    if (!item) throw new OrderError('An item to put back in stock is not in this order.');
    const quantity = Math.min(wanted.quantity, item.stockReduced);
    if (quantity <= 0) continue;
    const moved = await moveStock(tx, item, quantity);
    if (moved) changes.push(`${moved.name} ${moved.from}→${moved.to}`);
    await tx
      .update(orderItems)
      .set({ stockReduced: item.stockReduced - quantity })
      .where(eq(orderItems.id, item.id));
    restocked.push({ item: item.id, quantity });
    if (item.productId) productIds.push(item.productId);
  }
  const amount = (cents / 100).toFixed(2);
  // Last, inside the transaction: if the provider refuses, nothing is recorded.
  const gatewayRef = gateway ? ((await gateway(detail.order, amount)) ?? '') : '';
  await tx
    .insert(refunds)
    .values({ siteId, orderId: id, amount, reason: input.reason, restocked, author, gatewayRef });
  if (gatewayRef)
    await note(
      tx,
      siteId,
      id,
      `Money given back through the payment provider (${gatewayRef}).`,
      author,
    );
  await note(
    tx,
    siteId,
    id,
    `Refunded ${amount} ${detail.order.currency}${input.reason ? `: ${input.reason}` : ''}.${changes.length ? ` Back in stock: ${changes.join(', ')}.` : ''}`,
    author,
  );
  const full = cents === Math.round(Number(detail.refundable) * 100);
  if (full) {
    await tx
      .update(orders)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(orders.id, id));
    await note(tx, siteId, id, `Status changed from ${detail.order.status} to refunded.`, author);
  }
  return { full, amount, productIds };
}
