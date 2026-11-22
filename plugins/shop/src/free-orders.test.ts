import { describe, expect, it } from 'vitest';
import { freeOrderStatus, nothingToPay } from './orders';
import { checkoutPage, emptyAddress, moneyFormatter } from './pages';
import { translator } from './strings';
import { computeTotals } from './totals';

/** Free orders (1.26): a total of 0 needs no way to pay and is paid when placed. */

const line = (unitPrice: string) => ({
  key: unitPrice,
  unitPrice,
  quantity: 1,
  taxStatus: 'taxable' as const,
  taxClass: '',
});

describe('free orders', () => {
  it('cost nothing when the coupons take it all and shipping is free', () => {
    const free = computeTotals({
      lines: [line('59.00')],
      pricesIncludeTax: true,
      rates: { '': 22 },
      discounts: { '59.00': 5900 },
    });
    expect(free.total).toBe(0);
    expect(nothingToPay(free)).toBe(true);
    // Shipping to pay: not free.
    const shipped = computeTotals({
      lines: [line('59.00')],
      pricesIncludeTax: true,
      rates: { '': 22 },
      discounts: { '59.00': 5900 },
      shipping: { cost: '7.00', taxable: true },
    });
    expect(nothingToPay(shipped)).toBe(false);
    expect(
      nothingToPay(computeTotals({ lines: [line('1.00')], pricesIncludeTax: true, rates: {} })),
    ).toBe(false);
  });

  it('leave out the surcharge of a way to pay chosen before', () => {
    const withFee = computeTotals({
      lines: [line('10.00')],
      pricesIncludeTax: true,
      rates: {},
      discounts: { '10.00': 1000 },
      fees: [{ name: 'Cash on delivery', amount: '3.00', taxable: false }],
    });
    expect(withFee.total).toBe(300);
    expect(nothingToPay(withFee)).toBe(true);
  });

  it('are completed with only virtual products, else processing', () => {
    expect(freeOrderStatus([{ virtual: true }, { virtual: true }])).toBe('completed');
    expect(freeOrderStatus([{ virtual: true }, { virtual: false }])).toBe('processing');
    expect(freeOrderStatus([])).toBe('processing');
  });

  it('show no ways to pay at checkout', () => {
    const page = (free: boolean, locale = 'en') =>
      checkoutPage({
        values: {
          email: 'ada@example.com',
          billing: emptyAddress(),
          shipping: emptyAddress(),
          differentShipping: false,
          wantsInvoice: false,
          invoice: { taxCode: '', vatNumber: '', sdi: '', pec: '' },
          note: '',
          payment: '',
          rate: '',
          terms: false,
        },
        errors: {},
        lines: [],
        totals: computeTotals({ lines: [], pricesIncludeTax: true, rates: {} }),
        t: translator(locale),
        money: moneyFormatter(locale, 'EUR'),
        urls: { cart: '/cart', checkout: '/checkout', product: () => '/p', shop: '/shop' },
        locale,
        includeTax: true,
        payments: free ? [] : [{ id: 'bacs', title: 'Bank transfer', description: '' }],
        ...(free ? { free: true } : {}),
        termsUrl: '',
        phoneRequired: false,
        coupons: [],
        needsShipping: false,
        shippingSetUp: false,
        rates: [],
        rate: null,
      });
    expect(page(false)).toContain('name="payment"');
    expect(page(true)).not.toContain('name="payment"');
    expect(page(true)).toContain('No payment needed for this order.');
    expect(page(true, 'it')).toContain('Questo ordine non richiede alcun pagamento.');
  });
});
