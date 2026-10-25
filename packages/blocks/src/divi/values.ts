/**
 * Values of Divi's module settings (sizes, the four sides of spacing,
 * colors and global colors, fonts, shadows, per-device values) as Fresco's.
 * Divi's attribute names and formats are a data format: they appear here
 * only to be read.
 */
import type { DiviAttrs } from './shortcode.js';

export type Settings = Record<string, unknown>;

export interface SizeValue {
  size: number;
  unit: string;
}

/** Divi's devices: their attribute suffix and Fresco's key suffix. */
export type DiviDevice = 'desktop' | 'tablet' | 'phone';
export const DIVI_DEVICES: DiviDevice[] = ['desktop', 'tablet', 'phone'];
export const FRESCO_SUFFIX: Record<DiviDevice, string> = {
  desktop: '',
  tablet: '@tablet',
  phone: '@mobile',
};
/** Divi's breakpoints (tablets up to 980px, phones up to 767px). */
export const BREAKPOINTS = { tablet: 980, mobile: 767 } as const;
export const MEDIA: Record<DiviDevice, string> = {
  desktop: '',
  tablet: `@media (max-width:${BREAKPOINTS.tablet}px)`,
  phone: `@media (max-width:${BREAKPOINTS.mobile}px)`,
};

export const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

export const on = (value: unknown): boolean => value === 'on';

/**
 * A setting's value on each device. As in Divi, the tablet and phone
 * values count only when the setting's responsive switch is on
 * (`<name>_last_edited` starting with `on`); a device without its own value
 * takes the larger device's.
 */
export function responsive(attrs: DiviAttrs, name: string): Record<DiviDevice, string | undefined> {
  const desktop = attrs[name];
  const enabled = str(attrs[`${name}_last_edited`]).startsWith('on');
  const tablet = enabled && attrs[`${name}_tablet`] ? attrs[`${name}_tablet`] : undefined;
  const phone = enabled && attrs[`${name}_phone`] ? attrs[`${name}_phone`] : undefined;
  return { desktop: desktop || undefined, tablet, phone };
}

/** The value of a setting on a device, falling back to the larger devices. */
export function onDevice(attrs: DiviAttrs, name: string, device: DiviDevice): string | undefined {
  const values = responsive(attrs, name);
  if (device === 'phone') return values.phone ?? values.tablet ?? values.desktop;
  if (device === 'tablet') return values.tablet ?? values.desktop;
  return values.desktop;
}

const UNITS = new Set(['px', '%', 'em', 'rem', 'vw', 'vh']);

/**
 * A Divi length (`48px`, `10vw`, `1.8em`, `-40px`, `0`, `12pt`) → a Fresco
 * size. Points become pixels; `calc()`, `clamp()` and keywords are left to
 * `cssLength` (undefined here).
 */
export function length(value: unknown, defaultUnit = 'px'): SizeValue | undefined {
  const m = /^\s*(-?\d*\.?\d+)\s*([a-z%]*)\s*$/i.exec(str(value));
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (!unit) return { size: n, unit: defaultUnit };
  if (unit === 'pt') return { size: Math.round(n * (4 / 3) * 100) / 100, unit: 'px' };
  if (!UNITS.has(unit)) return undefined;
  return { size: n, unit };
}

