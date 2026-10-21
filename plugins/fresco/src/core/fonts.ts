/**
 * Google Fonts: the whole catalog (from Cleitext's list, about 1,900
 * families), and the families a page uses, so that only those are loaded.
 */
import { googleFonts } from '@cleitext/shared/google-fonts';
import type { Settings } from './model.js';

/** Whether Google Fonts serves this family. */
export const isGoogleFont = (family: string): boolean => googleFonts().has(family);

/** Every Google Fonts family with its category, by name (for the font pickers). */
export function googleFontList(): { family: string; category: string }[] {
  return [...googleFonts().values()]
    .map(({ family, category }) => ({ family, category }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

/**
 * The Google Fonts some CSS uses: the families of its `font-family`
 * declarations and font variables (`--fr-…-family`, `--fr-v-…`).
 */
export function usedGoogleFonts(css: string): string[] {
  const found = new Set<string>();
  for (const match of css.matchAll(/(?:font-family|--fr-[\w-]+)\s*:\s*([^;{}<]{1,300})/g)) {
    for (const part of match[1]!.split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '');
      if (name && isGoogleFont(name)) found.add(name);
    }
  }
  return [...found];
}

/**
 * The Google Fonts an element's settings name: font settings (keys with
 * "family" or "font") and the font family of its style variants.
 */
export function elementGoogleFonts(attrs: Settings): string[] {
  const found = new Set<string>();
  const check = (value: unknown) => {
    if (typeof value === 'string' && isGoogleFont(value.trim())) found.add(value.trim());
  };
  for (const [key, value] of Object.entries(attrs)) {
    if (/famil|font/i.test(key)) check(value);
  }
  if (Array.isArray(attrs._styles)) {
    for (const variant of attrs._styles as { props?: Record<string, unknown> }[]) {
      check(variant?.props?.fontFamily);
    }
  }
  return [...found];
}

/** The families named by the `data-fr-fonts` attributes of a page. */
export function pageGoogleFonts(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/data-fr-fonts="([^"]{1,500})"/g)) {
    for (const name of match[1]!.split('|')) if (isGoogleFont(name)) found.add(name);
  }
  return [...found];
}
