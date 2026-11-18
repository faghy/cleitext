import { describe, expect, it } from 'vitest';
import { chooseLine, parseOrderInput, sameCustomer } from './order-links';
import type { ShopOrder } from './providers';
import type { License } from './schema';

const line = (id: string, productId: string | null, kind = 'product') => ({
  id,
  kind,
  productId,
  variationId: null,
  quantity: 1,
  subtotal: '59.00',
  total: '59.00',
});
const order = (items: ShopOrder['items'], email = 'Anna@Example.com'): ShopOrder => ({
  order: { id: 'o1', email, currency: 'EUR', billing: null },
  items,
});

describe('orders linked to licenses', () => {
  it('reads an order number, or its id from the address of its page', () => {
    expect(parseOrderInput('123')).toEqual({ number: 123 });
    expect(parseOrderInput(' #42 ')).toEqual({ number: 42 });
    expect(parseOrderInput(7)).toEqual({ number: 7 });
    expect(
      parseOrderInput(
        'https://cleitext.com/admin/p/shop/orders?order=0B6F2A8E-3C1D-4E5F-8A9B-0C1D2E3F4A5B',
      ),
    ).toEqual({ orderId: '0b6f2a8e-3c1d-4e5f-8a9b-0c1d2e3f4a5b' });
    expect(parseOrderInput('0')).toBeNull();
    expect(parseOrderInput('abc')).toBeNull();
    expect(parseOrderInput(null)).toBeNull();
  });

  it('takes the line of the license’s product, else the only product line', () => {
    const sold = [
      { variantId: 'p-vitality', productSlug: 'vitality' },
      { variantId: 'p-zenit', productSlug: 'zenit' },
    ];
    const two = order([line('a', 'p-zenit'), line('b', 'p-vitality'), line('s', null, 'shipping')]);
    expect(chooseLine(two, 'vitality', sold)?.id).toBe('b');
    expect(chooseLine(two, 'campus', sold)).toBeNull();
    expect(chooseLine(order([line('c', 'p-other')]), 'vitality', sold)?.id).toBe('c');
    expect(chooseLine(order([line('s', null, 'shipping')]), 'vitality', sold)).toBeNull();
  });

  it('checks the order is the customer’s or the agency’s', () => {
    const license = { email: 'anna@example.com', ownerEmail: 'agency@example.com' } as License;
    expect(sameCustomer(order([]), license)).toBe(true);
    expect(sameCustomer(order([], 'agency@example.com'), license)).toBe(true);
    expect(sameCustomer(order([], 'someone@example.com'), license)).toBe(false);
  });
});
