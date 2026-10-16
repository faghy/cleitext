import type {
  PluginContext,
  PluginTransaction,
  RouteRequest,
  RouteResponse,
} from '@cleitext/plugin-sdk';
import { desc, eq, sql } from 'drizzle-orm';
import {
  checkAddress,
  checkInvoice,
  normalizeAddress,
  type Address,
  type Invoice,
} from './address';
import { prefixOf } from './catalog-routes';
import { html, raw } from './html';
import { orderByNumber } from './orders';
import {
  emptyAddress,
  formParts,
  moneyFormatter,
  receivedPage,
  SHOP_CSS,
  statusLabel,
} from './pages';
import { customers, orders, type CustomerRow } from './schema';
import { translator } from './strings';

/**
 * The shop in the visitor's account (WooCommerce's "My account"): orders,
 * an order's details, and the addresses the checkout fills in. Linked from
 * the account page through the core's `account.links` filter.
 */

const PER_PAGE = 20;

export async function customerOf(
  tx: PluginTransaction,
  userId: string,
): Promise<CustomerRow | null> {
  const [row] = await tx.select().from(customers).where(eq(customers.userId, userId));
  return row ?? null;
}

/** Keeps a customer's latest addresses, after an order or from the account. */
export async function saveCustomer(
  tx: PluginTransaction,
  siteId: string,
  userId: string,
  values: { email?: string; billing: Address; shipping: Address; invoice: Invoice | null },
): Promise<void> {
  const set = {
    ...(values.email ? { email: values.email } : {}),
    billing: values.billing,
    shipping: values.shipping,
    invoice: values.invoice,
    updatedAt: new Date(),
  };
  await tx
    .insert(customers)
    .values({ siteId, userId, ...set })
    .onConflictDoUpdate({ target: [customers.siteId, customers.userId], set });
}

const page = (title: string, content: string, status = 200): RouteResponse => ({
  status,
  headers: { 'cache-control': 'private, no-store' },
  page: { title, html: `<style>${SHOP_CSS}</style><div class="shop-page">${content}</div>` },
});

const sameAddress = (a: Address | null | undefined, b: Address | null | undefined) =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

