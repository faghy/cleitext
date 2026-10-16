import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe (Checkout) and PayPal (Orders v2) for the shop: the customer pays on
 * the provider's pages, so card data never reaches the site. Plain requests
 * through `send` (the plugin's `ctx.http.send`), so tests can answer for the
 * providers.
 */

export type Send = (request: {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}) => Promise<{ status: number; type: string; text: string }>;

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** Currencies without cents for the providers (amounts in units). */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX']);

/** An amount as the providers' smallest unit: 12.50 EUR → 1250, 1200 JPY → 1200. */
export function minorUnits(amount: string | number, currency: string): number {
  const value = Number(amount);
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(value) : Math.round(value * 100);
}

/** An amount as PayPal writes it: "12.50", or "1200" for currencies without cents. */
export function decimalAmount(amount: string | number, currency: string): string {
  const value = Number(amount);
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? String(Math.round(value)) : value.toFixed(2);
}

const json = (text: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The order a payment is for, as the providers need it. */
export interface PaymentOrder {
  id: string;
  number: number;
  total: string;
  currency: string;
  email: string;
  locale: string;
}

// ---- Stripe ----------------------------------------------------------------------------

const STRIPE = 'https://api.stripe.com/v1';

/** Form encoding with Stripe's brackets: `line_items[0][quantity]=1`. */
export function stripeForm(values: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(values).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) return [];
    if (typeof value === 'object') return stripeForm(value as Record<string, unknown>, name);
    return [`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`];
  });
}

export interface StripeSession {
  id: string;
  url: string | null;
  status: string;
  paymentStatus: string;
  paymentIntent: string | null;
  orderId: string | null;
  amount: number;
  currency: string;
}

export function stripeClient(send: Send, secretKey: string) {
  const call = async (
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotency?: string,
  ) => {
    const res = await send({
      url: `${STRIPE}${path}`,
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotency ? { 'idempotency-key': idempotency } : {}),
      },
      ...(body ? { body: stripeForm(body).join('&') } : {}),
      timeoutMs: 20_000,
    });
    const data = json(res.text);
    if (res.status >= 400) {
      const error = data.error as { message?: string } | undefined;
      throw new GatewayError(`Stripe: ${error?.message ?? `HTTP ${res.status}`}`, res.status);
    }
    return data;
  };
  const session = (data: Record<string, unknown>): StripeSession => ({
    id: String(data.id ?? ''),
    url: typeof data.url === 'string' ? data.url : null,
    status: String(data.status ?? ''),
    paymentStatus: String(data.payment_status ?? ''),
    paymentIntent:
      typeof data.payment_intent === 'string'
        ? data.payment_intent
        : ((data.payment_intent as { id?: string } | null)?.id ?? null),
    orderId:
      (typeof data.client_reference_id === 'string' ? data.client_reference_id : null) ??
      (data.metadata as Record<string, string> | undefined)?.order_id ??
      null,
    amount: Number(data.amount_total ?? 0),
    currency: String(data.currency ?? '').toUpperCase(),
  });
  return {
    /** A Checkout Session for the order's total; the customer goes to its `url`. */
    async createSession(
      order: PaymentOrder,
      urls: { success: string; cancel: string },
      title: string,
    ): Promise<StripeSession> {
      const locale = ['it', 'en', 'fr', 'de', 'es', 'nl', 'pt'].includes(order.locale.slice(0, 2))
        ? order.locale.slice(0, 2)
        : 'auto';
      return session(
        await call(
          'POST',
          '/checkout/sessions',
          {
            mode: 'payment',
            // Stripe puts the session's id in place of the placeholder.
            success_url: urls.success,
            cancel_url: urls.cancel,
            client_reference_id: order.id,
            customer_email: order.email,
            locale,
            metadata: { order_id: order.id, order_number: order.number },
            payment_intent_data: { metadata: { order_id: order.id, order_number: order.number } },
            line_items: {
              0: {
                quantity: 1,
                price_data: {
                  currency: order.currency.toLowerCase(),
                  unit_amount: minorUnits(order.total, order.currency),
                  product_data: { name: title },
                },
              },
            },
          },
          `order-${order.id}-${minorUnits(order.total, order.currency)}-${Date.now() >> 16}`,
        ),
      );
    },
    async getSession(id: string): Promise<StripeSession> {
      if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new GatewayError('Stripe: not a session');
      return session(await call('GET', `/checkout/sessions/${id}`));
    },
    async refund(paymentIntent: string, amount: string, currency: string): Promise<string> {
      const data = await call('POST', '/refunds', {
        payment_intent: paymentIntent,
        amount: minorUnits(amount, currency),
      });
      return String(data.id ?? '');
    },
  };
}

/**
 * Checks the `Stripe-Signature` header of a webhook: HMAC-SHA256 of
 * `<timestamp>.<body>` with the endpoint's secret, at most 5 minutes old.
 */
