import type { PluginContext, PluginTransaction, RouteRequest } from '@cleitext/plugin-sdk';
import { count, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  categoryRows,
  couponRows,
  couponStats,
  orderRows,
  productRows,
  reportQuerySchema,
  revenueStats,
  scopesOf,
  soldStats,
  stockRows,
  taxRows,
  topCustomers,
  variationRows,
  type Scope,
  type Series,
} from './analytics';
import { addDays, presetRange, previousRange, todayIn, type DateRange } from './analytics-dates';
import { customerListSchema, listCustomers } from './customers';
import { PAYMENT_IDS } from './payments';
import { REVIEW } from './reviews';
import { loadPayments, TAXES_STORAGE, taxSettingsSchema } from './rules-routes';
import { orders, products, shippingMethods, taxRates } from './schema';
import { CATEGORY } from './sync';

/**
 * The shop's home, its reports and its customers: `/ext/shop/home`,
 * `/ext/shop/analytics/<report>` and `/ext/shop/customers`, for shop managers.
 */

/** Storage keys: a test email went out; the "Get started" list was hidden. */
const EMAIL_TESTED = 'email-tested';
const CHECKLIST_HIDDEN = 'home-checklist-hidden';

export interface ReportSettings {
  currency: string;
  lowStock: number;
  notifyEmails: string[];
}

/** A report: its range, the one compared with, numbers by interval and table rows. */
export interface Report<T, R = never> {
  range: DateRange;
  previousRange: DateRange | null;
  interval: Scope['interval'];
  currency: string;
  current: Series<T>;
  previous: Series<T> | null;
  rows: R[];
}

const problem = (status: number, detail: string, errors: unknown[] = []) => ({
  status,
  body: {
    title: status === 404 ? 'Not Found' : 'Bad Request',
    status,
    detail,
    ...(errors.length ? { errors } : {}),
  },
});

