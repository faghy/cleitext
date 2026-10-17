/**
 * Texts entered in the admin in the site's other languages, as shops do it
 * with a string translation module: attribute names and values, shipping
 * methods, tax names, payment methods and emails. Each keeps its text and,
 * beside it, `{ "<locale>": { "<field>": "<text>" } }`; a page in a
 * language shows that language's text, or the text itself.
 */
import { z } from 'zod';

export type Texts = Record<string, Record<string, string>>;

const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Translations from the admin: well-formed languages, empty texts left out. */
export const textsSchema = z
  .record(z.string().regex(LOCALE), z.record(z.string().max(160), z.string().trim().max(2000)))
  .default({})
  .transform((value) => {
    const out: Texts = {};
    for (const [locale, fields] of Object.entries(value)) {
      const kept = Object.fromEntries(Object.entries(fields).filter(([, text]) => text !== ''));
      if (Object.keys(kept).length > 0) out[locale] = kept;
    }
    return out;
  });

/** The texts of a language: its own, or those of its base language (`it` for `it-CH`). */
function forLocale(texts: Texts | null | undefined, locale: string): Record<string, string> {
  if (!texts) return {};
  return texts[locale] ?? texts[locale.split('-')[0]!] ?? {};
}

/** One field in a language, or the fallback. */
export function textIn(
  texts: Texts | null | undefined,
  locale: string,
  field: string,
  fallback: string,
): string {
  return forLocale(texts, locale)[field] || fallback;
}

/** An object with its translated fields replaced, in a language. */
export function localize<T extends object>(
  value: T,
  texts: Texts | null | undefined,
  locale: string,
): T {
  const fields = forLocale(texts, locale);
  const keys = Object.keys(fields).filter(
    (k) => k in value && typeof value[k as keyof T] === 'string',
  );
  if (keys.length === 0) return value;
  return { ...value, ...Object.fromEntries(keys.map((k) => [k, fields[k]])) };
}
