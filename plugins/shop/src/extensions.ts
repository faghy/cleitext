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

/**
 * `shop.taxes` (1.16): a service that works out the taxes of a cart or an
 * order instead of the shop's rates, e.g. AvaTax. `quote` answers null when
 * it does not handle the address (the rates apply), and throws when it
 * cannot answer now: the checkout then refuses the order, it never charges
 * no tax by mistake.
 */
export interface TaxRequest {
  /** `cart` (an estimate), `checkout` (what the order will charge). */
  stage: 'cart' | 'checkout';
  /** The customer's language, for the messages a service throws. */
  locale: string;
  currency: string;
  /** Amounts below include the tax (prices entered with taxes). */
  pricesIncludeTax: boolean;
  /** Where it goes; the cart may know only the country and postcode. */
  address: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postcode: string;
    country: string;
  };
  customer: { email: string; userId: string | null } | null;
  /** Amounts in cents, after the discounts, as entered. */
  lines: {
    key: string;
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    amount: number;
    taxable: boolean;
    taxClass: string;
  }[];
  shipping: { amount: number; method: string } | null;
  fees: { name: string; amount: number }[];
}

export interface TaxAnswer {
  /** Tax in cents by line key. */
  lines: Record<string, number>;
  shipping: number;
  fees: number[];
  /** By jurisdiction, for the receipt and the order. */
  summary: { label: string; rate: number; amount: number }[];
}

export type TaxQuote = (siteId: string, request: TaxRequest) => Promise<TaxAnswer | null>;

/** The tax service of the site, when an add-on gives one. */
export async function taxService(ctx: PluginContext, siteId: string): Promise<TaxQuote | null> {
  for (const { plugin, service } of (await ctx.services?.all(siteId, 'shop.taxes')) ?? []) {
    if (typeof service.quote !== 'function') continue;
    const quote = service.quote as TaxQuote;
    return async (s, request) => {
      try {
        return await quote(s, request);
      } catch (error) {
        ctx.log.warn(`shop.taxes of ${plugin}: ${String(error)}`);
        // The service's own message (written for the customer), without the call's name.
        const message = (error instanceof Error ? error.message : String(error)).replace(
          /^[\w.-]+\.\w+:\s*/,
          '',
        );
        throw new TaxServiceError(message);
      }
    };
  }
  return null;
}

/** The tax service could not answer: no order is placed without its taxes. */
export class TaxServiceError extends Error {}
