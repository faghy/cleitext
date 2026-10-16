import type { PluginContext, RouteRequest } from '@cleitext/plugin-sdk';
import { and, asc, desc, eq, ilike, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { couponInputSchema } from './coupons';
import { legacyPayments, paymentsSchema, PAYMENTS_STORAGE, type Payments } from './payments';
import { couponOf } from './quote';
import {
  couponUses,
  coupons,
  orders,
  products,
  shippingMethods,
  shippingZones,
  taxRates,
  type ShippingMethodRow,
} from './schema';
import { methodInputSchema, rateFor, zoneFor, zoneInputSchema } from './shipping';
import { ratesFor, taxRateInputSchema } from './taxes';

/**
 * The admin's API for the rules of the checkout: shipping zones and methods
 * (`/shipping`), tax rates (`/taxes`) and coupons (`/coupons`).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TAXES_STORAGE = 'taxes';
export const taxSettingsSchema = z.object({ enabled: z.boolean().default(false) });

const problem = (status: number, detail: string, errors: unknown[] = []) => ({
  status,
  body: {
    title: status === 404 ? 'Not Found' : 'Bad Request',
    status,
    detail,
    ...(errors.length ? { errors } : {}),
  },
});
const invalid = (error: z.ZodError) =>
  problem(
    400,
    'Some values are not valid.',
    error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );

const methodWithId = methodInputSchema.extend({ id: z.string().regex(UUID_RE).optional() });
const shippingSchema = z.object({
  zones: z
    .array(
      zoneInputSchema.extend({
        id: z.string().regex(UUID_RE).optional(),
        methods: z.array(methodWithId).max(30).default([]),
      }),
    )
    .max(200),
  /** Methods of "everywhere else". */
  rest: z.array(methodWithId).max(30).default([]),
});
export type ShippingInput = z.input<typeof shippingSchema>;

const taxesSchema = z.object({
  enabled: z.boolean(),
  rates: z.array(taxRateInputSchema).max(1000),
});

const previewSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  province: z.string().max(10).default(''),
  postcode: z.string().max(20).default(''),
  /** As entered, e.g. "49.90". */
  contents: z.coerce.number().min(0).default(0),
  weight: z.coerce.number().min(0).default(0),
  quantity: z.coerce.number().int().min(1).default(1),
});

const methodView = (m: ShippingMethodRow) => ({
  id: m.id,
  title: m.title,
  enabled: m.enabled,
  taxable: m.taxable,
  settings: m.settings,
});

/** The ways to pay, set up in Shop → Payments (or still the old settings). */
export async function loadPayments(ctx: PluginContext, siteId: string): Promise<Payments> {
  const raw = await ctx.storage.get(siteId, PAYMENTS_STORAGE);
  const stored = paymentsSchema.safeParse(raw);
  if (raw !== null && stored.success) {
    // Ways to pay added later come last, switched off.
    const order = [...new Set([...stored.data.order, ...paymentsSchema.parse({}).order])];
    return { ...stored.data, order };
  }
  // Before Shop → Payments they were settings; their values stay in the plugin's storage.
  const legacy: Record<string, unknown> = {};
  for (const key of LEGACY_KEYS) {
    const value = await ctx.storage.get(siteId, key);
    if (value !== null) legacy[key] = value;
  }
  return legacyPayments(legacy);
}

const LEGACY_KEYS = [
  'bankEnabled',
  'bankAccountName',
  'bankIban',
  'bankBic',
  'bankName',
  'bankInstructions',
  'codEnabled',
  'codFee',
  'codInstructions',
];

