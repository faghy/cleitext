import { z } from 'zod';

/**
 * License keys of paid catalog items: 25 Crockford base32 characters in five
 * groups (`7KQ2M-…`), the last one a Luhn mod 32 check character, so a
 * mistyped key is spotted without asking the license server.
 */
export const LICENSE_KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const N = LICENSE_KEY_ALPHABET.length;

function luhn(codes: number[], withCheck: boolean): number {
  let factor = withCheck ? 1 : 2;
  let sum = 0;
  for (let i = codes.length - 1; i >= 0; i--) {
    let addend = factor * codes[i]!;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / N) + (addend % N);
    sum += addend;
  }
  return sum % N;
}

/** Upper case, without spaces and dashes, with O read as 0 and I/L as 1. */
export function normalizeLicenseKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** The check character for 24 characters of a key. */
export function licenseKeyCheck(body: string): string {
  const codes = [...body].map((c) => LICENSE_KEY_ALPHABET.indexOf(c));
  return LICENSE_KEY_ALPHABET[(N - luhn(codes, false)) % N]!;
}

/** A key as people read it: five groups of five. */
export function formatLicenseKey(key: string): string {
  return normalizeLicenseKey(key).replace(/(.{5})(?=.)/g, '$1-');
}

/** True when `input` is a well-formed key (the license server decides if it exists). */
export function isLicenseKey(input: string): boolean {
  const key = normalizeLicenseKey(input);
  if (key.length !== 25) return false;
  const codes = [...key].map((c) => LICENSE_KEY_ALPHABET.indexOf(c));
  return !codes.includes(-1) && luhn(codes, true) === 0;
}

/** Paid catalog items (RF-CAT-03): the price buys downloads, updates and support. */
export const paidSchema = z.object({
  /** The starting price, e.g. one site. */
  price: z.object({
    amount: z.number().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    per: z.enum(['site']).default('site'),
  }),
  /** Months of updates included with a purchase; 0 for no end. */
  updatesMonths: z.number().int().min(0).max(120),
  purchaseUrl: z.url(),
  /** Base address of the license server (`…/activate`, `…/download-token`). */
  licenseServer: z.url(),
});
export type PaidInfo = z.infer<typeof paidSchema>;

export const licenseRequestSchema = z.object({
  key: z.string().trim().min(1).max(60),
});

/** The license of a paid theme on this site, without the key. */
export interface LicenseView {
  slug: string;
  /** The last characters of the key. */
  keyHint: string;
  activatedAt: string;
  /** Updates published until this date are included; null for no end. */
  updatesUntil: string | null;
  /** Sites in use and allowed (0: no limit), as last told by the server. */
  seats: { used: number; total: number } | null;
  /** Where to renew the updates, when the server gave one. */
  renewUrl: string | null;
}
