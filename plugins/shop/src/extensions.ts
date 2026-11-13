/**
 * Cleishop's extension points (plugin API 1.73): what add-ons give to
 * Cleishop's own emails and pages. Each one is optional, and a failing
 * add-on never stops an email or a page: it is left out and logged.
 *
 * - `shop.email-attachments`: `attachments(siteId, { orderId, email })` →
 *   files attached to an order email (e.g. the invoice in PDF).
 * - `shop.order-documents`: `documents(siteId, { orderId, audience })` →
 *   links shown with the order, to the customer (`customer`, in their
 *   account) or in the admin (`admin`), e.g. «Invoice (PDF)».
 */
import type { MailAttachment, PluginContext } from '@cleitext/plugin-sdk';

export interface OrderDocument {
  label: string;
  url: string;
}

export async function emailAttachments(
  ctx: PluginContext,
  siteId: string,
  input: { orderId: string; email: string },
): Promise<MailAttachment[]> {
  const out: MailAttachment[] = [];
  for (const { plugin, service } of (await ctx.services?.all(siteId, 'shop.email-attachments')) ??
    []) {
    try {
      const files =
        (await (
          service.attachments as (s: string, i: typeof input) => Promise<MailAttachment[] | null>
        )(siteId, input)) ?? [];
      out.push(...files.filter((f) => f && typeof f.filename === 'string'));
    } catch (error) {
      ctx.log.warn(`shop.email-attachments of ${plugin}: ${String(error)}`);
    }
  }
  return out.slice(0, 10);
}

export async function orderDocuments(
  ctx: PluginContext,
  siteId: string,
  input: { orderId: string; audience: 'customer' | 'admin' },
): Promise<OrderDocument[]> {
  const out: OrderDocument[] = [];
  for (const { service } of (await ctx.services?.all(siteId, 'shop.order-documents')) ?? []) {
    try {
      const links =
        (await (
          service.documents as (s: string, i: typeof input) => Promise<OrderDocument[] | null>
        )(siteId, input)) ?? [];
      out.push(
        ...links.filter(
          (l) =>
            l &&
            typeof l.label === 'string' &&
            typeof l.url === 'string' &&
            /^(\/|https?:\/\/)/.test(l.url),
        ),
      );
    } catch {
      // A failing add-on leaves its links out.
    }
  }
  return out;
}
