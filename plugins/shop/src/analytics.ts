import type { PluginTransaction } from '@cleitext/plugin-sdk';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  DATE_RE,
  daysBetween,
  defaultInterval,
  intervalsOf,
  presetRange,
  PRESETS,
  previousRange,
  todayIn,
  type Compare,
  type DateRange,
  type Interval,
} from './analytics-dates';

/**
 * The shop's reports (WooCommerce's Analytics): revenue, orders, products,
 * variations, categories, coupons, taxes and stock, summed in SQL by day,
 * week or month of the site's time zone.
 *
 * As WooCommerce counts them: orders processing, completed and on hold
 * (refunded ones too, since their refunds take them back to zero), never
 * pending, failed or cancelled ones; an order counts on the day it was paid
 * (the day it was placed while unpaid), a refund on its own day. Refunds are
 * amounts, so they are split as the order was: goods, taxes and shipping.
 */

export const COUNTED_STATUSES = ['processing', 'completed', 'on-hold', 'refunded'] as const;
const COUNTED = sql.raw(`(${COUNTED_STATUSES.map((s) => `'${s}'`).join(', ')})`);
/** The day an order counts on. */
const ORDER_AT = sql.raw('coalesce(o.paid_at, o.created_at)');
/** A refund's share of an order's amount (none for free orders). */
const share = (column: string) =>
  sql.raw(`(CASE WHEN o.total > 0 THEN r.amount * ${column} / o.total ELSE 0 END)`);

/**
 * A report's range: a preset (`month`, `last_quarter`…, worked out on the
 * site's calendar) or `custom` days, the interval and what it is compared with.
 */
export const reportQuerySchema = z
  .object({
    period: z.enum([...PRESETS, 'custom']).default('month'),
    after: z.string().regex(DATE_RE).optional(),
    before: z.string().regex(DATE_RE).optional(),
    interval: z.enum(['day', 'week', 'month']).optional(),
    compare: z.enum(['previous_period', 'previous_year', 'none']).default('previous_year'),
  })
  .refine((q) => q.period !== 'custom' || (q.after && q.before && q.after <= q.before), {
    message: 'Give the first and the last day.',
  })
  .refine((q) => q.period !== 'custom' || daysBetween(q.after!, q.before!) <= 3660, {
    message: 'At most ten years.',
  });
export type ReportQuery = z.output<typeof reportQuerySchema>;

/** Where the numbers are looked up: the time zone, the range and its intervals. */
export interface Scope {
  timezone: string;
  range: DateRange;
  interval: Interval;
}

export function scopesOf(
  query: ReportQuery,
  timezone: string,
  now = new Date(),
): { current: Scope; previous: Scope | null } {
  const range =
    query.period === 'custom'
      ? { after: query.after!, before: query.before! }
      : presetRange(query.period, todayIn(timezone, now));
  const interval = query.interval ?? defaultInterval(range);
  return {
    current: { timezone, range, interval },
    previous:
      query.compare === 'none'
        ? null
        : { timezone, range: previousRange(range, query.compare as Compare), interval },
  };
}

