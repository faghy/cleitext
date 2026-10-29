import type { PluginContext, RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import { and, eq, lt } from 'drizzle-orm';
import { PAYMENTS_TAG, productTags } from './buy-box';
import { prefixOf } from './catalog-routes';
import {
  decimalAmount,
  GatewayError,
  minorUnits,
  paypalClient,
  stripeClient,
  verifyStripeSignature,
  type PaymentOrder,
  type Send,
} from './gateways';
import { html, raw } from './html';
import { changeStatus, note } from './order-admin';
import { moneyFormatter, SHOP_CSS } from './pages';
import {
  ONLINE,
  PAYMENTS_STORAGE,
  paymentsSchema,
  SECRETS,
  type PaymentId,
  type Payments,
  type SecretName,
  localizePayments,
  stripeOnPage,
} from './payments';
import { orders, type OrderRow } from './schema';
import { STRIPE_SCRIPT, stripeElement, stripeLocale } from './stripe-element';
import { translator } from './strings';

/**
 * Online payments: the order is placed as pending, the customer pays on
 * Stripe's or PayPal's pages (or in Stripe's Payment Element and express
 * buttons on the site), and the order becomes processing when the provider
 * confirms — on the way back to the site or through its webhook, whichever
 * comes first. Unpaid orders are cancelled after a while, giving their stock
 * back.
 */

/** Where Stripe keeps the file Apple Pay reads to check the site's domain. */
const APPLE_FILE_URL =
  'https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association';
export const APPLE_FILE_PATH = '/.well-known/apple-developer-merchantid-domain-association';
const APPLE_FILE_STORAGE = 'apple-pay-domain-file';

export type OnlineId = 'stripe' | 'paypal';
const isOnline = (id: string): id is OnlineId => (ONLINE as readonly string[]).includes(id);

export interface OnlineHooks {
  payments: (siteId: string) => Promise<Payments>;
  siteName: (siteId: string) => Promise<string>;
  /** After an order is paid: its emails and hooks. */
  paid: (siteId: string, origin: string, orderId: string, from: string) => Promise<void>;
}

export function onlinePayments(ctx: PluginContext, hooks: OnlineHooks) {
  const send: Send = (request) => ctx.http.send(request);
  const secret = (siteId: string, name: SecretName) => ctx.secrets.get(siteId, SECRETS[name]);

  /** Online ways to pay whose keys are set. */
  const ready = async (siteId: string): Promise<Record<OnlineId, boolean>> => {
    const payments = await hooks.payments(siteId);
    return {
      stripe: !!(await secret(siteId, 'stripeSecretKey')),
      paypal: !!payments.paypal.clientId && !!(await secret(siteId, 'paypalSecret')),
    };
  };

  const stripe = async (siteId: string) => {
    const key = await secret(siteId, 'stripeSecretKey');
    if (!key) throw new GatewayError('Stripe is not set up.');
    return stripeClient(send, key);
  };
  const paypal = async (siteId: string) => {
    const payments = await hooks.payments(siteId);
    const key = await secret(siteId, 'paypalSecret');
    if (!key || !payments.paypal.clientId) throw new GatewayError('PayPal is not set up.');
    return paypalClient(send, {
      clientId: payments.paypal.clientId,
      secret: key,
      sandbox: payments.paypal.sandbox,
    });
  };

  const paymentOrder = (order: OrderRow): PaymentOrder => ({
    id: order.id,
    number: order.number,
    total: order.total,
    currency: order.currency,
    email: order.email,
    locale: order.locale,
  });

  const returnUrl = (origin: string, prefix: string, order: OrderRow) =>
    `${origin}${prefix}/checkout/stripe/return?order=${order.number}&key=${encodeURIComponent(order.key)}`;

  /**
   * The order's PaymentIntent, paid on the site with the Payment Element or
   * the express buttons: its client secret for the page, and where Stripe
   * sends the customer back. The same order and amount get the same one.
   */
  const intent = async (
    siteId: string,
    origin: string,
    prefix: string,
    order: OrderRow,
  ): Promise<{ clientSecret: string; returnUrl: string }> => {
    if (order.paymentMethod !== 'stripe') throw new GatewayError('Not a card payment.');
    const t = translator(order.locale);
    const created = await (
      await stripe(siteId)
    ).createIntent(
      paymentOrder(order),
      `${t('Order {number}', { number: order.number })} – ${await hooks.siteName(siteId)}`,
    );
    if (!created.clientSecret) throw new GatewayError('Stripe: no payment to confirm');
    await ctx.db.transaction(siteId, (tx) =>
      tx
        .update(orders)
        .set({ paymentRef: created.id, updatedAt: new Date() })
        .where(eq(orders.id, order.id)),
    );
    return { clientSecret: created.clientSecret, returnUrl: returnUrl(origin, prefix, order) };
  };

  /** Whether cards are paid on the site's pages (the Payment Element). */
  const onPage = async (siteId: string) =>
    stripeOnPage(await hooks.payments(siteId), await ready(siteId));

  /** The provider's page where the customer pays the order. */
  const start = async (
    siteId: string,
    origin: string,
    prefix: string,
    order: OrderRow,
  ): Promise<string> => {
    const method = order.paymentMethod;
    if (!isOnline(method)) throw new GatewayError('Not an online payment.');
    const t = translator(order.locale);
    const key = encodeURIComponent(order.key);
    const back = `${origin}${prefix}/checkout/pay/${order.number}?key=${key}`;
    const title = `${t('Order {number}', { number: order.number })} – ${await hooks.siteName(siteId)}`;
    let ref: string;
    let url: string;
    if (method === 'stripe') {
      const session = await (
        await stripe(siteId)
      ).createSession(
        paymentOrder(order),
        {
          success: `${origin}${prefix}/checkout/stripe/return?order=${order.number}&key=${key}&session={CHECKOUT_SESSION_ID}`,
          cancel: `${back}&cancelled=1`,
        },
        title,
      );
      if (!session.url) throw new GatewayError('Stripe: no address to pay at');
      ({ id: ref, url } = { id: session.id, url: session.url });
    } else {
      const created = await (
        await paypal(siteId)
      ).createOrder(
        paymentOrder(order),
        {
          success: `${origin}${prefix}/checkout/paypal/return?order=${order.number}&key=${key}`,
          cancel: `${back}&cancelled=1`,
        },
        title,
        await hooks.siteName(siteId),
      );
      ({ id: ref, url } = { id: created.id, url: created.approveUrl });
    }
    await ctx.db.transaction(siteId, (tx) =>
      tx
        .update(orders)
        .set({ paymentRef: ref, updatedAt: new Date() })
        .where(eq(orders.id, order.id)),
    );
    return url;
  };

  /**
   * Records a confirmed payment, once: the order becomes processing with the
   * provider's id. An amount that does not match puts it on hold instead.
   */
  const complete = async (
    siteId: string,
    origin: string,
    orderId: string,
    payment: { method: OnlineId; transactionId: string; amount: string; currency: string },
  ): Promise<boolean> => {
    const outcome = await ctx.db.transaction(siteId, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order || order.paymentMethod !== payment.method) return null;
      if (!['pending', 'failed', 'cancelled'].includes(order.status)) return null;
      const label = payment.method === 'stripe' ? 'Stripe' : 'PayPal';
      const matches =
        payment.currency.toUpperCase() === order.currency.toUpperCase() &&
        (payment.method === 'stripe'
          ? Number(payment.amount) === minorUnits(order.total, order.currency)
          : Number(payment.amount) === Number(decimalAmount(order.total, order.currency)));
      const to = matches ? 'processing' : 'on-hold';
      const changed = await changeStatus(tx, siteId, order.id, to, label);
      await tx
        .update(orders)
        .set({ transactionId: payment.transactionId, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await note(
        tx,
        siteId,
        order.id,
        matches
          ? `Paid with ${label} (${payment.transactionId}).`
          : `Paid with ${label} (${payment.transactionId}), but ${payment.amount} ${payment.currency} does not match the order: check it.`,
        label,
      );
      return { from: changed.from, productIds: changed.productIds };
    });
    if (!outcome) return false;
    if (outcome.productIds.length)
      await ctx.cache.invalidate(siteId, productTags(outcome.productIds));
    await hooks.paid(siteId, origin, orderId, outcome.from);
    return true;
  };

  /** A Stripe payment that did not go through: a pending order becomes failed. */
  const failed = async (siteId: string, orderId: string, reason: string) => {
    const productIds = await ctx.db.transaction(siteId, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (order?.status !== 'pending' || order.paymentMethod !== 'stripe') return [];
      const changed = await changeStatus(tx, siteId, orderId, 'failed', 'Stripe');
      await note(
        tx,
        siteId,
        orderId,
        reason ? `The Stripe payment failed: ${reason}` : 'The Stripe payment failed.',
        'Stripe',
      );
      return changed.productIds;
    });
    if (productIds.length) await ctx.cache.invalidate(siteId, productTags(productIds));
  };

  /** The order of an address with its key, as the customer's links carry it. */
  const orderOf = async (request: RouteRequest) => {
    const number = Number(request.params.number ?? request.query.order);
    if (!Number.isSafeInteger(number)) return null;
    const [order] = await ctx.db.transaction(request.siteId, (tx) =>
      tx.select().from(orders).where(eq(orders.number, number)),
    );
    return order && order.key === request.query.key ? order : null;
  };

  const received = (request: RouteRequest, order: OrderRow) => ({
    status: 303,
    headers: {
      location: `${prefixOf(request)}/order-received/${order.number}?key=${encodeURIComponent(order.key)}`,
    },
  });

  const payPage = async (
    request: RouteRequest,
    order: OrderRow,
    message?: string,
  ): Promise<RouteResponse> => {
    const t = translator(request.locale);
    const payments = localizePayments(await hooks.payments(request.siteId), request.locale);
    const money = moneyFormatter(request.locale, order.currency);
    const method = order.paymentMethod as PaymentId;
    const title = payments[method]?.title || (method === 'stripe' ? t('Card') : 'PayPal');
    const payable = order.status === 'pending' || order.status === 'failed';
    // Cards on the page: the Payment Element for the order's PaymentIntent.
    // Without scripts (or if Stripe does not answer) the button goes to Stripe's page.
    let element = '';
    if (payable && method === 'stripe' && (await onPage(request.siteId))) {
      try {
        const pay = await intent(request.siteId, request.origin, prefixOf(request), order);
        element = stripeElement(
          {
            key: payments.stripe.publishableKey,
            locale: stripeLocale(request.locale),
            currency: order.currency.toLowerCase(),
            amount: minorUnits(order.total, order.currency),
            ...pay,
          },
          ctx.assets.url(STRIPE_SCRIPT),
          t,
        );
      } catch (error) {
        ctx.log.warn('A Stripe payment could not be prepared', {
          order: order.number,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const content = html`<style>
        ${SHOP_CSS}
      </style>
      <div class="shop-page">
        ${message ? html`<p class="shop-notice shop-notice--error" role="alert">${message}</p>` : ''}
        <p>
          ${t('Order {number}', { number: order.number })} ·
          <strong>${money.of(order.total)}</strong>
        </p>
        ${
          payable
            ? html`<form
                method="post"
                action="${prefixOf(request)}/checkout/pay/${order.number}?key=${encodeURIComponent(order.key)}"
              >
                ${raw(element)}
                <p>
                  <button class="shop-button" type="submit">
                    ${t('Pay with {method}', { method: title })}
                  </button>
                </p>
              </form>`
            : html`<p>${t('This order cannot be paid any more.')}</p>`
        }
      </div>`;
    return {
      status: message ? 422 : 200,
      headers: { 'cache-control': 'private, no-store' },
      page: { title: t('Pay for your order'), html: content.value },
    };
  };

  /** Whether the keys work: a harmless request to the provider. */
  const check = async (siteId: string, method: OnlineId): Promise<string | null> => {
    try {
      if (method === 'stripe') {
        const key = await secret(siteId, 'stripeSecretKey');
        if (!key) return 'Add the secret key.';
        const res = await send({
          url: 'https://api.stripe.com/v1/checkout/sessions?limit=1',
          method: 'GET',
          headers: { authorization: `Bearer ${key}` },
          timeoutMs: 15_000,
        });
        return res.status < 400 ? null : `Stripe refused the key (HTTP ${res.status}).`;
      }
      const payments = await hooks.payments(siteId);
      const key = await secret(siteId, 'paypalSecret');
      if (!key || !payments.paypal.clientId) return 'Add the client id and the secret.';
      const res = await send({
        url: `${payments.paypal.sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'}/v1/oauth2/token`,
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${payments.paypal.clientId}:${key}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        timeoutMs: 15_000,
      });
      return res.status < 400 ? null : `PayPal refused the credentials (HTTP ${res.status}).`;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  /** Shop → Payments: settings, with the secrets only written, never read back. */
  const registerAdmin = (capability: string) => {
    const api = (
      method: 'GET' | 'PUT' | 'POST',
      path: string,
      handler: (request: RouteRequest) => Promise<{ status?: number; body?: unknown }>,
    ) => ctx.routes.api({ method, path, capability, handler });
    const view = async (request: RouteRequest) => ({
      ...(await hooks.payments(request.siteId)),
      secrets: Object.fromEntries(
        await Promise.all(
          (Object.keys(SECRETS) as SecretName[]).map(async (name) => [
            name,
            !!(await secret(request.siteId, name)),
          ]),
        ),
      ) as Record<SecretName, boolean>,
      webhooks: {
        stripe: `${request.origin}/api/v1/ext/shop/webhooks/stripe`,
        paypal: `${request.origin}/api/v1/ext/shop/webhooks/paypal`,
      },
    });
    const bad = (path: string, message: string) => ({
      status: 400,
      body: {
        title: 'Bad Request',
        status: 400,
        detail: 'Some values are not valid.',
        errors: [{ path, message }],
      },
    });

    api('GET', '/payments', async (request) => ({ body: await view(request) }));

    api('PUT', '/payments', async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const input = paymentsSchema.safeParse(body);
      if (!input.success)
        return {
          status: 400,
          body: {
            title: 'Bad Request',
            status: 400,
            detail: 'Some values are not valid.',
            errors: input.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        };
      const secrets = (body.secrets ?? {}) as Partial<Record<SecretName, string | null>>;
      const formats: Record<SecretName, RegExp> = {
        stripeSecretKey: /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/,
        stripeWebhookSecret: /^whsec_[A-Za-z0-9]{10,}$/,
        paypalSecret: /^[A-Za-z0-9_-]{20,200}$/,
      };
      for (const name of Object.keys(SECRETS) as SecretName[]) {
        const value = secrets[name];
        if (typeof value === 'string' && value.trim() && !formats[name].test(value.trim()))
          return bad(`secrets.${name}`, 'This does not look like the right key.');
      }
      const data = input.data;
      if (data.bacs.enabled && !data.bacs.accounts.some((a) => a.iban))
        return bad('bacs.accounts', 'Add the account customers pay into.');
      for (const name of Object.keys(SECRETS) as SecretName[]) {
        const value = secrets[name];
        if (value === null) await ctx.secrets.delete(request.siteId, SECRETS[name]);
        else if (typeof value === 'string' && value.trim())
          await ctx.secrets.set(request.siteId, SECRETS[name], value.trim());
      }
      const stripeKey = await secret(request.siteId, 'stripeSecretKey');
      if (data.stripe.enabled && !stripeKey)
        return bad('secrets.stripeSecretKey', 'Add the secret key to take card payments.');
      // Both keys of the same mode: a test publishable key with a live secret key cannot pay.
      const mode = (key: string) => /_(test|live)_/.exec(key)?.[1];
      if (
        data.stripe.publishableKey &&
        stripeKey &&
        mode(data.stripe.publishableKey) !== mode(stripeKey)
      )
        return bad(
          'stripe.publishableKey',
          'The publishable key and the secret key must be both test keys or both live keys.',
        );
      if (
        data.paypal.enabled &&
        (!data.paypal.clientId || !(await secret(request.siteId, 'paypalSecret')))
      )
        return bad('paypal.clientId', 'Add the client id and the secret of your PayPal app.');
      await ctx.storage.set(request.siteId, PAYMENTS_STORAGE, data);
      // Product pages show the express buttons or not.
      await ctx.cache.invalidate(request.siteId, [PAYMENTS_TAG]);
      return { body: await view(request) };
    });

    // Apple Pay, Google Pay and Link on this site's domain (Stripe's payment method domains).
    const failure = (error: unknown) => ({
      status: 400,
      body: {
        title: 'Bad Request',
        status: 400,
        detail: error instanceof Error ? error.message : String(error),
      },
    });
    const domainOf = (request: RouteRequest) => new URL(request.origin).hostname;
    const domainView = async (
      request: RouteRequest,
      found: Awaited<ReturnType<Awaited<ReturnType<typeof stripe>>['findDomain']>>,
    ) => ({
      domain: domainOf(request),
      registered: !!found,
      applePay: found?.applePay ?? 'inactive',
      googlePay: found?.googlePay ?? 'inactive',
      link: found?.link ?? 'inactive',
      message: found?.message ?? null,
      file: !!(await ctx.storage.get(request.siteId, APPLE_FILE_STORAGE)),
    });

    api('GET', '/payments/stripe/domain', async (request) => {
      try {
        const client = await stripe(request.siteId);
        return { body: await domainView(request, await client.findDomain(domainOf(request))) };
      } catch (error) {
        return failure(error);
      }
    });

    api('POST', '/payments/stripe/domain', async (request) => {
      const name = domainOf(request);
      if (name === 'localhost' || /^[\d.]+$|:/.test(name) || !name.includes('.'))
        return failure(new Error('Apple Pay needs the site’s public domain, over HTTPS.'));
      try {
        const client = await stripe(request.siteId);
        // Apple reads this file on the domain when Stripe registers it.
        const file = await send({ url: APPLE_FILE_URL, method: 'GET', timeoutMs: 15_000 });
        if (file.status < 400 && file.text.trim())
          await ctx.storage.set(request.siteId, APPLE_FILE_STORAGE, file.text.trim());
        return { body: await domainView(request, await client.registerDomain(name)) };
      } catch (error) {
        return failure(error);
      }
    });

    api('POST', '/payments/check/:method', async (request) => {
      const method = request.params.method;
      if (method !== 'stripe' && method !== 'paypal') return { status: 404 };
      const problem = await check(request.siteId, method);
      return { body: { ok: problem === null, message: problem } };
    });
  };

  const register = () => {
    // Apple Pay's check of the domain: the file Stripe gives, saved when the domain is registered.
    ctx.routes.public({
      method: 'GET',
      path: APPLE_FILE_PATH,
      async handler(request) {
        const file = await ctx.storage.get(request.siteId, APPLE_FILE_STORAGE);
        if (typeof file !== 'string' || !file)
          return { status: 404, body: 'Not Found', contentType: 'text/plain; charset=utf-8' };
        return {
          body: file,
          contentType: 'text/plain; charset=utf-8',
          headers: { 'cache-control': 'public, max-age=3600' },
        };
      },
    });

    // The page to pay (again): after cancelling on the provider's page, or from the email.
    ctx.routes.public({
      method: 'GET',
      path: '/checkout/pay/:number',
      async handler(request) {
        const t = translator(request.locale);
        const order = await orderOf(request);
        if (!order)
          return {
            status: 404,
            page: { title: t('Order'), html: `<p>${t('This order does not exist.')}</p>` },
          };
        if (!['pending', 'failed'].includes(order.status)) return received(request, order);
        return payPage(
          request,
          order,
          request.query.cancelled
            ? t('The payment was not completed: you can try again.')
            : request.query.error
              ? t('The payment could not start: try again in a moment.')
              : undefined,
        );
      },
    });

    ctx.routes.public({
      method: 'POST',
      path: '/checkout/pay/:number',
      async handler(request) {
        const t = translator(request.locale);
        const order = await orderOf(request);
        if (
          !order ||
          !['pending', 'failed'].includes(order.status) ||
          !isOnline(order.paymentMethod)
        )
          return { status: 303, headers: { location: `${prefixOf(request)}/cart` } };
        try {
          const url = await start(request.siteId, request.origin, prefixOf(request), order);
          return { status: 303, headers: { location: url } };
        } catch (error) {
          ctx.log.error('An online payment could not start', {
            order: order.number,
            error: error instanceof Error ? error.message : String(error),
          });
          return payPage(request, order, t('The payment could not start: try again in a moment.'));
        }
      },
    });

    // Back from Stripe: the session tells whether it is paid (the webhook may come later).
    ctx.routes.public({
      method: 'GET',
      path: '/checkout/stripe/return',
      async handler(request) {
        const order = await orderOf(request);
        if (!order) return { status: 303, headers: { location: `${prefixOf(request)}/cart` } };
        // Paid on the site (Payment Element, express buttons): Stripe adds the PaymentIntent.
        const intentId = request.query.payment_intent ?? '';
        if (intentId) {
          try {
            if (['pending', 'failed'].includes(order.status)) {
              const paid = await (await stripe(request.siteId)).getIntent(intentId);
              if (paid.orderId === order.id && paid.status === 'succeeded')
                await complete(request.siteId, request.origin, order.id, {
                  method: 'stripe',
                  transactionId: paid.id,
                  amount: String(paid.amountReceived || paid.amount),
                  currency: paid.currency,
                });
              else if (
                paid.orderId === order.id &&
                ['requires_payment_method', 'canceled'].includes(paid.status)
              )
                return {
                  status: 303,
                  headers: {
                    location: `${prefixOf(request)}/checkout/pay/${order.number}?key=${encodeURIComponent(order.key)}&cancelled=1`,
                  },
                };
            }
          } catch (error) {
            ctx.log.warn('A Stripe payment could not be checked on return', {
              order: order.number,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return received(request, order);
        }
        const sessionId = request.query.session ?? '';
        try {
          if (order.status === 'pending' && sessionId === order.paymentRef) {
            const session = await (await stripe(request.siteId)).getSession(sessionId);
            if (session.paymentStatus === 'paid' && session.orderId === order.id)
              await complete(request.siteId, request.origin, order.id, {
                method: 'stripe',
                transactionId: session.paymentIntent ?? session.id,
                amount: String(session.amount),
                currency: session.currency,
              });
          }
        } catch (error) {
          ctx.log.warn('A Stripe payment could not be checked on return', {
            order: order.number,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return received(request, order);
      },
    });

    // Back from PayPal: the approved order is captured now.
    ctx.routes.public({
      method: 'GET',
      path: '/checkout/paypal/return',
      async handler(request) {
        const t = translator(request.locale);
        const order = await orderOf(request);
        if (!order) return { status: 303, headers: { location: `${prefixOf(request)}/cart` } };
        const token = request.query.token ?? '';
        if (order.status === 'pending' && token && token === order.paymentRef) {
          try {
            const capture = await (await paypal(request.siteId)).capture(token);
            if (capture.status === 'COMPLETED' && capture.captureId)
              await complete(request.siteId, request.origin, order.id, {
                method: 'paypal',
                transactionId: capture.captureId,
                amount: capture.amount,
                currency: capture.currency,
              });
          } catch (error) {
            ctx.log.warn('A PayPal payment could not be captured', {
              order: order.number,
              error: error instanceof Error ? error.message : String(error),
            });
            return payPage(request, order, t('The payment was not completed: you can try again.'));
          }
        }
        return received(request, order);
      },
    });

    // ---- Webhooks: the providers confirm payments even when the customer does not come back.

    ctx.routes.api({
      method: 'POST',
      path: '/webhooks/stripe',
      webhook: true,
      async handler(request) {
        const secretKey = await secret(request.siteId, 'stripeWebhookSecret');
        if (
          !secretKey ||
          !verifyStripeSignature(request.headers['stripe-signature'], request.rawBody, secretKey)
        )
          return { status: 400, body: { error: 'Invalid signature' } };
        const event = (request.body ?? {}) as {
          type?: string;
          data?: { object?: Record<string, unknown> };
        };
        const object = event.data?.object ?? {};
        // PaymentIntents (paid on the site; Stripe's page makes one too, for the same order).
        const intentOrder = (object.metadata as Record<string, unknown> | undefined)?.order_id;
        if (event.type === 'payment_intent.succeeded' && typeof intentOrder === 'string') {
          await complete(request.siteId, request.origin, intentOrder, {
            method: 'stripe',
            transactionId: String(object.id ?? ''),
            amount: String(object.amount_received ?? object.amount ?? ''),
            currency: String(object.currency ?? ''),
          });
          return { status: 200, body: { received: true } };
        }
        if (event.type === 'payment_intent.payment_failed' && typeof intentOrder === 'string') {
          const reason = (object.last_payment_error as { message?: unknown } | undefined)?.message;
          await failed(
            request.siteId,
            intentOrder,
            typeof reason === 'string' ? reason.slice(0, 300) : '',
          );
          return { status: 200, body: { received: true } };
        }
        const orderId =
          typeof object.client_reference_id === 'string' ? object.client_reference_id : null;
        if (
          orderId &&
          (event.type === 'checkout.session.completed' ||
            event.type === 'checkout.session.async_payment_succeeded') &&
          object.payment_status === 'paid'
        ) {
          await complete(request.siteId, request.origin, orderId, {
            method: 'stripe',
            transactionId: String(object.payment_intent ?? object.id ?? ''),
            amount: String(object.amount_total ?? ''),
            currency: String(object.currency ?? ''),
          });
        } else if (orderId && event.type === 'checkout.session.async_payment_failed') {
          await failed(request.siteId, orderId, '');
        }
        return { status: 200, body: { received: true } };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/webhooks/paypal',
      webhook: true,
      async handler(request) {
        const payments = await hooks.payments(request.siteId);
        let client: Awaited<ReturnType<typeof paypal>>;
        try {
          client = await paypal(request.siteId);
        } catch {
          return { status: 400, body: { error: 'PayPal is not set up' } };
        }
        const event = (request.body ?? {}) as {
          event_type?: string;
          resource?: Record<string, unknown>;
        };
        if (!(await client.verifyWebhook(request.headers, event, payments.paypal.webhookId)))
          return { status: 400, body: { error: 'Invalid signature' } };
        const resource = event.resource ?? {};
        if (event.event_type === 'CHECKOUT.ORDER.APPROVED' && typeof resource.id === 'string') {
          const capture = await client.capture(resource.id).catch(() => null);
          if (capture?.status === 'COMPLETED' && capture.orderId && capture.captureId)
            await complete(request.siteId, request.origin, capture.orderId, {
              method: 'paypal',
              transactionId: capture.captureId,
              amount: capture.amount,
              currency: capture.currency,
            });
        } else if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
          const amount = (resource.amount ?? {}) as { value?: string; currency_code?: string };
          if (typeof resource.custom_id === 'string' && typeof resource.id === 'string')
            await complete(request.siteId, request.origin, resource.custom_id, {
              method: 'paypal',
              transactionId: resource.id,
              amount: amount.value ?? '',
              currency: amount.currency_code ?? '',
            });
        }
        return { status: 200, body: { received: true } };
      },
    });

    // Unpaid online orders are cancelled after a while, and their stock goes back.
    ctx.schedule.every('cancel-unpaid', 5, async (siteId) => {
      const { holdMinutes } = await hooks.payments(siteId);
      const before = new Date(Date.now() - holdMinutes * 60_000);
      const stale = await ctx.db.transaction(siteId, (tx) =>
        tx
          .select({ id: orders.id, method: orders.paymentMethod })
          .from(orders)
          .where(and(eq(orders.status, 'pending'), lt(orders.createdAt, before))),
      );
      const productIds: string[] = [];
      for (const order of stale.filter((o) => isOnline(o.method))) {
        await ctx.db.transaction(siteId, async (tx) => {
          // Checked again inside: a payment may have arrived meanwhile.
          const [now] = await tx.select().from(orders).where(eq(orders.id, order.id)).for('update');
          if (now?.status !== 'pending') return;
          const changed = await changeStatus(tx, siteId, order.id, 'cancelled', 'Shop');
          await note(
            tx,
            siteId,
            order.id,
            `Unpaid after ${holdMinutes} minutes: cancelled.`,
            'Shop',
          );
          productIds.push(...changed.productIds);
        });
      }
      if (productIds.length) await ctx.cache.invalidate(siteId, productTags(productIds));
    });
  };

  /** Gives money back through the provider of an online order; returns the provider's id. */
  const refund = async (
    siteId: string,
    order: OrderRow,
    amount: string,
  ): Promise<string | null> => {
    if (!isOnline(order.paymentMethod) || !order.transactionId) return null;
    return order.paymentMethod === 'stripe'
      ? (await stripe(siteId)).refund(order.transactionId, amount, order.currency)
      : (await paypal(siteId)).refund(order.transactionId, amount, order.currency);
  };

  return { ready, start, intent, onPage, complete, register, registerAdmin, refund, isOnline };
}
