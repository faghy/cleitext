import { describe, expect, it } from 'vitest';
import { computeTotals } from './totals';

describe('taxes from a tax service (shop.taxes)', () => {
  const input = {
    lines: [
      { key: 'a', unitPrice: '100.00', quantity: 1, taxStatus: 'taxable' as const, taxClass: '' },
      { key: 'b', unitPrice: '20.00', quantity: 2, taxStatus: 'taxable' as const, taxClass: '' },
    ],
    pricesIncludeTax: false,
    rates: { '': 22 },
    shipping: { cost: '10.00', taxable: true },
    discounts: { a: 1000 },
  };

  it('takes its taxes per line, for the shipping and by jurisdiction instead of the rates', () => {
    const totals = computeTotals({
      ...input,
      taxes: {
        lines: { a: 799, b: 355 },
        shipping: 89,
        fees: [],
        summary: [
          { label: 'NY State Tax', rate: 4, amount: 520 },
          { label: 'NY City Tax', rate: 4.5, amount: 585 },
          { label: 'MCTD', rate: 0.375, amount: 49 },
        ],
      },
    });
    expect(totals.lines.map((l) => [l.net, l.tax])).toEqual([
      [9000, 799],
      [4000, 355],
    ]);
    expect(totals.shippingTax).toBe(89);
    expect(totals.taxTotal).toBe(799 + 355 + 89);
    // The summary adds up to what was charged (the difference on the largest).
    expect(totals.taxes).toEqual([
      { label: 'NY State Tax', rate: 4, amount: 520 },
      { label: 'NY City Tax', rate: 4.5, amount: 585 + 89 },
      { label: 'MCTD', rate: 0.375, amount: 49 },
    ]);
    expect(totals.total).toBe(9000 + 4000 + 1000 + 799 + 355 + 89);
  });

  it('keeps the rates without one', () => {
    const totals = computeTotals(input);
    expect(totals.taxes).toEqual([{ rate: 22, amount: 1980 + 880 + 220 }]);
  });
});