export function registerReportRoutes(
  ctx: PluginContext,
  capability: string,
  settings: (siteId: string) => Promise<ReportSettings>,
): void {
  const api = (
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    handler: (request: RouteRequest) => Promise<{ status?: number; body?: unknown }>,
  ) =>
    ctx.routes.api({
      method,
      path,
      capability,
      handler: async (request) => {
        try {
          return await handler(request);
        } catch (error) {
          if (error instanceof z.ZodError)
            return problem(
              400,
              'Some values are not valid.',
              error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            );
          throw error;
        }
      },
    });
  const timezone = async (siteId: string) => (await ctx.site(siteId)).timezone ?? 'UTC';

  /** A dated report: the same numbers for the range and the one compared with. */
  const report = <T, R>(
    path: string,
    stats: (tx: PluginTransaction, scope: Scope) => Promise<Series<T>>,
    rows: (tx: PluginTransaction, scope: Scope, request: RouteRequest) => Promise<R[]>,
  ) =>
    api('GET', `/analytics/${path}`, async (request) => {
      const query = reportQuerySchema.parse(request.query);
      const [zone, values] = await Promise.all([
        timezone(request.siteId),
        settings(request.siteId),
      ]);
      const { current, previous } = scopesOf(query, zone);
      const body = await ctx.db.transaction(request.siteId, async (tx) => ({
        range: current.range,
        previousRange: previous?.range ?? null,
        interval: current.interval,
        currency: values.currency,
        current: await stats(tx, current),
        previous: previous ? await stats(tx, previous) : null,
        rows: await rows(tx, current, request),
      }));
      return { body };
    });

  // The table of the revenue report is its intervals.
  report('revenue', revenueStats, async () => []);
  report('orders', revenueStats, orderRows);
  report(
    'products',
    (tx, scope) => soldStats(tx, scope),
    (tx, scope) => productRows(tx, scope),
  );
  report('variations', (tx, scope) => soldStats(tx, scope, 'variations'), variationRows);
  report(
    'categories',
    (tx, scope) => soldStats(tx, scope),
    async (tx, scope, request) => {
      const rows = await categoryRows(tx, scope);
      const terms = rows.length
        ? await ctx.terms.find(request.siteId, {
            taxonomy: CATEGORY,
            ids: rows.slice(0, 500).map((r) => r.id),
            limit: 500,
          })
        : [];
      const name = new Map(terms.map((t) => [t.id, t.name]));
      return rows.map((row) => ({ ...row, name: name.get(row.id) ?? '' }));
    },
  );
  report('coupons', couponStats, couponRows);
  report('taxes', revenueStats, taxRows);

  /** The overview: every number of the range, and the best sellers. */
  report('overview', revenueStats, async (tx, scope, request) => {
    const [top, categories, coupons, customers] = await Promise.all([
      productRows(tx, scope, 5),
      categoryRows(tx, scope),
      couponRows(tx, scope),
      topCustomers(tx, scope),
    ]);
    const best = categories.slice(0, 5);
    const terms = best.length
      ? await ctx.terms.find(request.siteId, {
          taxonomy: CATEGORY,
          ids: best.map((c) => c.id),
          limit: 5,
        })
      : [];
    const name = new Map(terms.map((t) => [t.id, t.name]));
    return [
      {
        products: top,
        categories: best.map((c) => ({ ...c, name: name.get(c.id) ?? '' })),
        coupons: coupons.slice(0, 5),
        customers,
      },
    ];
  });

  /** Stock has no dates: every product and variation, by how much is left. */
  api('GET', '/analytics/stock', async (request) => {
    const values = await settings(request.siteId);
    const rows = await ctx.db.transaction(request.siteId, (tx) => stockRows(tx, values.lowStock));
    const counts = { instock: 0, lowstock: 0, outofstock: 0, onbackorder: 0 };
    for (const row of rows) counts[row.status]++;
    return { body: { counts, rows } };
  });

  api('GET', '/customers', async (request) => {
    const query = customerListSchema.parse(request.query);
    const [values, list] = await Promise.all([
      settings(request.siteId),
      ctx.db.transaction(request.siteId, (tx) => listCustomers(tx, query)),
    ]);
    return { body: { ...list, currency: values.currency } };
  });

  /** The home of the shop: today, this week and this month; what needs doing; first steps. */
  api('GET', '/home', async (request) => {
    const site = request.siteId;
    const [zone, values, payments, taxSettings, tested, hidden, pendingReviews] = await Promise.all(
      [
        timezone(site),
        settings(site),
        loadPayments(ctx, site),
        ctx.storage.get(site, TAXES_STORAGE),
        ctx.storage.get(site, EMAIL_TESTED),
        ctx.storage.get(site, CHECKLIST_HIDDEN),
        ctx.comments.find(site, { type: REVIEW, status: 'pending', limit: 100 }),
      ],
    );
    const today = todayIn(zone);
    const scope = (range: DateRange): Scope => ({ timezone: zone, range, interval: 'day' });
    const body = await ctx.db.transaction(site, async (tx) => {
      const period = async (range: DateRange) => {
        const now = await revenueStats(tx, scope(range));
        const before = await revenueStats(tx, scope(previousRange(range, 'previous_period')));
        return { current: now.totals, previous: before.totals };
      };
      const month = { after: addDays(today, -29), before: today };
      const fulfil = await tx
        .select({
          id: orders.id,
          number: orders.number,
          status: orders.status,
          total: orders.total,
          billing: orders.billing,
          email: orders.email,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(inArray(orders.status, ['processing', 'on-hold']))
        .orderBy(desc(orders.createdAt))
        .limit(5);
      const [toFulfil] = await tx
        .select({ n: count() })
        .from(orders)
        .where(inArray(orders.status, ['processing', 'on-hold']));
      const stock = await stockRows(tx, values.lowStock);
      const [productCount] = await tx
        .select({ n: count() })
        .from(products)
        .where(ne(products.status, 'trashed'));
      const [methodCount] = await tx
        .select({ n: count() })
        .from(shippingMethods)
        .where(eq(shippingMethods.enabled, true));
      const [rateCount] = await tx.select({ n: count() }).from(taxRates);
      return {
        today: await period(presetRange('today', today)),
        week: await period(presetRange('week', today)),
        month: await period(presetRange('month', today)),
        chart: {
          current: (await revenueStats(tx, scope(month))).intervals,
          previous: (await revenueStats(tx, scope(previousRange(month, 'previous_period'))))
            .intervals,
        },
        toFulfil: {
          count: toFulfil?.n ?? 0,
          latest: fulfil.map((o) => ({
            id: o.id,
            number: o.number,
            status: o.status,
            total: o.total,
            name:
              `${o.billing.firstName ?? ''} ${o.billing.lastName ?? ''}`.trim() ||
              o.billing.company ||
              o.email,
            createdAt: o.createdAt.toISOString(),
          })),
        },
        stock: {
          low: stock.filter((s) => s.status === 'lowstock'),
          out: stock.filter((s) => s.status === 'outofstock'),
        },
        checklist: {
          product: (productCount?.n ?? 0) > 0,
          payments: PAYMENT_IDS.some((id) => payments[id].enabled),
          shipping: (methodCount?.n ?? 0) > 0,
          taxes: taxSettingsSchema.parse(taxSettings ?? {}).enabled && (rateCount?.n ?? 0) > 0,
          email: Boolean(tested),
        },
      };
    });
    return {
      body: {
        ...body,
        stock: {
          low: body.stock.low.slice(0, 5),
          out: body.stock.out.slice(0, 5),
          lowCount: body.stock.low.length,
          outCount: body.stock.out.length,
        },
        reviewsPending: pendingReviews.length,
        checklistHidden: hidden === true,
        canTestEmail: values.notifyEmails.length > 0,
        currency: values.currency,
        date: today,
      },
    };
  });

  api('PUT', '/home/checklist', async (request) => {
    const input = z.object({ hidden: z.boolean() }).parse(request.body ?? {});
    await ctx.storage.set(request.siteId, CHECKLIST_HIDDEN, input.hidden);
    return { body: input };
  });

  /** A test email to the shop's addresses, to see that emails arrive. */
  api('POST', '/emails/test', async (request) => {
    const values = await settings(request.siteId);
    if (values.notifyEmails.length === 0)
      return problem(400, 'Set the emails for new orders in the Cleishop settings first.');
    const site = await ctx.site(request.siteId);
    // In the admin's language.
    const { locale } = z
      .object({ locale: z.string().max(20).default('en') })
      .parse(request.body ?? {});
    const italian = locale.startsWith('it');
    await ctx.mail.send({
      siteId: request.siteId,
      to: values.notifyEmails,
      subject: italian
        ? `${site.name}: email di prova del negozio`
        : `${site.name}: shop test email`,
      text: italian
        ? 'Le email del negozio arrivano: qui riceverai gli ordini nuovi, annullati e non riusciti.'
        : 'The shop’s emails arrive: new, cancelled and failed orders will come here.',
    });
    await ctx.storage.set(request.siteId, EMAIL_TESTED, new Date().toISOString());
    return { body: { to: values.notifyEmails } };
  });
}
