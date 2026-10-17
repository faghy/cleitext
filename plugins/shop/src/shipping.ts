import { z } from 'zod';
import { textsSchema } from './texts';

/**
 * Shipping (WooCommerce's zones and methods, and Cleito's weight bands).
 * A zone is a list of places (countries, provinces, postcodes); the first
 * zone matching the address gives its methods, the zone for "everywhere
 * else" the rest. Pure: the checkout and the admin's preview use it.
 */

// ---- Zones ---------------------------------------------------------------------------

export const regionSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  /** A province or state (its code, e.g. MI); empty for the whole country. */
  province: z.string().trim().max(10).default(''),
});

export const zoneInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  regions: z.array(regionSchema).max(300).default([]),
  /**
   * Postcodes, one per line: exact (`20122`), with a wildcard (`20*`) or a
   * range (`20100...20199`). Empty: any postcode of the regions.
   */
  postcodes: z.array(z.string().trim().min(1).max(40)).max(500).default([]),
});
export type ZoneInput = z.output<typeof zoneInputSchema>;

export interface Destination {
  country: string;
  province: string;
  postcode: string;
}

function postcodeMatches(pattern: string, postcode: string): boolean {
  const code = postcode.replace(/\s+/g, '').toUpperCase();
  const p = pattern.replace(/\s+/g, '').toUpperCase();
  const range = /^([0-9A-Z]+)\.\.\.([0-9A-Z]+)$/.exec(p);
  if (range) {
    const [, from, to] = range;
    if (/^\d+$/.test(from!) && /^\d+$/.test(to!) && /^\d+$/.test(code))
      return Number(code) >= Number(from) && Number(code) <= Number(to);
    return code >= from! && code <= to!;
  }
  if (p.endsWith('*')) return code.startsWith(p.slice(0, -1));
  return code === p;
}

export function zoneMatches(zone: ZoneInput, to: Destination): boolean {
  const place = zone.regions.some(
    (r) =>
      r.country === to.country &&
      (!r.province || r.province.toUpperCase() === to.province.toUpperCase()),
  );
  if (!place) return false;
  return zone.postcodes.length === 0 || zone.postcodes.some((p) => postcodeMatches(p, to.postcode));
}

/** The first zone (by position) for the address, or null for "everywhere else". */
export function zoneFor<Z extends ZoneInput>(zones: Z[], to: Destination): Z | null {
  return zones.find((zone) => zoneMatches(zone, to)) ?? null;
}

// ---- Methods -------------------------------------------------------------------------

const amount = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => v === '' || /^\d{1,8}(\.\d{1,4})?$/.test(v), 'Not an amount');
const formula = z
  .string()
  .trim()
  .max(200)
  .refine(
    (v) => v === '' || evaluate(v, { qty: 1, cost: 1, weight: 1 }) !== null,
    'Not a valid cost',
  );

export const methodSettingsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('flat'),
    /** e.g. `5`, `3 + 1.5 * [qty]`, `[cost] * 0.1`. */
    cost: formula.default('0'),
    /** Costs added for products of a shipping class, by class; `` for products without one. */
    classCosts: z.record(z.string().max(60), formula).default({}),
    /** `class`: the costs of every class are added; `order`: only the most expensive class. */
    calculation: z.enum(['class', 'order']).default('class'),
  }),
  z.object({
    kind: z.literal('free'),
    /** What it needs: nothing, a minimum amount, a free-shipping coupon, either or both. */
    requires: z.enum(['none', 'min_amount', 'coupon', 'either', 'both']).default('none'),
    minAmount: amount.default(''),
  }),
  z.object({
    kind: z.literal('pickup'),
    cost: amount.default('0'),
    /** Where and when, shown at checkout and in the emails. */
    address: z.string().trim().max(500).default(''),
  }),
  z.object({
    kind: z.literal('weight'),
    /**
     * Bands of the cart's weight, one after the other (Cleito's couriers):
     * up to `upTo` costs `cost`; `upTo` null is "and above". Carts heavier
     * than the last closed band do not get this method.
     */
    bands: z
      .array(
        z.object({
          upTo: z.number().positive().nullable(),
          cost: amount.refine((v) => v !== '', 'Required'),
        }),
      )
      .min(1)
      .max(50),
  }),
]);
export type MethodSettings = z.output<typeof methodSettingsSchema>;

export const methodInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  taxable: z.boolean().default(true),
  settings: methodSettingsSchema,
  /** The title in other languages: `{ it: { title } }`. */
  translations: textsSchema,
});
export type MethodInput = z.output<typeof methodInputSchema>;