export function registerRulesRoutes(ctx: PluginContext, capability: string): void {
  const api = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    handler: (request: RouteRequest) => Promise<{ status?: number; body?: unknown }>,
  ) => ctx.routes.api({ method, path, capability, handler });

  // ---- Shipping ----------------------------------------------------------------------

  const loadShipping = (siteId: string) =>
    ctx.db.transaction(siteId, async (tx) => {
      const zones = await tx.select().from(shippingZones).orderBy(asc(shippingZones.position));
      const methods = await tx
        .select()
        .from(shippingMethods)
        .orderBy(asc(shippingMethods.position));
      const classes = await tx
        .selectDistinct({ name: products.shippingClass })
        .from(products)
        .where(ne(products.shippingClass, ''));
      return {
        zones: zones.map((z) => ({
          id: z.id,
          name: z.name,
          regions: z.regions,
          postcodes: z.postcodes,
          methods: methods.filter((m) => m.zoneId === z.id).map(methodView),
        })),
        rest: methods.filter((m) => m.zoneId === null).map(methodView),
        classes: classes.map((c) => c.name).sort(),
      };
    });

  api('GET', '/shipping', async (request) => ({ body: await loadShipping(request.siteId) }));

  api('PUT', '/shipping', async (request) => {
    const input = shippingSchema.safeParse(request.body);
    if (!input.success) return invalid(input.error);
    await ctx.db.transaction(request.siteId, async (tx) => {
      // Replaced as a whole, keeping the ids (a checkout open in a tab still finds its rate).
      await tx.delete(shippingMethods);
      await tx.delete(shippingZones);
      const methodRows = (zoneId: string | null, methods: z.output<typeof methodWithId>[]) =>
        methods.map((m, position) => ({
          siteId: request.siteId,
          ...(m.id ? { id: m.id } : {}),
          zoneId,
          position,
          title: m.title,
          enabled: m.enabled,
          taxable: m.taxable,
          settings: m.settings,
        }));
      for (const [position, zone] of input.data.zones.entries()) {
        const [row] = await tx
          .insert(shippingZones)
          .values({
            siteId: request.siteId,
            ...(zone.id ? { id: zone.id } : {}),
            name: zone.name,
            position,
            regions: zone.regions,
            postcodes: zone.postcodes,
          })
          .returning({ id: shippingZones.id });
        const rows = methodRows(row!.id, zone.methods);
        if (rows.length) await tx.insert(shippingMethods).values(rows);
      }
      const rest = methodRows(null, input.data.rest);
      if (rest.length) await tx.insert(shippingMethods).values(rest);
    });
    return { body: await loadShipping(request.siteId) };
  });

  /** Which zone and rates an address gets: the admin's tester. */
  api('POST', '/shipping/preview', async (request) => {
    const input = previewSchema.safeParse(request.body);
    if (!input.success) return invalid(input.error);
    const to = {
      country: input.data.country,
      province: input.data.province.toUpperCase(),
      postcode: input.data.postcode,
    };
    return {
      body: await ctx.db.transaction(request.siteId, async (tx) => {
        const zones = await tx.select().from(shippingZones).orderBy(asc(shippingZones.position));
        const zone = zoneFor(zones, to);
        const methods = (
          await tx.select().from(shippingMethods).orderBy(asc(shippingMethods.position))
        ).filter((m) => m.zoneId === (zone?.id ?? null));
        const pack = {
          contents: Math.round(input.data.contents * 100),
          quantity: input.data.quantity,
          weight: input.data.weight,
          classes: { '': input.data.quantity },
          freeShippingCoupon: false,
        };
        return {
          zone: zone ? { id: zone.id, name: zone.name } : null,
          rates: methods.flatMap((m) => rateFor(m.id, m, pack) ?? []),
        };
      }),
    };
  });

  // ---- Payments ----------------------------------------------------------------------

  api('GET', '/payments', async (request) => ({
    body: await loadPayments(ctx, request.siteId),
  }));

  api('PUT', '/payments', async (request) => {
    const input = paymentsSchema.safeParse(request.body);
    if (!input.success) return invalid(input.error);
    if (input.data.bacs.enabled && !input.data.bacs.accounts.some((a) => a.iban))
      return problem(400, 'Some values are not valid.', [
        { path: 'bacs.accounts', message: 'Add the account customers pay into.' },
      ]);
    await ctx.storage.set(request.siteId, PAYMENTS_STORAGE, input.data);
    return { body: await loadPayments(ctx, request.siteId) };
  });

  // ---- Taxes -------------------------------------------------------------------------

  const loadTaxes = async (siteId: string) => {
    const settings = taxSettingsSchema.parse((await ctx.storage.get(siteId, TAXES_STORAGE)) ?? {});
    const rows = await ctx.db.transaction(siteId, (tx) =>
      tx.select().from(taxRates).orderBy(asc(taxRates.position)),
    );
    return {
      enabled: settings.enabled,
      rates: rows.map((r) => ({
        country: r.country,
        province: r.province,
        taxClass: r.taxClass,
        rate: Number(r.rate),
        name: r.name,
      })),
    };
  };

  api('GET', '/taxes', async (request) => ({ body: await loadTaxes(request.siteId) }));

  api('PUT', '/taxes', async (request) => {
    const input = taxesSchema.safeParse(request.body);
    if (!input.success) return invalid(input.error);
    await ctx.db.transaction(request.siteId, async (tx) => {
      await tx.delete(taxRates);
      if (input.data.rates.length)
        await tx.insert(taxRates).values(
          input.data.rates.map((r, position) => ({
            siteId: request.siteId,
            country: r.country,
            province: r.province,
            taxClass: r.taxClass,
            rate: String(r.rate),
            name: r.name,
            position,
          })),
        );
    });
    await ctx.storage.set(request.siteId, TAXES_STORAGE, { enabled: input.data.enabled });
    return { body: await loadTaxes(request.siteId) };
  });

  /** The rates an address gets, by class. */
  api('POST', '/taxes/preview', async (request) => {
    const input = previewSchema.pick({ country: true, province: true }).safeParse(request.body);
    if (!input.success) return invalid(input.error);
    const taxes = await loadTaxes(request.siteId);
    return {
      body: {
        rates: ratesFor(
          taxes.rates.map((r) => taxRateInputSchema.parse(r)),
          input.data,
        ),
      },
    };
  });

  // ---- Coupons -----------------------------------------------------------------------

  const toRow = (input: z.output<typeof couponInputSchema>, enabled: boolean) => {
    const { code, kind, amount, expiresAt, usageLimit, ...settings } = input;
    return {
      code,
      kind,
      amount,
      enabled,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      usageLimit,
      settings,
      updatedAt: new Date(),
    };
  };
  const couponBody = z.object({ enabled: z.boolean().default(true) }).passthrough();

  api('GET', '/coupons', async (request) => {
    const q = (request.query.q ?? '').trim().toLowerCase().slice(0, 60);
    const rows = await ctx.db.transaction(request.siteId, (tx) =>
      tx
        .select()
        .from(coupons)
        .where(q ? ilike(coupons.code, `%${q.replace(/[%_\\]/g, '\\$&')}%`) : undefined)
        .orderBy(desc(coupons.createdAt))
        .limit(500),
    );
    return {
      body: { items: rows.map((row) => ({ ...couponOf(row), enabled: row.enabled })) },
    };
  });

  const saveCoupon = async (request: RouteRequest, id: string | null) => {
    const flags = couponBody.safeParse(request.body ?? {});
    const input = couponInputSchema.safeParse(request.body);
    if (!input.success) return invalid(input.error);
    const values = toRow(input.data, flags.success ? flags.data.enabled : true);
    return ctx.db.transaction(request.siteId, async (tx) => {
      const [clash] = await tx
        .select({ id: coupons.id })
        .from(coupons)
        .where(and(eq(coupons.code, values.code), id ? ne(coupons.id, id) : sql`true`));
      if (clash)
        return problem(400, 'Some values are not valid.', [
          { path: 'code', message: 'Another coupon has this code.' },
        ]);
      const [row] = id
        ? await tx.update(coupons).set(values).where(eq(coupons.id, id)).returning()
        : await tx
            .insert(coupons)
            .values({ siteId: request.siteId, ...values })
            .returning();
      if (!row) return problem(404, 'This coupon does not exist.');
      return { status: id ? 200 : 201, body: { ...couponOf(row), enabled: row.enabled } };
    });
  };

  api('POST', '/coupons', (request) => saveCoupon(request, null));

  api('PUT', '/coupons/:id', async (request) => {
    if (!UUID_RE.test(request.params.id ?? '')) return problem(404, 'This coupon does not exist.');
    return saveCoupon(request, request.params.id!);
  });

  api('DELETE', '/coupons/:id', async (request) => {
    const id = request.params.id ?? '';
    if (!UUID_RE.test(id)) return problem(404, 'This coupon does not exist.');
    const deleted = await ctx.db.transaction(request.siteId, (tx) =>
      tx.delete(coupons).where(eq(coupons.id, id)).returning({ id: coupons.id }),
    );
    if (!deleted.length) return problem(404, 'This coupon does not exist.');
    return { status: 204 };
  });

  /** The orders that used a coupon. */
  api('GET', '/coupons/:id/uses', async (request) => {
    const id = request.params.id ?? '';
    if (!UUID_RE.test(id)) return problem(404, 'This coupon does not exist.');
    const rows = await ctx.db.transaction(request.siteId, (tx) =>
      tx
        .select({
          orderId: couponUses.orderId,
          number: orders.number,
          email: couponUses.email,
          createdAt: couponUses.createdAt,
        })
        .from(couponUses)
        .innerJoin(orders, eq(orders.id, couponUses.orderId))
        .where(eq(couponUses.couponId, id))
        .orderBy(desc(couponUses.createdAt))
        .limit(200),
    );
    return { body: { items: rows } };
  });
}
