/**
 * The Shop plugin: Stripe and PayPal. The customer pays on the provider's
 * pages, or in Stripe's Payment Element and express buttons on the site; the
 * order waits as pending until the provider confirms, on the way back or
 * through a signed webhook. Refunds go back through the provider; unpaid
 * orders are cancelled. Apple Pay's domain is registered and its file served.
 * The providers are played by a stub of the plugins' outgoing requests.
 */
import { createHmac } from 'node:crypto';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const WHSEC = 'whsec_testsecret1234567890';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let lamp: string;

const ext = (path: string) => `/api/v1/ext/shop${path}`;

/** What the providers were asked, and what they answer. */
const calls: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
let answer: (call: (typeof calls)[number]) => { status: number; body: unknown } = () => ({
  status: 500,
  body: {},
});

const billing = (email: string, payment: string) => ({
  email,
  'billing.firstName': 'Pia',
  'billing.lastName': 'Bianchi',
  'billing.address1': 'Via Dante 3',
  'billing.city': 'Torino',
  'billing.postcode': '10121',
  'billing.province': 'TO',
  'billing.country': 'IT',
  'billing.phone': '011 123456',
  payment,
});

async function orderByEmail(email: string) {
  const list = (await admin.get(ext(`/orders?q=${encodeURIComponent(email)}`))).json();
  return (await admin.get(ext(`/orders/${list.items[0].id}`))).json();
}

/** A webhook as Stripe sends it, signed with the endpoint's secret. */
function stripeWebhook(event: unknown, secret = WHSEC) {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return app.inject({
    method: 'POST',
    url: ext('/webhooks/stripe'),
    headers: {
      host: site.host,
      'content-type': 'application/json',
      'stripe-signature': `t=${t},v1=${v1}`,
    },
    payload: raw,
  });
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'shop-src-')), 'shop');
  await cp(join(pluginsRoot, 'shop'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  vi.spyOn(app.get(PluginServicesProvider), 'httpSend').mockImplementation(
    async (_plugin, request) => {
      const call = {
        url: request.url,
        method: request.method,
        headers: request.headers ?? {},
        body: request.body ?? '',
      };
      calls.push(call);
      const { status, body } = answer(call);
      return {
        status,
        type: typeof body === 'string' ? 'text/plain' : 'application/json',
        text: typeof body === 'string' ? body : JSON.stringify(body),
      };
    },
  );
  site = await seedSite(owner, 'shop-pay');
  await seedUser(owner, {
    email: 'pay-admin@shop-pay.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.95.0.1');
  await admin.login('pay-admin@shop-pay.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/shop/activate')).statusCode).toBe(200);
  await admin.request('PATCH', '/api/v1/plugins/shop/settings', {
    notifyEmail: 'orders@shop-pay.test',
  });
  const { id } = (await admin.post('/api/v1/entries', { type: 'product', title: 'Lamp' })).json();
  await admin.request('PUT', ext(`/products/${id}`), {
    product: { sku: 'LAMP', regularPrice: '25.50', manageStock: true, stock: 10 },
  });
  await admin.post(`/api/v1/entries/${id}/publish`);
  lamp = id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
  await owner?.close();
});

