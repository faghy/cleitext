/**
 * The totals of a cart or an order, in cents: lines, discounts, shipping,
 * fees and taxes (WooCommerce's rules: prices entered with or without taxes,
 * discounts before taxes, taxes rounded per line). Pure: the cart, the
 * checkout and the order use it alike.
 */

export interface TotalsLine {
  key: string;
  /** Unit price as entered in the shop (with or without taxes, see `pricesIncludeTax`). */
  unitPrice: string;
  quantity: number;
  taxStatus: 'taxable' | 'shipping' | 'none';
  /** '' for the standard rate. */
  taxClass: string;
}

export interface TotalsInput {
  lines: TotalsLine[];
  pricesIncludeTax: boolean;
  /** Tax rates in percent by class ('' standard, 'reduced', 'zero'…); missing classes are 0. */
  rates: Record<string, number>;
  /** Shipping cost as entered (same rule as prices), and whether it is taxed. */
  shipping?: { cost: string; taxable: boolean } | null;
  /** Fees such as the cash-on-delivery surcharge, as entered. */
  fees?: { name: string; amount: string; taxable: boolean }[];
  /** Discounts (coupons) in cents by line key, on the same basis as the prices. */
  discounts?: Record<string, number>;
}

export interface LineTotals {
  key: string;
  quantity: number;
  /** Before the discount, without and with taxes. */
  subtotalNet: number;
  subtotalGross: number;
  /** After the discount, without taxes. */
  net: number;
  tax: number;
  /** With taxes. */
  gross: number;
  rate: number;
}

export interface Totals {
  lines: LineTotals[];
  /** Sum of the lines before discounts, without and with taxes. */
  subtotalNet: number;
  subtotalGross: number;
  /** Discounts, without and with taxes. */
  discountNet: number;
  discountGross: number;
  shippingNet: number;
  shippingTax: number;
  fees: { name: string; net: number; tax: number }[];
  /** Taxes by rate, for the receipt. */
  taxes: { rate: number; amount: number }[];
  taxTotal: number;
  /** What the customer pays. */
  total: number;
}

const cents = (amount: string) => Math.round(Number(amount) * 100);

/** Net and tax of an amount, entered with or without the tax. */
function split(amount: number, rate: number, inclusive: boolean): { net: number; tax: number } {
  if (rate <= 0) return { net: amount, tax: 0 };
  if (inclusive) {
    const tax = Math.round((amount * rate) / (100 + rate));
    return { net: amount - tax, tax };
  }
  return { net: amount, tax: Math.round((amount * rate) / 100) };
}

export function computeTotals(input: TotalsInput): Totals {
  const rateOf = (taxClass: string) => input.rates[taxClass] ?? 0;
  const byRate = new Map<number, number>();
  const addTax = (rate: number, amount: number) => {
    if (amount !== 0) byRate.set(rate, (byRate.get(rate) ?? 0) + amount);
  };

  let subtotalNet = 0;
  let subtotalGross = 0;
  const lines = input.lines.map((line) => {
    const rate = line.taxStatus === 'taxable' ? rateOf(line.taxClass) : 0;
    const before = cents(line.unitPrice) * line.quantity;
    const discount = Math.min(before, Math.max(0, input.discounts?.[line.key] ?? 0));
    const full = split(before, rate, input.pricesIncludeTax);
    subtotalNet += full.net;
    subtotalGross += full.net + full.tax;
    const { net, tax } = split(before - discount, rate, input.pricesIncludeTax);
    addTax(rate, tax);
    return {
      key: line.key,
      quantity: line.quantity,
      subtotalNet: full.net,
      subtotalGross: full.net + full.tax,
      net,
      tax,
      gross: net + tax,
      rate,
    };
  });
  const afterNet = lines.reduce((sum, l) => sum + l.net, 0);
  const afterGross = lines.reduce((sum, l) => sum + l.gross, 0);

  // Shipping is taxed at the standard rate (WooCommerce's default "based on cart items" is a later option).
  const shippingRate = input.shipping?.taxable ? rateOf('') : 0;
  const shipping = input.shipping
    ? split(cents(input.shipping.cost), shippingRate, input.pricesIncludeTax)
    : { net: 0, tax: 0 };
  addTax(shippingRate, shipping.tax);

  const fees = (input.fees ?? []).map((fee) => {
    const rate = fee.taxable ? rateOf('') : 0;
    const { net, tax } = split(cents(fee.amount), rate, input.pricesIncludeTax);
    addTax(rate, tax);
    return { name: fee.name, net, tax };
  });

  const taxes = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, amount]) => ({ rate, amount }));
  const taxTotal = taxes.reduce((sum, t) => sum + t.amount, 0);
  const total = afterNet + shipping.net + fees.reduce((sum, f) => sum + f.net, 0) + taxTotal;
  return {
    lines,
    subtotalNet,
    subtotalGross,
    discountNet: subtotalNet - afterNet,
    discountGross: subtotalGross - afterGross,
    shippingNet: shipping.net,
    shippingTax: shipping.tax,
    fees,
    taxes,
    taxTotal,
    total,
  };
}

/** Cents as a decimal string for numeric columns. */
export const decimal = (value: number) => (value / 100).toFixed(2);