/** What a cart needs to be priced for shipping. */
export interface Package {
  /** Contents cost, as entered, after discounts (cents). */
  contents: number;
  quantity: number;
  /** In the shop's weight unit. */
  weight: number;
  /** Quantities by shipping class ('' for none). */
  classes: Record<string, number>;
  /** A coupon of the cart gives free shipping. */
  freeShippingCoupon: boolean;
}

export interface Rate {
  id: string;
  title: string;
  /** Cents, as entered (with or without taxes, like prices). */
  cost: number;
  taxable: boolean;
  kind: MethodSettings['kind'];
  /** Pickup: where. */
  note?: string;
}

/** A method's cost for a package, or null when it does not apply. */
export function rateFor(id: string, method: MethodInput, pack: Package): Rate | null {
  if (!method.enabled) return null;
  const base = { id, title: method.title, taxable: method.taxable, kind: method.settings.kind };
  const s = method.settings;
  switch (s.kind) {
    case 'flat': {
      const vars = { qty: pack.quantity, cost: pack.contents / 100, weight: pack.weight };
      let cost = evaluate(s.cost || '0', vars) ?? 0;
      const classCosts = Object.entries(pack.classes)
        .map(([name, qty]) => {
          const expression = s.classCosts[name];
          return expression ? (evaluate(expression, { ...vars, qty }) ?? 0) : 0;
        })
        .filter((c) => c > 0);
      if (classCosts.length)
        cost +=
          s.calculation === 'order'
            ? Math.max(...classCosts)
            : classCosts.reduce((a, b) => a + b, 0);
      return { ...base, cost: Math.max(0, Math.round(cost * 100)) };
    }
    case 'free': {
      const min = s.minAmount ? Math.round(Number(s.minAmount) * 100) : 0;
      const enough = pack.contents >= min;
      const coupon = pack.freeShippingCoupon;
      const ok =
        s.requires === 'none' ||
        (s.requires === 'min_amount' && enough) ||
        (s.requires === 'coupon' && coupon) ||
        (s.requires === 'either' && (enough || coupon)) ||
        (s.requires === 'both' && enough && coupon);
      return ok ? { ...base, cost: 0, taxable: false } : null;
    }
    case 'pickup':
      return {
        ...base,
        cost: Math.round(Number(s.cost || 0) * 100),
        ...(s.address ? { note: s.address } : {}),
      };
    case 'weight': {
      const bands = [...s.bands].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
      const band = bands.find((b) => b.upTo === null || pack.weight <= b.upTo);
      return band ? { ...base, cost: Math.round(Number(band.cost || 0) * 100) } : null;
    }
  }
}

// ---- Cost formulas -------------------------------------------------------------------

/**
 * A cost such as `3 + 1.5 * [qty]`: numbers, + - * / and brackets, with the
 * cart's [qty], [cost] and [weight]. Parsed by hand (never `eval`); null when
 * it is not valid.
 */
export function evaluate(
  expression: string,
  vars: { qty: number; cost: number; weight: number },
): number | null {
  const source = expression
    .replace(/\[(qty|cost|weight)\]/gi, (_, name: string) =>
      String(vars[name.toLowerCase() as 'qty']),
    )
    .replace(/,/g, '.')
    .replace(/\s+/g, '');
  if (!/^[0-9.+\-*/()]*$/.test(source) || source === '') return null;
  let i = 0;
  const peek = () => source[i];
  const number = (): number | null => {
    const match = /^\d+(\.\d+)?|^\.\d+/.exec(source.slice(i));
    if (!match) return null;
    i += match[0].length;
    return Number(match[0]);
  };
  const factor = (): number | null => {
    if (peek() === '-') {
      i++;
      const value = factor();
      return value === null ? null : -value;
    }
    if (peek() === '(') {
      i++;
      const value = sum();
      if (value === null || peek() !== ')') return null;
      i++;
      return value;
    }
    return number();
  };
  const product = (): number | null => {
    let value = factor();
    while (value !== null && (peek() === '*' || peek() === '/')) {
      const op = source[i++];
      const right = factor();
      if (right === null || (op === '/' && right === 0)) return null;
      value = op === '*' ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number | null => {
    let value = product();
    while (value !== null && (peek() === '+' || peek() === '-')) {
      const op = source[i++];
      const right = product();
      if (right === null) return null;
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  return result !== null && i === source.length && Number.isFinite(result) ? result : null;
}
