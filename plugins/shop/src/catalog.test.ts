import { describe, expect, it } from 'vitest';
import {
  currentPrice,
  EXAMPLE_RULES,
  isOnSale,
  marginOf,
  markupFor,
  parseMoney,
  pricesFromCost,
  productInputSchema,
  stockStatusOf,
} from './catalog';

describe('money', () => {
  it('reads amounts with a comma or a dot', () => {
    expect(parseMoney('12,5')).toBe('12.5');
    expect(parseMoney(' 0.99 ')).toBe('0.99');
    expect(parseMoney(7)).toBe('7');
    expect(parseMoney('')).toBeNull();
    expect(() => parseMoney('12.34567')).toThrow();
    expect(() => parseMoney('-1')).toThrow();
    expect(() => parseMoney('ten')).toThrow();
  });
});

describe('sales', () => {
  const item = { regularPrice: '100', salePrice: '80', saleFrom: null, saleTo: null };
  it('apply a lower sale price within its dates', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    expect(isOnSale(item, now)).toBe(true);
    expect(currentPrice(item, now)).toBe('80');
    const later = { ...item, saleFrom: '2026-07-01T00:00:00Z' };
    expect(currentPrice(later, now)).toBe('100');
    const over = { ...item, saleTo: '2026-06-15T12:00:00Z' };
    expect(isOnSale(over, now)).toBe(false);
    expect(isOnSale({ ...item, salePrice: '120' }, now)).toBe(false);
    expect(currentPrice({ ...item, regularPrice: null, salePrice: null }, now)).toBeNull();
  });
});

describe('stock', () => {
  it('follows the quantity when managed', () => {
    const base = {
      manageStock: true,
      stock: 3,
      backorders: 'no' as const,
      stockStatus: 'outofstock' as const,
    };
    expect(stockStatusOf(base)).toBe('instock');
    expect(stockStatusOf({ ...base, stock: 0 })).toBe('outofstock');
    expect(stockStatusOf({ ...base, stock: -2, backorders: 'notify' })).toBe('onbackorder');
    expect(stockStatusOf({ ...base, manageStock: false })).toBe('outofstock');
  });
});

describe('prices from the cost', () => {
  it('apply the surcharge, the markup of the band and the discount', () => {
    expect(markupFor(20, EXAMPLE_RULES)).toBe(65);
    expect(markupFor(30, EXAMPLE_RULES)).toBe(65);
    expect(markupFor(30.01, EXAMPLE_RULES)).toBe(45);
    expect(markupFor(500, EXAMPLE_RULES)).toBe(35);
    // 20 → 20.64 with 3.2%; +65% = 34.06; -10% = 30.65
    expect(pricesFromCost(20, EXAMPLE_RULES)).toEqual({
      cost: '20.64',
      listPrice: '34.06',
      regularPrice: '30.65',
    });
    expect(pricesFromCost(20, { ...EXAMPLE_RULES, rounding: 'ninety' }).regularPrice).toBe('30.90');
    expect(pricesFromCost(20, { ...EXAMPLE_RULES, rounding: 'unit' }).regularPrice).toBe('31.00');
  });

  it('give the margin over the selling price', () => {
    expect(marginOf('60', '100')).toBe(40);
    expect(marginOf(null, '100')).toBeNull();
  });
});

describe('product input', () => {
  it('normalizes amounts and checks the sale dates and the GTIN', () => {
    const ok = productInputSchema.parse({
      regularPrice: '19,90',
      salePrice: null,
      gtin: '8001234567890',
    });
    expect(ok).toMatchObject({ regularPrice: '19.9', salePrice: null });
    expect(productInputSchema.safeParse({ gtin: '123' }).success).toBe(false);
    expect(
      productInputSchema.safeParse({
        saleFrom: '2026-07-02T00:00:00Z',
        saleTo: '2026-07-01T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(productInputSchema.safeParse({ regularPrice: 'free' }).success).toBe(false);
  });
});