describe('setting up', () => {
  it('keeps the keys secret and checks them', async () => {
    const missing = await admin.request('PUT', ext('/payments'), { stripe: { enabled: true } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().errors[0].path).toBe('secrets.stripeSecretKey');
    const wrong = await admin.request('PUT', ext('/payments'), {
      secrets: { stripeSecretKey: 'not-a-key' },
    });
    expect(wrong.statusCode).toBe(400);

    const saved = await admin.request('PUT', ext('/payments'), {
      stripe: { enabled: true },
      paypal: { enabled: true, sandbox: true, clientId: 'AbCdClientId', webhookId: 'WH-1' },
      secrets: {
        stripeSecretKey: 'sk_test_abcdefghijklmnop',
        stripeWebhookSecret: WHSEC,
        paypalSecret: 'paypal-secret-0123456789abcdef',
      },
    });
    expect(saved.statusCode).toBe(200);
    const view = saved.json();
    expect(view.secrets).toEqual({
      stripeSecretKey: true,
      stripeWebhookSecret: true,
      paypalSecret: true,
    });
    expect(JSON.stringify(view)).not.toContain('sk_test_');
    expect(view.webhooks.stripe).toMatch(/\/api\/v1\/ext\/shop\/webhooks\/stripe$/);

    answer = () => ({ status: 200, body: { data: [] } });
    expect((await admin.post(ext('/payments/check/stripe'))).json()).toEqual({
      ok: true,
      message: null,
    });
    answer = () => ({ status: 401, body: {} });
    expect((await admin.post(ext('/payments/check/stripe'))).json().ok).toBe(false);
  });
});

describe('paying with Stripe', () => {
  let pia: TestClient;
  let number: number;
  let key: string;

  it('sends the customer to Stripe with the order pending', async () => {
    pia = new TestClient(app, site.host, '10.95.0.10');
    await pia.postForm('/cart/add', { product: lamp, quantity: '2' });
    expect((await pia.get('/checkout')).body).toContain('value="stripe"');
    calls.length = 0;
    answer = () => ({
      status: 200,
      body: { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' },
    });
    const placed = await pia.postForm('/checkout', billing('pia@example.test', 'stripe'));
    expect(placed.statusCode).toBe(303);
    expect(placed.headers.location).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    const asked = calls.find((c) => c.url.endsWith('/v1/checkout/sessions'))!;
    expect(asked.headers.authorization).toBe('Bearer sk_test_abcdefghijklmnop');
    const form = new URLSearchParams(asked.body);
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('5100');
    expect(form.get('line_items[0][price_data][currency]')).toBe('eur');
    expect(form.get('success_url')).toContain('session={CHECKOUT_SESSION_ID}');
    expect(form.get('customer_email')).toBe('pia@example.test');

    const detail = await orderByEmail('pia@example.test');
    expect(detail.order).toMatchObject({ status: 'pending', paymentRef: 'cs_test_1' });
    number = detail.order.number;
    key = detail.order.key;
    // Nothing is sent before the payment is confirmed.
    expect(app.get(MailService).outbox.filter((m) => m.to === 'pia@example.test')).toEqual([]);
    // The stock is held meanwhile.
    expect((await admin.get(ext(`/products/${lamp}`))).json().stock).toBe(8);
  });

  it('lets the customer try again after cancelling on Stripe', async () => {
    const page = await pia.get(`/checkout/pay/${number}?key=${key}&cancelled=1`);
    expect(page.body).toContain('The payment was not completed: you can try again.');
    answer = () => ({
      status: 200,
      body: { id: 'cs_test_2', url: 'https://checkout.stripe.com/c/pay/cs_test_2' },
    });
    const again = await pia.postForm(`/checkout/pay/${number}?key=${key}`, {});
    expect(again.headers.location).toBe('https://checkout.stripe.com/c/pay/cs_test_2');
    expect((await pia.get(`/checkout/pay/${number}?key=wrong`)).statusCode).toBe(404);
  });

  it('confirms the payment when the customer comes back', async () => {
    const detail = await orderByEmail('pia@example.test');
    answer = (call) =>
      call.url.endsWith('/v1/checkout/sessions/cs_test_2')
        ? {
            status: 200,
            body: {
              id: 'cs_test_2',
              payment_status: 'paid',
              status: 'complete',
              client_reference_id: detail.order.id,
              amount_total: 5100,
              currency: 'eur',
              payment_intent: 'pi_123',
            },
          }
        : { status: 404, body: {} };
    // A session of another order does not count.
    const other = await pia.get(
      `/checkout/stripe/return?order=${number}&key=${key}&session=cs_test_1`,
    );
    expect((await orderByEmail('pia@example.test')).order.status).toBe('pending');
    expect(other.headers.location).toBe(`/order-received/${number}?key=${key}`);
    const back = await pia.get(
      `/checkout/stripe/return?order=${number}&key=${key}&session=cs_test_2`,
    );
    expect(back.headers.location).toBe(`/order-received/${number}?key=${key}`);
    expect((await orderByEmail('pia@example.test')).order).toMatchObject({
      status: 'processing',
      transactionId: 'pi_123',
    });
    const outbox = app.get(MailService).outbox;
    expect(outbox.find((m) => m.to === 'pia@example.test')?.subject).toContain(
      'is being processed',
    );
    expect(outbox.some((m) => m.to === 'orders@shop-pay.test')).toBe(true);
    // The webhook arriving later changes nothing.
    const before = outbox.length;
    const late = await stripeWebhook({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_2',
          client_reference_id: detail.order.id,
          payment_status: 'paid',
          amount_total: 5100,
          currency: 'eur',
          payment_intent: 'pi_123',
        },
      },
    });
    expect(late.statusCode).toBe(200);
    expect(outbox.length).toBe(before);
  });

  it('confirms through the signed webhook alone', async () => {
    const ugo = new TestClient(app, site.host, '10.95.0.11');
    await ugo.postForm('/cart/add', { product: lamp, quantity: '1' });
    answer = () => ({
      status: 200,
      body: { id: 'cs_test_3', url: 'https://checkout.stripe.com/x' },
    });
    await ugo.postForm('/checkout', billing('ugo@example.test', 'stripe'));
    const detail = await orderByEmail('ugo@example.test');
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_3',
          client_reference_id: detail.order.id,
          payment_status: 'paid',
          amount_total: 2550,
          currency: 'eur',
          payment_intent: 'pi_456',
        },
      },
    };
    expect((await stripeWebhook(event, 'whsec_somebodyelse12345')).statusCode).toBe(400);
    expect((await orderByEmail('ugo@example.test')).order.status).toBe('pending');
    expect((await stripeWebhook(event)).statusCode).toBe(200);
    expect((await orderByEmail('ugo@example.test')).order).toMatchObject({
      status: 'processing',
      transactionId: 'pi_456',
    });
  });

  it('refunds through Stripe, and records nothing when Stripe refuses', async () => {
    const detail = await orderByEmail('pia@example.test');
    answer = () => ({ status: 402, body: { error: { message: 'Insufficient balance' } } });
    const refused = await admin.post(ext(`/orders/${detail.order.id}/refunds`), { amount: '10' });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().detail).toContain('Insufficient balance');
    expect((await orderByEmail('pia@example.test')).refunds).toEqual([]);

    calls.length = 0;
    answer = () => ({ status: 200, body: { id: 're_1' } });
    const done = await admin.post(ext(`/orders/${detail.order.id}/refunds`), { amount: '10' });
    expect(done.statusCode).toBe(201);
    expect(done.json().refunds[0]).toMatchObject({ amount: '10.00', gatewayRef: 're_1' });
    const asked = new URLSearchParams(calls[0]!.body);
    expect(asked.get('payment_intent')).toBe('pi_123');
    expect(asked.get('amount')).toBe('1000');
    // Recorded only, the money given back another way.
    calls.length = 0;
    const manual = await admin.post(ext(`/orders/${detail.order.id}/refunds`), {
      amount: '1',
      gateway: false,
    });
    expect(manual.statusCode).toBe(201);
    expect(calls).toEqual([]);
  });
});