export function registerAccount(
  ctx: PluginContext,
  settings: (siteId: string) => Promise<{ currency: string; phoneRequired: boolean }>,
): void {
  ctx.hooks.filter('account.links', (links, context) => {
    const t = translator(context.locale);
    return [
      ...links,
      { label: t('Your orders'), url: `${context.base}/orders` },
      { label: t('Addresses'), url: `${context.base}/addresses` },
    ];
  });

  /** Signed-in visitors only: the others sign in and come back. */
  const signedIn = (request: RouteRequest) => {
    if (request.user) return null;
    const prefix = prefixOf(request);
    return {
      status: 303,
      headers: {
        location: `${prefix}/account/login?redirect=${encodeURIComponent(request.path)}`,
      },
    } satisfies RouteResponse;
  };

  ctx.routes.public({
    method: 'GET',
    path: '/account/orders',
    async handler(request) {
      const away = signedIn(request);
      if (away) return away;
      const t = translator(request.locale);
      const prefix = prefixOf(request);
      const store = await settings(request.siteId);
      const pageNo = Math.max(1, Math.floor(Number(request.query.page)) || 1);
      const { rows, total } = await ctx.db.transaction(request.siteId, async (tx) => {
        const mine = eq(orders.customerId, request.user!.id);
        const list = await tx
          .select()
          .from(orders)
          .where(mine)
          .orderBy(desc(orders.createdAt))
          .limit(PER_PAGE)
          .offset((pageNo - 1) * PER_PAGE);
        const [counted] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(orders)
          .where(mine);
        return { rows: list, total: counted?.n ?? 0 };
      });
      const money = moneyFormatter(request.locale, store.currency);
      const pages = Math.ceil(total / PER_PAGE);
      const content = html`<p><a href="${prefix}/account">← ${t('Your account')}</a></p>
        ${
          rows.length === 0
            ? html`<p>${t('You have no orders yet.')}</p>
                <p><a class="shop-button" href="${prefix}/shop">${t('Go to the shop')}</a></p>`
            : html`<table class="shop-table">
                <thead>
                  <tr>
                    <th scope="col">${t('Order')}</th>
                    <th scope="col">${t('Date')}</th>
                    <th scope="col">${t('Status')}</th>
                    <th scope="col" class="num">${t('Total')}</th>
                    <th scope="col"><span class="shop-sr">${t('Details')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(
                    (o) =>
                      html`<tr>
                        <td>#${o.number}</td>
                        <td>
                          ${new Date(o.createdAt).toLocaleDateString(request.locale, { dateStyle: 'medium' })}
                        </td>
                        <td>${statusLabel(t, o.status)}</td>
                        <td class="num">${money.of(o.total)}</td>
                        <td>
                          <a href="${prefix}/account/orders/${o.number}"
                            >${t('View')}<span class="shop-sr">
                              ${t('Order {number}', { number: o.number })}</span
                            ></a
                          >
                        </td>
                      </tr>`,
                  )}
                </tbody>
              </table>`
        }
        ${
          pages > 1
            ? html`<p class="shop-actions">
                ${pageNo > 1 ? html`<a href="?page=${pageNo - 1}">← ${t('Previous')}</a>` : html`<span></span>`}
                ${pageNo < pages ? html`<a href="?page=${pageNo + 1}">${t('Next')} →</a>` : ''}
              </p>`
            : ''
        }`;
      return page(t('Your orders'), content.value);
    },
  });

  ctx.routes.public({
    method: 'GET',
    path: '/account/orders/:number',
    async handler(request) {
      const away = signedIn(request);
      if (away) return away;
      const t = translator(request.locale);
      const prefix = prefixOf(request);
      const number = Number(request.params.number);
      const found = Number.isSafeInteger(number)
        ? await ctx.db.transaction(request.siteId, (tx) => orderByNumber(tx, number))
        : null;
      // Only the customer's own orders; others do not exist for them.
      if (!found || found.order.customerId !== request.user!.id)
        return page(t('Order'), `<p>${t('This order does not exist.')}</p>`, 404);
      return {
        headers: { 'cache-control': 'private, no-store' },
        page: {
          title: t('Order {number}', { number: found.order.number }),
          html: receivedPage({
            order: found.order,
            items: found.items,
            t,
            locale: request.locale,
            bank: null,
            account: { back: `${prefix}/account/orders` },
          }),
        },
      };
    },
  });

  // ---- Addresses ---------------------------------------------------------------------

  const addressesPage = async (
    request: RouteRequest,
    values: { billing: Address; shipping: Address; differentShipping: boolean; invoice: Invoice },
    errors: Record<string, string>,
    notice?: { kind: 'ok' | 'error'; text: string },
  ): Promise<RouteResponse> => {
    const t = translator(request.locale);
    const prefix = prefixOf(request);
    const store = await settings(request.siteId);
    const { field, addressFields } = formParts({
      t,
      errors,
      locale: request.locale,
      phoneRequired: store.phoneRequired,
    });
    const content = html`<p><a href="${prefix}/account">← ${t('Your account')}</a></p>
      ${notice ? html`<p class="shop-notice${notice.kind === 'error' ? ' shop-notice--error' : ''}" role="${notice.kind === 'error' ? 'alert' : 'status'}">${notice.text}</p>` : ''}
      <p>${t('The checkout fills these in for you.')}</p>
      <form method="post" action="${prefix}/account/addresses" novalidate>
        <h2>${t('Billing address')}</h2>
        <div class="shop-fields">${addressFields('billing', values.billing, 'billing')}</div>
        <details
          class="shop-more"
          ${values.invoice.taxCode || values.invoice.vatNumber ? raw(' open') : ''}
        >
          <summary>${t('I need an invoice')}</summary>
          <div class="shop-fields" style="margin-top:.75rem">
            ${field('invoice.taxCode', t('Tax code (codice fiscale)'), values.invoice.taxCode)}
            ${field('invoice.vatNumber', t('VAT number (partita IVA)'), values.invoice.vatNumber)}
            ${field('invoice.sdi', t('Recipient code (SDI)'), values.invoice.sdi)}
            ${field('invoice.pec', t('PEC'), values.invoice.pec, { type: 'email' })}
          </div>
        </details>
        <h2>${t('Shipping address')}</h2>
        <label class="shop-check"
          ><input
            type="checkbox"
            name="differentShipping"
            value="1"
            ${values.differentShipping ? raw(' checked') : ''}
          />
          ${t('Ship to a different address')}</label
        >
        <div class="shop-fields">${addressFields('shipping', values.shipping, 'shipping')}</div>
        <p><button class="shop-button" type="submit">${t('Save addresses')}</button></p>
      </form>`;
    return page(t('Addresses'), content.value, Object.keys(errors).length ? 422 : 200);
  };

  ctx.routes.public({
    method: 'GET',
    path: '/account/addresses',
    async handler(request) {
      const away = signedIn(request);
      if (away) return away;
      const t = translator(request.locale);
      const customer = await ctx.db.transaction(request.siteId, (tx) =>
        customerOf(tx, request.user!.id),
      );
      const billing = customer?.billing ?? emptyAddress();
      return addressesPage(
        request,
        {
          billing,
          shipping: customer?.shipping ?? billing,
          differentShipping:
            !!customer?.shipping && !sameAddress(customer.billing, customer.shipping),
          invoice: customer?.invoice ?? { taxCode: '', vatNumber: '', sdi: '', pec: '' },
        },
        {},
        request.query.saved ? { kind: 'ok', text: t('Addresses saved.') } : undefined,
      );
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: '/account/addresses',
    async handler(request) {
      const away = signedIn(request);
      if (away) return away;
      const t = translator(request.locale);
      const store = await settings(request.siteId);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const text = (name: string, max = 200) => {
        const value = body[name];
        return typeof value === 'string' ? value.trim().slice(0, max) : '';
      };
      const address = (prefix: string): Address => ({
        firstName: text(`${prefix}.firstName`, 100),
        lastName: text(`${prefix}.lastName`, 100),
        company: text(`${prefix}.company`, 150),
        address1: text(`${prefix}.address1`),
        address2: text(`${prefix}.address2`),
        city: text(`${prefix}.city`, 100),
        postcode: text(`${prefix}.postcode`, 20),
        province: text(`${prefix}.province`, 100),
        country: text(`${prefix}.country`, 2).toUpperCase() || 'IT',
        phone: text(`${prefix}.phone`, 30),
      });
      const invoice: Invoice = {
        taxCode: text('invoice.taxCode', 20).toUpperCase(),
        vatNumber: text('invoice.vatNumber', 20).toUpperCase(),
        sdi: text('invoice.sdi', 7).toUpperCase(),
        pec: text('invoice.pec'),
      };
      const values = {
        billing: address('billing'),
        shipping: address('shipping'),
        differentShipping: text('differentShipping', 1) === '1',
        invoice,
      };
      const errors: Record<string, string> = {};
      for (const [key, message] of Object.entries(
        checkAddress(values.billing, { phoneRequired: store.phoneRequired }),
      ))
        errors[`billing.${key}`] = message!;
      if (values.differentShipping)
        for (const [key, message] of Object.entries(
          checkAddress(values.shipping, { phoneRequired: false }),
        ))
          errors[`shipping.${key}`] = message!;
      for (const [key, message] of Object.entries(checkInvoice(invoice)))
        errors[`invoice.${key}`] = message!;
      if (Object.keys(errors).length)
        return addressesPage(request, values, errors, {
          kind: 'error',
          text: t('Please correct the fields marked below.'),
        });
      const billing = normalizeAddress(values.billing);
      await ctx.db.transaction(request.siteId, (tx) =>
        saveCustomer(tx, request.siteId, request.user!.id, {
          billing,
          shipping: values.differentShipping ? normalizeAddress(values.shipping) : billing,
          invoice: Object.values(invoice).some(Boolean) ? invoice : null,
        }),
      );
      return {
        status: 303,
        headers: { location: `${prefixOf(request)}/account/addresses?saved=1` },
      };
    },
  });
}
