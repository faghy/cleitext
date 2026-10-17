import { z } from 'zod';
import { TAX_CLASSES } from './tax-rates';
import { textsSchema } from './texts';

/** Tax rates as the admin sends them; the rules are in `tax-rates.ts`. */

export { ITALY_PRESET, ratesFor, TAX_CLASSES, type TaxClass, type TaxRateInput } from './tax-rates';

export const taxRateInputSchema = z.object({
  country: z.union([z.literal(''), z.string().regex(/^[A-Z]{2}$/)]).default(''),
  province: z.string().trim().toUpperCase().max(10).default(''),
  taxClass: z.enum(TAX_CLASSES).default(''),
  rate: z.number().min(0).max(100),
  name: z.string().trim().max(60).default(''),
  /** The name in other languages: `{ it: { name } }`. */
  translations: textsSchema,
});
