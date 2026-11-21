/**
 * A push notification of the official app for each new order (Cleishop
 * 1.24.0, plugin API 1.78): to the people with `manage_shop` who chose
 * "orders" in the app. Missing on older cores.
 */
import { adminUrl, type PluginContext, type PushNotification } from '@cleitext/plugin-sdk';
import type { OrderDetail } from './order-admin';

/** The amount as people read it: `71,98 €` in Italian, `€71.98` in English. */
export function money(amount: string, currency: string, locale: string): string {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** "Nuovo ordine n. 12 — 71,98 €" / "Ada Rossi · 2 products". */
export function orderNotification(detail: OrderDetail): PushNotification {
  const { order, items } = detail;
  const name = [order.billing.firstName, order.billing.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  const who = name || order.email;
  const count = items.reduce((n, item) => n + item.quantity, 0);
  return {
    event: 'shop.order',
    id: order.id,
    title: {
      en: `New order #${order.number} — ${money(order.total, order.currency, 'en-US')}`,
      it: `Nuovo ordine n. ${order.number} — ${money(order.total, order.currency, 'it-IT')}`,
    },
    body: {
      en: `${who} · ${count} ${count === 1 ? 'product' : 'products'}`,
      it: `${who} · ${count} ${count === 1 ? 'prodotto' : 'prodotti'}`,
    },
    adminPath: adminUrl(`/ext/shop/orders?order=${order.id}`),
  };
}

/** Never throws, never waits. */
export function pushNewOrder(ctx: PluginContext, siteId: string, detail: OrderDetail): void {
  try {
    ctx.push?.notify(siteId, orderNotification(detail));
  } catch (error) {
    ctx.log.warn(`Push notification not sent: ${String(error)}`);
  }
}
