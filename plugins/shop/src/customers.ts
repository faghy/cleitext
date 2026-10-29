import type { PluginTransaction } from '@cleitext/plugin-sdk';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { COUNTED_STATUSES, select } from './analytics';

/**
 * Shop → Customers (WooCommerce's customers report): people with an account
 * and guests, one row per email address. Orders, spending and the average
 * order count the orders the reports count, less refunds; the last order is
 * the latest of any status; name and place come from the latest address.
 */

export const CUSTOMER_SORTS = [
  'name',
  'email',
  'lastOrder',
  'orders',
  'spent',
  'aov',
  'country',
  'city',
  'registeredAt',
] as const;

export const customerListSchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: z.enum(['registered', 'guest']).optional(),
  country: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  /** Only those with at least this many orders (1: who bought something). */
  minOrders: z.coerce.number().int().min(0).max(100_000).optional(),
  sort: z.enum(CUSTOMER_SORTS).default('lastOrder'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(10).max(10_000).default(50),
});
export type CustomerListQuery = z.output<typeof customerListSchema>;

export interface CustomerListItem {
  email: string;
  name: string;
  /** The account, when there is one. */
  userId: string | null;
  registered: boolean;
  /** When the account joined the shop (its first order for older accounts). */
  registeredAt: string | null;
  lastOrder: string | null;
  orders: number;
  spent: number;
  aov: number;
  country: string;
  city: string;
}

const COUNTED = sql.raw(`(${COUNTED_STATUSES.map((s) => `'${s}'`).join(', ')})`);

const SORT_SQL: Record<(typeof CUSTOMER_SORTS)[number], string> = {
  name: 'lower(name)',
  email: 'email',
  lastOrder: 'last_order',
  orders: 'orders',
  spent: 'spent',
  aov: 'aov',
  country: 'country',
  city: 'lower(city)',
  registeredAt: 'registered_at',
};

/** Customers merged by email, with their numbers, as a subquery named `people`. */
const PEOPLE = sql`people AS (
  SELECT m.*, CASE WHEN m.orders > 0 THEN round(m.spent / m.orders, 2) ELSE 0 END AS aov
  FROM (
    SELECT coalesce(s.email, lower(c.email)) AS email,
      coalesce(c.user_id, s.user_id) AS user_id,
      (c.user_id IS NOT NULL OR s.user_id IS NOT NULL) AS registered,
      coalesce(c.created_at, s.first_account_order) AS registered_at,
      s.last_order,
      coalesce(s.orders, 0) AS orders,
      coalesce(s.spent, 0) AS spent,
      trim(coalesce(coalesce(s.billing, c.billing)->>'firstName', '') || ' ' ||
        coalesce(coalesce(s.billing, c.billing)->>'lastName', '')) AS full_name,
      coalesce(coalesce(s.billing, c.billing)->>'company', '') AS company,
      coalesce(coalesce(s.billing, c.billing)->>'country', '') AS country,
      coalesce(coalesce(s.billing, c.billing)->>'city', '') AS city
    FROM (
      SELECT lower(o.email) AS email,
        (array_agg(o.customer_id ORDER BY o.created_at DESC) FILTER (WHERE o.customer_id IS NOT NULL))[1] AS user_id,
        min(o.created_at) FILTER (WHERE o.customer_id IS NOT NULL) AS first_account_order,
        max(o.created_at) AS last_order,
        count(*) FILTER (WHERE o.status IN ${COUNTED}) AS orders,
        sum(o.total - (SELECT coalesce(sum(r.amount), 0) FROM refunds r
          WHERE r.site_id = o.site_id AND r.order_id = o.id)) FILTER (WHERE o.status IN ${COUNTED}) AS spent,
        (array_agg(o.billing ORDER BY o.created_at DESC))[1] AS billing
      FROM orders o WHERE o.status <> 'draft' AND o.email <> ''
      GROUP BY 1
    ) s
    FULL JOIN (
      SELECT DISTINCT ON (lower(email)) * FROM customers WHERE email <> ''
      ORDER BY lower(email), updated_at DESC
    ) c ON lower(c.email) = s.email
  ) m
), named AS (
  SELECT people.*, CASE WHEN full_name <> '' THEN full_name ELSE company END AS name FROM people
)`;

function filters(query: CustomerListQuery): SQL {
  const parts: SQL[] = [sql`true`];
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    parts.push(sql`(email ILIKE ${like} OR name ILIKE ${like} OR city ILIKE ${like})`);
  }
  if (query.kind) parts.push(sql`registered = ${query.kind === 'registered'}`);
  if (query.country) parts.push(sql`country = ${query.country}`);
  if (query.minOrders !== undefined) parts.push(sql`orders >= ${query.minOrders}`);
  return sql.join(parts, sql` AND `);
}

export async function listCustomers(
  tx: PluginTransaction,
  query: CustomerListQuery,
): Promise<{ items: CustomerListItem[]; total: number; countries: string[] }> {
  const order = sql.raw(
    `${SORT_SQL[query.sort]} ${query.order === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, email ASC`,
  );
  const where = filters(query);
  const rows = await select<Record<string, unknown>>(
    tx,
    sql`WITH ${PEOPLE} SELECT * FROM named WHERE ${where} ORDER BY ${order}
      LIMIT ${query.perPage} OFFSET ${(query.page - 1) * query.perPage}`,
  );
  const [counted] = await select<{ n: string }>(
    tx,
    sql`WITH ${PEOPLE} SELECT count(*) AS n FROM named WHERE ${where}`,
  );
  const countries = await select<{ country: string }>(
    tx,
    sql`WITH ${PEOPLE} SELECT DISTINCT country FROM named WHERE country <> '' ORDER BY country`,
  );
  const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
  return {
    items: rows.map((row) => ({
      email: String(row.email),
      name: String(row.name ?? ''),
      userId: row.user_id ? String(row.user_id) : null,
      registered: row.registered === true,
      registeredAt: row.registered === true ? iso(row.registered_at) : null,
      lastOrder: iso(row.last_order),
      orders: Number(row.orders ?? 0),
      spent: Number(row.spent ?? 0),
      aov: Number(row.aov ?? 0),
      country: String(row.country ?? ''),
      city: String(row.city ?? ''),
    })),
    total: Number(counted?.n ?? 0),
    countries: countries.map((c) => c.country),
  };
}
