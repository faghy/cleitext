import { describe, expect, it } from 'vitest';
import {
  isWooExport,
  languageOf,
  numberOf,
  pickCustomers,
  toAddress,
  toImportedOrder,
  type WooCustomer,
  type WooOrder,
} from '../src/model/convert';

const customer = (over: Partial<WooCustomer>): WooCustomer => ({
  id: 1,
  email: 'a@b.test',
  orders: 0,
  paidOrders: 0,
  ...over,
});

const order: WooOrder = {
  id: 9001,
  number: '37860',
  status: 'processing',
  currency: 'USD',
  createdAt: '2025-01-02T03:04:05+00:00',
  customerId: 7,
  email: 'jane@example.test',
  billing: { first_name: 'Jane', city: 'New York', state: 'NY', country: 'US' },
  language: 'it',
  totals: { subtotal: '50.00', shipping: '5.00', tax: '4.88', total: '59.88' },
  items: [
    { type: 'line_item', name: 'Cologne', sku: 'COL-1', quantity: 1, total: '50.00', tax: '4.44' },
    { type: 'shipping', name: 'Flat rate', total: '5.00', tax: '0.44' },
    { type: 'fee', name: 'Gift wrap', total: '2.00' },
  ],
  taxes: [{ label: 'NY', rate: 8.875, amount: '4.88' }],
  notes: [{ content: 'Paid', author: '', date: '2025-01-02T03:05:00+00:00' }],
  refunds: [{ amount: '3.00', reason: 'late' }],
  meta: { _order_number: '37860', _ppcp_paypal_order_id: 'X1' },
};

describe('WooCommerce export', () => {
  it('is recognised', () => {
    expect(isWooExport({ format: 'cleitext-woo-export', customers: [], orders: [] })).toBe(true);
    expect(isWooExport({ format: 'other', customers: [], orders: [] })).toBe(false);
  });

  it('picks the customers asked for, never the staff', () => {
    const list = [
      customer({ id: 1, paidOrders: 1, orders: 1 }),
      customer({ id: 2, orders: 2 }),
      customer({ id: 3 }),
      customer({ id: 4, orders: 3, paidOrders: 1, roles: ['administrator'] }),
      customer({ id: 5, email: 'not-an-email' }),
      customer({ id: 6, orders: 1, emailVerified: true }),
    ];
    const ids = (which: 'paid' | 'orders' | 'all', verifiedOnly = false) =>
      pickCustomers(list, { which, verifiedOnly }).map((c) => c.id);
    expect(ids('paid')).toEqual([1]);
    expect(ids('orders')).toEqual([1, 2, 6]);
    expect(ids('all')).toEqual([1, 2, 3, 6]);
    expect(ids('orders', true)).toEqual([6]);
  });

  it('converts addresses, languages and numbers', () => {
    expect(toAddress({ first_name: 'Jane', state: 'NY' })).toMatchObject({
      firstName: 'Jane',
      province: 'NY',
      company: '',
    });
    expect(toAddress({ first_name: ' ' })).toBeNull();
    expect(languageOf('it_IT')).toBe('it');
    expect(languageOf('', 'en')).toBe('en');
    expect(numberOf(order)).toBe(37860);
    expect(numberOf({ ...order, number: undefined, meta: {} })).toBe(9001);
  });

  it('converts an order, linking products by SKU and its customer', () => {
    const converted = toImportedOrder(order, {
      customerUserId: 'user-7',
      productIdBySku: new Map([['COL-1', 'entry-1']]),
      defaultLocale: 'en',
    })!;
    expect(converted).toMatchObject({
      ref: 'wc:9001',
      number: 37860,
      status: 'processing',
      locale: 'it',
      customerUserId: 'user-7',
      shippingMethod: 'Flat rate',
      totals: { total: '59.88', fees: '2.00' },
      meta: { _ppcp_paypal_order_id: 'X1', woocommerceId: 9001 },
    });
    expect(converted.items.map((i) => [i.kind, i.productId])).toEqual([
      ['product', 'entry-1'],
      ['shipping', null],
      ['fee', null],
    ]);
    expect(converted.notes[0]).toMatchObject({ note: 'Paid', author: 'WooCommerce' });
    expect(
      toImportedOrder(
        { ...order, status: 'checkout-draft' },
        {
          customerUserId: null,
          productIdBySku: new Map(),
          defaultLocale: 'en',
        },
      ),
    ).toBeNull();
  });
});

describe('fixes after the first trial (1.1.0)', () => {
  it('does not count failed orders when they are left out', () => {
    const bot = customer({ id: 20, orders: 3, failedOrders: 3 });
    const real = customer({ id: 21, orders: 2, failedOrders: 1 });
    const ids = (skipFailed: boolean) =>
      pickCustomers([bot, real], { which: 'orders', verifiedOnly: false, skipFailed }).map(
        (c) => c.id,
      );
    expect(ids(true)).toEqual([21]);
    expect(ids(false)).toEqual([20, 21]);
  });

  it('links lines without a SKU by the product’s slug', () => {
    const converted = toImportedOrder(
      { ...order, items: [{ type: 'line_item', name: 'Rose', productSlug: 'rose', total: '1' }] },
      {
        customerUserId: null,
        productIdBySku: new Map(),
        productIdBySlug: new Map([['rose', 'entry-rose']]),
        defaultLocale: 'en',
      },
    )!;
    expect(converted.items[0]!.productId).toBe('entry-rose');
  });
});
