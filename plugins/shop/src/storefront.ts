import type { PluginContext, RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import { eq } from 'drizzle-orm';
import {
  checkAddress,
  checkInvoice,
  normalizeAddress,
  type Address,
  type Invoice,
} from './address';
import { productTag } from './buy-box';
import {
  addItem,
  CART_COOKIE,
  CART_DAYS,
  findVariation,
  itemKey,
  loadCart,
  newToken,
  priceCart,
  saveCart,
  type CartLine,
} from './cart';
import { orderByNumber, placeOrder, StockError } from './orders';
import {
  cartPage,
  checkoutPage,
  emptyAddress,
  moneyFormatter,
  receivedPage,
  type CheckoutValues,
  type PageUrls,
  type PaymentOption,
} from './pages';
import { products } from './schema';
import { translator } from './strings';
import { computeTotals } from './totals';

/** What the storefront needs from the shop's settings. */
export interface StoreSettings {
  currency: string;
  pricesIncludeTax: boolean;
  phoneRequired: boolean;
  termsUrl: string;
  bank: {
    enabled: boolean;
    accountName: string;
    iban: string;
    bic: string;
    bankName: string;
    instructions: string;
  };
}

const text = (body: Record<string, unknown>, name: string, max = 200) => {
  const value = body[name];
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The language prefix of a public address: `/it` for `/it/cart`, '' for the default language. */
const prefixOf = (request: RouteRequest) =>
  request.locale && request.path.startsWith(`/${request.locale}/`) ? `/${request.locale}` : '';

function withQuery(path: string, params: Record<string, string>): string {
  const [base, query = ''] = path.split('?');
  const search = new URLSearchParams(query);
  for (const [k, v] of Object.entries(params)) search.set(k, v);
  return `${base}?${search}`;
}

export function registerStorefront(
  ctx: PluginContext,
  settings: (siteId: string) => Promise<StoreSettings>,
): void {
  const cookieOf = (token: string) => ({
    name: CART_COOKIE,
    value: token,
    maxAge: CART_DAYS * 86_400,
  });

  const urlsFor = async (request: RouteRequest, lines: CartLine[]): Promise<PageUrls> => {
    const prefix = prefixOf(request);
    const entries = lines.length
      ? await ctx.content.find(request.siteId, { ids: lines.map((l) => l.productId), limit: 200 })
      : [];
    const urls = new Map(entries.map((e) => [e.id, e.url]));
    return {
      cart: `${prefix}/cart`,
      checkout: `${prefix}/checkout`,
      shop: `${prefix}/`,
      product: (line) => urls.get(line.productId) ?? `${prefix}/`,
    };
  };

  const payments = (values: StoreSettings, t: ReturnType<typeof translator>): PaymentOption[] =>
    values.bank.enabled
      ? [{ id: 'bacs', title: t('Bank transfer'), description: values.bank.instructions }]
      : [];

  /** The cart priced now; items that changed are written back. */
  const currentCart = async (request: RouteRequest) => {
    const token = request.cookies[CART_COOKIE];
    return ctx.db.transaction(request.siteId, async (tx) => {
      const items = await loadCart(tx, token);
      const priced = await priceCart(tx, items);
      if (token && (priced.dropped.length || priced.lowered.length))
        await saveCart(tx, request.siteId, token, priced.items, request.user?.id ?? null);
      return { token, ...priced };
    });
  };

  const totalsOf = (lines: CartLine[], values: StoreSettings) =>
    computeTotals({
      lines: lines.map((l) => ({
        key: l.key,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        taxStatus: l.taxStatus,
        taxClass: l.taxClass,
      })),
      pricesIncludeTax: values.pricesIncludeTax,
      // Tax rates arrive with the taxes milestone: prices are what customers pay.
      rates: {},
    });

  // ---- Cart ------------------------------------------------------------------------

  ctx.routes.public({
    method: 'GET',
    path: '/cart',
    async handler(request) {
      const t = translator(request.locale);
      const values = await settings(request.siteId);
      const cart = await currentCart(request);
      const notices: { kind: 'ok' | 'error'; text: string }[] = [];
      if (request.query.added)
        notices.push({
          kind: 'ok',
          text: t('Added to your cart: {name}.', { name: request.query.added.slice(0, 200) }),
        });
      if (request.query.updated) notices.push({ kind: 'ok', text: t('Cart updated.') });
      if (request.query.error)
        notices.push({ kind: 'error', text: request.query.error.slice(0, 300) });
      for (const name of [...cart.dropped, ...cart.lowered])
        notices.push({
          kind: 'error',
          text: t('Sorry, “{name}” is not available in that quantity any more.', { name }),
        });
      return {
        page: {
          title: t('Cart'),
          html: cartPage({
            lines: cart.lines,
            totals: totalsOf(cart.lines, values),
            t,
            money: moneyFormatter(request.locale, values.currency),
            urls: await urlsFor(request, cart.lines),
            includeTax: values.pricesIncludeTax,
            notices,
          }),
        },
      };
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: '/cart/add',
    async handler(request) {
      const t = translator(request.locale);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const productId = text(body, 'product', 40);
      const quantity = Math.max(
        1,
        Math.min(9999, Math.floor(Number(text(body, 'quantity', 6) || 1)) || 1),
      );
      const prefix = prefixOf(request);
      const chosen = Object.fromEntries(
        Object.entries(body)
          .filter(([k, v]) => k.startsWith('attribute_') && typeof v === 'string')
          .map(([k, v]) => [k.slice('attribute_'.length), String(v)]),
      );
      const token = request.cookies[CART_COOKIE] || newToken();
      const outcome = await ctx.db.transaction(request.siteId, async (tx) => {
        const [product] = /^[0-9a-f-]{36}$/i.test(productId)
          ? await tx.select().from(products).where(eq(products.entryId, productId))
          : [];
        if (!product || product.status !== 'published')
          return { error: t('This product cannot be bought now.') };
        const variation =
          product.kind === 'variable' ? await findVariation(tx, product.entryId, chosen) : null;
        if (product.kind === 'variable' && !variation)
          return { error: t('This combination is not available.') };
        const items = addItem(
          await loadCart(tx, token),
          { product: product.entryId, variation: variation?.id ?? null, quantity },
          product.soldIndividually,
        );
        const priced = await priceCart(tx, items);
        const line = priced.lines.find(
          (l) => l.key === itemKey({ product: product.entryId, variation: variation?.id ?? null }),
        );
        if (!line) return { error: t('This product cannot be bought now.') };
        await saveCart(tx, request.siteId, token, priced.items, request.user?.id ?? null);
        return { name: line.title, lowered: priced.lowered.includes(line.title) };
      });
      if ('error' in outcome)
        return {
          status: 303,
          headers: { location: withQuery(`${prefix}/cart`, { error: outcome.error! }) },
        };
      return {
        status: 303,
        cookies: [cookieOf(token)],
        headers: {
          location: outcome.lowered
            ? `${prefix}/cart`
            : withQuery(`${prefix}/cart`, { added: outcome.name }),
        },
      };
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: '/cart/update',
    async handler(request) {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const prefix = prefixOf(request);
      const token = request.cookies[CART_COOKIE];
      if (token) {
        await ctx.db.transaction(request.siteId, async (tx) => {
          const remove = text(body, 'remove', 100);
          const items = (await loadCart(tx, token))
            .map((item) => {
              const raw = body[`qty_${itemKey(item)}`];
              const quantity = typeof raw === 'string' ? Math.floor(Number(raw)) : item.quantity;
              return {
                ...item,
                quantity: Number.isFinite(quantity) ? Math.min(quantity, 9999) : item.quantity,
              };
            })
            .filter((item) => item.quantity > 0 && itemKey(item) !== remove);
          const priced = await priceCart(tx, items);
          await saveCart(tx, request.siteId, token, priced.items, request.user?.id ?? null);
        });
      }
      return { status: 303, headers: { location: `${prefix}/cart?updated=1` } };
    },
  });

  // ---- Checkout ----------------------------------------------------------------------

  const readValues = (body: Record<string, unknown>): CheckoutValues => {
    const address = (prefix: string): Address => ({
      firstName: text(body, `${prefix}.firstName`, 100),
      lastName: text(body, `${prefix}.lastName`, 100),
      company: text(body, `${prefix}.company`, 150),
      address1: text(body, `${prefix}.address1`, 200),
      address2: text(body, `${prefix}.address2`, 200),
      city: text(body, `${prefix}.city`, 100),
      postcode: text(body, `${prefix}.postcode`, 20),
      province: text(body, `${prefix}.province`, 100),
      country: text(body, `${prefix}.country`, 2).toUpperCase() || 'IT',
      phone: text(body, `${prefix}.phone`, 30),
    });
    const invoice: Invoice = {
      taxCode: text(body, 'invoice.taxCode', 20).toUpperCase(),
      vatNumber: text(body, 'invoice.vatNumber', 20).toUpperCase(),
      sdi: text(body, 'invoice.sdi', 7).toUpperCase(),
      pec: text(body, 'invoice.pec', 200),
    };
    return {
      email: text(body, 'email', 200),
      billing: address('billing'),
      shipping: address('shipping'),
      differentShipping: text(body, 'differentShipping', 1) === '1',
      wantsInvoice: Object.values(invoice).some(Boolean),
      invoice,
      note: text(body, 'note', 2000),
      payment: text(body, 'payment', 40),
      terms: text(body, 'terms', 1) === '1',
    };
  };

  const renderCheckout = async (
    request: RouteRequest,
    values: CheckoutValues,
    errors: Record<string, string>,
    notice?: string,
  ): Promise<RouteResponse> => {
    const t = translator(request.locale);
    const store = await settings(request.siteId);
    const cart = await currentCart(request);
    const prefix = prefixOf(request);
    if (cart.lines.length === 0) return { status: 303, headers: { location: `${prefix}/cart` } };
    return {
      status: Object.keys(errors).length || notice ? 422 : 200,
      page: {
        title: t('Checkout'),
        html: checkoutPage({
          values,
          errors,
          lines: cart.lines,
          totals: totalsOf(cart.lines, store),
          t,
          money: moneyFormatter(request.locale, store.currency),
          urls: await urlsFor(request, cart.lines),
          locale: request.locale,
          includeTax: store.pricesIncludeTax,
          payments: payments(store, t),
          termsUrl: store.termsUrl,
          phoneRequired: store.phoneRequired,
          ...(notice ? { notice } : {}),
        }),
      },
    };
  };

  ctx.routes.public({
    method: 'GET',
    path: '/checkout',
    handler: (request) =>
      renderCheckout(
        request,
        {
          email: '',
          billing: emptyAddress(),
          shipping: emptyAddress(),
          differentShipping: false,
          wantsInvoice: false,
          invoice: { taxCode: '', vatNumber: '', sdi: '', pec: '' },
          note: '',
          payment: '',
          terms: false,
        },
        {},
      ),
  });

  ctx.routes.public({
    method: 'POST',
    path: '/checkout',
    async handler(request) {
      const t = translator(request.locale);
      const store = await settings(request.siteId);
      const values = readValues((request.body ?? {}) as Record<string, unknown>);
      const errors: Record<string, string> = {};
      if (!EMAIL_RE.test(values.email)) errors.email = 'Not a valid email address';
      for (const [key, message] of Object.entries(
        checkAddress(values.billing, { phoneRequired: store.phoneRequired }),
      ))
        errors[`billing.${key}`] = message!;
      if (values.differentShipping)
        for (const [key, message] of Object.entries(
          checkAddress(values.shipping, { phoneRequired: false }),
        ))
          errors[`shipping.${key}`] = message!;
      for (const [key, message] of Object.entries(checkInvoice(values.invoice)))
        errors[`invoice.${key}`] = message!;
      const methods = payments(store, t);
      const method =
        methods.find((m) => m.id === values.payment) ??
        (methods.length === 1 ? methods[0] : undefined);
      if (!method) errors.payment = 'Choose a way to pay.';
      if (store.termsUrl && !values.terms) errors.terms = 'Accept the terms to place the order.';
      if (Object.keys(errors).length > 0)
        return renderCheckout(
          request,
          values,
          errors,
          t('Please correct the fields marked below.'),
        );

      const token = request.cookies[CART_COOKIE];
      const prefix = prefixOf(request);
      const billing = normalizeAddress(values.billing);
      const shipping = values.differentShipping ? normalizeAddress(values.shipping) : billing;
      try {
        const placed = await ctx.db.transaction(request.siteId, async (tx) => {
          const items = await loadCart(tx, token);
          const priced = await priceCart(tx, items);
          // Prices or stock changed since the page was shown: the customer looks again.
          if (priced.lines.length === 0 || priced.dropped.length || priced.lowered.length) {
            if (token)
              await saveCart(tx, request.siteId, token, priced.items, request.user?.id ?? null);
            return null;
          }
          const order = await placeOrder(tx, request.siteId, {
            locale: request.locale,
            currency: store.currency,
            pricesIncludeTax: store.pricesIncludeTax,
            lines: priced.lines,
            totals: totalsOf(priced.lines, store),
            email: values.email.toLowerCase(),
            billing,
            shipping,
            invoice: values.wantsInvoice ? values.invoice : null,
            customerNote: values.note,
            customerId: request.user?.id ?? null,
            payment: { method: method!.id, title: method!.title },
            // A bank transfer is waiting for the money.
            status: 'on-hold',
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? '',
          });
          await saveCart(tx, request.siteId, token!, [], request.user?.id ?? null);
          return { order, products: priced.lines.map((l) => l.productId) };
        });
        if (!placed)
          return {
            status: 303,
            headers: {
              location: withQuery(`${prefix}/cart`, {
                error: t('Some products changed: check your cart.'),
              }),
            },
          };
        await ctx.cache.invalidate(request.siteId, [...new Set(placed.products)].map(productTag));
        await ctx.hooks.emit(
          'shop.order.created',
          { orderId: placed.order.id, number: placed.order.number },
          { siteId: request.siteId },
        );
        return {
          status: 303,
          headers: {
            location: `${prefix}/order-received/${placed.order.number}?key=${placed.order.key}`,
          },
        };
      } catch (error) {
        if (error instanceof StockError)
          return {
            status: 303,
            headers: {
              location: withQuery(`${prefix}/cart`, {
                error: t('Sorry, “{name}” is not available in that quantity any more.', {
                  name: error.productName,
                }),
              }),
            },
          };
        throw error;
      }
    },
  });

  ctx.routes.public({
    method: 'GET',
    path: '/order-received/:number',
    async handler(request) {
      const t = translator(request.locale);
      const number = Number(request.params.number);
      const found = Number.isSafeInteger(number)
        ? await ctx.db.transaction(request.siteId, (tx) => orderByNumber(tx, number))
        : null;
      // The key in the address proves it is the customer's order.
      if (!found || found.order.key !== request.query.key)
        return {
          status: 404,
          page: { title: t('Order received'), html: `<p>${t('This order does not exist.')}</p>` },
        };
      const store = await settings(request.siteId);
      return {
        page: {
          title: t('Order received'),
          html: receivedPage({
            order: found.order,
            items: found.items,
            t: translator(found.order.locale),
            locale: found.order.locale,
            bank:
              found.order.paymentMethod === 'bacs' &&
              ['on-hold', 'pending'].includes(found.order.status)
                ? store.bank
                : null,
          }),
        },
      };
    },
  });
}
