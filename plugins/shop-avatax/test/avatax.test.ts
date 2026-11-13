/**
 * AvaTax for Cleishop against a fake Avalara: never the real API, never real
 * credentials.
 */
import { describe, expect, it } from 'vitest';
import {
  addressProblem,
  answerOf,
  client,
  invoiceModel,
  quoteModel,
  refundModel,
  type QuoteRequest,
  type Send,
} from '../src/avatax';
import { setupAvatax } from '../src/server';
import { cleanSettings } from '../src/settings';

const settings = {
  environment: 'sandbox' as const,
  companyCode: 'SHOPCO',
  origin: {
    line1: '1 Main St',
    city: 'New York',
    region: 'NY',
    postalCode: '10001',
    country: 'US',
  },
  shippingTaxCode: 'FR',
  defaultTaxCode: 'P0000000',
};

const request = (stage: 'cart' | 'checkout' = 'checkout'): QuoteRequest & { locale: string } => ({
  stage,
  locale: 'en',
  currency: 'USD',
  pricesIncludeTax: false,
  address: {
    line1: '10 Test Ave',
    line2: '',
    city: 'Rochester',
    region: 'NY',
    postcode: '14604',
    country: 'US',
  },
  customer: stage === 'checkout' ? { email: 'buyer@example.com', userId: null } : null,
  lines: [
    {
      key: 'a',
      productId: 'p1',
      sku: 'ROSE-50',
      name: 'Rose',
      quantity: 2,
      amount: 17800,
      taxable: true,
      taxClass: '',
    },
    {
      key: 'b',
      productId: 'p2',
      sku: '',
      name: 'Gift card',
      quantity: 1,
      amount: 2000,
      taxable: false,
      taxClass: '',
    },
  ],
  shipping: { amount: 1000, method: 'Ground' },
  fees: [],
});

/** Avalara's answer to the quote above: 8% in Rochester, on the products and the freight. */
const quoteAnswer = {
  code: 'x',
  totalTax: 15.04,
  lines: [
    { lineNumber: '1', tax: 14.24 },
    { lineNumber: '2', tax: 0 },
    { lineNumber: 'shipping', tax: 0.8 },
  ],
  summary: [
    { jurisName: 'NEW YORK', jurisType: 'State', taxName: 'NY STATE TAX', rate: 0.04, tax: 7.52 },
    { jurisName: 'MONROE', jurisType: 'County', taxName: 'NY COUNTY TAX', rate: 0.04, tax: 7.52 },
  ],
};

describe('AvaTax requests and answers', () => {
  it('asks a SalesOrder with the lines, the freight and the addresses', () => {
    const model = quoteModel(request(), settings, new Date('2026-11-13T10:00:00Z'));
    expect(model).toMatchObject({
      type: 'SalesOrder',
      companyCode: 'SHOPCO',
      date: '2026-11-13',
      customerCode: 'buyer@example.com',
      currencyCode: 'USD',
      addresses: {
        shipFrom: settings.origin,
        shipTo: {
          line1: '10 Test Ave',
          city: 'Rochester',
          region: 'NY',
          postalCode: '14604',
          country: 'US',
        },
      },
    });
    expect(model.commit).toBeUndefined();
    expect(model.lines).toEqual([
      {
        number: '1',
        quantity: 2,
        amount: 178,
        taxCode: 'P0000000',
        itemCode: 'ROSE-50',
        description: 'Rose',
      },
      { number: '2', quantity: 1, amount: 20, taxCode: 'NT', description: 'Gift card' },
      { number: 'shipping', quantity: 1, amount: 10, taxCode: 'FR', description: 'Ground' },
    ]);
  });

  it('reads the taxes per line and by jurisdiction', () => {
    expect(answerOf(request(), quoteAnswer)).toEqual({
      lines: { a: 1424, b: 0 },
      shipping: 80,
      fees: [],
      summary: [
        { label: 'NY STATE TAX', rate: 4, amount: 752 },
        { label: 'NY COUNTY TAX', rate: 4, amount: 752 },
      ],
    });
  });

  it('records a paid order as a committed SalesInvoice and refunds by percentage', () => {
    const model = invoiceModel(
      {
        number: 1042,
        createdAt: '2026-11-13T10:00:00Z',
        currency: 'USD',
        email: 'buyer@example.com',
        pricesIncludeTax: false,
        shipping: {
          address1: '10 Test Ave',
          address2: '',
          city: 'Rochester',
          province: 'NY',
          postcode: '14604',
          country: 'US',
        },
        billing: {
          address1: '',
          address2: '',
          city: '',
          province: '',
          postcode: '',
          country: 'US',
        },
        shippingTotal: '10.00',
        shippingMethod: 'Ground',
        items: [
          { kind: 'product', name: 'Rose', sku: 'ROSE-50', quantity: 2, total: '178.00' },
          { kind: 'shipping', name: 'Ground', sku: '', quantity: 1, total: '10.00' },
        ],
      },
      settings,
    );
    expect(model).toMatchObject({ type: 'SalesInvoice', code: '1042', commit: true });
    expect(model.lines.map((l) => [l.number, l.amount, l.taxCode])).toEqual([
      ['1', 178, 'P0000000'],
      ['shipping', 10, 'FR'],
    ]);
    expect(refundModel('1042', 'abcdef123456', 50, 200, new Date('2026-11-14'))).toEqual({
      refundTransactionCode: '1042-Rabcdef12',
      refundDate: '2026-11-14',
      refundType: 'Percentage',
      refundPercentage: 25,
      referenceCode: '1042',
    });
    expect(refundModel('1042', 'r1', 200, 200).refundType).toBe('Full');
  });

  it('tells an address not found', () => {
    expect(
      addressProblem({ validatedAddresses: [{ ...settings.origin }], messages: [] }),
    ).toBeNull();
    expect(
      addressProblem({
        messages: [{ severity: 'Error', summary: 'The address is not deliverable.' }],
      }),
    ).toBe('The address is not deliverable.');
  });

  it('sends the account in Basic auth to the environment chosen, and reads Avalara’s errors', async () => {
    const seen: { url: string; auth: string }[] = [];
    const send: Send = async (r) => {
      seen.push({ url: r.url, auth: r.headers.authorization! });
      return {
        status: 401,
        text: JSON.stringify({
          error: { code: 'AuthenticationException', message: 'Authentication failed.' },
        }),
      };
    };
    const ava = client(send, { accountId: 'acct', licenseKey: 'key' }, 'sandbox', '1.0.0');
    await expect(ava.ping()).rejects.toThrow('Authentication failed.');
    expect(seen[0]!.url).toBe('https://sandbox-rest.avatax.com/api/v2/utilities/ping');
    expect(seen[0]!.auth).toBe(`Basic ${Buffer.from('acct:key').toString('base64')}`);
  });

  it('keeps settings within the known values', () => {
    const s = cleanSettings({
      environment: 'prod',
      countries: ['us', 'XX1'],
      commit: 'yes',
      shippingTaxCode: 'bad code!',
    });
    expect(s).toMatchObject({
      environment: 'sandbox',
      countries: ['US'],
      commit: false,
      shippingTaxCode: 'FR',
      enabled: false,
    });
  });
});

