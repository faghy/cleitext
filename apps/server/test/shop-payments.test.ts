/**
 * The Shop plugin: Stripe and PayPal. The customer pays on the provider's
 * pages; the order waits as pending until the provider confirms, on the way
 * back or through a signed webhook. Refunds go back through the provider;
 * unpaid orders are cancelled. The providers are played by a stub of the
 * plugins' outgoing requests.
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
      return { status, type: 'application/json', text: JSON.stringify(body) };
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