/** Rows of a raw query, whichever driver gives them. */
export async function select<T>(tx: PluginTransaction, query: SQL): Promise<T[]> {
  const result = (await tx.execute(query)) as unknown;
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

const lower = (scope: Scope) =>
  sql`((${scope.range.after}::date)::timestamp AT TIME ZONE ${scope.timezone})`;
const upper = (scope: Scope) =>
  sql`((${scope.range.before}::date + 1)::timestamp AT TIME ZONE ${scope.timezone})`;
const inScope = (column: SQL, scope: Scope) =>
  sql`${column} >= ${lower(scope)} AND ${column} < ${upper(scope)}`;
const bucket = (column: SQL, scope: Scope) =>
  sql`to_char(date_trunc(${scope.interval}, ${column} AT TIME ZONE ${scope.timezone}), 'YYYY-MM-DD')`;

const num = (value: unknown) => Number(value ?? 0) || 0;
const money = (value: number) => Math.round(value * 100) / 100;

// ---- Revenue and orders -------------------------------------------------------------

/** The numbers of the revenue, orders and taxes reports, for a range or an interval. */
export interface Stats {
  orders: number;
  /** Products and fees before coupons, without taxes and shipping. */
  gross: number;
  /** Refunded, without the refund's taxes and shipping. */
  returns: number;
  coupons: number;
  /** Gross − returns − coupons. */
  net: number;
  taxes: number;
  /** Taxes on products and fees (taxes − shipping taxes). */
  orderTax: number;
  shippingTax: number;
  shipping: number;
  /** What customers paid and kept paid: net + taxes + shipping. */
  total: number;
  /** Products sold, less those put back in stock by refunds. */
  items: number;
  /** Orders with a coupon. */
  discounted: number;
  /** Orders with taxes. */
  taxed: number;
  /** Net sales per order. */
  aov: number;
  avgItems: number;
}
export type StatKey = keyof Stats;

export interface Series<T> {
  totals: T;
  intervals: { date: string; values: T }[];
}

const EMPTY_STATS: Stats = {
  orders: 0,
  gross: 0,
  returns: 0,
  coupons: 0,
  net: 0,
  taxes: 0,
  orderTax: 0,
  shippingTax: 0,
  shipping: 0,
  total: 0,
  items: 0,
  discounted: 0,
  taxed: 0,
  aov: 0,
  avgItems: 0,
};

/** Adds up rows of the stats query into the numbers shown. */
function statsOf(rows: Record<string, unknown>[]): Stats {
  const sum = (key: string) => rows.reduce((total, row) => total + num(row[key]), 0);
  const orders = sum('orders');
  const gross = money(sum('gross'));
  const returns = money(sum('returns'));
  const coupons = money(sum('coupons'));
  const net = money(gross - returns - coupons);
  const taxes = money(sum('taxes'));
  const shippingTax = money(sum('shipping_tax'));
  const items = sum('items');
  return {
    orders,
    gross,
    returns,
    coupons,
    net,
    taxes,
    orderTax: money(taxes - shippingTax),
    shippingTax,
    shipping: money(sum('shipping')),
    total: money(sum('total')),
    items,
    discounted: sum('discounted'),
    taxed: sum('taxed'),
    aov: orders ? money(net / orders) : 0,
    avgItems: orders ? Math.round((items / orders) * 100) / 100 : 0,
  };
}

/** Fills the intervals of a range, empty where nothing happened. */
function fill<T>(scope: Scope, found: Map<string, T>, empty: T): { date: string; values: T }[] {
  return intervalsOf(scope.range, scope.interval).map((date) => ({
    date,
    values: found.get(date) ?? empty,
  }));
}

export async function revenueStats(tx: PluginTransaction, scope: Scope): Promise<Series<Stats>> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH moves AS (
      SELECT ${ORDER_AT} AS at, 1 AS orders,
        o.subtotal + o.fee_total AS gross, o.discount_total AS coupons, 0::numeric AS returns,
        o.tax_total AS taxes, o.shipping_tax AS shipping_tax, o.shipping_total AS shipping,
        o.total AS total,
        (SELECT coalesce(sum(i.quantity), 0) FROM order_items i
          WHERE i.site_id = o.site_id AND i.order_id = o.id AND i.kind = 'product') AS items,
        CASE WHEN jsonb_array_length(o.coupons) > 0 THEN 1 ELSE 0 END AS discounted,
        CASE WHEN o.tax_total > 0 THEN 1 ELSE 0 END AS taxed
      FROM orders o
      WHERE o.status IN ${COUNTED} AND ${inScope(ORDER_AT, scope)}
      UNION ALL
      SELECT r.created_at, 0, 0, 0,
        ${share('(o.total - o.tax_total - o.shipping_total)')},
        -${share('o.tax_total')}, -${share('o.shipping_tax')},
        -${share('(o.shipping_total)')}, -r.amount,
        -(SELECT coalesce(sum((x->>'quantity')::int), 0) FROM jsonb_array_elements(r.restocked) x),
        0, 0
      FROM refunds r JOIN orders o ON o.site_id = r.site_id AND o.id = r.order_id
      WHERE o.status IN ${COUNTED} AND ${inScope(sql`r.created_at`, scope)}
    )
    SELECT ${bucket(sql`at`, scope)} AS date, sum(orders) AS orders, sum(gross) AS gross,
      sum(coupons) AS coupons, sum(returns) AS returns, sum(taxes) AS taxes,
      sum(shipping_tax) AS shipping_tax, sum(shipping) AS shipping, sum(total) AS total,
      sum(items) AS items, sum(discounted) AS discounted, sum(taxed) AS taxed
    FROM moves GROUP BY 1`,
  );
  const byDate = new Map(rows.map((row) => [String(row.date), statsOf([row])]));
  return { totals: statsOf(rows), intervals: fill(scope, byDate, EMPTY_STATS) };
}

export interface OrderReportRow {
  id: string;
  number: number;
  status: string;
  date: string;
  customer: string;
  email: string;
  /** First order of this customer (by email) among the counted ones. */
  newCustomer: boolean;
  products: string;
  items: number;
  coupons: string;
  /** Without taxes and shipping, less refunds. */
  net: number;
}

/** The orders of a range, newest first (at most 1000). */
export async function orderRows(tx: PluginTransaction, scope: Scope): Promise<OrderReportRow[]> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`SELECT o.id, o.number, o.status, ${ORDER_AT} AS at, o.email,
      trim(coalesce(o.billing->>'firstName', '') || ' ' || coalesce(o.billing->>'lastName', '')) AS name,
      o.billing->>'company' AS company,
      NOT EXISTS (SELECT 1 FROM orders e WHERE e.site_id = o.site_id AND lower(e.email) = lower(o.email)
        AND e.status IN ${COUNTED} AND coalesce(e.paid_at, e.created_at) < ${ORDER_AT}) AS new_customer,
      (SELECT string_agg(i.name, ', ' ORDER BY i.position) FROM order_items i
        WHERE i.site_id = o.site_id AND i.order_id = o.id AND i.kind = 'product') AS products,
      (SELECT coalesce(sum(i.quantity), 0) FROM order_items i
        WHERE i.site_id = o.site_id AND i.order_id = o.id AND i.kind = 'product') AS items,
      (SELECT string_agg(c->>'code', ', ') FROM jsonb_array_elements(o.coupons) c) AS coupons,
      o.total - o.tax_total - o.shipping_total
        - (SELECT coalesce(sum(${share('(o.total - o.tax_total - o.shipping_total)')}), 0)
            FROM refunds r WHERE r.site_id = o.site_id AND r.order_id = o.id) AS net
    FROM orders o
    WHERE o.status IN ${COUNTED} AND ${inScope(ORDER_AT, scope)}
    ORDER BY at DESC LIMIT 1000`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    number: num(row.number),
    status: String(row.status),
    date: new Date(row.at as string).toISOString(),
    customer: String(row.name || row.company || ''),
    email: String(row.email),
    newCustomer: row.new_customer === true,
    products: String(row.products ?? ''),
    items: num(row.items),
    coupons: String(row.coupons ?? ''),
    net: money(num(row.net)),
  }));
}

// ---- Products, variations, categories -------------------------------------------------

/**
 * What was sold, line by line: products in the order's language count as
 * their group (the product first translated), refunds take back their share
 * of each line and the quantities they put back in stock.
 */
function soldLines(scope: Scope): SQL {
  return sql`lines AS (
    SELECT coalesce(p.group_id, i.product_id) AS product,
      CASE WHEN i.variation_id IS NULL THEN NULL ELSE coalesce(v.group_id, i.variation_id) END AS variation,
      i.order_id, i.name, i.sku, i.attributes, ${ORDER_AT} AS at, true AS sale,
      i.quantity AS qty, i.total AS net
    FROM order_items i
    JOIN orders o ON o.site_id = i.site_id AND o.id = i.order_id
    LEFT JOIN products p ON p.site_id = i.site_id AND p.entry_id = i.product_id
    LEFT JOIN variations v ON v.site_id = i.site_id AND v.id = i.variation_id
    WHERE i.kind = 'product' AND i.product_id IS NOT NULL AND o.status IN ${COUNTED}
      AND ${inScope(ORDER_AT, scope)}
    UNION ALL
    SELECT coalesce(p.group_id, i.product_id),
      CASE WHEN i.variation_id IS NULL THEN NULL ELSE coalesce(v.group_id, i.variation_id) END,
      i.order_id, i.name, i.sku, i.attributes, r.created_at, false,
      -(SELECT coalesce(sum((x->>'quantity')::int), 0) FROM jsonb_array_elements(r.restocked) x
        WHERE x->>'item' = i.id::text),
      -${share('i.total')}
    FROM refunds r
    JOIN orders o ON o.site_id = r.site_id AND o.id = r.order_id
    JOIN order_items i ON i.site_id = o.site_id AND i.order_id = o.id AND i.kind = 'product'
    LEFT JOIN products p ON p.site_id = i.site_id AND p.entry_id = i.product_id
    LEFT JOIN variations v ON v.site_id = i.site_id AND v.id = i.variation_id
    WHERE i.product_id IS NOT NULL AND o.status IN ${COUNTED} AND ${inScope(sql`r.created_at`, scope)}
  )`;
}

export interface SoldStats {
  items: number;
  net: number;
  orders: number;
}
const EMPTY_SOLD: SoldStats = { items: 0, net: 0, orders: 0 };
const soldOf = (row: Record<string, unknown>): SoldStats => ({
  items: num(row.items),
  net: money(num(row.net)),
  orders: num(row.orders),
});

/** Items sold, net sales and orders by interval, of the products (or variations, or a category). */
export async function soldStats(
  tx: PluginTransaction,
  scope: Scope,
  only: 'products' | 'variations' = 'products',
): Promise<Series<SoldStats>> {
  const where = only === 'variations' ? sql`WHERE variation IS NOT NULL` : sql``;
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${soldLines(scope)}
    SELECT ${bucket(sql`at`, scope)} AS date, sum(qty) AS items, sum(net) AS net,
      count(DISTINCT CASE WHEN sale THEN order_id END) AS orders
    FROM lines ${where} GROUP BY 1`,
  );
  const [totals] = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${soldLines(scope)}
    SELECT sum(qty) AS items, sum(net) AS net, count(DISTINCT CASE WHEN sale THEN order_id END) AS orders
    FROM lines ${where}`,
  );
  const byDate = new Map(rows.map((row) => [String(row.date), soldOf(row)]));
  return { totals: soldOf(totals ?? {}), intervals: fill(scope, byDate, EMPTY_SOLD) };
}

export interface ProductReportRow extends SoldStats {
  id: string;
  name: string;
  sku: string;
  categoryIds: string[];
  /** Null when the shop does not count it. */
  stock: number | null;
  stockStatus: string;
  variations: number;
}

export async function productRows(
  tx: PluginTransaction,
  scope: Scope,
  limit = 1000,
): Promise<ProductReportRow[]> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${soldLines(scope)}, sold AS (
      SELECT product, sum(qty) AS items, sum(net) AS net,
        count(DISTINCT CASE WHEN sale THEN order_id END) AS orders, max(name) AS name, max(sku) AS sku
      FROM lines GROUP BY product
    )
    SELECT s.product AS id, coalesce(nullif(p.title, ''), s.name) AS name,
      coalesce(nullif(p.sku, ''), s.sku) AS sku, coalesce(p.category_ids, '{}') AS category_ids,
      CASE WHEN p.manage_stock THEN p.stock END AS stock, coalesce(p.stock_status, '') AS stock_status,
      (SELECT count(*) FROM variations v WHERE v.site_id = p.site_id AND v.product_id = p.entry_id) AS variations,
      s.items, s.net, s.orders
    FROM sold s LEFT JOIN products p ON p.entry_id = s.product
    ORDER BY s.items DESC, s.net DESC LIMIT ${limit}`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    sku: String(row.sku ?? ''),
    categoryIds: (row.category_ids as string[] | null) ?? [],
    stock: row.stock === null || row.stock === undefined ? null : num(row.stock),
    stockStatus: String(row.stock_status ?? ''),
    variations: num(row.variations),
    ...soldOf(row),
  }));
}

