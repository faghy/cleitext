import { z } from 'zod';
import { parseMoney, type PricingRules } from './pricing';

export * from './pricing';

/** Validation of what the admin sends (zod: server side only). */

// ---- Prices from the cost ------------------------------------------------------------

export const pricingRulesSchema: z.ZodType<PricingRules, unknown> = z.object({
  /** Added to what the supplier asks (transport, fees), in percent. */
  surcharge: z.number().min(0).max(1000).default(0),
  /**
   * Markup on the cost by bands of cost, in percent; the band with the
   * smallest `upTo` that the cost does not exceed applies, `null` is "above".
   */
  tiers: z
    .array(
      z.object({ upTo: z.number().positive().nullable(), markup: z.number().min(0).max(10_000) }),
    )
    .max(20)
    .default([]),
  /** The selling price is the list price minus this percent. */
  discount: z.number().min(0).max(100).default(0),
  /** How selling prices are rounded. */
  rounding: z.enum(['cent', 'ten', 'unit', 'ninety']).default('cent'),
});
// ---- Product input -------------------------------------------------------------------

const money = z.union([z.string(), z.number(), z.null()]).transform((value, ctx) => {
  try {
    return parseMoney(value);
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message });
    return z.NEVER;
  }
});
const measure = z.union([z.number().min(0).max(1_000_000), z.null()]);
const date = z.union([z.iso.datetime({ offset: true }), z.null()]);
const uuid = z.uuid();

/** Commercial data of a product, as the admin form sends it (every field optional). */
export const productInputSchema = z
  .object({
    kind: z.enum(['simple', 'variable']),
    sku: z.string().trim().max(100),
    gtin: z
      .string()
      .trim()
      .regex(/^(\d{8}|\d{12,14})?$/, 'A GTIN has 8, 12, 13 or 14 digits'),
    condition: z.enum(['new', 'used', 'refurbished']),
    cost: money,
    listPrice: money,
    regularPrice: money,
    salePrice: money,
    saleFrom: date,
    saleTo: date,
    taxStatus: z.enum(['taxable', 'shipping', 'none']),
    taxClass: z.string().trim().max(60),
    manageStock: z.boolean(),
    stock: z.union([z.number().int().min(-1_000_000).max(1_000_000_000), z.null()]),
    stockStatus: z.enum(['instock', 'outofstock', 'onbackorder']),
    backorders: z.enum(['no', 'notify', 'yes']),
    lowStock: z.union([z.number().int().min(0).max(1_000_000), z.null()]),
    soldIndividually: z.boolean(),
    weight: measure,
    length: measure,
    width: measure,
    height: measure,
    shippingClass: z.string().trim().max(60),
    virtual: z.boolean(),
    downloadable: z.boolean(),
    purchaseNote: z.string().max(2_000),
    gallery: z.array(z.object({ id: uuid, caption: z.string().max(300).default('') })).max(50),
    upsellIds: z.array(uuid).max(50),
    crossSellIds: z.array(uuid).max(50),
    featured: z.boolean(),
    visibility: z.enum(['visible', 'catalog', 'search', 'hidden']),
  })
  .partial()
  .superRefine((input, ctx) => {
    if (
      input.saleFrom &&
      input.saleTo &&
      new Date(input.saleFrom).getTime() >= new Date(input.saleTo).getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['saleTo'],
        message: 'The sale must end after it starts',
      });
    }
  });
export type ProductInput = z.output<typeof productInputSchema>;

/** Quick edits from the product list: prices and stock, one product at a time. */
export const quickEditSchema = z
  .object({
    regularPrice: money,
    salePrice: money,
    cost: money,
    listPrice: money,
    stock: z.union([z.number().int().min(-1_000_000).max(1_000_000_000), z.null()]),
    stockStatus: z.enum(['instock', 'outofstock', 'onbackorder']),
  })
  .partial();