/** A length as CSS text (keywords and CSS functions kept when safe), or undefined. */
export function cssLength(value: unknown): string | undefined {
  const text = str(value).trim();
  const size = length(text);
  if (size) return size.size === 0 ? '0' : `${size.size}${size.unit}`;
  if (/^(auto|none|inherit|initial)$/i.test(text)) return text.toLowerCase();
  if (/^(calc|clamp|min|max)\([-+*/\d\s.,a-z%()]+\)$/i.test(text) && !/[;{}<>"'\\]/.test(text))
    return text;
  return undefined;
}

/** A line height: unitless numbers stay unitless (Divi's `1.8em` keeps its unit). */
export function lineHeight(value: unknown): SizeValue | undefined {
  return length(value, '');
}

/** The four sides of `custom_margin`/`custom_padding` (`top|right|bottom|left|…`), as CSS. */
export function sides(value: unknown): [string?, string?, string?, string?] {
  const parts = str(value).split('|');
  return [0, 1, 2, 3].map((i) => cssLength(parts[i])) as [string?, string?, string?, string?];
}

// ---- Colors ------------------------------------------------------------------------------------

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|transparent)$/i;

/**
 * A Divi global color id (`gcid-f21ab52a-d63f-…`) as a Fresco kit id: its
 * prefix and first group, short enough for the kit (`gcid-f21ab52a`).
 */
export const globalColorId = (gcid: string): string =>
  gcid
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .split('-')
    .slice(0, 2)
    .join('-')
    .slice(0, 40);

/**
 * A Divi color → Fresco's: a hex, rgb() or hsl() value (Divi may write
 * them in capitals), a global color (its kit variable), or undefined.
 */
export function color(value: unknown): string | undefined {
  const text = str(value).trim();
  if (!text) return undefined;
  if (/^gcid-[a-z0-9-]+$/i.test(text)) return `var(--fr-c-${globalColorId(text)})`;
  // Divi 4's global body and heading colors.
  const global = /^var\(--(gcid-[a-z0-9-]+)\)$/i.exec(text);
  if (global) return `var(--fr-c-${globalColorId(global[1]!)})`;
  const lower = /^(rgba?|hsla?)\(/i.test(text) ? text.toLowerCase().replace(/\s+/g, '') : text;
  return COLOR.test(lower) ? lower : undefined;
}

// ---- Fonts -------------------------------------------------------------------------------------

export interface DiviFont {
  family?: string;
  /** A global font of the kit (`primary` for Divi's heading font, `text` for its body font). */
  global?: 'primary' | 'text';
  weight?: string;
  italic?: boolean;
  uppercase?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  lineThrough?: boolean;
}

/**
 * Divi's font setting `Family|weight|italic|uppercase|underline|smallcaps|
 * linethrough|linecolor|linestyle`: the family (`Default` or empty: none of
 * its own), the weight (old layouts wrote `on` for bold) and the styles.
 */
export function font(value: unknown): DiviFont {
  const parts = str(value).split('|');
  const out: DiviFont = {};
  const family = (parts[0] ?? '').trim();
  if (family === '--et_global_heading_font') out.global = 'primary';
  else if (family === '--et_global_body_font') out.global = 'text';
  else if (family && !/^(default|none)$/i.test(family) && /^[\w\s'-]{1,80}$/.test(family))
    out.family = family;
  const weight = (parts[1] ?? '').trim();
  if (weight === 'on') out.weight = '700';
  else if (/^[1-9]00$/.test(weight)) out.weight = weight;
  if (parts[2] === 'on') out.italic = true;
  if (parts[3] === 'on') out.uppercase = true;
  if (parts[4] === 'on') out.underline = true;
  if (parts[5] === 'on') out.smallCaps = true;
  if (parts[6] === 'on') out.lineThrough = true;
  return out;
}

/** A Divi font as CSS declarations (for rules Fresco has no setting for). */
export function fontCss(f: DiviFont): string[] {
  const out: string[] = [];
  if (f.global) out.push(`font-family:var(--fr-t-${f.global}-family)`);
  else if (f.family) out.push(`font-family:"${f.family}"`);
  if (f.weight) out.push(`font-weight:${f.weight}`);
  if (f.italic) out.push('font-style:italic');
  if (f.uppercase) out.push('text-transform:uppercase');
  if (f.smallCaps) out.push('font-variant:small-caps');
  const lines = [f.underline && 'underline', f.lineThrough && 'line-through'].filter(Boolean);
  if (lines.length) out.push(`text-decoration:${lines.join(' ')}`);
  return out;
}

// ---- Shadows -----------------------------------------------------------------------------------

/** Divi's box shadow presets: horizontal, vertical, blur, spread, inset. */
const BOX_PRESETS: Record<string, [number, number, number, number, boolean]> = {
  preset1: [0, 2, 18, 0, false],
  preset2: [6, 6, 18, 0, false],
  preset3: [0, 12, 18, -6, false],
  preset4: [10, 10, 0, 0, false],
  preset5: [0, 6, 0, 10, false],
  preset6: [0, 0, 18, 0, true],
  preset7: [10, 10, 0, 0, true],
};

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset?: boolean;
}

/**
 * A box shadow (`<prefix>box_shadow_style` with its preset, and the
 * horizontal, vertical, blur, spread, color and position that change it)
 * on a device, or on hover (`__hover` values): Fresco's shadow, or undefined.
 */
export function boxShadow(
  attrs: DiviAttrs,
  prefix = '',
  device: DiviDevice = 'desktop',
  hover = false,
): Shadow | undefined {
  const style = str(attrs[`${prefix}box_shadow_style`]);
  const preset = BOX_PRESETS[style];
  if (!preset) return undefined;
  const value = (part: string) => {
    const name = `${prefix}box_shadow_${part}`;
    if (hover && on(str(attrs[`${name}__hover_enabled`]).split('|')[0]) && attrs[`${name}__hover`])
      return attrs[`${name}__hover`];
    return onDevice(attrs, name, device);
  };
  const px = (part: string, fallback: number) => {
    const size = length(value(part));
    return size ? (size.unit === 'em' ? size.size * 16 : size.size) : fallback;
  };
  const position = value('position');
  return {
    x: px('horizontal', preset[0]),
    y: px('vertical', preset[1]),
    blur: px('blur', preset[2]),
    spread: px('spread', preset[3]),
    color: color(value('color')) ?? 'rgba(0,0,0,0.3)',
    ...((position ? position === 'inner' : preset[4]) ? { inset: true } : {}),
  };
}

/** Whether a module changes its shadow on hover. */
export function shadowHovers(attrs: DiviAttrs, prefix = ''): boolean {
  return ['horizontal', 'vertical', 'blur', 'spread', 'color', 'position'].some(
    (part) =>
      on(str(attrs[`${prefix}box_shadow_${part}__hover_enabled`]).split('|')[0]) &&
      Boolean(attrs[`${prefix}box_shadow_${part}__hover`]),
  );
}

/** Divi's text shadow presets (em, of the text's size): horizontal, vertical, blur. */
const TEXT_PRESETS: Record<string, [number, number, number]> = {
  preset1: [0, 0.1, 0.1],
  preset2: [0.08, 0.08, 0.08],
  preset3: [0, 0, 0.3],
  preset4: [0, 0.08, 0],
  preset5: [0.08, 0.08, 0],
};

/** A text shadow (`<prefix>_text_shadow_style` and its parts) as CSS, or undefined. */
export function textShadowCss(attrs: DiviAttrs, prefix: string): string | undefined {
  const preset = TEXT_PRESETS[str(attrs[`${prefix}_text_shadow_style`])];
  if (!preset) return undefined;
  const part = (name: string, fallback: number) =>
    cssLength(attrs[`${prefix}_text_shadow_${name}`]) ?? `${fallback}em`;
  const shadowColor = color(attrs[`${prefix}_text_shadow_color`]) ?? 'rgba(0,0,0,0.4)';
  return `${part('horizontal_length', preset[0])} ${part('vertical_length', preset[1])} ${part('blur_strength', preset[2])} ${shadowColor}`;
}

// ---- Links -------------------------------------------------------------------------------------

/**
 * A link to the old site (`origin`, e.g. `https://example.com`) as a path
 * of this one; other addresses stay as they are.
 */
export function relativeUrl(url: string, origin?: string): string {
  const base = (origin ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/^https?:/i, '');
  if (!base.startsWith('//')) return url;
  const bare = url.replace(/^https?:/i, '');
  if (!bare.toLowerCase().startsWith(base.toLowerCase())) return url;
  const rest = bare.slice(base.length);
  if (rest && !/^[/?#]/.test(rest)) return url;
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** A Divi link (an address and its "new window" switch) → Fresco link. */
export function link(url: unknown, newWindow: unknown, origin?: string): Settings | undefined {
  const href = relativeUrl(
    str(url)
      .trim()
      .replace(/&amp;|&#0?38;/g, '&'),
    origin,
  );
  if (!href) return undefined;
  return { url: href, ...(on(newWindow) ? { newTab: true } : {}) };
}
