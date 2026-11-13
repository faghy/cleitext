/**
 * Cleishop's `shop` service (plugin API 1.73): what Cleishop's add-ons call,
 * e.g. the WooCommerce import (customers and orders), invoices (an order),
 * a wishlist (products). Each function takes the site id first.
 *
 * Imported orders are written as they were: no email, no stock movement, no
 * payment; one already imported (same `ref`) is left as it is.
 */
import { randomBytes } from 'node:crypto';
import type { PluginContext, PluginTransaction } from '@cleitext/plugin-sdk';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Address, Invoice } from './address';
import { orderDetail, type OrderDetail } from './order-admin';
import {
  counters,
  customers,
  orderItems,
  orderNotes,
  orders,
  products,
  refunds,
  type OrderStatus,
} from './schema';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'on-hold',
  'processing',
  'completed',
  'cancelled',
  'refunded',
  'failed',
];

const EMPTY: Address = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  postcode: '',
  province: '',
  country: '',
  phone: '',
};

/** An address with only the known keys, as text (a missing one is empty). */
export function cleanAddress(raw: unknown): Address {
  const value = (raw ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as (keyof Address)[]) {
    const v = value[key];
    out[key] = typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 300) : '';
  }
  return out;
}

const money = (value: unknown): string => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};
const date = (value: unknown): Date | null => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const text = (value: unknown, max = 500) =>
  typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, max) : '';

/** A line of an imported order: a product (linked when it still exists), shipping or a fee. */
export interface ImportedItem {
  kind?: 'product' | 'shipping' | 'fee';
  name: string;
  sku?: string;
  /** The Cleishop product it is, when known (see `productsBy`). */
  productId?: string | null;
  quantity?: number;
  subtotal?: string | number;
  subtotalTax?: string | number;
  total?: string | number;
  tax?: string | number;
  attributes?: { name: string; value: string }[];
}

/** An order of another shop, as `importOrder` takes it. */
export interface ImportedOrder {
  /** Its reference there, e.g. `wc:1234`: an order with the same one is not imported again. */
  ref: string;
  /** The number customers know; the next free one when missing or taken. */
  number?: number;
  status: OrderStatus;
  currency: string;
  locale?: string;
  pricesIncludeTax?: boolean;
  email: string;
  /** The Cleitext user of the customer's account; null for a guest. */
  customerUserId?: string | null;
  billing?: Partial<Address>;
  shipping?: Partial<Address>;
  invoice?: Invoice | null;
  paymentMethod?: string;
  paymentTitle?: string;
  transactionId?: string;
  shippingMethod?: string;
  customerNote?: string;
  coupons?: { code: string; discount: string | number }[];
  taxes?: { rate: number; amount: string | number; label?: string }[];
  totals: {
    subtotal?: string | number;
    discount?: string | number;
    shipping?: string | number;
    shippingTax?: string | number;
    fees?: string | number;
    tax?: string | number;
    total: string | number;
  };
  items: ImportedItem[];
  notes?: { note: string; customer?: boolean; author?: string; createdAt?: string }[];
  refunds?: { amount: string | number; reason?: string; createdAt?: string }[];
  createdAt: string;
  paidAt?: string | null;
  completedAt?: string | null;
  /** Data kept as they were (payment ids, tax details, invoice numbers…). */
  meta?: Record<string, unknown>;
}

export interface ShopService {
  [name: string]: (siteId: string, ...args: never[]) => unknown;
  /** The shop's currency and whether prices include tax. */
  settings(siteId: string): Promise<{ currency: string; pricesIncludeTax: boolean }>;
  /** Saves the addresses of a customer's account (no email is sent). */
  saveCustomer(
    siteId: string,
    customer: {
      userId: string;
      email: string;
      billing?: Partial<Address> | null;
      shipping?: Partial<Address> | null;
      invoice?: Invoice | null;
    },
  ): Promise<{ created: boolean }>;
  /** Cleishop products (their entry ids) by SKU, for linking imported lines. */
  productsBy(siteId: string, keys: { skus?: string[] }): Promise<{ id: string; sku: string }[]>;
  /** Imports an order as it was; one with the same ref is left as it is. */
  importOrder(siteId: string, order: ImportedOrder): Promise<{ id: string; created: boolean }>;
  /** The id of an order imported with a ref, or null. */
  orderByRef(siteId: string, ref: string): Promise<string | null>;
  /** An order with its lines, notes and refunds. */
  order(siteId: string, id: string): Promise<OrderDetail | null>;
}

