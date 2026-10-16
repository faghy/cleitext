import { describe, expect, it } from 'vitest';
import {
  allocate,
  applyCoupons,
  couponInputSchema,
  couponProblem,
  emailAllowed,
  type Coupon,
  type CouponLine,
} from './coupons';
import {
  evaluate,
  methodInputSchema,
  rateFor,
  zoneFor,
  zoneInputSchema,
  type Package,
} from './shipping';
import { ITALY_PRESET, ratesFor, taxRateInputSchema } from './taxes';
import { computeTotals } from './totals';

const pack = (changes: Partial<Package> = {}): Package => ({
  contents: 5000,
  quantity: 2,
  weight: 1.5,
  classes: { '': 2 },
  freeShippingCoupon: false,
  ...changes,
});
const method = (settings: Record<string, unknown>, title = 'Method') =>
  methodInputSchema.parse({ title, settings });

describe('shipping zones', () => {
  const zones = [
    zoneInputSchema.parse({ name: 'Milan', regions: [{ country: 'IT' }], postcodes: ['201*'] }),
    zoneInputSchema.parse({
      name: 'Islands',
      regions: [
        { country: 'IT', province: 'CA' },
        { country: 'IT', province: 'PA' },
      ],
    }),
    zoneInputSchema.parse({
      name: 'Rome',
      regions: [{ country: 'IT' }],
      postcodes: ['00118...00199'],
    }),
    zoneInputSchema.parse({ name: 'Italy', regions: [{ country: 'IT' }] }),
  ];
  const at = (country: string, province: string, postcode: string) =>
    zoneFor(zones, { country, province, postcode })?.name ?? null;

  it('take the first zone that matches, by postcode, province or country', () => {
    expect(at('IT', 'MI', '20122')).toBe('Milan');
    expect(at('IT', 'pa', '90100')).toBe('Islands');
    expect(at('IT', 'RM', '00150')).toBe('Rome');
    expect(at('IT', 'RM', '00100')).toBe('Italy');
    expect(at('IT', 'TO', '10100')).toBe('Italy');
  });

  it('leave the rest to "everywhere else"', () => {
    expect(at('FR', '', '75001')).toBeNull();
  });
});

describe('shipping methods', () => {
  it('evaluate cost formulas without eval', () => {
    const vars = { qty: 3, cost: 40, weight: 2 };
    expect(evaluate('5', vars)).toBe(5);
    expect(evaluate('3 + 1,5 * [qty]', vars)).toBe(7.5);
    expect(evaluate('([cost] * 0.1) + [weight]', vars)).toBe(6);
    expect(evaluate('-2 + 4 / 2', vars)).toBe(0);
    expect(evaluate('1 / 0', vars)).toBeNull();
    expect(evaluate('alert(1)', vars)).toBeNull();
    expect(evaluate('2 +', vars)).toBeNull();
    expect(() => method({ kind: 'flat', cost: '3 +* 2' })).toThrow();
  });

  it('price flat rates with class costs, per class or per order', () => {
    const flat = (calculation: string) =>
      method({
        kind: 'flat',
        cost: '4',
        classCosts: { bulky: '10', fragile: '2 * [qty]' },
        calculation,
      });
    const classes = { bulky: 1, fragile: 3, '': 1 };
    expect(rateFor('a', flat('class'), pack({ classes }))?.cost).toBe(2000);
    expect(rateFor('a', flat('order'), pack({ classes }))?.cost).toBe(1400);
    expect(rateFor('a', flat('class'), pack())?.cost).toBe(400);
  });

  it('give free shipping by minimum amount or coupon', () => {
    const free = (requires: string) => method({ kind: 'free', requires, minAmount: '49,90' });
    expect(rateFor('f', free('min_amount'), pack({ contents: 4989 }))).toBeNull();
    expect(rateFor('f', free('min_amount'), pack({ contents: 4990 }))?.cost).toBe(0);
    expect(rateFor('f', free('coupon'), pack())).toBeNull();
    expect(rateFor('f', free('coupon'), pack({ freeShippingCoupon: true }))).not.toBeNull();
    expect(
      rateFor('f', free('either'), pack({ contents: 100, freeShippingCoupon: true })),
    ).not.toBeNull();
    expect(
      rateFor('f', free('both'), pack({ contents: 100, freeShippingCoupon: true })),
    ).toBeNull();
    expect(rateFor('f', free('none'), pack())).not.toBeNull();
  });

  it('price by weight bands, hidden beyond the last closed band', () => {
    const closed = method({
      kind: 'weight',
      bands: [
        { upTo: 5, cost: '8' },
        { upTo: 1, cost: '5' },
        { upTo: 20, cost: '15,50' },
      ],
    });
    expect(rateFor('w', closed, pack({ weight: 0.4 }))?.cost).toBe(500);
    expect(rateFor('w', closed, pack({ weight: 1 }))?.cost).toBe(500);
    expect(rateFor('w', closed, pack({ weight: 3 }))?.cost).toBe(800);
    expect(rateFor('w', closed, pack({ weight: 19.9 }))?.cost).toBe(1550);
    expect(rateFor('w', closed, pack({ weight: 21 }))).toBeNull();
    const open = method({
      kind: 'weight',
      bands: [
        { upTo: 5, cost: '8' },
        { upTo: null, cost: '30' },
      ],
    });
    expect(rateFor('w', open, pack({ weight: 300 }))?.cost).toBe(3000);
  });

  it('offer pickup with its address, and skip disabled methods', () => {
    const pickup = method({ kind: 'pickup', address: 'Via Roma 1, Milano' });
    expect(rateFor('p', pickup, pack())).toMatchObject({ cost: 0, note: 'Via Roma 1, Milano' });
    expect(rateFor('p', { ...pickup, enabled: false }, pack())).toBeNull();
  });
});