/** A plugin context with what AvaTax uses, and a fake Avalara behind `send`. */
function fakeContext(answer: (url: string, body: unknown) => { status: number; body: unknown }) {
  const services = new Map<string, Record<string, (...args: never[]) => unknown>>();
  const hooks = new Map<string, (payload: unknown, meta: { siteId: string }) => unknown>();
  const storage = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const routes = new Map<
    string,
    (request: { siteId: string; body?: unknown }) => Promise<{ status?: number; body: unknown }>
  >();
  const calls: { url: string; body: unknown }[] = [];
  const order = {
    order: {
      id: 'o1',
      number: 1042,
      status: 'processing',
      total: '198.00',
      createdAt: '2026-11-13T10:00:00Z',
      currency: 'USD',
      email: 'buyer@example.com',
      pricesIncludeTax: false,
      shipping: {
        address1: '10 Test Ave',
        address2: '',
        city: 'Rochester',
        province: 'NY',
        postcode: '14604',
        country: 'US',
      },
      billing: {
        address1: '10 Test Ave',
        address2: '',
        city: 'Rochester',
        province: 'NY',
        postcode: '14604',
        country: 'US',
      },
      shippingTotal: '10.00',
      shippingMethod: 'Ground',
      externalRef: null as string | null,
    },
    items: [{ kind: 'product', name: 'Rose', sku: 'ROSE-50', quantity: 2, total: '178.00' }],
  };
  const ctx = {
    access: { defineCapability() {} },
    log: { warn() {}, info() {}, error() {} },
    storage: {
      get: async (_s: string, k: string) => storage.get(k) ?? null,
      set: async (_s: string, k: string, v: unknown) => void storage.set(k, v),
      delete: async (_s: string, k: string) => void storage.delete(k),
    },
    secrets: {
      get: async (_s: string, k: string) => secrets.get(k) ?? null,
      set: async (_s: string, k: string, v: string) => void secrets.set(k, v),
      delete: async (_s: string, k: string) => void secrets.delete(k),
    },
    services: {
      provide: (name: string, fns: Record<string, (...args: never[]) => unknown>) =>
        services.set(name, fns),
      use: async (_s: string, name: string) =>
        name === 'shop' ? { order: async () => order } : null,
      all: async () => [],
    },
    hooks: {
      on: (name: string, fn: (payload: unknown, meta: { siteId: string }) => unknown) =>
        hooks.set(name, fn),
    },
    routes: {
      api: (route: {
        method: string;
        path: string;
        handler: (r: {
          siteId: string;
          body?: unknown;
        }) => Promise<{ status?: number; body: unknown }>;
      }) => routes.set(`${route.method} ${route.path}`, route.handler),
    },
  };
  const send: Send = async (r) => {
    const body = r.body ? JSON.parse(r.body) : null;
    calls.push({ url: r.url, body });
    const a = answer(r.url, body);
    return { status: a.status, text: JSON.stringify(a.body) };
  };
  setupAvatax(ctx as never, send);
  const quote = services.get('shop.taxes')!.quote as unknown as (
    s: string,
    r: unknown,
  ) => Promise<unknown>;
  return { quote, hooks, routes, storage, secrets, calls, order };
}

