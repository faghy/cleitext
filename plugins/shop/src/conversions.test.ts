import { describe, expect, it } from 'vitest';
import { becomesPaid, becomesReversed, orderConversion } from './conversions';
import type { OrderDetail } from './order-admin';

describe('orders as conversions', () => {
  it('is paid when it reaches processing or completed from another status', () => {
    expect(becomesPaid(null, 'processing')).toBe(true);
    expect(becomesPaid(null, 'on-hold')).toBe(false);
    expect(becomesPaid('on-hold', 'processing')).toBe(true);
    expect(becomesPaid('pending', 'completed')).toBe(true);
    expect(becomesPaid('processing', 'completed')).toBe(false);
  });

  it('is reversed when a paid order is cancelled, failed or refunded', () => {
    expect(becomesReversed('processing', 'cancelled')).toBe(true);
    expect(becomesReversed('completed', 'refunded')).toBe(true);
    expect(becomesReversed('on-hold', 'cancelled')).toBe(false);
    expect(becomesReversed('processing', 'on-hold')).toBe(false);
  });

  it('gives the total, the products (not shipping) and the referral codes', () => {
    const paidAt = new Date('2026-10-20T10:00:00Z');
    const detail = {
      order: {
        id: 'o1',
        number: 12,
        total: '61.00',
        currency: 'EUR',
        email: 'ada@example.test',
        customerId: null,
        paidAt,
        referrals: { passaparola: 'anna' },
      },
      items: [
        {
          id: 'i1',
          kind: 'product',
          productId: 'p1',
          variationId: null,
          name: 'Mug',
          quantity: 2,
          total: '40.00',
        },
        {
          id: 'i2',
          kind: 'shipping',
          productId: null,
          variationId: null,
          name: 'Courier',
          quantity: 1,
          total: '10.00',
        },
      ],
    } as unknown as OrderDetail;
    expect(orderConversion(detail)).toEqual({
      kind: 'order',
      id: 'o1',
      amount: '61.00',
      currency: 'EUR',
      customer: { email: 'ada@example.test', userId: null },
      items: [{ id: 'p1', name: 'Mug × 2', amount: '40.00' }],
      label: '#12',
      at: paidAt.toISOString(),
      referrals: { passaparola: 'anna' },
    });
  });
});