export function provideShopService(
  ctx: PluginContext,
  currency: (siteId: string) => Promise<{ currency: string; pricesIncludeTax: boolean }>,
): void {
  const tx = <T>(siteId: string, fn: (t: PluginTransaction) => Promise<T>) =>
    ctx.db.transaction<T>(siteId, fn);

  const service: ShopService = {
    settings: (siteId) => currency(siteId),

    async saveCustomer(siteId, customer) {
      if (!/^[0-9a-f-]{36}$/i.test(customer.userId)) throw new Error('Invalid user id.');
      return tx(siteId, async (t) => {
        const [existing] = await t
          .select({ userId: customers.userId })
          .from(customers)
          .where(eq(customers.userId, customer.userId));
        const values = {
          email: text(customer.email, 320).toLowerCase(),
          billing: customer.billing ? cleanAddress(customer.billing) : null,
          shipping: customer.shipping ? cleanAddress(customer.shipping) : null,
          ...(customer.invoice !== undefined ? { invoice: customer.invoice } : {}),
          updatedAt: new Date(),
        };
        if (existing) {
          await t.update(customers).set(values).where(eq(customers.userId, customer.userId));
          return { created: false };
        }
        await t.insert(customers).values({ siteId, userId: customer.userId, ...values });
        return { created: true };
      });
    },

    async productsBy(siteId, keys) {
      const skus = [...new Set((keys.skus ?? []).map((k) => text(k, 100)).filter(Boolean))].slice(
        0,
        5000,
      );
      if (!skus.length) return [];
      const rows = await tx(siteId, (t) =>
        t
          .select({ id: products.entryId, sku: products.sku })
          .from(products)
          .where(inArray(products.sku, skus)),
      );
      return rows.map((r) => ({ id: r.id, sku: r.sku }));
    },

    async orderByRef(siteId, ref) {
      const [row] = await tx(siteId, (t) =>
        t
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.externalRef, text(ref, 200))),
      );
      return row?.id ?? null;
    },

    async importOrder(siteId, input) {
      const ref = text(input.ref, 200);
      if (!ref) throw new Error('An imported order needs its ref.');
      if (!ORDER_STATUSES.includes(input.status))
        throw new Error(`Unknown status ${input.status}.`);
      const created = date(input.createdAt);
      if (!created) throw new Error(`${ref}: no date.`);
      return tx(siteId, async (t) => {
        const [already] = await t
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.externalRef, ref));
        if (already) return { id: already.id, created: false };
        // The number customers know, when free; otherwise the next one.
        let number = Number.isInteger(input.number) && input.number! > 0 ? input.number! : 0;
        if (number) {
          const [taken] = await t
            .select({ id: orders.id })
            .from(orders)
            .where(eq(orders.number, number));
          if (taken) number = 0;
        }
        if (!number) {
          const [row] = await t
            .select({ n: sql<number>`coalesce(max(${orders.number}), 0)::bigint` })
            .from(orders);
          number = Number(row?.n ?? 0) + 1;
        }
        const totals = input.totals;
        const [order] = await t
          .insert(orders)
          .values({
            siteId,
            number,
            key: `order_${randomBytes(12).toString('base64url')}`,
            status: input.status,
            locale: text(input.locale, 10) || 'en',
            currency: text(input.currency, 3).toUpperCase() || 'EUR',
            pricesIncludeTax: Boolean(input.pricesIncludeTax),
            subtotal: money(totals.subtotal),
            discountTotal: money(totals.discount),
            shippingTotal: money(totals.shipping),
            shippingTax: money(totals.shippingTax),
            feeTotal: money(totals.fees),
            taxTotal: money(totals.tax),
            total: money(totals.total),
            taxes: (input.taxes ?? []).map((x) => ({
              rate: Number(x.rate) || 0,
              amount: money(x.amount),
            })),
            paymentMethod: text(input.paymentMethod, 100),
            paymentTitle: text(input.paymentTitle, 200),
            transactionId: text(input.transactionId, 200),
            shippingMethod: text(input.shippingMethod, 200),
            coupons: (input.coupons ?? []).map((c) => ({
              code: text(c.code, 100),
              discount: money(c.discount),
            })),
            customerId: input.customerUserId ?? null,
            email: text(input.email, 320).toLowerCase(),
            billing: cleanAddress(input.billing),
            shipping: cleanAddress(input.shipping),
            invoice: input.invoice ?? null,
            customerNote: text(input.customerNote, 5000),
            // Imported as it was: its stock was moved by the old shop.
            stockReduced: true,
            externalRef: ref,
            meta: input.meta ?? {},
            paidAt: date(input.paidAt),
            completedAt: date(input.completedAt),
            createdAt: created,
            updatedAt: created,
          })
          .returning({ id: orders.id });
        const id = order!.id;
        if (input.items.length) {
          await t.insert(orderItems).values(
            input.items.map((item, position) => ({
              siteId,
              orderId: id,
              position,
              kind: item.kind ?? 'product',
              productId: item.productId ?? null,
              name: text(item.name, 300) || '—',
              sku: text(item.sku, 100),
              attributes: (item.attributes ?? []).map((a) => ({
                name: text(a.name, 100),
                value: text(a.value, 300),
              })),
              quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
              subtotal: money(item.subtotal ?? item.total),
              subtotalTax: money(item.subtotalTax ?? item.tax),
              total: money(item.total),
              tax: money(item.tax),
            })),
          );
        }
        if (input.notes?.length) {
          await t.insert(orderNotes).values(
            input.notes.map((n) => ({
              siteId,
              orderId: id,
              note: text(n.note, 5000),
              customer: Boolean(n.customer),
              author: text(n.author, 200),
              createdAt: date(n.createdAt) ?? created,
            })),
          );
        }
        if (input.refunds?.length) {
          await t.insert(refunds).values(
            input.refunds.map((r) => ({
              siteId,
              orderId: id,
              amount: money(Math.abs(Number(r.amount))),
              reason: text(r.reason, 1000),
              author: 'import',
              createdAt: date(r.createdAt) ?? created,
            })),
          );
        }
        // New orders continue after the highest number.
        await t
          .insert(counters)
          .values({ siteId, name: 'order', value: number })
          .onConflictDoUpdate({
            target: [counters.siteId, counters.name],
            set: { value: sql`greatest(${counters.value}, ${number})` },
          });
        return { id, created: true };
      });
    },

    async order(siteId, id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      return tx(siteId, (t) => orderDetail(t, id));
    },
  };

  ctx.services?.provide('shop', service);
}
