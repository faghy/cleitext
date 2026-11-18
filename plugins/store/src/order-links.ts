import type { PluginContext } from '@cleitext/plugin-sdk';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { fail, text } from './common';
import type { ShopOrder } from './providers';
import { licenses, orderLinks, products, variants, type License, type OrderLink } from './schema';

/**
 * Cleishop orders linked by hand to a license made before them (Store 1.6),
 * e.g. a license sold and billed by hand, whose order is entered in the shop
 * afterwards. The license takes the order line (`source` cleishop, `orderRef`
 * `<orderId>:<itemId>`): when the order is paid the store finds its license
 * already there and makes no other, sends no key. A refunded or cancelled
 * order revokes it, as for licenses sold by the shop.
 *
 * The order is named by its id (immediate), by its number (immediate for
 * orders imported in Cleishop, otherwise when the order next changes status:
 * then its email must be the license's or its agency's) or made by the store
 * through Cleishop's import (no email, no stock, no payment, no status hook).
 */

const PROVIDER = 'cleishop';
/** A link waiting for its order by number is forgotten after this. */
export const PENDING_DAYS = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the store uses of Cleishop's `shop` service. */
export interface ShopLinkService {
  [name: string]: (siteId: string, ...args: never[]) => unknown;
  order(siteId: string, id: string): Promise<(ShopOrder & { order: { number: number } }) | null>;
  importedOrders(
    siteId: string,
    options: { after?: number; limit?: number },
  ): Promise<{ id: string; number: number }[]>;
  importOrder(siteId: string, order: Record<string, unknown>): Promise<{ id: string }>;
}

const shopOf = (ctx: PluginContext, siteId: string) =>
  ctx.services?.use<ShopLinkService>(siteId, 'shop') ?? Promise.resolve(null);

/**
 * An order named by people: its number (`123`, `#123`) or its id, alone or
 * in the address of its admin page (`…/orders?order=<id>`).
 */
export function parseOrderInput(value: unknown): { orderId?: string; number?: number } | null {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const id = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(raw)?.[0];
  if (id) return { orderId: id.toLowerCase() };
  const n = /^(?:#|n\.?\s*)?(\d{1,9})$/i.exec(raw)?.[1];
  return n && Number(n) > 0 ? { number: Number(n) } : null;
}

/**
 * The line of an order that a license takes: the line of the license's
 * product (by the Cleishop variants), else the only product line.
 */
export function chooseLine(
  detail: ShopOrder,
  productSlug: string,
  sold: { variantId: string; productSlug: string }[],
): ShopOrder['items'][number] | null {
  const lines = detail.items.filter(
    (item) => item.kind === 'product' && (item.variationId || item.productId),
  );
  const mine = lines.find((item) =>
    sold.some(
      (v) =>
        v.productSlug === productSlug &&
        (v.variantId === item.variationId || v.variantId === item.productId),
    ),
  );
  if (mine) return mine;
  const products = detail.items.filter((item) => item.kind === 'product');
  return products.length === 1 ? products[0]! : null;
}

/** Whether an order belongs to the license's customer or agency. */
export function sameCustomer(detail: ShopOrder, license: License): boolean {
  const email = detail.order.email.trim().toLowerCase();
  return email === license.email.toLowerCase() || email === license.ownerEmail?.toLowerCase();
}

type Outcome =
  | { ok: true; link: OrderLink }
  | { ok: false; status: number; message: string; licenseId?: string };

/** Links a license to an order the store has read: the line, then the license. */
async function linkDetail(
  ctx: PluginContext,
  siteId: string,
  license: License,
  detail: ShopOrder & { order: { number: number } },
  pending: OrderLink | null,
): Promise<Outcome> {
  const sold = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select({ variantId: variants.variantId, productSlug: variants.productSlug })
      .from(variants)
      .where(eq(variants.provider, PROVIDER)),
  );
  const line = chooseLine(detail, license.productSlug, sold);
  if (!line) {
    return {
      ok: false,
      status: 400,
      message: `Order ${detail.order.number} has no line of ${license.productSlug}.`,
    };
  }
  const orderRef = `${detail.order.id}:${line.id}`;
  const result = await ctx.db.transaction(siteId, async (tx): Promise<Outcome> => {
    const [taken] = await tx
      .select({ id: licenses.id })
      .from(licenses)
      .where(and(eq(licenses.source, PROVIDER), eq(licenses.orderRef, orderRef)));
    if (taken && taken.id !== license.id) {
      return {
        ok: false,
        status: 409,
        message: `Order ${detail.order.number} already has its license: revoke one of the two.`,
        licenseId: taken.id,
      };
    }
    const [current] = await tx.select().from(licenses).where(eq(licenses.id, license.id));
    if (!current) return { ok: false, status: 404, message: 'Unknown license.' };
    const already = current.source === PROVIDER && current.orderRef === orderRef;
    if (!already && current.source !== 'manual') {
      return {
        ok: false,
        status: 409,
        message: `This license already belongs to an order (${current.source}).`,
      };
    }
    if (!already) {
      await tx
        .update(licenses)
        .set({ source: PROVIDER, orderRef })
        .where(eq(licenses.id, license.id));
    }
    const values = {
      orderNumber: detail.order.number,
      orderId: detail.order.id,
      orderRef,
      status: 'linked' as const,
      linkedAt: new Date(),
    };
    if (pending) {
      const [row] = await tx
        .update(orderLinks)
        .set(values)
        .where(eq(orderLinks.id, pending.id))
        .returning();
      return { ok: true, link: row! };
    }
    const [existing] = await tx
      .select()
      .from(orderLinks)
      .where(and(eq(orderLinks.licenseId, license.id), eq(orderLinks.orderRef, orderRef)));
    if (existing) return { ok: true, link: existing };
    const [row] = await tx
      .insert(orderLinks)
      .values({
        siteId,
        licenseId: license.id,
        provider: PROVIDER,
        previousSource: already ? null : current.source,
        ...values,
      })
      .returning();
    return { ok: true, link: row! };
  });
  if (result.ok) {
    // A renewal line, too, is done: the same key as the status hook's renewals.
    await ctx.storage.set(siteId, `renewed:${PROVIDER}:${orderRef}`.slice(0, 100), {
      licenseId: license.id,
      linked: true,
      at: new Date().toISOString(),
    });
    ctx.log.info('Order linked to a license', { license: license.id, order: orderRef });
  }
  return result;
}

