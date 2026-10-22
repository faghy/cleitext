import type { PluginContext, RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import { and, eq } from 'drizzle-orm';
import {
  checkAddress,
  checkInvoice,
  normalizeAddress,
  type Address,
  type Invoice,
} from './address';
import { productTags } from './buy-box';
import {
  adoptCart,
  addItem,
  CART_COOKIE,
  CART_DAYS,
  findVariation,
  itemKey,
  loadCart,
  loadCoupons,
  newToken,
  priceCart,
  saveCart,
  saveCoupons,
  type CartLine,
} from './cart';
import { cartJson, readQuantity, removeItem, setQuantity, type CartJson } from './cart-api';
import type { CouponProblem } from './coupons';
import { CouponError, orderByNumber, placeOrder, StockError } from './orders';
import {
  cartPage,
  checkoutPage,
  emptyAddress,
  moneyFormatter,
  receivedPage,
  type CheckoutValues,
  type Money,
  type PageUrls,
  type PaymentOption,
} from './pages';
import { customerOf, saveCustomer } from './account';
import type { PaymentInstructions } from './pages';
import {
  availablePayments,
  localizePayments,
  type PaymentContext,
  type PaymentId,
  type Payments,
} from './payments';
import { couponOf, quote, type Quote, type QuoteInput } from './quote';
import { coupons, products, type CartItem, type OrderRow } from './schema';
import type { Destination } from './shipping';
import { translator, type Translate } from './strings';

/** The checkout's id for the site's bot protection (`ctx.forms`, plugin API 1.38). */
const CHECKOUT_FORM = 'shop/checkout';

/** What the storefront needs from the shop's settings. */
export interface StoreSettings {
  currency: string;
  pricesIncludeTax: boolean;
  phoneRequired: boolean;
  termsUrl: string;
  /** Where the shop is: taxes until the customer gives an address. */
  baseCountry: string;
  taxesEnabled: boolean;
  /** Ways to pay (Shop → Payments). */
  payments: Payments;
  /** Online ways to pay whose keys are set. */
  ready: Partial<Record<PaymentId, boolean>>;
}

const DEFAULT_TITLES: Record<PaymentId, string> = {
  bacs: 'Bank transfer',
  cod: 'Cash on delivery',
  stripe: 'Credit or debit card',
  paypal: 'PayPal',
};

/** The store's settings with the texts of the ways to pay in a language. */
export const inLanguage = <S extends Pick<StoreSettings, 'payments'>>(
  store: S,
  locale: string,
): S => ({
  ...store,
  payments: localizePayments(store.payments, locale),
});

/** The default name of a way to pay, in the customer's language. */
export const paymentTitle = (store: Pick<StoreSettings, 'payments'>, id: PaymentId, t: Translate) =>
  store.payments[id].title || t(DEFAULT_TITLES[id]);

/** What an order's page and emails tell the customer about paying. */
export function paymentInstructions(
  store: Pick<StoreSettings, 'payments'>,
  order: { paymentMethod: string; status: string },
): PaymentInstructions | null {
  if (order.paymentMethod === 'bacs') {
    const awaited = ['on-hold', 'pending'].includes(order.status);
    const { instructions, accounts } = store.payments.bacs;
    return awaited ? { method: 'bacs', instructions, accounts } : null;
  }
  if (order.paymentMethod === 'cod' && ['processing', 'on-hold'].includes(order.status))
    return { method: 'cod', instructions: store.payments.cod.instructions, accounts: [] };
  return null;
}

const text = (body: Record<string, unknown>, name: string, max = 200) => {
  const value = body[name];
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What the customer reads when a coupon does not apply. */
export function couponMessage(
  t: Translate,
  code: string,
  problem: CouponProblem | 'unknown',
): string {
  const messages: Record<CouponProblem | 'unknown', string> = {
    unknown: 'Coupon “{code}” does not exist.',
    expired: 'Coupon “{code}” has expired.',
    used_up: 'Coupon “{code}” has been used up.',
    used_up_by_you: 'You have already used coupon “{code}”.',
    min_spend: 'Coupon “{code}” needs a larger order.',
    max_spend: 'Coupon “{code}” is for smaller orders.',
    not_applicable: 'Coupon “{code}” does not apply to the products in your cart.',
    email: 'Coupon “{code}” is not valid for your email address.',
    individual: 'Coupon “{code}” cannot be used together with other coupons.',
    already: 'Coupon “{code}” is already applied.',
  };
  return t(messages[problem], { code });
}

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
  /** After an order is placed: its emails. Failures are logged, the order stays. */
  onPlaced: (siteId: string, orderId: string, origin: string) => Promise<void> = async () => {},
  /** Online payments: the provider's page where the customer pays a pending order. */
  online?: {
    start: (siteId: string, origin: string, prefix: string, order: OrderRow) => Promise<string>;
  },
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

  /** The ways to pay this cart, as the checkout lists them. */
  const payments = (
    values: StoreSettings,
    t: Translate,
    money: Money,
    cart: PaymentContext,
  ): PaymentOption[] =>
    availablePayments(values.payments, cart).map((id) => ({
      id,
      title: paymentTitle(values, id, t),
      description: [
        values.payments[id].description,
        id === 'cod' && Number(values.payments.cod.fee) > 0
          ? t('Surcharge: {amount}.', { amount: money.of(values.payments.cod.fee) })
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    }));

  const base = (store: StoreSettings): Destination => ({
    country: store.baseCountry,
    province: '',
    postcode: '',
  });

  /**
   * The cart priced now, with its coupons, shipping and taxes; items that
   * changed are written back, and coupons that no longer apply dropped
   * (only on the cart page: at checkout the customer is told).
   */
  const currentCart = async (
    request: RouteRequest,
    store: StoreSettings,
    t: Translate,
    options: Partial<Omit<QuoteInput, 'lines' | 'codes'>> = {},
  ) => {
    let token = request.cookies[CART_COOKIE];
    return ctx.db.transaction(request.siteId, async (tx) => {
      let items = await loadCart(tx, token);
      // Signed in with an empty cart: the one left on another device.
      let adopted: string | null = null;
      if (items.length === 0 && request.user) {
        const found = await adoptCart(tx, request.siteId, token, request.user.id);
        if (found) {
          ({ token, items } = found);
          adopted = found.token;
        }
      }
      const priced = await priceCart(tx, items, request.locale);
      const codes = await loadCoupons(tx, token);
      const quoted = await quote(tx, quoteSettings(store, t), {
        locale: request.locale,
        lines: priced.lines,
        codes,
        to: options.to ?? base(store),
        shipping: options.shipping ?? false,
        ...options,
      });
      if (token && (priced.dropped.length || priced.lowered.length))
        await saveCart(tx, request.siteId, token, priced.items, request.user?.id ?? null);
      if (token && quoted.rejected.length && !options.customer)
        await saveCoupons(
          tx,
          request.siteId,
          token,
          codes.filter((c) => !quoted.rejected.some((r) => r.code === c)),
          request.user?.id ?? null,
        );
      return { token, ...priced, quote: quoted, cookie: adopted };
    });
  };

  const quoteSettings = (store: StoreSettings, t: Translate) => ({
    pricesIncludeTax: store.pricesIncludeTax,
    taxesEnabled: store.taxesEnabled,
    cod: {
      enabled: store.payments.cod.enabled,
      fee: store.payments.cod.fee || '0',
      taxable: store.payments.cod.feeTaxable,
      title: paymentTitle(store, 'cod', t),
      shippingMethods: store.payments.cod.shippingMethods,
      virtual: store.payments.cod.virtual,
    },
  });

  const couponViews = (quoted: Quote) =>
    quoted.coupons.map((c) => ({ code: c.coupon.code, discount: c.discount }));

  // ---- Cart ------------------------------------------------------------------------

  /** The cart page's content for a request: its lines, totals, notices and markup. */
  const cartView = async (request: RouteRequest) => {
    const t = translator(request.locale);
    const values = inLanguage(await settings(request.siteId), request.locale);
    const cart = await currentCart(request, values, t);
    const notices: { kind: 'ok' | 'error'; text: string }[] = [];
    if (request.query.added)
      notices.push({
        kind: 'ok',
        text: t('Added to your cart: {name}.', { name: request.query.added.slice(0, 200) }),
      });
    if (request.query.updated) notices.push({ kind: 'ok', text: t('Cart updated.') });
    if (request.query.error)
      notices.push({ kind: 'error', text: request.query.error.slice(0, 300) });
    if (request.query.coupon)
      notices.push({
        kind: 'ok',
        text: t('Coupon applied: {code}.', { code: request.query.coupon.slice(0, 60) }),
      });
    for (const r of cart.quote.rejected)
      notices.push({ kind: 'error', text: couponMessage(t, r.code, r.problem) });
    for (const name of [...cart.dropped, ...cart.lowered])
      notices.push({
        kind: 'error',
        text: t('Sorry, “{name}” is not available in that quantity any more.', { name }),
      });
    const money = moneyFormatter(request.locale, values.currency);
    const urls = await urlsFor(request, cart.lines);
    return {
      t,
      cart,
      values,
      notices,
      money,
      urls,
      html: () =>
        cartPage({
          lines: cart.lines,
          totals: cart.quote.totals,
          t,
          money,
          urls,
          includeTax: values.pricesIncludeTax,
          notices,
          coupons: couponViews(cart.quote),
          needsShipping: cart.quote.shippingSetUp,
        }),
    };
  };

  ctx.routes.public({
    method: 'GET',
    path: '/cart',
    async handler(request) {
      const { t, cart, html } = await cartView(request);
      return {
        ...(cart.cookie ? { cookies: [cookieOf(cart.cookie)] } : {}),
        page: { title: t('Cart'), html: html() },
      };
    },
  });

  /** The cart as JSON (see `CartJson`), with the page's markup when `?html=1`. */
  const cartData = async (request: RouteRequest): Promise<RouteResponse> => {
    const view = await cartView(request);
    const body: CartJson = cartJson({
      lines: view.cart.lines,
      totals: view.cart.quote.totals,
      coupons: couponViews(view.cart.quote),
      currency: view.values.currency,
      includeTax: view.values.pricesIncludeTax,
      money: view.money,
      notices: view.notices,
      urls: view.urls,
    });
    if (request.query.html === '1') body.html = view.html();
    return {
      body,
      headers: { 'cache-control': 'private, no-store' },
      ...(view.cart.cookie ? { cookies: [cookieOf(view.cart.cookie)] } : {}),
    };
  };

  /** The visitor's cart, for page builders and scripts (never cached). */
  ctx.routes.public({ method: 'GET', path: '/cart/data', handler: cartData });

  /** How many items the cart holds, for the cart link on cached pages. */
  ctx.routes.public({
    method: 'GET',
    path: '/cart/count',
    async handler(request) {
      const t = translator(request.locale);
      const token = request.cookies[CART_COOKIE];
      const items = token
        ? await ctx.db.transaction(request.siteId, (tx) => loadCart(tx, token))
        : [];
      const count = items.reduce((sum, item) => sum + item.quantity, 0);
      return {
        body: { count, label: t('Cart: {n} items', { n: count }) },
        headers: { 'cache-control': 'private, no-store' },
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
        const priced = await priceCart(tx, items, request.locale);
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
          const priced = await priceCart(tx, items, request.locale);
          await saveCart(tx, request.siteId, token, priced.items, request.user?.id ?? null);
        });
      }
      return { status: 303, headers: { location: `${prefix}/cart?updated=1` } };
    },
  });

  /**
   * Changes an item's quantity (0 removes it) or removes it, with the cart
   * page's rules, and answers with the cart as JSON (`/cart/data`). Same-origin
   * requests only, as every public form. JSON or form bodies: `key`, `quantity`.
   */
  const changeItem = async (
    request: RouteRequest,
    change: (items: CartItem[], key: string, body: Record<string, unknown>) => CartItem[] | null,
  ): Promise<RouteResponse> => {
    const t = translator(request.locale);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const key = text(body, 'key', 100);
    const token = request.cookies[CART_COOKIE];
    const changed = token
      ? await ctx.db.transaction(request.siteId, async (tx) => {
          const next = change(await loadCart(tx, token), key, body);
          if (!next) return false;
          const priced = await priceCart(tx, next, request.locale);
          await saveCart(tx, request.siteId, token, priced.items, request.user?.id ?? null);
          return true;
        })
      : false;
    if (!changed)
      return {
        status: 404,
        body: { error: t('This product is not in your cart.') },
        headers: { 'cache-control': 'private, no-store' },
      };
    return cartData({ ...request, query: {} });
  };

  ctx.routes.public({
    method: 'POST',
    path: '/cart/item',
    async handler(request) {
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (readQuantity(body.quantity) === null) {
        const t = translator(request.locale);
        return {
          status: 400,
          body: { error: t('Enter a quantity.') },
          headers: { 'cache-control': 'private, no-store' },
        };
      }
      return changeItem(request, (items, key, b) =>
        setQuantity(items, key, readQuantity(b.quantity)!),
      );
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: '/cart/item/remove',
    handler: (request) => changeItem(request, (items, key) => removeItem(items, key)),
  });

  ctx.routes.public({
    method: 'POST',
    path: '/cart/coupon',
    async handler(request) {
      const t = translator(request.locale);
      const store = inLanguage(await settings(request.siteId), request.locale);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const prefix = prefixOf(request);
      const token = request.cookies[CART_COOKIE] || newToken();
      const remove = text(body, 'remove', 60).toLowerCase();
      const code = text(body, 'code', 60).toLowerCase();
      const back = (params: Record<string, string>) => ({
        status: 303,
        cookies: [cookieOf(token)],
        headers: { location: withQuery(`${prefix}/cart`, params) },
      });
      if (!remove && !code) return back({ error: t('Enter a coupon code.') });
      const outcome = await ctx.db.transaction(request.siteId, async (tx) => {
        const codes = await loadCoupons(tx, token);
        const userId = request.user?.id ?? null;
        if (remove) {
          await saveCoupons(
            tx,
            request.siteId,
            token,
            codes.filter((c) => c !== remove),
            userId,
          );
          return { removed: true };
        }
        if (codes.includes(code)) return { error: couponMessage(t, code, 'already') };
        const [row] = await tx
          .select()
          .from(coupons)
          .where(and(eq(coupons.code, code), eq(coupons.enabled, true)));
        // A coupon for individual use replaces the others (WooCommerce does the same).
        const next = row && couponOf(row).individualUse ? [code] : [...codes, code];
        const priced = await priceCart(tx, await loadCart(tx, token), request.locale);
        const quoted = await quote(tx, quoteSettings(store, t), {
          locale: request.locale,
          lines: priced.lines,
          codes: next,
          to: base(store),
          shipping: false,
        });
        const problem = quoted.rejected.find((r) => r.code === code);
        if (problem) return { error: couponMessage(t, code, problem.problem) };
        await saveCoupons(
          tx,
          request.siteId,
          token,
          next.filter((c) => !quoted.rejected.some((r) => r.code === c)),
          userId,
        );
        return { applied: code };
      });
      if ('error' in outcome) return back({ error: outcome.error! });
      if ('applied' in outcome) return back({ coupon: outcome.applied! });
      return back({ updated: '1' });
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
      rate: text(body, 'rate', 40),
      terms: text(body, 'terms', 1) === '1',
    };
  };

  /** Where the order goes: the shipping address, or the billing one. */
  const destinationOf = (values: CheckoutValues, store: StoreSettings): Destination => {
    const address = values.differentShipping ? values.shipping : values.billing;
    return {
      country: address.country || store.baseCountry,
      province: address.province,
      postcode: address.postcode,
    };
  };

  /** The checkout's markup for a request; `empty` when the cart is (the cart page instead). */
  const checkoutView = async (
    request: RouteRequest,
    values: CheckoutValues,
    errors: Record<string, string>,
    notice?: string,
  ) => {
    const t = translator(request.locale);
    const store = inLanguage(await settings(request.siteId), request.locale);
    const money = moneyFormatter(request.locale, store.currency);
    const cart = await currentCart(request, store, t, {
      to: destinationOf(values, store),
      shipping: true,
      rateId: values.rate,
      payment: values.payment,
    });
    const prefix = prefixOf(request);
    if (cart.lines.length === 0) return { empty: true as const, prefix };
    // The site's bot protection, when a plugin gives one (e.g. Captcha).
    const challenge =
      (await ctx.forms
        ?.challenge({
          siteId: request.siteId,
          form: CHECKOUT_FORM,
          locale: request.locale,
          signedIn: request.user !== null,
        })
        .catch(() => '')) ?? '';
    return {
      empty: false as const,
      prefix,
      cookie: cart.cookie,
      status: Object.keys(errors).length || notice ? 422 : 200,
      title: t('Checkout'),
      html: checkoutPage({
        values: { ...values, rate: cart.quote.rate?.id ?? '' },
        errors,
        lines: cart.lines,
        totals: cart.quote.totals,
        coupons: couponViews(cart.quote),
        needsShipping: cart.quote.needsShipping,
        shippingSetUp: cart.quote.shippingSetUp,
        rates: cart.quote.rates.map((r) => ({
          id: r.id,
          title: r.title,
          cost: r.cost,
          ...(r.note ? { note: r.note } : {}),
        })),
        rate: cart.quote.rate?.id ?? null,
        ...(request.user
          ? {}
          : {
              loginUrl: `${prefix}/account/login?redirect=${encodeURIComponent(`${prefix}/checkout`)}`,
            }),
        t,
        money,
        urls: await urlsFor(request, cart.lines),
        locale: request.locale,
        includeTax: store.pricesIncludeTax,
        payments: payments(store, t, money, {
          needsShipping: cart.quote.needsShipping,
          rateId: cart.quote.rate?.id ?? null,
          ready: store.ready,
        }),
        termsUrl: store.termsUrl,
        phoneRequired: store.phoneRequired,
        ...(notice ? { notice } : {}),
        ...(challenge ? { challenge } : {}),
      }),
    };
  };

  const renderCheckout = async (
    request: RouteRequest,
    values: CheckoutValues,
    errors: Record<string, string>,
    notice?: string,
  ): Promise<RouteResponse> => {
    const view = await checkoutView(request, values, errors, notice);
    if (view.empty) return { status: 303, headers: { location: `${view.prefix}/cart` } };
    return {
      ...(view.cookie ? { cookies: [cookieOf(view.cookie)] } : {}),
      status: view.status,
      page: { title: view.title, html: view.html },
    };
  };

  /** The checkout's first values: a customer with an account finds their latest addresses. */
  const initialValues = async (request: RouteRequest): Promise<CheckoutValues> => {
    const customer = request.user
      ? await ctx.db.transaction(request.siteId, (tx) => customerOf(tx, request.user!.id))
      : null;
    const billing = customer?.billing ?? emptyAddress();
    const shipping = customer?.shipping ?? billing;
    const invoice = customer?.invoice ?? { taxCode: '', vatNumber: '', sdi: '', pec: '' };
    return {
      email: customer?.email ?? '',
      billing,
      shipping,
      differentShipping: JSON.stringify(shipping) !== JSON.stringify(billing),
      wantsInvoice: Object.values(invoice).some(Boolean),
      invoice,
      note: '',
      payment: '',
      rate: '',
      terms: false,
    };
  };

  ctx.routes.public({
    method: 'GET',
    path: '/checkout',
    handler: async (request) => renderCheckout(request, await initialValues(request), {}),
  });

  /**
   * The checkout's markup for the checkout block (pages are cached, carts are
   * not): `{ empty, html, cartUrl, checkoutUrl }`; with an empty cart, the
   * cart page's markup. The form posts to the checkout page as usual.
   */
  ctx.routes.public({
    method: 'GET',
    path: '/checkout/data',
    async handler(request) {
      const view = await checkoutView(request, await initialValues(request), {});
      const urls = { cartUrl: `${view.prefix}/cart`, checkoutUrl: `${view.prefix}/checkout` };
      const headers = { 'cache-control': 'private, no-store' };
      if (view.empty) {
        const cart = await cartView(request);
        return { body: { empty: true, html: cart.html(), ...urls }, headers };
      }
      return {
        body: { empty: false, html: view.html, ...urls },
        headers,
        ...(view.cookie ? { cookies: [cookieOf(view.cookie)] } : {}),
      };
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: '/checkout',
    async handler(request) {
      const t = translator(request.locale);
      const store = inLanguage(await settings(request.siteId), request.locale);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const values = readValues(body);
      // "Update shipping and totals": the page again with the new address.
      if (text(body, 'refresh', 1) === '1') return renderCheckout(request, values, {});
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
      // Switched on now; whether it suits this cart is checked with its shipping, below.
      const enabled = store.payments.order.filter((id) => store.payments[id].enabled);
      const chosen =
        enabled.find((id) => id === values.payment) ??
        (enabled.length === 1 ? enabled[0] : undefined);
      const method = chosen ? { id: chosen, title: paymentTitle(store, chosen, t) } : undefined;
      if (!method) errors.payment = 'Choose a way to pay.';
      if (store.termsUrl && !values.terms) errors.terms = 'Accept the terms to place the order.';
      if (Object.keys(errors).length > 0)
        return renderCheckout(
          request,
          values,
          errors,
          t('Please correct the fields marked below.'),
        );

      // The site's bot protection (Captcha plugin), when there is one.
      const verdict = await ctx.forms?.verify({
        siteId: request.siteId,
        form: CHECKOUT_FORM,
        locale: request.locale,
        fields: body,
        ip: request.ip,
        host: (request.headers.host ?? '').replace(/:\d+$/, ''),
        signedIn: request.user !== null,
      });
      if (verdict && !verdict.ok)
        return renderCheckout(
          request,
          values,
          {},
          verdict.message ?? t('The spam check did not pass: please try again.'),
        );

      const token = request.cookies[CART_COOKIE];
      const prefix = prefixOf(request);
      const billing = normalizeAddress(values.billing);
      const shipping = values.differentShipping ? normalizeAddress(values.shipping) : billing;
      try {
        const placed = await ctx.db.transaction(request.siteId, async (tx) => {
          const items = await loadCart(tx, token);
          const priced = await priceCart(tx, items, request.locale);
          // Prices or stock changed since the page was shown: the customer looks again.
          if (priced.lines.length === 0 || priced.dropped.length || priced.lowered.length) {
            if (token)
              await saveCart(tx, request.siteId, token, priced.items, request.user?.id ?? null);
            return null;
          }
          const quoted = await quote(tx, quoteSettings(store, t), {
            locale: request.locale,
            lines: priced.lines,
            codes: await loadCoupons(tx, token),
            to: destinationOf(values, store),
            shipping: true,
            rateId: values.rate,
            payment: method!.id,
            customer: { email: values.email, userId: request.user?.id ?? null },
          });
          const rejected = quoted.rejected[0];
          if (rejected) return { problem: couponMessage(t, rejected.code, rejected.problem) };
          const allowed = availablePayments(store.payments, {
            needsShipping: quoted.needsShipping,
            rateId: quoted.rate?.id ?? null,
            ready: store.ready,
          });
          if (!allowed.includes(method!.id))
            return {
              problem: t('This way to pay is not available for this order: choose another.'),
            };
          // The rates depend on the address: a rate not offered for it is chosen again.
          if (quoted.shippingSetUp && quoted.rate?.id !== values.rate)
            return { rate: quoted.rates.length ? 'Choose a shipping method.' : 'No shipping' };
          const order = await placeOrder(tx, request.siteId, {
            locale: request.locale,
            currency: store.currency,
            pricesIncludeTax: store.pricesIncludeTax,
            lines: priced.lines,
            totals: quoted.totals,
            shippingRate: quoted.rate ? { id: quoted.rate.id, title: quoted.rate.title } : null,
            coupons: quoted.coupons.map((c) => ({
              id: c.coupon.id,
              code: c.coupon.code,
              discount: c.discount,
            })),
            email: values.email.toLowerCase(),
            billing,
            shipping,
            invoice: values.wantsInvoice ? values.invoice : null,
            customerNote: values.note,
            customerId: request.user?.id ?? null,
            payment: { method: method!.id, title: method!.title },
            // A bank transfer waits for the money, online payments for the provider;
            // cash on delivery ships now.
            status:
              method!.id === 'cod'
                ? 'processing'
                : method!.id === 'stripe' || method!.id === 'paypal'
                  ? 'pending'
                  : 'on-hold',
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? '',
          });
          await saveCart(tx, request.siteId, token!, [], request.user?.id ?? null);
          await saveCoupons(tx, request.siteId, token!, [], request.user?.id ?? null);
          if (request.user)
            await saveCustomer(tx, request.siteId, request.user.id, {
              email: values.email.toLowerCase(),
              billing,
              shipping,
              invoice: values.wantsInvoice ? values.invoice : null,
            });
          return { order, products: priced.lines.map((l) => l.productId) };
        });
        if (placed && 'problem' in placed)
          return renderCheckout(request, values, {}, placed.problem);
        if (placed && 'rate' in placed)
          return renderCheckout(
            request,
            values,
            placed.rate === 'No shipping' ? {} : { rate: placed.rate! },
            placed.rate === 'No shipping'
              ? t('We do not ship to this address: check it, or write to us.')
              : t('Please choose how to ship your order.'),
          );
        if (!placed)
          return {
            status: 303,
            headers: {
              location: withQuery(`${prefix}/cart`, {
                error: t('Some products changed: check your cart.'),
              }),
            },
          };
        await ctx.cache.invalidate(request.siteId, productTags(placed.products));
        try {
          await onPlaced(request.siteId, placed.order.id, request.origin);
        } catch (error) {
          ctx.log.error('The emails of an order could not be sent', {
            order: placed.order.number,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await ctx.hooks.emit(
          'shop.order.created',
          { orderId: placed.order.id, number: placed.order.number },
          { siteId: request.siteId },
        );
        // Online payments: on to the provider's page.
        if (placed.order.status === 'pending' && online) {
          const pay = `${prefix}/checkout/pay/${placed.order.number}?key=${encodeURIComponent(placed.order.key)}`;
          try {
            const url = await online.start(request.siteId, request.origin, prefix, placed.order);
            return { status: 303, headers: { location: url } };
          } catch (error) {
            ctx.log.error('An online payment could not start', {
              order: placed.order.number,
              error: error instanceof Error ? error.message : String(error),
            });
            return { status: 303, headers: { location: `${pay}&error=1` } };
          }
        }
        return {
          status: 303,
          headers: {
            location: `${prefix}/order-received/${placed.order.number}?key=${placed.order.key}`,
          },
        };
      } catch (error) {
        if (error instanceof CouponError)
          return renderCheckout(request, values, {}, couponMessage(t, error.code, 'used_up'));
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
      const store = inLanguage(await settings(request.siteId), request.locale);
      return {
        page: {
          title: t('Order received'),
          html: receivedPage({
            order: found.order,
            items: found.items,
            t: translator(found.order.locale),
            locale: found.order.locale,
            payment: paymentInstructions(store, found.order),
            ...(['pending', 'failed'].includes(found.order.status) &&
            ['stripe', 'paypal'].includes(found.order.paymentMethod)
              ? {
                  unpaid: {
                    payUrl: `${prefixOf(request)}/checkout/pay/${found.order.number}?key=${encodeURIComponent(found.order.key)}`,
                  },
                }
              : {}),
          }),
        },
      };
    },
  });
}
