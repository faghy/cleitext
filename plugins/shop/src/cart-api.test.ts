import { describe, expect, it } from 'vitest';
import type { CartLine } from './cart';
import {
  cartJson,
  EMBED_JS,
  EMBED_JS_PATH,
  readQuantity,
  removeItem,
  setQuantity,
} from './cart-api';
import { moneyFormatter } from './pages';
import { cartUrls } from './public-api';
import { computeTotals } from './totals';

const line = (over: Partial<CartLine>): CartLine => ({
  key: 'p1:',
  productId: 'p1',
  variationId: null,
  quantity: 2,
  title: 'Desk lamp',
  slug: 'desk-lamp',
  locale: 'en',
  attributes: [],
  sku: 'LAMP-1',
  imageUrl: '/media/lamp.jpg',
  unitPrice: '30',
  regularPrice: '40',
  onSale: true,
  taxStatus: 'taxable',
  taxClass: '',
  shippingClass: '',
  categoryIds: [],
  manageStock: false,
  stock: null,
  backorders: 'no',
  soldIndividually: false,
  weight: 0,
  virtual: false,
  purchaseNote: '',
  ...over,
});

describe('the cart as JSON', () => {
  const lines = [
    line({}),
    line({
      key: 'p2:v1',
      productId: 'p2',
      variationId: 'v1',
      title: 'Shirt',
      quantity: 1,
      unitPrice: '12.20',
      regularPrice: '12.20',
      onSale: false,
      imageUrl: null,
      attributes: [{ name: 'Colour', value: 'Red' }],
      soldIndividually: true,
    }),
  ];
  const totals = computeTotals({
    lines: lines.map((l) => ({
      key: l.key,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      taxStatus: l.taxStatus,
      taxClass: l.taxClass,
    })),
    pricesIncludeTax: true,
    rates: { '': 22 },
    discounts: { 'p1:': 500 },
  });
  const json = cartJson({
    lines,
    totals,
    coupons: [{ code: 'save5', discount: 500 }],
    currency: 'EUR',
    includeTax: true,
    money: moneyFormatter('en', 'EUR'),
    notices: [{ kind: 'ok', text: 'Cart updated.' }],
    urls: { cart: '/it/cart', checkout: '/it/checkout', product: (l) => `/product/${l.slug}` },
  });

  it('lists the items with their prices, pictures and links', () => {
    expect(json.items).toEqual([
      {
        key: 'p1:',
        productId: 'p1',
        variationId: null,
        title: 'Desk lamp',
        attributes: [],
        sku: 'LAMP-1',
        quantity: 2,
        soldIndividually: false,
        price: 30,
        regularPrice: 40,
        onSale: true,
        total: 60,
        image: '/media/lamp.jpg',
        url: '/product/desk-lamp',
        formatted: { price: '€30.00', total: '€60.00' },
      },
      expect.objectContaining({
        key: 'p2:v1',
        variationId: 'v1',
        attributes: [{ name: 'Colour', value: 'Red' }],
        quantity: 1,
        soldIndividually: true,
        price: 12.2,
        total: 12.2,
        image: null,
      }),
    ]);
    expect(json.count).toBe(3);
  });

  it('gives the totals, coupons and addresses as the cart page shows them', () => {
    expect(json).toMatchObject({
      currency: 'EUR',
      pricesIncludeTax: true,
      coupons: [{ code: 'save5', discount: 5, formatted: '€5.00' }],
      totals: {
        subtotal: 72.2,
        discount: 5,
        shipping: null,
        fees: [],
        total: totals.total / 100,
        formatted: { subtotal: '€72.20', total: `€${(totals.total / 100).toFixed(2)}` },
      },
      notices: [{ kind: 'ok', text: 'Cart updated.' }],
      cartUrl: '/it/cart',
      checkoutUrl: '/it/checkout',
    });
    expect(json.totals.tax).toBeGreaterThan(0);
    expect(json.html).toBeUndefined();
  });

  it('is empty for an empty cart', () => {
    const empty = cartJson({
      lines: [],
      totals: computeTotals({ lines: [], pricesIncludeTax: false, rates: {} }),
      coupons: [],
      currency: 'EUR',
      includeTax: false,
      money: moneyFormatter('it', 'EUR'),
      notices: [],
      urls: { cart: '/cart', checkout: '/checkout', product: () => '/' },
    });
    expect(empty).toMatchObject({ items: [], count: 0, totals: { subtotal: 0, total: 0 } });
  });
});

describe('changing the cart', () => {
  const items = [
    { product: 'p1', variation: null, quantity: 2 },
    { product: 'p2', variation: 'v1', quantity: 1 },
  ];

  it('reads quantities as the cart page does', () => {
    expect(readQuantity('3')).toBe(3);
    expect(readQuantity(4.7)).toBe(4);
    expect(readQuantity('-2')).toBe(0);
    expect(readQuantity(123456)).toBe(9999);
    expect(readQuantity('')).toBeNull();
    expect(readQuantity('many')).toBeNull();
    expect(readQuantity(undefined)).toBeNull();
  });

  it('sets a quantity, and removes the item at 0', () => {
    expect(setQuantity(items, 'p2:v1', 5)).toEqual([
      { product: 'p1', variation: null, quantity: 2 },
      { product: 'p2', variation: 'v1', quantity: 5 },
    ]);
    expect(setQuantity(items, 'p1:', 0)).toEqual([{ product: 'p2', variation: 'v1', quantity: 1 }]);
    expect(setQuantity(items, 'p9:', 1)).toBeNull();
  });

  it('removes an item', () => {
    expect(removeItem(items, 'p1:')).toEqual([{ product: 'p2', variation: 'v1', quantity: 1 }]);
    expect(removeItem(items, 'nope')).toBeNull();
  });
});

describe('the cart for other plugins and blocks', () => {
  it('names the cart addresses in a language', () => {
    expect(cartUrls('/it')).toEqual({
      cart: '/it/cart',
      checkout: '/it/checkout',
      data: '/it/cart/data',
      item: '/it/cart/item',
      remove: '/it/cart/item/remove',
      count: '/it/cart/count',
      checkoutData: '/it/checkout/data',
      add: '/it/cart/add',
    });
    expect(cartUrls('').data).toBe('/cart/data');
    expect(cartUrls('//evil.example').cart).toBe('/cart');
  });

  it('serves the blocks’ script at an address that changes with it', () => {
    expect(EMBED_JS_PATH).toMatch(/^\/shop-assets\/embed-[a-z0-9]+\.js$/);
    expect(EMBED_JS).toContain('data-shop-embed');
    expect(() => new Function(EMBED_JS)).not.toThrow();
  });
});