const avalara = (url: string) =>
  url.endsWith('/addresses/resolve')
    ? { status: 200, body: { validatedAddresses: [{ line1: '10 TEST AVE' }], messages: [] } }
    : url.endsWith('/transactions/create')
      ? { status: 201, body: quoteAnswer }
      : url.includes('/void') || url.includes('/refund')
        ? { status: 200, body: { code: 'x' } }
        : { status: 404, body: { error: { message: 'unknown' } } };

describe('AvaTax as Cleishop’s tax service', () => {
  const configure = async (
    fake: ReturnType<typeof fakeContext>,
    extra: Record<string, unknown> = {},
  ) => {
    const save = fake.routes.get('PUT /settings')!;
    await save({
      siteId: 's1',
      body: {
        enabled: true,
        environment: 'sandbox',
        companyCode: 'SHOPCO',
        origin: settings.origin,
        accountId: 'acct',
        licenseKey: 'key',
        ...extra,
      },
    });
  };

  it('answers the cart and the checkout, checks the address once, and keeps answers a while', async () => {
    const fake = fakeContext(avalara);
    expect(await fake.quote('s1', request())).toBeNull(); // not set up yet
    await configure(fake);
    const answer = await fake.quote('s1', request());
    expect(answer).toMatchObject({ lines: { a: 1424, b: 0 }, shipping: 80 });
    expect(fake.calls.map((c) => c.url.split('/api/v2')[1])).toEqual([
      '/addresses/resolve',
      '/transactions/create',
    ]);
    // Only SalesOrders: never saved by Avalara.
    expect((fake.calls[1]!.body as { type: string; commit?: boolean }).type).toBe('SalesOrder');
    await fake.quote('s1', request());
    expect(fake.calls).toHaveLength(2);
    // Other countries keep the shop's rates.
    expect(
      await fake.quote('s1', { ...request(), address: { ...request().address, country: 'IT' } }),
    ).toBeNull();
    // The secrets are never sent back.
    const view = (await fake.routes.get('GET /settings')!({ siteId: 's1' })).body as Record<
      string,
      unknown
    >;
    expect(view).toMatchObject({ hasKey: true, hasAccount: true });
    expect(JSON.stringify(view)).not.toContain('key"');
  });

  it('refuses an address Avalara cannot find, and stops when Avalara does not answer', async () => {
    const notFound = fakeContext((url) =>
      url.endsWith('/addresses/resolve')
        ? { status: 200, body: { messages: [{ severity: 'Error', summary: 'Not found' }] } }
        : avalara(url),
    );
    await configure(notFound);
    await expect(notFound.quote('s1', request())).rejects.toThrow(
      'We could not find this shipping address',
    );
    const down = fakeContext(() => ({
      status: 503,
      body: { error: { message: 'Service unavailable' } },
    }));
    await configure(down, { addressValidation: 'off' });
    await expect(down.quote('s1', request('cart'))).rejects.toThrow(
      'Taxes cannot be worked out right now',
    );
  });

  it('records orders only with commit on, then voids and refunds them', async () => {
    const fake = fakeContext(avalara);
    await configure(fake);
    await fake.hooks.get('shop.order.status')!(
      { orderId: 'o1', to: 'processing' },
      { siteId: 's1' },
    );
    expect(fake.calls).toHaveLength(0);
    await configure(fake, { commit: true });
    await fake.hooks.get('shop.order.status')!(
      { orderId: 'o1', to: 'processing' },
      { siteId: 's1' },
    );
    const commit = fake.calls.at(-1)!;
    expect(commit.body).toMatchObject({ type: 'SalesInvoice', code: '1042', commit: true });
    // Again: recorded once.
    await fake.hooks.get('shop.order.created')!({ orderId: 'o1' }, { siteId: 's1' });
    expect(fake.calls.filter((c) => c.url.endsWith('/transactions/create'))).toHaveLength(1);
    await fake.hooks.get('shop.order.refunded')!(
      { orderId: 'o1', refundId: 'r1', amount: '99.00' },
      { siteId: 's1' },
    );
    expect(fake.calls.at(-1)!.url).toContain('/companies/SHOPCO/transactions/1042/refund');
    expect(fake.calls.at(-1)!.body).toMatchObject({
      refundType: 'Percentage',
      refundPercentage: 50,
    });
    await fake.hooks.get('shop.order.status')!(
      { orderId: 'o1', to: 'cancelled' },
      { siteId: 's1' },
    );
    expect(fake.calls.at(-1)!.url).toContain('/companies/SHOPCO/transactions/1042/void');
  });

  it('never records orders imported from the old shop', async () => {
    const fake = fakeContext(avalara);
    fake.order.order.externalRef = 'wc:1';
    await configure(fake, { commit: true });
    await fake.hooks.get('shop.order.status')!(
      { orderId: 'o1', to: 'completed' },
      { siteId: 's1' },
    );
    expect(fake.calls).toHaveLength(0);
  });
});
