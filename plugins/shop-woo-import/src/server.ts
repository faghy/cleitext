import {
  definePlugin,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  languageOf,
  pickCustomers,
  toAddress,
  toImportedOrder,
  type CustomerChoice,
  type WooCustomer,
  type WooOrder,
} from './model/convert';
import { imported } from './store';

/**
 * WooCommerce Import (official plugin, Cleishop add-on): a WooCommerce
 * shop's customers and orders into Cleishop, through its `shop` service
 * (plugin API 1.73). The admin page reads the export of
 * exporter/cleitext-woo-export.php in the browser and sends it in batches:
 * customers first (their accounts, without passwords), then orders.
 * Importing again adds only what is new.
 */

const CAPABILITY = 'import_woocommerce';
const MAX_CUSTOMERS = 200;
const MAX_ORDERS = 100;

interface ShopService {
  [name: string]: (siteId: string, ...args: never[]) => unknown;
  saveCustomer(siteId: string, customer: unknown): Promise<{ created: boolean }>;
  productsBy(siteId: string, keys: { skus: string[] }): Promise<{ id: string; sku: string }[]>;
  importOrder(siteId: string, order: unknown): Promise<{ id: string; created: boolean }>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export default definePlugin({
  setup(ctx: PluginContext) {
    ctx.access.defineCapability(CAPABILITY, {
      label: { en: 'Import from WooCommerce', it: 'Importare da WooCommerce' },
      roles: ['administrator'],
    });
    const tx = <T>(siteId: string, fn: Parameters<typeof ctx.db.transaction<T>>[1]) =>
      ctx.db.transaction<T>(siteId, fn);

    const shopOf = async (siteId: string) => {
      const shop = await ctx.services?.use<ShopService>(siteId, 'shop');
      if (!shop) throw new HttpError(409, 'Activate Cleishop 1.13 or later first.');
      return shop;
    };

    const mapOf = async (siteId: string, kind: string, refs: string[]) => {
      if (!refs.length) return new Map<string, string>();
      const rows = await tx(siteId, (t) =>
        t
          .select({ ref: imported.ref, target: imported.targetId })
          .from(imported)
          .where(and(eq(imported.kind, kind), inArray(imported.ref, refs))),
      );
      return new Map(rows.map((r) => [r.ref, r.target]));
    };
    const remember = (siteId: string, kind: string, ref: string, targetId: string) =>
      tx(siteId, (t) =>
        t
          .insert(imported)
          .values({ siteId, kind, ref, targetId })
          .onConflictDoUpdate({
            target: [imported.siteId, imported.kind, imported.ref],
            set: { targetId },
          }),
      );

    const route = (
      method: 'GET' | 'POST',
      path: string,
      handler: (request: RouteRequest) => Promise<RouteResponse['body']>,
    ) =>
      ctx.routes.api({
        method,
        path,
        capability: CAPABILITY,
        handler: async (request) => {
          try {
            return { body: await handler(request) };
          } catch (error) {
            if (error instanceof HttpError) {
              return { status: error.status, body: { error: error.message } };
            }
            throw error;
          }
        },
      });

    // For other add-ons (the Wishlist's YITH import): the accounts of imported customers.
    ctx.services?.provide('shop-woo-import', {
      async customers(siteId: string, ids: string[]) {
        const map = await mapOf(
          siteId,
          'customer',
          (Array.isArray(ids) ? ids : []).map(String).slice(0, 5000),
        );
        return Object.fromEntries(map);
      },
    });

    route('GET', '/state', async (request) => {
      const counts = await tx(request.siteId, (t) =>
        t
          .select({ kind: imported.kind, n: sql<number>`count(*)::int` })
          .from(imported)
          .groupBy(imported.kind),
      );
      const shop = await ctx.services?.use(request.siteId, 'shop');
      return {
        shop: Boolean(shop),
        customers: counts.find((c) => c.kind === 'customer')?.n ?? 0,
        orders: counts.find((c) => c.kind === 'order')?.n ?? 0,
      };
    });

    // A batch of customers: their accounts (no password, no email sent), then their addresses.
    route('POST', '/customers', async (request) => {
      const siteId = request.siteId;
      const body = (request.body ?? {}) as {
        customers?: WooCustomer[];
        which?: CustomerChoice;
        verifiedOnly?: boolean;
        dryRun?: boolean;
      };
      const all = Array.isArray(body.customers) ? body.customers.slice(0, MAX_CUSTOMERS) : [];
      const which: CustomerChoice = ['paid', 'orders', 'all'].includes(body.which ?? '')
        ? body.which!
        : 'orders';
      const chosen = pickCustomers(all, { which, verifiedOnly: body.verifiedOnly === true });
      const known = await mapOf(
        siteId,
        'customer',
        chosen.map((c) => String(c.id)),
      );
      const fresh = chosen.filter((c) => !known.has(String(c.id)));
      if (body.dryRun) {
        return { chosen: chosen.length, new: fresh.length, left: all.length - chosen.length };
      }
      const shop = await shopOf(siteId);
      const site = await ctx.site(siteId);
      let created = 0;
      const warnings: string[] = [];
      if (fresh.length) {
        const report = await ctx.transfer.importDocument(
          siteId,
          {
            format: 'cleitext-transfer',
            version: 1,
            source: {
              kind: 'wordpress',
              name: 'WooCommerce',
              exportedAt: new Date().toISOString(),
            },
            users: fresh.map((c) => ({
              ref: `wc-user-${c.id}`,
              email: c.email,
              displayName:
                c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email,
              ...(c.username ? { username: c.username } : {}),
              role: 'subscriber',
              locale: languageOf(c.locale, site.defaultLocale),
            })),
          } as never,
          { userId: request.user!.id },
        );
        warnings.push(...report.warnings, ...report.errors);
        for (const c of fresh) {
          const userId = report.users?.[`wc-user-${c.id}`];
          if (!userId) {
            warnings.push(`${c.email}: no account (Cleitext 0.100 or later is needed).`);
            continue;
          }
          await shop.saveCustomer(siteId, {
            userId,
            email: c.email,
            billing: toAddress(c.billing),
            shipping: toAddress(c.shipping),
          } as never);
          await remember(siteId, 'customer', String(c.id), userId);
          created++;
        }
      }
      return {
        chosen: chosen.length,
        imported: created,
        already: chosen.length - fresh.length,
        warnings,
      };
    });

    // A batch of orders, as they were: no email, no stock, no payment.
    route('POST', '/orders', async (request) => {
      const siteId = request.siteId;
      const body = (request.body ?? {}) as {
        orders?: WooOrder[];
        skipFailed?: boolean;
        dryRun?: boolean;
      };
      const all = Array.isArray(body.orders) ? body.orders.slice(0, MAX_ORDERS) : [];
      const wanted = all.filter((o) => !(body.skipFailed && o.status === 'failed'));
      const known = await mapOf(
        siteId,
        'order',
        wanted.map((o) => String(o.id)),
      );
      const fresh = wanted.filter((o) => !known.has(String(o.id)));
      if (body.dryRun) {
        return { chosen: wanted.length, new: fresh.length, left: all.length - wanted.length };
      }
      const shop = await shopOf(siteId);
      const site = await ctx.site(siteId);
      const customers = await mapOf(
        siteId,
        'customer',
        fresh.map((o) => String(o.customerId ?? '')).filter((r) => r && r !== '0'),
      );
      const skus = [
        ...new Set(fresh.flatMap((o) => o.items.map((i) => i.sku ?? '').filter(Boolean))),
      ];
      const productIdBySku = new Map(
        (skus.length ? await shop.productsBy(siteId, { skus }) : []).map((p) => [p.sku, p.id]),
      );
      let created = 0;
      let skipped = 0;
      const warnings: string[] = [];
      for (const order of fresh) {
        const converted = toImportedOrder(order, {
          customerUserId: customers.get(String(order.customerId ?? '')) ?? null,
          productIdBySku,
          defaultLocale: site.defaultLocale,
        });
        if (!converted) {
          skipped++;
          continue;
        }
        try {
          const result = await shop.importOrder(siteId, converted as never);
          await remember(siteId, 'order', String(order.id), result.id);
          if (result.created) created++;
        } catch (error) {
          warnings.push(`#${order.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return {
        chosen: wanted.length,
        imported: created,
        already: wanted.length - fresh.length,
        skipped,
        warnings,
      };
    });
  },
});
