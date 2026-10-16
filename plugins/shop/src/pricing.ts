import type { Backorders, StockStatus } from './schema';

/**
 * Rules of the catalog that need no database: prices, sales, stock and the
 * prices computed from the cost. Money travels as decimal strings ("12.50"),
 * as PostgreSQL's numeric returns it, and is computed in cents. No
 * dependencies: the admin pages use these too.
 */

// ---- Money ---------------------------------------------------------------------------

/** "12,5", "12.50" or 12.5 → "12.5"; null when empty. Throws on anything else. */
export function parseMoney(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'number' ? String(value) : String(value).trim().replace(',', '.');
  if (!/^-?\d{1,10}(\.\d{1,4})?$/.test(text))
    throw new Error(`"${String(value)}" is not an amount`);
  const amount = Number(text);
  if (amount < 0) throw new Error('Amounts cannot be negative');
  return String(amount);
}

/** Amount to cents, rounding half away from zero. */
export function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---- Sales ---------------------------------------------------------------------------

export interface Priced {
  regularPrice: string | null;
  salePrice: string | null;
  saleFrom: Date | string | null;
  saleTo: Date | string | null;
}

const time = (value: Date | string | null) =>
  value === null ? null : (value instanceof Date ? value : new Date(value)).getTime();

/** A sale price lower than the regular one, within its dates (either may be missing). */
export function isOnSale(item: Priced, now = new Date()): boolean {
  if (item.salePrice === null || item.regularPrice === null) return false;
  if (Number(item.salePrice) >= Number(item.regularPrice)) return false;
  const from = time(item.saleFrom);
  const to = time(item.saleTo);
  const at = now.getTime();
  return (from === null || from <= at) && (to === null || at < to);
}

/** What the customer pays now (before taxes), or null when the item has no price. */
export function currentPrice(item: Priced, now = new Date()): string | null {
  return isOnSale(item, now) ? item.salePrice : item.regularPrice;
}

/** The same rule in SQL, for lists filtered and sorted by price. */
export const CURRENT_PRICE_SQL = (prefix = '') => `
  CASE WHEN ${prefix}sale_price IS NOT NULL AND ${prefix}regular_price IS NOT NULL
        AND ${prefix}sale_price < ${prefix}regular_price
        AND (${prefix}sale_from IS NULL OR ${prefix}sale_from <= now())
        AND (${prefix}sale_to IS NULL OR now() < ${prefix}sale_to)
       THEN ${prefix}sale_price ELSE ${prefix}regular_price END`;

// ---- Stock ---------------------------------------------------------------------------

/**
 * The stock status follows the quantity when stock is managed: in stock
 * above zero, otherwise on backorder (when allowed) or out of stock. Without
 * managed stock it is set by hand.
 */
export function stockStatusOf(item: {
  manageStock: boolean;
  stock: number | null;
  backorders: Backorders;
  stockStatus: StockStatus;
}): StockStatus {
  if (!item.manageStock) return item.stockStatus;
  if ((item.stock ?? 0) > 0) return 'instock';
  return item.backorders === 'no' ? 'outofstock' : 'onbackorder';
}

// ---- Prices from the cost (Cleito's rules, configurable) --------------------------------

/** How the three prices come from the cost (validated by `pricingRulesSchema`). */
export interface PricingRules {
  /** Added to what the supplier asks (transport, fees), in percent. */
  surcharge: number;
  /** Markup on the cost by bands: the band with the smallest `upTo` not exceeded; `null` is "above". */
  tiers: { upTo: number | null; markup: number }[];
  /** The selling price is the list price minus this percent. */
  discount: number;
  rounding: 'cent' | 'ten' | 'unit' | 'ninety';
}

/** Cleito's rules: +3.2% transport, 65% up to 30, 45% up to 100, 35% above, site 10% below list. */
export const EXAMPLE_RULES: PricingRules = {
  surcharge: 3.2,
  tiers: [
    { upTo: 30, markup: 65 },
    { upTo: 100, markup: 45 },
    { upTo: null, markup: 35 },
  ],
  discount: 10,
  rounding: 'cent',
};

function round(cents: number, rounding: PricingRules['rounding']): number {
  switch (rounding) {
    case 'cent':
      return cents;
    case 'ten':
      return Math.round(cents / 10) * 10;
    case 'unit':
      return Math.round(cents / 100) * 100;
    case 'ninety':
      // 12.34 → 12.90; 12.95 → 13.90: prices that end in .90.
      return Math.max(90, Math.floor((cents - 90 + 99) / 100) * 100 + 90);
  }
}

/** The markup of a cost, from the bands sorted by their upper bound. */
export function markupFor(cost: number, rules: PricingRules): number {
  const bands = [...rules.tiers].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  return bands.find((band) => band.upTo === null || cost <= band.upTo)?.markup ?? 0;
}

/**
 * The three prices from what the supplier asks: the cost with the
 * surcharge, the list price with the markup of its band, the selling price
 * with the discount, rounded.
 */
export function pricesFromCost(
  supplierCost: number,
  rules: PricingRules,
): { cost: string; listPrice: string; regularPrice: string } {
  const cost = Math.round(supplierCost * 100 * (1 + rules.surcharge / 100));
  const list = Math.round(cost * (1 + markupFor(cost / 100, rules) / 100));
  const sell = round(Math.round(list * (1 - rules.discount / 100)), rules.rounding);
  return { cost: fromCents(cost), listPrice: fromCents(list), regularPrice: fromCents(sell) };
}

/** Margin of a selling price over the cost, in percent of the price (null when unknown). */
export function marginOf(cost: string | null, price: string | null): number | null {
  if (cost === null || price === null || Number(price) <= 0) return null;
  return Math.round(((Number(price) - Number(cost)) / Number(price)) * 1000) / 10;
}
