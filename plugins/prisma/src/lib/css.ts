import {
  add,
  emptySheet,
  num,
  printSheet,
  safeColor,
  type Breakpoints,
  type BaseDevice as Device,
  type Sheet,
} from '@cleitext/design';
import { DEFAULT_GLOBALS, type Globals } from './globals';
import type { Attrs, PrismaBlock } from './types';

/** Breakpoints of the blocks' responsive settings (tablet up to 976px, mobile up to 767px). */
export const BREAKPOINTS: Breakpoints = { tablet: 976, mobile: 767 };

/** The CSS class of a block instance. */
export const blockClass = (id: string): string => `pr-block-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;

/**
 * Attributes with the block's defaults (saved attributes are sparse), those
 * of the page's language included (`locale`, e.g. `it-IT`).
 */
export function withDefaults(
  block: Pick<PrismaBlock, 'defaults' | 'localized'>,
  attrs: Attrs,
  locale?: string,
): Attrs {
  const lang = (locale ?? 'en').slice(0, 2).toLowerCase();
  return { ...block.defaults, ...(block.localized?.(lang) ?? {}), ...attrs };
}

/**
 * A number with its unit (`12` + `px` → `12px`), or null when the value is
 * empty or not a number, so nothing else can reach the CSS.
 */
export function length(value: unknown, unit: unknown = 'px'): string | null {
  const n = num(value);
  if (n === null) return null;
  const u =
    typeof unit === 'string' && /^(px|%|em|rem|vw|vh|fr|deg|s|ms)?$/.test(unit) ? unit : 'px';
  return `${n}${u}`;
}

/** A color, or null. */
export const color = (value: unknown): string | null => safeColor(value);

/** A CSS keyword (letters, digits, dashes, spaces), or null. */
export const keyword = (value: unknown): string | null =>
  typeof value === 'string' && /^[a-z0-9 -]{1,60}$/i.test(value) && value !== '' ? value : null;

/** Adds declarations to a selector for a device; empty values are skipped. */
export function rule(
  sheet: Sheet,
  device: Device,
  selector: string,
  declarations: Record<string, string | null | undefined | false>,
): void {
  for (const [property, value] of Object.entries(declarations)) {
    if (value) add(sheet, device, selector, `${property}:${value}`);
  }
}

/** The attribute of a device: `fooDesktop`/`fooTablet`/`fooMobile` (or a custom naming). */
export function deviceKey(base: string, device: Device): string {
  return `${base}${device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile'}`;
}

/** The CSS of one block, with its media queries. */
export function blockCss(
  block: PrismaBlock,
  attrs: Attrs,
  id: string,
  globals: Globals = DEFAULT_GLOBALS,
): string {
  const sheet = emptySheet();
  block.css(withDefaults(block, attrs), `.${blockClass(id)}`, sheet, globals);
  return printSheet(sheet, BREAKPOINTS);
}

export { emptySheet, printSheet, type Device, type Sheet };
