import { definePlugin, type PluginContext, type PluginTransaction } from '@cleitext/plugin-sdk';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { counterOf, formatNumber } from './numbering';
import { drawInvoice, drawPackingSlip, type OrderData, type ShopIdentity } from './pdf/documents';
import { PdfDocument } from './pdf/writer';
import { cleanSettings, logoBytes, wooInvoice, type Settings } from './settings';
import { counters, invoices, type InvoiceRow } from './store';
import { strings } from './strings';

/**
 * PDF invoices (official plugin, Cleishop add-on): an invoice for each order
 * when it reaches a chosen status, numbered without gaps, attached to
 * Cleishop's emails and downloaded from the customer's account and from the
 * order in the admin; a packing slip; every invoice of a month in one PDF;
 * the numbers of «PDF Invoices & Packing Slips» for orders imported from
 * WooCommerce. Through Cleishop's `shop` service and extension points (1.14).
 */

declare module '@cleitext/plugin-sdk' {
  interface Actions {
    'shop.order.status': { orderId: string; number: number; from: string; to: string };
  }
}

interface OrderDetail {
  order: OrderData['order'] & { id: string; key: string; status: string };
  items: OrderData['items'];
  refunded: string;
}

interface ShopService {
  [name: string]: (siteId: string, ...args: never[]) => unknown;
  order(siteId: string, id: string): Promise<OrderDetail | null>;
  importedOrders(
    siteId: string,
    options: { after?: number; limit?: number },
  ): Promise<{ id: string; number: number; meta: Record<string, unknown> }[]>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAPABILITY = 'manage_invoices';
const MAX_BULK = 500;

/** Rolls back a transaction that found the invoice already there (no number is used). */
class Exists extends Error {
  constructor(readonly row: InvoiceRow) {
    super('exists');
  }
}

export default definePlugin({
  setup(ctx: PluginContext) {
    ctx.access.defineCapability(CAPABILITY, {
      label: { en: 'Manage the invoices', it: 'Gestire le fatture' },
      roles: ['administrator', 'editor'],
    });
    const tx = <T>(siteId: string, fn: (t: PluginTransaction) => Promise<T>) =>
      ctx.db.transaction<T>(siteId, fn);
    const settingsOf = async (siteId: string) =>
      cleanSettings(await ctx.storage.get(siteId, 'settings'));
    const shopOf = (siteId: string) => ctx.services?.use<ShopService>(siteId, 'shop') ?? null;

    async function invoiceOf(siteId: string, orderId: string): Promise<InvoiceRow | null> {
      const [row] = await tx(siteId, (t) =>
        t.select().from(invoices).where(eq(invoices.orderId, orderId)),
      );
      return row ?? null;
    }

    /**
     * The order's invoice, created with the next number when it has none. The
     * counter's row stays locked until the end, so two requests never take
     * the same number, and a number is never skipped.
     */
    async function ensureInvoice(siteId: string, orderId: string): Promise<InvoiceRow> {
      const settings = await settingsOf(siteId);
      const now = new Date();
      const counter = counterOf(settings.numbering, now);
      try {
        return await tx(siteId, async (t) => {
          const [next] = await t
            .insert(counters)
            .values({ siteId, counter, last: 1 })
            .onConflictDoUpdate({
              target: [counters.siteId, counters.counter],
              set: { last: sql`${counters.last} + 1` },
            })
            .returning({ last: counters.last });
          const [already] = await t.select().from(invoices).where(eq(invoices.orderId, orderId));
          if (already) throw new Exists(already);
          const [row] = await t
            .insert(invoices)
            .values({
              siteId,
              orderId,
              number: next!.last,
              counter,
              formatted: formatNumber(next!.last, settings.numbering, now),
              date: now,
            })
            .returning();
          return row!;
        });
      } catch (error) {
        if (error instanceof Exists) return error.row;
        throw error;
      }
    }

    const identity = (settings: Settings): ShopIdentity => ({
      name: settings.shopName,
      address: settings.address,
      taxId: settings.taxId,
      footer: settings.footer,
      logo: logoBytes(settings),
    });

    /** One PDF with the documents of some orders (missing ones are left out). */
    async function render(
      siteId: string,
      list: { detail: OrderDetail; invoice: InvoiceRow | null }[],
      kind: 'invoice' | 'packing-slip',
    ): Promise<Buffer> {
      const settings = await settingsOf(siteId);
      const shop = identity(settings);
      const doc = new PdfDocument({ title: kind === 'invoice' ? 'Invoice' : 'Packing slip' });
      for (const { detail, invoice } of list) {
        if (kind === 'invoice' && invoice) {
          drawInvoice(doc, detail, shop, { number: invoice.formatted, date: invoice.date });
        } else if (kind === 'packing-slip') {
          drawPackingSlip(doc, detail, shop);
        }
      }
      return doc.toBuffer();
    }

    const fileName = (
      kind: 'invoice' | 'packing-slip',
      detail: OrderDetail,
      invoice?: InvoiceRow | null,
    ) => {
      const t = strings(detail.order.locale);
      const base =
        kind === 'invoice'
          ? `${t('Invoice')} ${invoice?.formatted ?? ''}`
          : `${t('Packing slip')} ${detail.order.number}`;
      return `${base.replace(/[^\p{L}\p{N} _-]+/gu, '-').trim()}.pdf`;
    };

    const link = (orderId: string, key: string, kind: 'invoice' | 'packing-slip', create = false) =>
      `/shop-invoice/${orderId}.pdf?key=${encodeURIComponent(key)}${kind === 'packing-slip' ? '&doc=packing-slip' : ''}${create ? '&create=1' : ''}`;

    // Cleishop's extension points (1.14): the invoice attached to its emails…
    ctx.services?.provide('shop.email-attachments', {
      async attachments(siteId: string, input: { orderId: string; email: string }) {
        const settings = await settingsOf(siteId);
        if (!settings.attachTo.includes(input.email)) return [];
        const shop = await shopOf(siteId);
        const detail = shop ? await shop.order(siteId, input.orderId) : null;
        if (!detail) return [];
        const invoice = await ensureInvoice(siteId, input.orderId);
        return [
          {
            filename: fileName('invoice', detail, invoice),
            content: await render(siteId, [{ detail, invoice }], 'invoice'),
            contentType: 'application/pdf',
          },
        ];
      },
    });

    // …and its links, in the customer's account and in the order's admin page.
    ctx.services?.provide('shop.order-documents', {
      async documents(siteId: string, input: { orderId: string; audience: 'customer' | 'admin' }) {
        const settings = await settingsOf(siteId);
        const shop = await shopOf(siteId);
        const detail = shop ? await shop.order(siteId, input.orderId) : null;
        if (!detail) return [];
        const invoice = await invoiceOf(siteId, input.orderId);
        const t = strings(detail.order.locale);
        const key = detail.order.key;
        if (input.audience === 'customer') {
          return invoice && settings.customerDownload
            ? [
                {
                  label: `${t('Invoice')} ${invoice.formatted} (PDF)`,
                  url: link(input.orderId, key, 'invoice'),
                },
              ]
            : [];
        }
        return [
          invoice
            ? {
                label: `${t('Invoice')} ${invoice.formatted} (PDF)`,
                url: link(input.orderId, key, 'invoice'),
              }
            : {
                label: `${t('Create the invoice')} (PDF)`,
                url: link(input.orderId, key, 'invoice', true),
              },
          ...(settings.packingSlip
            ? [
                {
                  label: `${t('Packing slip')} (PDF)`,
                  url: link(input.orderId, key, 'packing-slip'),
                },
              ]
            : []),
        ];
      },
    });

    // A new invoice when an order reaches one of the chosen statuses.
    ctx.hooks.on('shop.order.status', async ({ orderId, to }, { siteId }) => {
      const settings = await settingsOf(siteId);
      if (settings.createOn.includes(to)) await ensureInvoice(siteId, orderId);
    });

    // The documents of an order: with its key (the customer's link, the admin's).
    ctx.routes.public({
      method: 'GET',
      path: '/shop-invoice/:id.pdf',
      handler: async (request) => {
        const id = request.params.id ?? '';
        const notFound = { status: 404, body: 'Not found', contentType: 'text/plain' };
        if (!UUID_RE.test(id)) return notFound;
        const shop = await shopOf(request.siteId);
        const detail = shop ? await shop.order(request.siteId, id) : null;
        if (!detail || !request.query.key || request.query.key !== detail.order.key)
          return notFound;
        const manager = Boolean(request.user?.capabilities.includes(CAPABILITY));
        const settings = await settingsOf(request.siteId);
        const kind = request.query.doc === 'packing-slip' ? 'packing-slip' : 'invoice';
        if (kind === 'packing-slip' && !(manager && settings.packingSlip)) return notFound;
        let invoice = await invoiceOf(request.siteId, id);
        if (kind === 'invoice' && !invoice) {
          if (!(manager && request.query.create === '1')) return notFound;
          invoice = await ensureInvoice(request.siteId, id);
        }
        if (kind === 'invoice' && !manager && !settings.customerDownload) return notFound;
        return {
          body: await render(request.siteId, [{ detail, invoice }], kind),
          contentType: 'application/pdf',
          headers: {
            'cache-control': 'private, no-store',
            'content-disposition': `inline; filename="${fileName(kind, detail, invoice)}"`,
            'x-robots-tag': 'noindex',
          },
        };
      },
    });

    // Admin: the settings.
    ctx.routes.api({
      method: 'GET',
      path: '/settings',
      capability: CAPABILITY,
      handler: async (request) => ({ body: await settingsOf(request.siteId) }),
    });
    ctx.routes.api({
      method: 'PUT',
      path: '/settings',
      capability: CAPABILITY,
      handler: async (request) => {
        const settings = cleanSettings(request.body);
        await ctx.storage.set(request.siteId, 'settings', settings);
        return { body: settings };
      },
    });

    // Admin: the latest invoices, and whether Cleishop is there.
    ctx.routes.api({
      method: 'GET',
      path: '/invoices',
      capability: CAPABILITY,
      handler: async (request) => {
        const siteId = request.siteId;
        const shop = await shopOf(siteId);
        const rows = await tx(siteId, (t) =>
          t.select().from(invoices).orderBy(desc(invoices.date), desc(invoices.number)).limit(50),
        );
        const [count] = await tx(siteId, (t) =>
          t.select({ n: sql<number>`count(*)::int` }).from(invoices),
        );
        const list = [];
        for (const row of rows) {
          const detail = shop ? await shop.order(siteId, row.orderId) : null;
          list.push({
            orderId: row.orderId,
            formatted: row.formatted,
            date: row.date,
            imported: row.imported,
            order: detail?.order.number ?? null,
            total: detail?.order.total ?? null,
            currency: detail?.order.currency ?? null,
            customer: detail
              ? [detail.order.billing.firstName, detail.order.billing.lastName]
                  .filter(Boolean)
                  .join(' ') || detail.order.email
              : '',
            url: detail ? link(row.orderId, detail.order.key, 'invoice') : null,
          });
        }
        return { body: { shop: Boolean(shop), count: count?.n ?? 0, invoices: list } };
      },
    });

    // Admin: every invoice of a period in one PDF (e.g. a month, for the accountant).
    ctx.routes.api({
      method: 'POST',
      path: '/bulk',
      capability: CAPABILITY,
      handler: async (request) => {
        const siteId = request.siteId;
        const body = (request.body ?? {}) as { from?: string; to?: string };
        const from = new Date(String(body.from ?? ''));
        const to = new Date(String(body.to ?? ''));
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
          return { status: 400, body: { detail: 'Choose a valid period.' } };
        }
        const shop = await shopOf(siteId);
        if (!shop) return { status: 409, body: { detail: 'Cleishop is not active.' } };
        const rows = await tx(siteId, (t) =>
          t
            .select()
            .from(invoices)
            .where(and(gte(invoices.date, from), lt(invoices.date, to)))
            .orderBy(invoices.date, invoices.number)
            .limit(MAX_BULK),
        );
        const list = [];
        for (const invoice of rows) {
          const detail = await shop.order(siteId, invoice.orderId);
          if (detail) list.push({ detail, invoice });
        }
        if (!list.length) return { body: { count: 0 } };
        const pdf = await render(siteId, list, 'invoice');
        return { body: { count: list.length, data: pdf.toString('base64') } };
      },
    });

    // Admin: the numbers of «PDF Invoices & Packing Slips» of the orders imported from WooCommerce.
    ctx.routes.api({
      method: 'POST',
      path: '/import-woocommerce',
      capability: CAPABILITY,
      handler: async (request) => {
        const siteId = request.siteId;
        const shop = await shopOf(siteId);
        if (!shop) return { status: 409, body: { detail: 'Cleishop is not active.' } };
        const settings = await settingsOf(siteId);
        let imported = 0;
        let already = 0;
        const warnings: string[] = [];
        let after = 0;
        for (;;) {
          const page = await shop.importedOrders(siteId, { after, limit: 200 });
          if (!page.length) break;
          after = page[page.length - 1]!.number;
          for (const order of page) {
            const woo = wooInvoice(order.meta ?? {});
            if (!woo) continue;
            const counter = counterOf(settings.numbering, woo.date);
            const done = await tx(siteId, async (t) => {
              const [there] = await t
                .select({ id: invoices.orderId })
                .from(invoices)
                .where(eq(invoices.orderId, order.id));
              if (there) return 'already';
              const [taken] = await t
                .select({ id: invoices.orderId })
                .from(invoices)
                .where(and(eq(invoices.counter, counter), eq(invoices.number, woo.number)));
              if (taken) return 'taken';
              await t.insert(invoices).values({
                siteId,
                orderId: order.id,
                number: woo.number,
                counter,
                formatted: woo.formatted,
                date: woo.date,
                imported: true,
              });
              // The next invoice continues from the highest number.
              await t
                .insert(counters)
                .values({ siteId, counter, last: woo.number })
                .onConflictDoUpdate({
                  target: [counters.siteId, counters.counter],
                  set: { last: sql`GREATEST(${counters.last}, ${woo.number})` },
                });
              return 'imported';
            });
            if (done === 'imported') imported++;
            else if (done === 'already') already++;
            else
              warnings.push(
                `Order ${order.number}: invoice number ${woo.formatted} is already used.`,
              );
          }
        }
        return { body: { imported, already, warnings } };
      },
    });
  },
});
