import { describe, expect, it } from 'vitest';
import { orderNotification, pushNewOrder } from './push';

const detail = {
  order: {
    id: '0190a0b2-0000-7000-8000-000000000012',
    number: 12,
    total: '71.98',
    currency: 'EUR',
    email: 'ada@example.com',
    billing: { firstName: 'Ada', lastName: 'Rossi' },
  },
  items: [{ quantity: 2 }, { quantity: 1 }],
} as never;

describe('new order notification', () => {
  it('reads well in Italian and English', () => {
    const n = orderNotification(detail);
    expect(n.title).toEqual({
      en: 'New order #12 — €71.98',
      it: 'Nuovo ordine n. 12 — 71,98 €',
    });
    expect(n.body).toEqual({ en: 'Ada Rossi · 3 products', it: 'Ada Rossi · 3 prodotti' });
    expect(n.event).toBe('shop.order');
    expect(n.adminPath).toBe(
      '/cl-admin/ext/shop/orders?order=0190a0b2-0000-7000-8000-000000000012',
    );
  });

  it('works on cores without push, and never throws', () => {
    const warnings: string[] = [];
    const log = { warn: (m: string) => void warnings.push(m) };
    expect(() => pushNewOrder({ log } as never, 's', detail)).not.toThrow();
    const failing = {
      log,
      push: {
        notify: () => {
          throw new Error('no');
        },
      },
    };
    expect(() => pushNewOrder(failing as never, 's', detail)).not.toThrow();
    expect(warnings).toHaveLength(1);
  });
});