export interface VariationReportRow extends SoldStats {
  id: string;
  productId: string;
  name: string;
  attributes: string;
  sku: string;
  stock: number | null;
  stockStatus: string;
}

export async function variationRows(
  tx: PluginTransaction,
  scope: Scope,
): Promise<VariationReportRow[]> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${soldLines(scope)}, sold AS (
      SELECT variation, max(product::text) AS product, sum(qty) AS items, sum(net) AS net,
        count(DISTINCT CASE WHEN sale THEN order_id END) AS orders, max(name) AS name,
        max(sku) AS sku, (array_agg(attributes ORDER BY at DESC))[1] AS attributes
      FROM lines WHERE variation IS NOT NULL GROUP BY variation
    )
    SELECT s.variation AS id, s.product AS product_id, coalesce(nullif(p.title, ''), s.name) AS name,
      (SELECT string_agg(a->>'value', ', ') FROM jsonb_array_elements(s.attributes) a) AS attributes,
      coalesce(nullif(v.sku, ''), s.sku) AS sku,
      CASE WHEN v.manage_stock THEN v.stock END AS stock, coalesce(v.stock_status, '') AS stock_status,
      s.items, s.net, s.orders
    FROM sold s
    LEFT JOIN variations v ON v.id = s.variation
    LEFT JOIN products p ON p.entry_id = s.product::uuid
    ORDER BY s.items DESC, s.net DESC LIMIT 1000`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    productId: String(row.product_id),
    name: String(row.name ?? ''),
    attributes: String(row.attributes ?? ''),
    sku: String(row.sku ?? ''),
    stock: row.stock === null || row.stock === undefined ? null : num(row.stock),
    stockStatus: String(row.stock_status ?? ''),
    ...soldOf(row),
  }));
}

export interface CategoryReportRow extends SoldStats {
  id: string;
  products: number;
}

/** Sales by the categories of the products (of the product first translated). */
export async function categoryRows(
  tx: PluginTransaction,
  scope: Scope,
): Promise<CategoryReportRow[]> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${soldLines(scope)}
    SELECT c.id, sum(l.qty) AS items, sum(l.net) AS net,
      count(DISTINCT CASE WHEN l.sale THEN l.order_id END) AS orders,
      count(DISTINCT l.product) AS products
    FROM lines l
    JOIN products p ON p.entry_id = l.product
    CROSS JOIN LATERAL unnest(p.category_ids) AS c(id)
    GROUP BY c.id ORDER BY net DESC LIMIT 1000`,
  );
  return rows.map((row) => ({ id: String(row.id), products: num(row.products), ...soldOf(row) }));
}