describe('tax rates', () => {
  const rows = [
    ...ITALY_PRESET,
    taxRateInputSchema.parse({ country: 'IT', province: 'ao', taxClass: '', rate: 0 }),
    taxRateInputSchema.parse({ country: '', taxClass: '', rate: 20 }),
  ];

  it('pick the most specific row for the address', () => {
    expect(ratesFor(rows, { country: 'IT', province: 'MI' })).toMatchObject({
      '': 22,
      reduced: 10,
      'second-reduced': 5,
      'super-reduced': 4,
      zero: 0,
    });
    expect(ratesFor(rows, { country: 'IT', province: 'AO' })['']).toBe(0);
    expect(ratesFor(rows, { country: 'DE', province: '' })).toEqual({ '': 20 });
    expect(ratesFor(ITALY_PRESET, { country: 'US', province: 'NY' })).toEqual({});
  });

  it('keep the gross price when prices include taxes, whatever the rate', () => {
    const line = {
      key: 'a',
      unitPrice: '12.20',
      quantity: 1,
      taxStatus: 'taxable' as const,
      taxClass: '',
    };
    for (const country of ['IT', 'DE', 'US']) {
      const totals = computeTotals({
        lines: [line],
        pricesIncludeTax: true,
        rates: ratesFor(rows, { country, province: '' }),
      });
      expect(totals.total).toBe(1220);
    }
  });
});

