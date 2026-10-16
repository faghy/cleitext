import { describe, expect, it } from 'vitest';
import {
  addressLines,
  checkAddress,
  checkInvoice,
  isItalianVat,
  italianProvince,
  normalizeAddress,
  type Address,
} from './address';
import { computeTotals } from './totals';

describe('totals', () => {
  const line = (unitPrice: string, quantity: number, taxClass = '') => ({
    key: unitPrice,
    unitPrice,
    quantity,
    taxStatus: 'taxable' as const,
    taxClass,
  });

  it('take the tax out of prices entered with it, per line', () => {
    const totals = computeTotals({
      lines: [line('12.20', 2), line('10.40', 1, 'reduced')],
      pricesIncludeTax: true,
      rates: { '': 22, reduced: 4 },
    });
    expect(totals.lines.map((l) => [l.net, l.tax, l.gross])).toEqual([
      [2000, 440, 2440],
      [1000, 40, 1040],
    ]);
    expect(totals.taxes).toEqual([
      { rate: 22, amount: 440 },
      { rate: 4, amount: 40 },
    ]);
    expect(totals.total).toBe(3480);
  });

  it('add the tax to prices entered without it, shipping and fees included', () => {
    const totals = computeTotals({
      lines: [line('100', 1)],
      pricesIncludeTax: false,
      rates: { '': 22 },
      shipping: { cost: '10', taxable: true },
      fees: [{ name: 'Cash on delivery', amount: '5', taxable: false }],
    });
    expect(totals).toMatchObject({
      subtotalNet: 10000,
      shippingNet: 1000,
      shippingTax: 220,
      taxTotal: 2420,
      total: 10000 + 1000 + 500 + 2420,
    });
  });

  it('charge no tax without rates or for untaxed products', () => {
    const totals = computeTotals({
      lines: [{ ...line('9.99', 3), taxStatus: 'none' }],
      pricesIncludeTax: true,
      rates: { '': 22 },
    });
    expect(totals).toMatchObject({ taxTotal: 0, total: 2997 });
  });
});

describe('addresses', () => {
  const base: Address = {
    firstName: 'Anna',
    lastName: 'Rossi',
    company: '',
    address1: 'Via Roma 1',
    address2: '',
    city: 'Varazze',
    postcode: '17019',
    province: 'savona',
    country: 'IT',
    phone: '+39 019 123456',
  };

  it('check Italian postcodes and provinces', () => {
    expect(checkAddress(base, { phoneRequired: true })).toEqual({});
    expect(italianProvince('Milano')).toBe('MI');
    expect(normalizeAddress(base).province).toBe('SV');
    expect(
      checkAddress({ ...base, postcode: '1701', province: 'Gotham' }, { phoneRequired: false }),
    ).toEqual({
      postcode: 'Not a valid postcode',
      province: 'Not an Italian province',
    });
    expect(
      checkAddress({ ...base, firstName: ' ', country: 'XX' }, { phoneRequired: false }),
    ).toMatchObject({
      firstName: 'Required',
      country: 'Not a country we ship to',
    });
  });

  it('check the Italian invoice details', () => {
    expect(isItalianVat('01234567897')).toBe(true);
    expect(isItalianVat('01234567890')).toBe(false);
    expect(
      checkInvoice({ taxCode: 'RSSMRA80A01H501U', vatNumber: '', sdi: 'ABC1234', pec: '' }),
    ).toEqual({});
    expect(checkInvoice({ taxCode: 'NOPE', vatNumber: '123', sdi: 'X', pec: 'nope' })).toEqual({
      taxCode: 'Not a valid codice fiscale',
      vatNumber: 'Not a valid partita IVA',
      sdi: 'Seven letters or digits',
      pec: 'Not a valid address',
    });
  });

  it('print the address as on a label', () => {
    expect(addressLines(normalizeAddress(base), 'it')).toEqual([
      'Anna Rossi',
      'Via Roma 1',
      '17019 Varazze (SV)',
      'Italia',
    ]);
  });
});