// ---- Coupons and taxes ---------------------------------------------------------------------

export interface CouponStats {
  /** Orders with a coupon. */
  orders: number;
  amount: number;
}
const EMPTY_COUPONS: CouponStats = { orders: 0, amount: 0 };

function couponUses(scope: Scope): SQL {
  return sql`uses AS (
    SELECT ${ORDER_AT} AS at, o.id AS order_id, lower(c->>'code') AS code, c->>'code' AS label,
      coalesce((c->>'discount')::numeric, 0) AS amount
    FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.coupons) c
    WHERE o.status IN ${COUNTED} AND ${inScope(ORDER_AT, scope)}
  )`;
}

export async function couponStats(
  tx: PluginTransaction,
  scope: Scope,
): Promise<Series<CouponStats>> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${couponUses(scope)}
    SELECT ${bucket(sql`at`, scope)} AS date, count(DISTINCT order_id) AS orders, sum(amount) AS amount
    FROM uses GROUP BY 1`,
  );
  const [totals] = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${couponUses(scope)} SELECT count(DISTINCT order_id) AS orders, sum(amount) AS amount FROM uses`,
  );
  const of = (row: Record<string, unknown>) => ({
    orders: num(row.orders),
    amount: money(num(row.amount)),
  });
  const byDate = new Map(rows.map((row) => [String(row.date), of(row)]));
  return { totals: of(totals ?? {}), intervals: fill(scope, byDate, EMPTY_COUPONS) };
}

