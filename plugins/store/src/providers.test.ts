import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  cleishopEvents,
  parseLemonSqueezy,
  renewalProductFor,
  renewalUrl,
  verifyLemonSqueezy,
} from './providers';

const order = (event: string, extra: Record<string, unknown> = {}) => ({
  meta: { event_name: event, custom_data: extra },
  data: {
    type: 'orders',
    id: '4242',
    attributes: {
      status: 'paid',
      user_email: 'Buyer@Example.com ',
      user_name: 'Ada Buyer',
      first_order_item: { variant_id: 777, product_id: 1, quantity: 2 },
      total: 11800,
      currency: 'eur',
    },
  },
});

describe('Lemon Squeezy', () => {
  it('checks the signature over the raw body', () => {
    const raw = Buffer.from(JSON.stringify(order('order_created')));
    const sig = createHmac('sha256', 'whsec').update(raw).digest('hex');
    expect(verifyLemonSqueezy('whsec', raw, sig)).toBe(true);
    expect(verifyLemonSqueezy('other', raw, sig)).toBe(false);
    expect(verifyLemonSqueezy('whsec', Buffer.from(`${raw} `), sig)).toBe(false);
    expect(verifyLemonSqueezy('whsec', raw, undefined)).toBe(false);
    expect(verifyLemonSqueezy('whsec', raw, 'zz')).toBe(false);
    expect(verifyLemonSqueezy('whsec', null, sig)).toBe(false);
  });

  it('reads paid orders, refunds and renewals', () => {
    expect(parseLemonSqueezy(order('order_created'))).toEqual({
      kind: 'paid',
      provider: 'lemonsqueezy',
      orderRef: '4242',
      variantId: '777',
      quantity: 2,
      email: 'buyer@example.com',
      name: 'Ada Buyer',
      licenseId: null,
      partner: null,
      subtotalCents: null,
      discountCents: null,
      currency: 'EUR',
      totalCents: 11800,
      referrals: {},
    });
    expect(
      parseLemonSqueezy(order('order_created', { ref_tandem: 'anna', ref_x: 'no way', other: 1 }))
        .referrals,
    ).toEqual({ tandem: 'anna' });
    expect(parseLemonSqueezy(order('order_refunded')).kind).toBe('refunded');
    expect(parseLemonSqueezy(order('subscription_created')).kind).toBe('ignored');
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(parseLemonSqueezy(order('order_created', { license: id })).licenseId).toBe(id);
    expect(parseLemonSqueezy(order('order_created', { license: 'x' })).licenseId).toBeNull();
    expect(parseLemonSqueezy(null).kind).toBe('ignored');
  });

  it('reads the partner code and the amounts, for the record', () => {
    const paid = order('order_created', { partner: 'DBATrade' });
    Object.assign(paid.data.attributes, { subtotal: 5900, discount_total: 1770, currency: 'eur' });
    expect(parseLemonSqueezy(paid)).toMatchObject({
      partner: 'dbatrade',
      subtotalCents: 5900,
      discountCents: 1770,
      currency: 'EUR',
    });
    expect(parseLemonSqueezy(order('order_created', { partner: 'a b<' })).partner).toBeNull();
  });

  it('adds the license to the renewal checkout', () => {
    expect(renewalUrl('https://shop.test/checkout/buy/abc', 'L1')).toBe(
      'https://shop.test/checkout/buy/abc?checkout%5Bcustom%5D%5Blicense%5D=L1',
    );
    expect(renewalUrl(null, 'L1')).toBeNull();
  });
});

describe('Cleishop orders (1.5)', () => {
  const detail = {
    order: {
      id: 'o1',
      email: 'Anna@Example.com',
      currency: 'EUR',
      billing: { firstName: 'Anna', lastName: 'Rossi' },
    },
    items: [
      {
        id: 'i1',
        kind: 'product',
        productId: 'p1',
        variationId: 'v10',
        quantity: 1,
        subtotal: '59.00',
        total: '49.00',
        ref: '',
      },
      {
        id: 'i2',
        kind: 'product',
        productId: 'p2',
        variationId: null,
        quantity: 1,
        subtotal: '29.00',
        total: '29.00',
        ref: '7BD438D8-3685-493B-9BDB-E3458E0C4C67',
      },
      {
        id: 'i3',
        kind: 'shipping',
        productId: null,
        variationId: null,
        quantity: 1,
        subtotal: '0',
        total: '0',
      },
    ],
  };

  it('sells or renews the lines of a paid order, by product or variation', () => {
    const events = cleishopEvents(detail, 'processing');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: 'paid',
      provider: 'cleishop',
      orderRef: 'o1:i1',
      variantId: 'v10',
      email: 'anna@example.com',
      name: 'Anna Rossi',
      licenseId: null,
      subtotalCents: 5900,
      discountCents: 1000,
      totalCents: null,
    });
    expect(events[1]).toMatchObject({
      variantId: 'p2',
      licenseId: '7bd438d8-3685-493b-9bdb-e3458e0c4c67',
    });
  });

  it('revokes on refunds and cancellations, and waits for other statuses', () => {
    expect(cleishopEvents(detail, 'refunded').map((e) => e.kind)).toEqual(['refunded', 'refunded']);
    expect(cleishopEvents(detail, 'cancelled')).toHaveLength(2);
    expect(cleishopEvents(detail, 'on-hold')).toEqual([]);
    expect(cleishopEvents(detail, 'pending')).toEqual([]);
  });

  it('gives Cleishop’s renewal link the license as the line’s ref', () => {
    expect(renewalUrl('https://cleitext.com/cart/add?product=abc', 'lic-1')).toBe(
      'https://cleitext.com/cart/add?product=abc&ref=lic-1',
    );
    expect(renewalUrl('https://shop.lemonsqueezy.com/buy/x', 'lic-1')).toContain(
      'checkout%5Bcustom%5D%5Blicense%5D=lic-1',
    );
  });
});

describe("renewal links for the license's plan (1.6.1)", () => {
  const plans = [
    { provider: 'cleishop', variantId: 'one', seats: 1, kind: 'new' },
    { provider: 'cleishop', variantId: 'ten', seats: 10, kind: 'new' },
    { provider: 'cleishop', variantId: 'all', seats: 0, kind: 'new' },
    { provider: 'lemonsqueezy', variantId: '99', seats: 10, kind: 'new' },
  ];
  it('pick the product of the same sites, and put it in the cart link', () => {
    expect(renewalProductFor(plans, 10)).toBe('ten');
    expect(renewalProductFor(plans, 0)).toBe('all');
    expect(renewalProductFor(plans, 3)).toBeNull();
    expect(renewalUrl('https://cleitext.com/cart/add?product=one', 'lic-1', 'ten')).toBe(
      'https://cleitext.com/cart/add?product=ten&ref=lic-1',
    );
  });
  it("prefer renewal products, and keep the link's own when none fits", () => {
    const withRenewal = [
      ...plans,
      { provider: 'cleishop', variantId: 'r', seats: 0, kind: 'renewal' },
    ];
    expect(renewalProductFor(withRenewal, 0)).toBe('r');
    expect(renewalProductFor(withRenewal, 1)).toBeNull();
  });
});