export function verifyStripeSignature(
  header: string | undefined,
  rawBody: Buffer | null,
  secret: string,
  now = Date.now(),
): boolean {
  if (!header || !rawBody || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return parts
    .filter(([k]) => k === 'v1')
    .some(([, v]) => {
      const given = Buffer.from(v ?? '', 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

// ---- PayPal ----------------------------------------------------------------------------

export interface PayPalCapture {
  status: string;
  captureId: string | null;
  orderId: string | null;
  amount: string;
  currency: string;
}

/** Access tokens by client id, until they expire. */
const tokens = new Map<string, { token: string; expires: number }>();

export function paypalClient(
  send: Send,
  credentials: { clientId: string; secret: string; sandbox: boolean },
) {
  const base = credentials.sandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
  const key = `${credentials.sandbox ? 'sandbox' : 'live'}:${credentials.clientId}`;
  const token = async () => {
    const cached = tokens.get(key);
    if (cached && cached.expires > Date.now() + 60_000) return cached.token;
    const res = await send({
      url: `${base}/v1/oauth2/token`,
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.secret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      timeoutMs: 20_000,
    });
    const data = json(res.text);
    if (res.status >= 400 || typeof data.access_token !== 'string')
      throw new GatewayError(`PayPal: cannot sign in (HTTP ${res.status})`, res.status);
    tokens.set(key, {
      token: data.access_token,
      expires: Date.now() + Number(data.expires_in ?? 300) * 1000,
    });
    return data.access_token;
  };
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown, requestId?: string) => {
    const res = await send({
      url: `${base}${path}`,
      method,
      headers: {
        authorization: `Bearer ${await token()}`,
        'content-type': 'application/json',
        ...(requestId ? { 'paypal-request-id': requestId } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      timeoutMs: 20_000,
    });
    return { status: res.status, data: json(res.text) };
  };
  const failure = (status: number, data: Record<string, unknown>) =>
    new GatewayError(
      `PayPal: ${String((data.details as { issue?: string }[] | undefined)?.[0]?.issue ?? data.message ?? `HTTP ${status}`)}`,
      status,
    );
  const captureOf = (data: Record<string, unknown>): PayPalCapture => {
    const unit = (data.purchase_units as Record<string, unknown>[] | undefined)?.[0] ?? {};
    const capture = ((unit.payments as { captures?: Record<string, unknown>[] } | undefined)
      ?.captures ?? [])[0];
    const amount = (capture?.amount ?? {}) as { value?: string; currency_code?: string };
    return {
      status: String(capture?.status ?? data.status ?? ''),
      captureId: typeof capture?.id === 'string' ? capture.id : null,
      orderId:
        (typeof capture?.custom_id === 'string' ? capture.custom_id : null) ??
        (typeof unit.custom_id === 'string' ? unit.custom_id : null) ??
        (typeof unit.reference_id === 'string' ? unit.reference_id : null),
      amount: amount.value ?? '',
      currency: amount.currency_code ?? '',
    };
  };
  return {
    /** A PayPal order for the total; the customer approves it at `approveUrl`. */
    async createOrder(
      order: PaymentOrder,
      urls: { success: string; cancel: string },
      title: string,
      brand: string,
    ): Promise<{ id: string; approveUrl: string }> {
      const { status, data } = await call(
        'POST',
        '/v2/checkout/orders',
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: order.id,
              custom_id: order.id,
              description: title.slice(0, 127),
              amount: {
                currency_code: order.currency,
                value: decimalAmount(order.total, order.currency),
              },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: urls.success,
                cancel_url: urls.cancel,
                user_action: 'PAY_NOW',
                shipping_preference: 'NO_SHIPPING',
                brand_name: brand.slice(0, 127),
              },
            },
          },
        },
        `create-${order.id}-${Date.now() >> 16}`,
      );
      if (status >= 400) throw failure(status, data);
      const link = (data.links as { rel?: string; href?: string }[] | undefined)?.find(
        (l) => l.rel === 'payer-action' || l.rel === 'approve',
      );
      if (typeof data.id !== 'string' || !link?.href)
        throw new GatewayError('PayPal: no address to approve the payment');
      return { id: data.id, approveUrl: link.href };
    },
    /** Takes the money of an approved order (again without harm: an order is captured once). */
    async capture(paypalOrderId: string): Promise<PayPalCapture> {
      if (!/^[A-Z0-9]{8,40}$/.test(paypalOrderId)) throw new GatewayError('PayPal: not an order');
      const done = await call(
        'POST',
        `/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        `capture-${paypalOrderId}`,
      );
      if (done.status < 400) return captureOf(done.data);
      // Captured already (the webhook was first): read the order.
      const issue = (done.data.details as { issue?: string }[] | undefined)?.[0]?.issue;
      if (issue === 'ORDER_ALREADY_CAPTURED') {
        const read = await call('GET', `/v2/checkout/orders/${paypalOrderId}`);
        if (read.status < 400) return captureOf(read.data);
      }
      throw failure(done.status, done.data);
    },
    async refund(captureId: string, amount: string, currency: string): Promise<string> {
      const { status, data } = await call(
        'POST',
        `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
        { amount: { value: decimalAmount(amount, currency), currency_code: currency } },
        `refund-${captureId}-${amount}-${Date.now() >> 16}`,
      );
      if (status >= 400) throw failure(status, data);
      return String(data.id ?? '');
    },
    /** Whether a webhook notification really comes from PayPal (their check). */
    async verifyWebhook(
      headers: Record<string, string | undefined>,
      event: unknown,
      webhookId: string,
    ): Promise<boolean> {
      if (!webhookId) return false;
      const { status, data } = await call('POST', '/v1/notifications/verify-webhook-signature', {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: event,
      });
      return status < 400 && data.verification_status === 'SUCCESS';
    },
  };
}