export interface CouponReportRow {
  code: string;
  orders: number;
  amount: number;
  /** The coupon in Shop → Coupons, when it still exists. */
  id: string | null;
  kind: string;
  createdAt: string | null;
  expiresAt: string | null;
}

export async function couponRows(tx: PluginTransaction, scope: Scope): Promise<CouponReportRow[]> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${couponUses(scope)}, used AS (
      SELECT code, max(label) AS label, count(DISTINCT order_id) AS orders, sum(amount) AS amount
      FROM uses GROUP BY code
    )
    SELECT coalesce(c.code, u.label) AS code, u.orders, u.amount, c.id, c.kind, c.created_at, c.expires_at
    FROM used u LEFT JOIN coupons c ON lower(c.code) = u.code
    ORDER BY u.orders DESC, u.amount DESC LIMIT 1000`,
  );
  const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
  return rows.map((row) => ({
    code: String(row.code),
    orders: num(row.orders),
    amount: money(num(row.amount)),
    id: row.id ? String(row.id) : null,
    kind: String(row.kind ?? ''),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
  }));
}

export interface TaxReportRow {
  rate: number;
  /** Names of the shop's rates with this percentage. */
  name: string;
  tax: number;
  orders: number;
}

/** Taxes by rate, less the refunds' share. */
export async function taxRows(tx: PluginTransaction, scope: Scope): Promise<TaxReportRow[]> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH taxes AS (
      SELECT (x->>'rate')::numeric AS rate, (x->>'amount')::numeric AS amount, o.id AS order_id, true AS sale
      FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.taxes) x
      WHERE o.status IN ${COUNTED} AND ${inScope(ORDER_AT, scope)}
      UNION ALL
      SELECT (x->>'rate')::numeric, -${share("(x->>'amount')::numeric")}, o.id, false
      FROM refunds r JOIN orders o ON o.site_id = r.site_id AND o.id = r.order_id
      CROSS JOIN LATERAL jsonb_array_elements(o.taxes) x
      WHERE o.status IN ${COUNTED} AND ${inScope(sql`r.created_at`, scope)}
    )
    SELECT t.rate, sum(t.amount) AS tax, count(DISTINCT CASE WHEN t.sale THEN t.order_id END) AS orders,
      (SELECT string_agg(DISTINCT nullif(tr.name, ''), ', ') FROM tax_rates tr WHERE tr.rate = t.rate) AS name
    FROM taxes t GROUP BY t.rate ORDER BY t.rate DESC`,
  );
  return rows.map((row) => ({
    rate: num(row.rate),
    name: String(row.name ?? ''),
    tax: money(num(row.tax)),
    orders: num(row.orders),
  }));
}