describe('paying with PayPal', () => {
  it('captures the approved payment when the customer comes back', async () => {
    const eva = new TestClient(app, site.host, '10.95.0.12');
    await eva.postForm('/cart/add', { product: lamp, quantity: '1' });
    let orderId = '';
    answer = (call) => {
      if (call.url.endsWith('/v1/oauth2/token'))
        return { status: 200, body: { access_token: 'A21AA', expires_in: 3600 } };
      if (call.url.endsWith('/v2/checkout/orders')) {
        orderId = JSON.parse(call.body).purchase_units[0].custom_id;
        return {
          status: 201,
          body: {
            id: '5O190127TN364715T',
            links: [
              {
                rel: 'payer-action',
                href: 'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T',
              },
            ],
          },
        };
      }
      if (call.url.endsWith('/v2/checkout/orders/5O190127TN364715T/capture'))
        return {
          status: 201,
          body: {
            id: '5O190127TN364715T',
            status: 'COMPLETED',
            purchase_units: [
              {
                reference_id: orderId,
                payments: {
                  captures: [
                    {
                      id: '3C679366HH908993F',
                      status: 'COMPLETED',
                      custom_id: orderId,
                      amount: { value: '25.50', currency_code: 'EUR' },
                    },
                  ],
                },
              },
            ],
          },
        };
      return { status: 404, body: {} };
    };
    calls.length = 0;
    const placed = await eva.postForm('/checkout', billing('eva@example.test', 'paypal'));
    expect(placed.headers.location).toBe(
      'https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T',
    );
    expect(calls[0]!.url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    const created = JSON.parse(calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!.body);
    expect(created.purchase_units[0].amount).toEqual({ currency_code: 'EUR', value: '25.50' });

    const detail = await orderByEmail('eva@example.test');
    const back = await eva.get(
      `/checkout/paypal/return?order=${detail.order.number}&key=${detail.order.key}&token=5O190127TN364715T`,
    );
    expect(back.headers.location).toContain(`/order-received/${detail.order.number}`);
    expect((await orderByEmail('eva@example.test')).order).toMatchObject({
      status: 'processing',
      transactionId: '3C679366HH908993F',
    });
  });
});

describe('unpaid orders', () => {
  it('are cancelled after a while, with their stock given back', async () => {
    const leo = new TestClient(app, site.host, '10.95.0.13');
    await leo.postForm('/cart/add', { product: lamp, quantity: '3' });
    answer = () => ({
      status: 200,
      body: { id: 'cs_test_9', url: 'https://checkout.stripe.com/y' },
    });
    await leo.postForm('/checkout', billing('leo@example.test', 'stripe'));
    const stock = (await admin.get(ext(`/products/${lamp}`))).json().stock;
    const detail = await orderByEmail('leo@example.test');
    await withSiteContext(owner.db, site.id, (tx) =>
      tx.execute(
        sql`UPDATE plg_shop.orders SET created_at = now() - interval '2 hours' WHERE id = ${detail.order.id}`,
      ),
    );
    await app.get(PluginHost).runSchedules(Date.now() + 3_600_000);
    expect((await orderByEmail('leo@example.test')).order.status).toBe('cancelled');
    expect((await admin.get(ext(`/products/${lamp}`))).json().stock).toBe(stock + 3);
    // Paid orders stay as they are.
    expect((await orderByEmail('ugo@example.test')).order.status).toBe('processing');
  });
});

describe('paying on the site (Payment Element)', () => {
  const PK = 'pk_test_abcdefghijklmnop';
  let ada: TestClient;
  let adaOrder: { id: string; number: number; key: string };
  /** Stripe's answer to a new PaymentIntent, for the order in the request. */
  const intentAnswer = (id: string) => (call: (typeof calls)[number]) => {
    if (call.url.endsWith('/v1/payment_intents')) {
      const form = new URLSearchParams(call.body);
      return {
        status: 200,
        body: {
          id,
          client_secret: `${id}_secret_abc`,
          status: 'requires_payment_method',
          amount: Number(form.get('amount')),
          currency: form.get('currency'),
          metadata: { order_id: form.get('metadata[order_id]') },
        },
      };
    }
    return { status: 404, body: {} };
  };
  const paidIntent = (id: string, orderId: string, amount: number, status = 'succeeded') => ({
    id,
    object: 'payment_intent',
    status,
    amount,
    amount_received: status === 'succeeded' ? amount : 0,
    currency: 'eur',
    metadata: { order_id: orderId },
  });

  it('takes the publishable key, checked against the secret key', async () => {
    const wrong = await admin.request('PUT', ext('/payments'), {
      stripe: { enabled: true, publishableKey: 'sk_test_abcdefghijklmnop' },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().errors[0].path).toBe('stripe.publishableKey');
    const live = await admin.request('PUT', ext('/payments'), {
      stripe: { enabled: true, publishableKey: 'pk_live_abcdefghijklmnop' },
    });
    expect(live.statusCode).toBe(400);
    expect(live.json().errors[0].message).toContain('both test keys');
    const saved = await admin.request('PUT', ext('/payments'), {
      stripe: { enabled: true, publishableKey: PK },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().stripe).toMatchObject({
      publishableKey: PK,
      checkout: 'page',
      express: { enabled: true, checkout: true, cart: true, product: true },
    });
  });

  it('shows the Payment Element and creates the PaymentIntent when the order is sent', async () => {
    ada = new TestClient(app, site.host, '10.95.0.20');
    await ada.postForm('/cart/add', { product: lamp, quantity: '1' });
    const page = (await ada.get('/checkout')).body;
    expect(page).toContain('data-shop-stripe=');
    expect(page).toContain(PK);
    expect(page).toContain('&quot;amount&quot;:2550');
    expect(page).toMatch(/<script src="[^"]*stripe-pay\.js[^"]*" defer>/);
    expect(page).toContain('data-shop-express=');
    // No secret key on the page.
    expect(page).not.toContain('sk_test_');
    // Public pages let stripe.js and its frames load (no script or frame sources set).
    const policy = String((await ada.get('/checkout')).headers['content-security-policy']);
    expect(policy).not.toMatch(/script-src|frame-src|default-src|connect-src/);

    // A field to correct: the checkout's markup again, as JSON.
    const missing = await ada.postForm('/checkout', {
      ...billing('', 'stripe'),
      stripeOnPage: '1',
    });
    expect(missing.statusCode).toBe(200);
    expect(missing.json().html).toContain('Please correct the fields marked below.');

    calls.length = 0;
    answer = intentAnswer('pi_page_1');
    const placed = await ada.postForm('/checkout', {
      ...billing('ada@example.test', 'stripe'),
      stripeOnPage: '1',
    });
    expect(placed.statusCode).toBe(200);
    const detail = await orderByEmail('ada@example.test');
    adaOrder = detail.order;
    expect(placed.json()).toEqual({
      clientSecret: 'pi_page_1_secret_abc',
      returnUrl: `http://${site.host}/checkout/stripe/return?order=${adaOrder.number}&key=${encodeURIComponent(adaOrder.key)}`,
    });
    expect(calls.some((c) => c.url.includes('/checkout/sessions'))).toBe(false);
    const asked = calls.find((c) => c.url.endsWith('/v1/payment_intents'))!;
    expect(asked.headers['idempotency-key']).toBe(`intent-${adaOrder.id}-2550`);
    const form = new URLSearchParams(asked.body);
    expect(form.get('amount')).toBe('2550');
    expect(form.get('currency')).toBe('eur');
    expect(form.get('automatic_payment_methods[enabled]')).toBe('true');
    expect(form.get('metadata[order_id]')).toBe(adaOrder.id);
    expect(detail.order).toMatchObject({ status: 'pending', paymentRef: 'pi_page_1' });
  });

  it('confirms the payment once, back from 3-D Secure, and not again with the webhook', async () => {
    // A PaymentIntent of another order does not count.
    answer = (call) =>
      call.url.endsWith('/v1/payment_intents/pi_other')
        ? { status: 200, body: paidIntent('pi_other', 'another-order', 2550) }
        : call.url.endsWith('/v1/payment_intents/pi_page_1')
          ? { status: 200, body: paidIntent('pi_page_1', adaOrder.id, 2550) }
          : { status: 404, body: {} };
    const base = `/checkout/stripe/return?order=${adaOrder.number}&key=${encodeURIComponent(adaOrder.key)}`;
    await ada.get(`${base}&payment_intent=pi_other&redirect_status=succeeded`);
    expect((await orderByEmail('ada@example.test')).order.status).toBe('pending');
    const back = await ada.get(
      `${base}&payment_intent=pi_page_1&payment_intent_client_secret=pi_page_1_secret_abc&redirect_status=succeeded`,
    );
    expect(back.headers.location).toBe(
      `/order-received/${adaOrder.number}?key=${encodeURIComponent(adaOrder.key)}`,
    );
    expect((await orderByEmail('ada@example.test')).order).toMatchObject({
      status: 'processing',
      transactionId: 'pi_page_1',
    });
    const outbox = app.get(MailService).outbox;
    expect(outbox.filter((m) => m.to === 'ada@example.test')).toHaveLength(1);
    const before = outbox.length;
    const late = await stripeWebhook({
      type: 'payment_intent.succeeded',
      data: { object: paidIntent('pi_page_1', adaOrder.id, 2550) },
    });
    expect(late.statusCode).toBe(200);
    expect(outbox.length).toBe(before);
  });

  it('marks a failed payment, offers the card again, and takes the payment later', async () => {
    const bo = new TestClient(app, site.host, '10.95.0.21');
    await bo.postForm('/cart/add', { product: lamp, quantity: '1' });
    answer = intentAnswer('pi_page_2');
    await bo.postForm('/checkout', { ...billing('bo@example.test', 'stripe'), stripeOnPage: '1' });
    const { order } = await orderByEmail('bo@example.test');
    const declined = {
      ...paidIntent('pi_page_2', order.id, 2550, 'requires_payment_method'),
      last_payment_error: { message: 'Your card was declined.' },
    };
    const failed = await stripeWebhook({
      type: 'payment_intent.payment_failed',
      data: { object: declined },
    });
    expect(failed.statusCode).toBe(200);
    const detail = await orderByEmail('bo@example.test');
    expect(detail.order.status).toBe('failed');
    expect(JSON.stringify(detail)).toContain('Your card was declined.');

    // Back from a 3-D Secure that did not pass: the page to pay, with the card form.
    answer = (call) =>
      call.url.endsWith('/v1/payment_intents/pi_page_2')
        ? { status: 200, body: declined }
        : intentAnswer('pi_page_2')(call);
    const key = encodeURIComponent(order.key);
    const back = await bo.get(
      `/checkout/stripe/return?order=${order.number}&key=${key}&payment_intent=pi_page_2&redirect_status=failed`,
    );
    expect(back.headers.location).toBe(`/checkout/pay/${order.number}?key=${key}&cancelled=1`);
    const again = await bo.get(back.headers.location as string);
    expect(again.body).toContain('The payment was not completed: you can try again.');
    expect(again.body).toContain('pi_page_2_secret_abc');

    const paid = await stripeWebhook({
      type: 'payment_intent.succeeded',
      data: { object: paidIntent('pi_page_2', order.id, 2550) },
    });
    expect(paid.statusCode).toBe(200);
    expect((await orderByEmail('bo@example.test')).order).toMatchObject({
      status: 'processing',
      transactionId: 'pi_page_2',
    });
  });

  it('refunds through the PaymentIntent', async () => {
    calls.length = 0;
    answer = () => ({ status: 200, body: { id: 're_page_1' } });
    const done = await admin.post(ext(`/orders/${adaOrder.id}/refunds`), { amount: '5' });
    expect(done.statusCode).toBe(201);
    const asked = new URLSearchParams(calls[0]!.body);
    expect(calls[0]!.url).toBe('https://api.stripe.com/v1/refunds');
    expect(asked.get('payment_intent')).toBe('pi_page_1');
    expect(asked.get('amount')).toBe('500');
  });

  it('still goes to Stripe’s page without the script, or when the shop chose it', async () => {
    const cy = new TestClient(app, site.host, '10.95.0.22');
    await cy.postForm('/cart/add', { product: lamp, quantity: '1' });
    answer = () => ({
      status: 200,
      body: { id: 'cs_test_page', url: 'https://checkout.stripe.com/c/pay/cs_test_page' },
    });
    const placed = await cy.postForm('/checkout', billing('cy@example.test', 'stripe'));
    expect(placed.headers.location).toBe('https://checkout.stripe.com/c/pay/cs_test_page');

    await admin.request('PUT', ext('/payments'), {
      stripe: { enabled: true, publishableKey: PK, checkout: 'redirect' },
    });
    const dan = new TestClient(app, site.host, '10.95.0.23');
    await dan.postForm('/cart/add', { product: lamp, quantity: '1' });
    expect((await dan.get('/checkout')).body).not.toContain('data-shop-stripe=');
    await admin.request('PUT', ext('/payments'), {
      stripe: { enabled: true, publishableKey: PK, checkout: 'page' },
    });
  });
});

describe('express buttons (Apple Pay, Google Pay, Link)', () => {
  let rates: { islands: string; italy: string };

  beforeAll(async () => {
    const saved = await admin.request('PUT', ext('/shipping'), {
      zones: [
        {
          name: 'Islands',
          regions: [{ country: 'IT', province: 'CA' }],
          methods: [{ title: 'Courier (islands)', settings: { kind: 'flat', cost: '12' } }],
        },
        {
          name: 'Italy',
          regions: [{ country: 'IT' }],
          methods: [{ title: 'Courier', settings: { kind: 'flat', cost: '7' } }],
        },
      ],
      rest: [],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const zones = (await admin.get(ext('/shipping'))).json().zones as {
      methods: { id: string }[];
    }[];
    rates = { islands: zones[0]!.methods[0]!.id, italy: zones[1]!.methods[0]!.id };
  });

  it('gives the wallet the shop’s rates and total for its address, and places the order', async () => {
    const eli = new TestClient(app, site.host, '10.95.0.30');
    await eli.postForm('/cart/add', { product: lamp, quantity: '1' });
    expect((await eli.get('/cart')).body).toContain('class="shop-express shop-express--cart"');

    const config = (await eli.get('/checkout/express?place=cart')).json();
    expect(config).toMatchObject({
      key: 'pk_test_abcdefghijklmnop',
      currency: 'eur',
      amount: 3250,
      needsShipping: true,
      rates: [{ id: rates.italy, displayName: 'Courier', amount: 700 }],
      quoteUrl: '/checkout/express/quote',
      orderUrl: '/checkout/express/order',
    });
    const quoted = await eli.request(
      'POST',
      '/checkout/express/quote',
      { address: { country: 'IT', state: 'CA', postal_code: '09100', city: 'Cagliari' } },
      { csrf: false },
    );
    expect(quoted.json()).toMatchObject({
      amount: 3750,
      rates: [{ id: rates.islands, displayName: 'Courier (islands)', amount: 1200 }],
      rate: rates.islands,
    });

    // A wallet without the street: refused.
    const wallet = {
      rate: rates.islands,
      email: 'eli@example.test',
      phone: '+39 070 123456',
      billing: {
        name: 'Eli Sanna',
        email: 'eli@example.test',
        phone: '+39 070 123456',
        address: { postal_code: '09100', country: 'IT' },
      },
      shipping: {
        name: 'Eli Sanna',
        address: {
          line1: 'Via Roma 1',
          city: 'Cagliari',
          state: 'CA',
          postal_code: '09100',
          country: 'IT',
        },
      },
    };
    const incomplete = await eli.request(
      'POST',
      '/checkout/express/order',
      { ...wallet, shipping: { name: 'Eli Sanna', address: { country: 'IT' } } },
      { csrf: false },
    );
    expect(incomplete.statusCode).toBe(400);

    calls.length = 0;
    answer = (call) =>
      call.url.endsWith('/v1/payment_intents')
        ? {
            status: 200,
            body: {
              id: 'pi_express_1',
              client_secret: 'pi_express_1_secret',
              status: 'requires_payment_method',
            },
          }
        : { status: 404, body: {} };
    const placed = await eli.request('POST', '/checkout/express/order', wallet, { csrf: false });
    expect(placed.statusCode, placed.body).toBe(200);
    expect(placed.json().clientSecret).toBe('pi_express_1_secret');
    expect(placed.json().returnUrl).toContain('/checkout/stripe/return?order=');
    expect(new URLSearchParams(calls[0]!.body).get('amount')).toBe('3750');
    const detail = await orderByEmail('eli@example.test');
    expect(detail.order).toMatchObject({
      status: 'pending',
      paymentMethod: 'stripe',
      paymentRef: 'pi_express_1',
      total: '37.50',
    });
    // The billing address is the shipping one when the wallet gives only the postcode.
    expect(detail.order.billing).toMatchObject({
      firstName: 'Eli',
      lastName: 'Sanna',
      address1: 'Via Roma 1',
      city: 'Cagliari',
      province: 'CA',
      phone: '+39 070 123456',
    });
    expect(detail.order.shipping).toMatchObject({ city: 'Cagliari', province: 'CA' });
    // The cart is emptied, as at checkout.
    expect((await eli.get('/cart/count')).json().count).toBe(0);

    // Paid: the webhook confirms it as any PaymentIntent.
    await stripeWebhook({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_express_1',
          amount: 3750,
          amount_received: 3750,
          currency: 'eur',
          metadata: { order_id: detail.order.id },
        },
      },
    });
    expect((await orderByEmail('eli@example.test')).order.status).toBe('processing');
  });

  it('buys one product from its page, leaving the cart as it is', async () => {
    const flo = new TestClient(app, site.host, '10.95.0.31');
    await flo.postForm('/cart/add', { product: lamp, quantity: '2' });
    const page = (await flo.get('/product/lamp')).body;
    expect(page).toContain('class="shop-express shop-express--product"');
    expect(page).toMatch(/stripe-pay\.js/);

    const config = (
      await flo.get(`/checkout/express?place=product&product=${lamp}&quantity=1`)
    ).json();
    expect(config.amount).toBe(3250);
    answer = (call) =>
      call.url.endsWith('/v1/payment_intents')
        ? { status: 200, body: { id: 'pi_express_2', client_secret: 'pi_express_2_secret' } }
        : { status: 404, body: {} };
    const placed = await flo.request(
      'POST',
      '/checkout/express/order',
      {
        product: lamp,
        quantity: '1',
        rate: rates.italy,
        email: 'flo@example.test',
        billing: {
          name: 'Flo Neri',
          email: 'flo@example.test',
          phone: '011 765432',
          address: {
            line1: 'Via Po 2',
            city: 'Torino',
            state: 'Torino',
            postal_code: '10123',
            country: 'IT',
          },
        },
        shipping: {
          name: 'Flo Neri',
          address: {
            line1: 'Via Po 2',
            city: 'Torino',
            state: 'TO',
            postal_code: '10123',
            country: 'IT',
          },
        },
      },
      { csrf: false },
    );
    expect(placed.statusCode, placed.body).toBe(200);
    const detail = await orderByEmail('flo@example.test');
    expect(detail.order.total).toBe('32.50');
    expect(detail.order.billing.province).toBe('TO');
    expect(detail.items.filter((i: { kind: string }) => i.kind === 'product')).toHaveLength(1);
    expect((await flo.get('/cart/count')).json().count).toBe(2);
  });

  it('shows no buttons when they are turned off there', async () => {
    await admin.request('PUT', ext('/payments'), {
      stripe: {
        enabled: true,
        publishableKey: 'pk_test_abcdefghijklmnop',
        express: { enabled: true, checkout: true, cart: false, product: true },
      },
    });
    const gil = new TestClient(app, site.host, '10.95.0.32');
    await gil.postForm('/cart/add', { product: lamp, quantity: '1' });
    expect((await gil.get('/cart')).body).not.toContain('class="shop-express shop-express--cart"');
    expect((await gil.get('/checkout/express?place=cart')).json()).toEqual({ key: null });
    expect((await gil.get('/checkout')).body).toContain(
      'class="shop-express shop-express--checkout"',
    );
  });
});

describe('Apple Pay’s domain', () => {
  const FILE = '/.well-known/apple-developer-merchantid-domain-association';

  it('registers the site’s domain with Stripe and serves Apple’s file', async () => {
    const visitor = new TestClient(app, site.host, '10.95.0.40');
    expect((await visitor.get(FILE)).statusCode).toBe(404);
    answer = () => ({ status: 200, body: { data: [] } });
    const before = await admin.get(ext('/payments/stripe/domain'));
    expect(before.json()).toMatchObject({ domain: site.host, registered: false, file: false });

    calls.length = 0;
    answer = (call) => {
      if (
        call.url ===
        'https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association'
      )
        return { status: 200, body: '7B2270737022' };
      if (call.url.includes('/v1/payment_method_domains?'))
        return { status: 200, body: { data: [] } };
      if (call.url.endsWith('/v1/payment_method_domains'))
        return {
          status: 200,
          body: {
            id: 'pmd_1',
            domain_name: site.host,
            enabled: true,
            apple_pay: { status: 'active' },
            google_pay: { status: 'active' },
            link: { status: 'active' },
          },
        };
      return { status: 404, body: {} };
    };
    const registered = await admin.post(ext('/payments/stripe/domain'));
    expect(registered.statusCode, registered.body).toBe(200);
    expect(registered.json()).toMatchObject({
      domain: site.host,
      registered: true,
      applePay: 'active',
      file: true,
    });
    const created = calls.find((c) => c.url.endsWith('/v1/payment_method_domains'))!;
    expect(new URLSearchParams(created.body).get('domain_name')).toBe(site.host);

    const file = await visitor.get(FILE);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toContain('text/plain');
    expect(file.body).toBe('7B2270737022');

    // Registered already: Stripe checks it again.
    calls.length = 0;
    answer = (call) => {
      if (call.url.includes('/v1/payment_method_domains?'))
        return { status: 200, body: { data: [{ id: 'pmd_1', domain_name: site.host }] } };
      if (call.url.endsWith('/v1/payment_method_domains/pmd_1/validate'))
        return {
          status: 200,
          body: { id: 'pmd_1', domain_name: site.host, apple_pay: { status: 'active' } },
        };
      return { status: 200, body: '7B2270737022' };
    };
    expect((await admin.post(ext('/payments/stripe/domain'))).statusCode).toBe(200);
    expect(calls.some((c) => c.url.endsWith('/pmd_1/validate'))).toBe(true);
  });
});