/** The id of an imported Cleishop order by its number, or null. */
async function importedByNumber(shop: ShopLinkService, siteId: string, number: number) {
  const [row] = await shop.importedOrders(siteId, { after: number - 1, limit: 1 });
  return row && row.number === number ? row.id : null;
}

export interface LinkInput {
  /** The order's number or id (or the address of its admin page). */
  order?: unknown;
  /** Make the order in Cleishop from the license (imported: no email, stock, payment, hook). */
  create?: {
    number?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    company?: unknown;
    vatNumber?: unknown;
    taxCode?: unknown;
    country?: unknown;
    /** Paid, tax included, e.g. "59.00"; the license's price when missing. */
    total?: unknown;
    /** The tax in it, e.g. "10.64". */
    tax?: unknown;
    /** YYYY-MM-DD; the license's date when missing. */
    date?: unknown;
  } | null;
}

const amount = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : NaN;
};

/** The admin's action «Link to a Cleishop order». */
export async function linkLicense(
  ctx: PluginContext,
  siteId: string,
  licenseId: string,
  input: LinkInput,
) {
  if (!UUID_RE.test(licenseId)) return fail(404, 'Unknown license.');
  const [license] = await ctx.db.transaction(siteId, (tx) =>
    tx.select().from(licenses).where(eq(licenses.id, licenseId)),
  );
  if (!license) return fail(404, 'Unknown license.');
  const shop = await shopOf(ctx, siteId);
  if (!shop) return fail(409, 'Cleishop is not active on this site.');

  let orderId: string | null;
  let number: number | null = null;
  if (input.create) {
    const c = input.create;
    const [product] = await ctx.db.transaction(siteId, (tx) =>
      tx.select().from(products).where(eq(products.slug, license.productSlug)),
    );
    const [variant] = await ctx.db.transaction(siteId, (tx) =>
      tx
        .select({ id: variants.variantId })
        .from(variants)
        .where(
          and(
            eq(variants.provider, PROVIDER),
            eq(variants.productSlug, license.productSlug),
            eq(variants.kind, 'new'),
          ),
        ),
    );
    const total =
      amount(c.total) ?? (license.priceCents === null ? null : license.priceCents / 100);
    const tax = amount(c.tax) ?? 0;
    if (total === null || Number.isNaN(total) || Number.isNaN(tax) || tax > total) {
      return fail(400, 'Give the total paid (and the tax in it), e.g. 59.00.');
    }
    const day = text(c.date, 10) || license.createdAt.toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) {
      return fail(400, 'The date is not valid (YYYY-MM-DD).');
    }
    const wanted = Math.round(Number(c.number));
    const net = (total - tax).toFixed(2);
    const at = `${day}T12:00:00.000Z`;
    const vatNumber = text(c.vatNumber, 40);
    const taxCode = text(c.taxCode, 40);
    const imported = await shop.importOrder(siteId, {
      // One order per license: making it again finds the same one.
      ref: `store-license:${license.id}`,
      ...(Number.isInteger(wanted) && wanted > 0 ? { number: wanted } : {}),
      status: 'completed',
      currency: license.currency ?? product?.currency ?? 'EUR',
      locale: 'it',
      pricesIncludeTax: false,
      email: license.email,
      billing: {
        firstName: text(c.firstName, 100),
        lastName: text(c.lastName, 100),
        company: text(c.company, 200),
        country: text(c.country, 2).toUpperCase(),
      },
      invoice: vatNumber || taxCode ? { vatNumber, taxCode, sdi: '', pec: '' } : null,
      paymentMethod: 'manual',
      paymentTitle: 'Pagato e fatturato a parte',
      totals: { subtotal: net, tax: tax.toFixed(2), total: total.toFixed(2) },
      items: [
        {
          kind: 'product',
          name: product?.name ?? license.productSlug,
          productId: variant?.id && UUID_RE.test(variant.id) ? variant.id : null,
          quantity: 1,
          subtotal: net,
          total: net,
          tax: tax.toFixed(2),
        },
      ],
      notes: [
        {
          note: `Order of the license …${license.keyHint}, made by hand and billed separately: no new key, no email, no invoice. / Ordine della licenza …${license.keyHint}, fatta a mano e fatturata a parte: nessuna nuova chiave, email o fattura.`,
          author: 'Store',
        },
      ],
      createdAt: at,
      paidAt: at,
      completedAt: at,
      meta: { storeLicense: license.id },
    });
    orderId = imported.id;
  } else {
    const named = parseOrderInput(input.order);
    if (!named) return fail(400, 'Give the order number, or the address of its page.');
    orderId = named.orderId ?? null;
    number = named.number ?? null;
    if (!orderId && number) orderId = await importedByNumber(shop, siteId, number);
  }

  if (orderId) {
    const detail = await shop.order(siteId, orderId);
    if (!detail) return fail(404, 'This order does not exist in Cleishop.');
    if (number && detail.order.number !== number) return fail(400, 'The order number differs.');
    const outcome = await linkDetail(ctx, siteId, license, detail, null);
    if (!outcome.ok) return fail(outcome.status, outcome.message, { license: outcome.licenseId });
    return { body: { ok: true, created: Boolean(input.create), link: outcome.link } };
  }

  // Known by its number only: linked when the order reaches the store.
  const link = await ctx.db.transaction(siteId, async (tx) => {
    const [same] = await tx
      .select()
      .from(orderLinks)
      .where(
        and(
          eq(orderLinks.provider, PROVIDER),
          eq(orderLinks.orderNumber, number!),
          inArray(orderLinks.status, ['pending', 'linked']),
        ),
      );
    if (same) return same.licenseId === license.id ? same : null;
    const [row] = await tx
      .insert(orderLinks)
      .values({
        siteId,
        licenseId: license.id,
        provider: PROVIDER,
        orderNumber: number!,
        status: 'pending',
        previousSource: license.source,
      })
      .returning();
    return row!;
  });
  if (!link) return fail(409, `Order ${number} is already linked to another license.`);
  return { body: { ok: true, created: false, link } };
}