// ---- Stock -----------------------------------------------------------------------------------

export type StockKind = 'instock' | 'lowstock' | 'outofstock' | 'onbackorder';
export interface StockRow {
  id: string;
  /** The product, for links (the variation's product for a variation). */
  productId: string;
  kind: 'product' | 'variation';
  name: string;
  sku: string;
  status: StockKind;
  /** Null when the shop does not count it. */
  stock: number | null;
}

/**
 * Simple products and variations (one per translation group, never in the
 * trash), with their stock: "low" when counted, above zero and at most the
 * product's threshold (the shop's when it has none).
 */
export async function stockRows(tx: PluginTransaction, lowStock: number): Promise<StockRow[]> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`SELECT * FROM (
      SELECT p.entry_id AS id, p.entry_id AS product_id, 'product' AS kind, p.title AS name, p.sku,
        p.manage_stock, p.stock, p.stock_status, coalesce(p.low_stock, ${lowStock}) AS low
      FROM products p
      WHERE p.kind = 'simple' AND p.status <> 'trashed'
        AND (p.group_id IS NULL OR p.group_id = p.entry_id)
      UNION ALL
      SELECT v.id, p.entry_id, 'variation',
        p.title || coalesce(' – ' || (SELECT string_agg(value, ', ') FROM jsonb_each_text(v.attributes)), ''),
        v.sku, v.manage_stock, v.stock, v.stock_status, coalesce(p.low_stock, ${lowStock})
      FROM variations v JOIN products p ON p.site_id = v.site_id AND p.entry_id = v.product_id
      WHERE p.kind = 'variable' AND p.status <> 'trashed'
        AND (p.group_id IS NULL OR p.group_id = p.entry_id)
        AND (v.group_id IS NULL OR v.group_id = v.id)
    ) s ORDER BY (CASE WHEN manage_stock THEN stock END) ASC NULLS LAST, name LIMIT 5000`,
  );
  return rows.map((row) => {
    const counted = row.manage_stock === true;
    const stock = counted ? num(row.stock) : null;
    const status = String(row.stock_status);
    return {
      id: String(row.id),
      productId: String(row.product_id),
      kind: row.kind === 'variation' ? 'variation' : 'product',
      name: String(row.name ?? ''),
      sku: String(row.sku ?? ''),
      status:
        status === 'outofstock'
          ? 'outofstock'
          : status === 'onbackorder'
            ? 'onbackorder'
            : stock !== null && stock > 0 && stock <= num(row.low)
              ? 'lowstock'
              : 'instock',
      stock,
    };
  });
}

// ---- Customers of a range (leaderboard) ---------------------------------------------------

export interface TopCustomer {
  email: string;
  name: string;
  orders: number;
  /** Paid, less refunds. */
  spent: number;
}

export async function topCustomers(
  tx: PluginTransaction,
  scope: Scope,
  limit = 5,
): Promise<TopCustomer[]> {
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`SELECT lower(o.email) AS email,
      (array_agg(trim(coalesce(o.billing->>'firstName', '') || ' ' || coalesce(o.billing->>'lastName', ''))
        ORDER BY o.created_at DESC))[1] AS name,
      count(*) AS orders,
      sum(o.total - (SELECT coalesce(sum(r.amount), 0) FROM refunds r
        WHERE r.site_id = o.site_id AND r.order_id = o.id)) AS spent
    FROM orders o
    WHERE o.status IN ${COUNTED} AND ${inScope(ORDER_AT, scope)}
    GROUP BY 1 ORDER BY spent DESC LIMIT ${limit}`,
  );
  return rows.map((row) => ({
    email: String(row.email),
    name: String(row.name ?? ''),
    orders: num(row.orders),
    spent: money(num(row.spent)),
  }));
}
