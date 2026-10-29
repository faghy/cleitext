import type { PluginContext, RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import { checkAddress, italianProvince, type Address } from './address';
import { CART_COOKIE, loadCart, loadCoupons, priceCart } from './cart';
import { sharedLimiter } from './cart-link';
import { prefixOf } from './catalog-routes';
import { CouponError, StockError } from './orders';
import type { CheckoutValues } from './pages';
import { expressAt, type ExpressPlace } from './payments';
import { quote } from './quote';
import type { CartItem, OrderRow } from './schema';
import type { Destination } from './shipping';
import { minorOfCents, stripeLocale } from './stripe-element';
import type { StoreSettings } from './storefront';
import { translator, type Translate } from './strings';

/**
 * Apple Pay, Google Pay and Link (Stripe's Express Checkout Element) in the
 * checkout, the cart and the product page ("buy now"): the wallet gives the
 * address, the shop answers with its shipping rates and the total (its own
 * zones, methods and taxes, as at checkout), and the order is placed with the
 * wallet's name, email and addresses when the customer confirms. Then the
 * page confirms the order's PaymentIntent with Stripe, and the order is paid
 * as with the Payment Element (return address and webhook).
 *
 * - `GET /checkout/express?place=…&product=…&quantity=…`: what the buttons
 *   need (publishable key, amount, first rates), or `{ key: null }`.
 * - `POST /checkout/express/quote`: rates and total for the wallet's address.
 * - `POST /checkout/express/order`: the order, and its PaymentIntent.
 */

type Placed = { order: OrderRow; products: string[] };

export interface ExpressDeps {
  settings: (siteId: string, locale: string) => Promise<StoreSettings>;
  quoteSettings: (store: StoreSettings, t: Translate) => Parameters<typeof quote>[1];
  /** Where the shop is: the rates before the wallet gives an address. */
  destination: (store: StoreSettings) => Destination;
  placeFrom: (
    request: RouteRequest,
    store: StoreSettings,
    t: Translate,
    values: CheckoutValues,
    method: { id: 'stripe'; title: string },
    source: { cart: string | undefined } | { items: CartItem[] },
  ) => Promise<Placed | { problem: string } | { rate: string } | null>;
  afterPlaced: (request: RouteRequest, values: CheckoutValues, placed: Placed) => Promise<void>;
  intent: (
    siteId: string,
    origin: string,
    prefix: string,
    order: OrderRow,
  ) => Promise<{ clientSecret: string; returnUrl: string }>;
}

const PLACES: ExpressPlace[] = ['checkout', 'cart', 'product'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NO_STORE = { 'cache-control': 'private, no-store' };

/** Orders from the wallets one visitor may start: 10 every 10 minutes. */
const ORDER_LIMIT = { max: 10, windowMs: 10 * 60_000 };

const str = (value: unknown, max = 200) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** "Buy now": the product of the page, or the visitor's cart. */
function itemsOf(input: Record<string, unknown>): CartItem[] | null {
  const product = str(input.product, 60);
  if (!/^[0-9a-f-]{36}$/i.test(product)) return null;
  const quantity = Math.max(1, Math.min(9999, Math.floor(Number(input.quantity) || 1)));
  return [{ product, variation: null, quantity }];
}

/** A wallet's address (Stripe's shape) as the shop's destination. */
function destinationOf(address: Record<string, unknown>, fallback: Destination): Destination {
  const country = str(address.country, 2).toUpperCase();
  if (!country) return fallback;
  const state = str(address.state, 100);
  return {
    country,
    province: country === 'IT' ? (italianProvince(state) ?? state) : state,
    postcode: str(address.postal_code, 20).toUpperCase(),
  };
}

/** A wallet's contact (name, address, phone) as the shop's address. */
function addressOf(contact: Record<string, unknown>, phone: string): Address {
  const address = record(contact.address);
  const [first = '', ...rest] = str(contact.name, 200).split(/\s+/);
  const destination = destinationOf(address, { country: '', province: '', postcode: '' });
  return {
    firstName: first.slice(0, 100),
    lastName: (rest.join(' ') || first).slice(0, 100),
    company: '',
    address1: str(address.line1),
    address2: str(address.line2),
    city: str(address.city, 100),
    postcode: destination.postcode,
    province: destination.province,
    country: destination.country,
    phone: str(contact.phone, 30) || phone,
  };
}

export function registerExpress(ctx: PluginContext, deps: ExpressDeps): void {
  const orderAllowed = sharedLimiter('express-order', ORDER_LIMIT.max, ORDER_LIMIT.windowMs);

  /** The rates and the total of the cart (or of "buy now") for an address. */
  const quoteFor = async (
    request: RouteRequest,
    store: StoreSettings,
    t: Translate,
    input: Record<string, unknown>,
  ) => {
    const items = itemsOf(input);
    const token = request.cookies[CART_COOKIE];
    return ctx.db.transaction(request.siteId, async (tx) => {
      const priced = await priceCart(tx, items ?? (await loadCart(tx, token)), request.locale);
      if (priced.lines.length === 0 || priced.dropped.length || priced.lowered.length) return null;
      const quoted = await quote(tx, deps.quoteSettings(store, t), {
        locale: request.locale,
        lines: priced.lines,
        codes: items ? [] : await loadCoupons(tx, token),
        to: destinationOf(record(input.address), deps.destination(store)),
        shipping: true,
        rateId: str(input.rate, 40),
        payment: 'stripe',
      });
      const currency = store.currency;
      const rates = quoted.shippingSetUp
        ? quoted.rates.map((r) => ({
            id: r.id,
            displayName: r.title,
            amount: minorOfCents(r.cost, currency),
          }))
        : quoted.needsShipping
          ? [{ id: 'shipping', displayName: t('Shipping'), amount: 0 }]
          : [];
      // The rate in the total first: the wallet shows the first one as chosen.
      rates.sort((a, b) => Number(b.id === quoted.rate?.id) - Number(a.id === quoted.rate?.id));
      return {
        amount: minorOfCents(quoted.totals.total, currency),
        needsShipping: quoted.needsShipping,
        rates,
        rate: quoted.rate?.id ?? rates[0]?.id ?? null,
      };
    });
  };

  ctx.routes.public({
    method: 'GET',
    path: '/checkout/express',
    async handler(request) {
      const t = translator(request.locale);
      const store = await deps.settings(request.siteId, request.locale);
      const place = PLACES.find((p) => p === request.query.place) ?? 'checkout';
      const none = { headers: NO_STORE, body: { key: null } };
      if (!expressAt(store.payments, store.ready, place)) return none;
      const quoted = await quoteFor(request, store, t, request.query);
      if (!quoted) return none;
      const prefix = prefixOf(request);
      return {
        headers: NO_STORE,
        body: {
          key: store.payments.stripe.publishableKey,
          locale: stripeLocale(request.locale),
          currency: store.currency.toLowerCase(),
          country: store.baseCountry,
          phoneRequired: store.phoneRequired,
          ...quoted,
          quoteUrl: `${prefix}/checkout/express/quote`,
          orderUrl: `${prefix}/checkout/express/order`,
          // Paying with a wallet places the order: the terms are accepted by paying.
          terms: store.termsUrl
            ? {
                url: store.termsUrl,
                text: t('By paying you accept the {terms}.'),
                link: t('terms and conditions'),
              }
            : null,
          texts: {
            error: t('The payment could not start: try again in a moment.'),
            noShipping: t('We do not ship to this address: check it, or write to us.'),
          },
        },
      };
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: '/checkout/express/quote',
    async handler(request) {
      const t = translator(request.locale);
      const store = await deps.settings(request.siteId, request.locale);
      const quoted = await quoteFor(request, store, t, record(request.body));
      if (!quoted)
        return {
          status: 409,
          headers: NO_STORE,
          body: { error: t('Some products changed: check your cart.') },
        };
      return { headers: NO_STORE, body: quoted };
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: '/checkout/express/order',
    async handler(request): Promise<RouteResponse> {
      const t = translator(request.locale);
      const refuse = (error: string, status = 400): RouteResponse => ({
        status,
        headers: NO_STORE,
        body: { error },
      });
      const store = await deps.settings(request.siteId, request.locale);
      if (!PLACES.some((place) => expressAt(store.payments, store.ready, place)))
        return refuse(t('This way to pay is not available for this order: choose another.'));
      if (!orderAllowed(`${request.siteId}|${request.ip}`))
        return refuse(t('Too many requests: try again later.'), 429);
      const body = record(request.body);
      const items = itemsOf(body);
      const billingContact = record(body.billing);
      const shippingContact = body.shipping ? record(body.shipping) : null;
      const phone = str(body.phone, 30) || str(billingContact.phone, 30);
      let billing = addressOf(billingContact, phone);
      const shipping = shippingContact ? addressOf(shippingContact, phone) : null;
      // Some wallets give only the postcode of the card: the address it ships to then.
      if (shipping && (!billing.address1 || !billing.city))
        billing = {
          ...shipping,
          firstName: billing.firstName || shipping.firstName,
          lastName: billing.lastName || shipping.lastName,
          phone: billing.phone || shipping.phone,
        };
      const email = str(body.email).toLowerCase();
      const problems = {
        ...checkAddress(billing, { phoneRequired: store.phoneRequired }),
        ...(shipping ? checkAddress(shipping, { phoneRequired: false }) : {}),
      };
      if (!EMAIL_RE.test(email) || Object.keys(problems).length)
        return refuse(t('The address from your wallet is not complete: check it and try again.'));
      const values: CheckoutValues = {
        email,
        billing,
        shipping: shipping ?? billing,
        differentShipping: !!shipping,
        wantsInvoice: false,
        invoice: { taxCode: '', vatNumber: '', sdi: '', pec: '' },
        note: '',
        payment: 'stripe',
        rate: str(body.rate, 40),
        // Paying from the wallet's sheet accepts the terms, as the buttons say.
        terms: true,
      };
      const prefix = prefixOf(request);
      let placed: Awaited<ReturnType<ExpressDeps['placeFrom']>>;
      try {
        placed = await deps.placeFrom(
          request,
          store,
          t,
          values,
          { id: 'stripe', title: store.payments.stripe.title || t('Credit or debit card') },
          items ? { items } : { cart: request.cookies[CART_COOKIE] },
        );
      } catch (error) {
        if (error instanceof CouponError || error instanceof StockError)
          return refuse(t('Some products changed: check your cart.'), 409);
        throw error;
      }
      if (!placed) return refuse(t('Some products changed: check your cart.'), 409);
      if ('problem' in placed) return refuse(placed.problem, 409);
      if ('rate' in placed)
        return refuse(t('We do not ship to this address: check it, or write to us.'), 409);
      await deps.afterPlaced(request, values, placed);
      try {
        const pay = await deps.intent(request.siteId, request.origin, prefix, placed.order);
        return { headers: NO_STORE, body: pay };
      } catch (error) {
        ctx.log.error('An online payment could not start', {
          order: placed.order.number,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          status: 502,
          headers: NO_STORE,
          body: {
            error: t('The payment could not start: try again in a moment.'),
            redirect: `${prefix}/checkout/pay/${placed.order.number}?key=${encodeURIComponent(placed.order.key)}&error=1`,
          },
        };
      }
    },
  });
}
