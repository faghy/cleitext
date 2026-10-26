import type { ConversionInput, PluginContext } from '@cleitext/plugin-sdk';
import { orderDetail, type OrderDetail } from './order-admin';
import type { OrderStatus } from './schema';

/**
 * Orders as paid conversions (plugin API 1.58), for affiliate programs and
 * reports: an order is announced when it becomes paid (processing or
 * completed: a payment confirmed, a bank transfer marked as received, cash
 * on delivery placed), with the referral codes the customer came with; a
 * paid order cancelled, failed or refunded, and every refund, is announced
 * as a reversal. On cores without `ctx.conversions` nothing happens.
 */

const PAID: OrderStatus[] = ['processing', 'completed'];
const REVERSED: OrderStatus[] = ['cancelled', 'refunded', 'failed'];

/** An order that has just been paid. */
export const becomesPaid = (from: OrderStatus | null, to: OrderStatus) =>
  PAID.includes(to) && (from === null || !PAID.includes(from));

/** A paid order taken back: cancelled, failed or refunded. */
export const becomesReversed = (from: OrderStatus, to: OrderStatus) =>
  PAID.includes(from) && REVERSED.includes(to);

/** The conversion of an order: its total, and its products (net) as items. */
export function orderConversion(detail: OrderDetail): ConversionInput {
  const { order, items } = detail;
  return {
    kind: 'order',
    id: order.id,
    amount: String(order.total),
    currency: order.currency,
    customer: { email: order.email, userId: order.customerId },
    items: items
      .filter((i) => i.kind === 'product')
      .map((i) => ({
        id: i.variationId ?? i.productId ?? i.id,
        name: i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name,
        amount: String(i.total),
      })),
    label: `#${order.number}`,
    at: (order.paidAt ?? new Date()).toISOString(),
    referrals: order.referrals ?? {},
  };
}

export function conversions(ctx: PluginContext) {
  const load = (siteId: string, orderId: string) =>
    ctx.db.transaction(siteId, (tx) => orderDetail(tx, orderId));

  return {
    /** After a status change (or a new order, `from` null). */
    async changed(
      siteId: string,
      orderId: string,
      from: OrderStatus | null,
      to: OrderStatus,
    ): Promise<void> {
      if (!ctx.conversions) return;
      if (becomesPaid(from, to)) {
        const detail = await load(siteId, orderId);
        if (detail) ctx.conversions.paid(siteId, orderConversion(detail));
      } else if (from && becomesReversed(from, to)) {
        ctx.conversions.reversed(siteId, {
          id: orderId,
          reason: to === 'refunded' ? 'refund' : 'cancel',
        });
      }
    },
    /** A refund, full or partial, of a paid order. */
    refunded(siteId: string, orderId: string, amount: string): void {
      ctx.conversions?.reversed(siteId, { id: orderId, amount, reason: 'refund' });
    },
  };
}