describe('coupons', () => {
  const A = '00000000-0000-4000-8000-00000000000a';
  const B = '00000000-0000-4000-8000-00000000000b';
  const SHOES = '00000000-0000-4000-8000-0000000000c1';
  const lines: CouponLine[] = [
    { key: 'a', productId: A, categoryIds: [SHOES], onSale: false, unitPrice: 6000, quantity: 1 },
    { key: 'b', productId: B, categoryIds: [], onSale: true, unitPrice: 2000, quantity: 2 },
  ];
  const coupon = (input: Record<string, unknown>): Coupon => ({
    id: 'c',
    usageCount: 0,
    ...couponInputSchema.parse({ code: 'X', amount: '10', ...input }),
  });

  it('store codes in lower case and refuse more than 100%', () => {
    expect(coupon({ code: 'SUMMER' }).code).toBe('summer');
    expect(() => coupon({ amount: '120' })).toThrow();
    expect(coupon({ kind: 'fixed_cart', amount: '120' }).amount).toBe('120');
  });

  it('split amounts in proportion, to the cent', () => {
    expect(allocate(1000, [6000, 4000])).toEqual([600, 400]);
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(5, [0, 0])).toEqual([0, 0]);
  });

  it('take a percentage off each line', () => {
    const applied = applyCoupons([coupon({ kind: 'percent', amount: '10' })], lines);
    expect(applied.discounts).toEqual({ a: 600, b: 400 });
    expect(applied.byCoupon).toEqual({ x: 1000 });
  });

  it('spread a cart amount and cap it at the cart', () => {
    expect(applyCoupons([coupon({ kind: 'fixed_cart', amount: '15' })], lines).discounts).toEqual({
      a: 900,
      b: 600,
    });
    expect(applyCoupons([coupon({ kind: 'fixed_cart', amount: '500' })], lines).byCoupon.x).toBe(
      10000,
    );
  });

  it('take a product amount per item, at most the item', () => {
    const applied = applyCoupons(
      [coupon({ kind: 'fixed_product', amount: '25', productIds: [B] })],
      lines,
    );
    expect(applied.discounts).toEqual({ b: 4000 });
  });

  it('respect categories, exclusions, sale items and item limits', () => {
    expect(applyCoupons([coupon({ categoryIds: [SHOES] })], lines).discounts).toEqual({ a: 600 });
    expect(applyCoupons([coupon({ excludeSaleItems: true })], lines).discounts).toEqual({ a: 600 });
    expect(applyCoupons([coupon({ excludedProductIds: [A] })], lines).discounts).toEqual({
      b: 400,
    });
    expect(applyCoupons([coupon({ amount: '50', limitItems: 2 })], lines).discounts).toEqual({
      a: 3000,
      b: 1000,
    });
  });

  it('apply product, then percent, then cart coupons', () => {
    const applied = applyCoupons(
      [
        coupon({ code: 'cart', kind: 'fixed_cart', amount: '10' }),
        coupon({ code: 'pct', kind: 'percent', amount: '50' }),
        coupon({ code: 'prod', kind: 'fixed_product', amount: '10', productIds: [A] }),
      ],
      lines,
    );
    expect(applied.byCoupon).toEqual({ prod: 1000, pct: 4500, cart: 1000 });
    expect(Object.values(applied.discounts).reduce((a, b) => a + b, 0)).toBe(6500);
  });

  it('say why a coupon does not apply', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const check = (
      input: Record<string, unknown>,
      extra: Partial<Parameters<typeof couponProblem>[1]> = {},
      usageCount = 0,
    ) => couponProblem({ ...coupon(input), usageCount }, { lines, applied: [], now, ...extra });
    expect(check({})).toBeNull();
    expect(check({ expiresAt: '2026-05-31T23:00:00Z' })).toBe('expired');
    expect(check({ usageLimit: 3 }, {}, 3)).toBe('used_up');
    expect(check({ usageLimitPerUser: 1 }, { usesByCustomer: 1 })).toBe('used_up_by_you');
    expect(check({ minSpend: '100.01' })).toBe('min_spend');
    expect(check({ maxSpend: '99.99' })).toBe('max_spend');
    expect(check({ productIds: [SHOES] })).toBe('not_applicable');
    expect(check({ emails: ['*@shop.it'] }, { email: 'Anna@Shop.it' })).toBeNull();
    expect(check({ emails: ['*@shop.it'] }, { email: 'anna@other.it' })).toBe('email');
    expect(check({}, { applied: [{ code: 'x', individualUse: false }] })).toBe('already');
    expect(check({}, { applied: [{ code: 'solo', individualUse: true }] })).toBe('individual');
    expect(check({ kind: 'fixed_cart', freeShipping: true }, { lines: [] })).toBeNull();
  });

  it('match emails with wildcards', () => {
    expect(emailAllowed([], 'a@b.it')).toBe(true);
    expect(emailAllowed(['a@b.it'], 'A@B.IT')).toBe(true);
    expect(emailAllowed(['a.b@c.it'], 'axb@c.it')).toBe(false);
  });

  it('feed the totals: discounts before taxes, per line rate', () => {
    const applied = applyCoupons([coupon({ kind: 'fixed_cart', amount: '20' })], lines);
    const totals = computeTotals({
      lines: lines.map((l) => ({
        key: l.key,
        unitPrice: (l.unitPrice / 100).toFixed(2),
        quantity: l.quantity,
        taxStatus: 'taxable' as const,
        taxClass: l.key === 'a' ? '' : 'super-reduced',
      })),
      pricesIncludeTax: true,
      rates: ratesFor(ITALY_PRESET, { country: 'IT', province: 'MI' }),
      discounts: applied.discounts,
    });
    expect(totals.discountGross).toBe(2000);
    expect(totals.total).toBe(8000);
  });
});
