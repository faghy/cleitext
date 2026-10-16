import type { Destination } from './shipping';

/**
 * Tax rates (WooCommerce's tax tables): a rate per class, country and
 * province, chosen by the shipping address. The most specific row wins:
 * province over country over "any country". No dependencies: the admin
 * imports it in the browser.
 */

/** The tax classes of products; '' is the standard rate. */
export const TAX_CLASSES = ['', 'reduced', 'second-reduced', 'super-reduced', 'zero'] as const;
export type TaxClass = (typeof TAX_CLASSES)[number];

export interface TaxRateInput {
  /** ISO code, or '' for any country. */
  country: string;
  /** A province or state code; '' for the whole country. */
  province: string;
  taxClass: TaxClass;
  /** Percent, e.g. 22 or 4.5. */
  rate: number;
  /** As shown on receipts, e.g. "IVA 22%". */
  name: string;
}

/** Italy's VAT rates (2026): 22, 10, 5 and 4 percent, and exempt. */
export const ITALY_PRESET: TaxRateInput[] = [
  { country: 'IT', province: '', taxClass: '', rate: 22, name: 'IVA 22%' },
  { country: 'IT', province: '', taxClass: 'reduced', rate: 10, name: 'IVA 10%' },
  { country: 'IT', province: '', taxClass: 'second-reduced', rate: 5, name: 'IVA 5%' },
  { country: 'IT', province: '', taxClass: 'super-reduced', rate: 4, name: 'IVA 4%' },
  { country: 'IT', province: '', taxClass: 'zero', rate: 0, name: 'Esente' },
];

/**
 * The rate of each class for an address, for `computeTotals`. Classes
 * without a matching row are not taxed.
 */
export function ratesFor(
  rows: TaxRateInput[],
  to: Pick<Destination, 'country' | 'province'>,
): Record<string, number> {
  const rank = (row: TaxRateInput) => {
    if (row.country === '') return 0;
    if (row.country !== to.country) return -1;
    if (row.province === '') return 1;
    return row.province.toUpperCase() === to.province.toUpperCase() ? 2 : -1;
  };
  const best = new Map<string, { rank: number; rate: number }>();
  for (const row of rows) {
    const r = rank(row);
    if (r < 0) continue;
    const current = best.get(row.taxClass);
    if (!current || r > current.rank) best.set(row.taxClass, { rank: r, rate: row.rate });
  }
  return Object.fromEntries([...best].map(([taxClass, { rate }]) => [taxClass, rate]));
}