/**
 * Before the store handles a Cleishop order's new status: the links waiting
 * for this order (by id or number) take its line, when the order is the
 * license's customer's (or its agency's); otherwise they are refused.
 */
export async function resolvePending(
  ctx: PluginContext,
  siteId: string,
  detail: ShopOrder & { order: { number: number } },
): Promise<void> {
  const since = new Date(Date.now() - PENDING_DAYS * 86_400_000);
  const waiting = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select()
      .from(orderLinks)
      .where(
        and(
          eq(orderLinks.provider, PROVIDER),
          eq(orderLinks.status, 'pending'),
          or(
            eq(orderLinks.orderId, detail.order.id),
            and(isNull(orderLinks.orderId), eq(orderLinks.orderNumber, detail.order.number)),
          ),
        ),
      )
      .orderBy(desc(orderLinks.createdAt)),
  );
  for (const link of waiting) {
    const [license] = await ctx.db.transaction(siteId, (tx) =>
      tx.select().from(licenses).where(eq(licenses.id, link.licenseId)),
    );
    const refuse = (note: string) =>
      ctx.db.transaction(siteId, (tx) =>
        tx
          .update(orderLinks)
          .set({ status: 'refused', orderId: detail.order.id, note })
          .where(eq(orderLinks.id, link.id)),
      );
    if (!license || link.createdAt < since) {
      await refuse(license ? 'expired' : 'license deleted');
      continue;
    }
    if (!sameCustomer(detail, license)) {
      ctx.log.warn('Order not linked: another customer', { license: license.id });
      await refuse(`the order's email (${detail.order.email}) is not the license's`);
      continue;
    }
    const outcome = await linkDetail(ctx, siteId, license, detail, link);
    if (!outcome.ok) await refuse(outcome.message);
  }
}

/** The links of some licenses, for the admin's list. */
export async function linksOf(ctx: PluginContext, siteId: string, licenseIds: string[]) {
  if (licenseIds.length === 0) return new Map<string, OrderLink[]>();
  const rows = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select()
      .from(orderLinks)
      .where(inArray(orderLinks.licenseId, licenseIds))
      .orderBy(desc(orderLinks.createdAt)),
  );
  const out = new Map<string, OrderLink[]>();
  for (const row of rows) out.set(row.licenseId, [...(out.get(row.licenseId) ?? []), row]);
  return out;
}

/** Drops a link still waiting for its order. */
export async function cancelPending(ctx: PluginContext, siteId: string, id: string) {
  if (!UUID_RE.test(id)) return fail(404, 'Unknown link.');
  const done = await ctx.db.transaction(siteId, (tx) =>
    tx
      .delete(orderLinks)
      .where(and(eq(orderLinks.id, id), eq(orderLinks.status, 'pending')))
      .returning({ id: orderLinks.id }),
  );
  return done.length ? { body: { ok: true } } : fail(404, 'No pending link with this id.');
}
