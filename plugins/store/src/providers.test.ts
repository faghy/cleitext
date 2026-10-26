import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseLemonSqueezy, renewalUrl, verifyLemonSqueezy } from './providers';

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
      currency: null,
    });
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
