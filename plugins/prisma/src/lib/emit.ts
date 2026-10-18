import { add, type Device, type Sheet } from '@cleitext/design';
import type { Attrs } from './types';

/**
 * How Prisma writes CSS, matching the blocks it replaces so that imported
 * pages look the same:
 * - a number with its unit, or nothing when the value is not a number;
 * - empty strings, null, false and the string "0" are left out; the number 0 is kept;
 * - braces, semicolons and angle brackets never reach the CSS.
 */

export const DEVICES: Device[] = ['desktop', 'tablet', 'mobile'];

/** `Tablet`/`Mobile` suffix of an attribute (none on desktop). */
export const suffix = (device: Device): string =>
  device === 'desktop' ? '' : device === 'tablet' ? 'Tablet' : 'Mobile';

/** A finite number, or null. */
export function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

/** A number with its unit (`12`, `px` → `12px`), or '' when it is not a number. */
export function px(value: unknown, unit: unknown = 'px'): string {
  const n = numeric(value);
  if (n === null) return '';
  const u =
    typeof unit === 'string' && /^(px|%|em|rem|vw|vh|fr|deg|s|ms|)$/.test(unit) ? unit : 'px';
  return `${n}${u}`;
}

/** A value fit for CSS: what could close a rule or an element is removed. */
export function clean(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  return String(value).replace(/[{};<>]/g, '');
}

/** Whether a value is written: not empty, not false, not the string "0" (the number 0 is). */
function kept(value: unknown): boolean {
  if (value === 0) return true;
  return value !== '' && value !== null && value !== undefined && value !== false && value !== '0';
}

export type Declarations = Record<string, unknown>;

/** Adds the declarations of a selector for a device, leaving out empty values. */
export function emit(
  sheet: Sheet,
  device: Device,
  selector: string,
  declarations: Declarations,
): void {
  for (const [property, raw] of Object.entries(declarations)) {
    if (!kept(raw)) continue;
    let value = clean(raw);
    if (property === 'font-family') {
      if (value === 'Default' || !value.trim()) continue;
      value = `"${value.replace(/"/g, '')}"`;
    }
    if (value.trim() === '' && raw !== 0) continue;
    add(sheet, device, selector, `${property}:${raw === 0 ? '0' : value}`);
  }
}

/** Value of an attribute for a device, else the larger device's (tablet ← desktop, mobile ← tablet). */
export function cascade(attrs: Attrs, base: string, device: Device, desktopKey = base): unknown {
  const desktop = attrs[desktopKey];
  const tablet = attrs[`${base}Tablet`];
  const mobile = attrs[`${base}Mobile`];
  const set = (v: unknown) => v !== '' && v !== undefined && v !== null;
  if (device === 'desktop') return desktop;
  if (device === 'tablet') return set(tablet) ? tablet : desktop;
  return set(mobile) ? mobile : set(tablet) ? tablet : desktop;
}

// ---- Borders ---------------------------------------------------------------------------

/**
 * Border of a part (`<p>BorderStyle`, `<p>BorderTopWidth[Tablet|Mobile]`,
 * `<p>BorderTopLeftRadius…`, `<p>BorderRadiusUnit…`, `<p>BorderColor`):
 * widths when the style shows one, the radius always, nothing at all with
 * the `default` style. Tablet and mobile values do not fall back (the
 * desktop ones cascade through the media queries).
 */
export function border(attrs: Attrs, p: string, device: Device): Declarations {
  const style = attrs[`${p}BorderStyle`];
  if (style === 'default') return {};
  const s = suffix(device);
  const out: Declarations = {};
  if (style && style !== 'none') {
    out['border-top-width'] = px(attrs[`${p}BorderTopWidth${s}`]);
    out['border-left-width'] = px(attrs[`${p}BorderLeftWidth${s}`]);
    out['border-right-width'] = px(attrs[`${p}BorderRightWidth${s}`]);
    out['border-bottom-width'] = px(attrs[`${p}BorderBottomWidth${s}`]);
  }
  const unit = attrs[`${p}BorderRadiusUnit${s}`] ?? 'px';
  out['border-top-left-radius'] = px(attrs[`${p}BorderTopLeftRadius${s}`], unit);
  out['border-top-right-radius'] = px(attrs[`${p}BorderTopRightRadius${s}`], unit);
  out['border-bottom-left-radius'] = px(attrs[`${p}BorderBottomLeftRadius${s}`], unit);
  out['border-bottom-right-radius'] = px(attrs[`${p}BorderBottomRightRadius${s}`], unit);
  out['border-style'] = style;
  out['border-color'] = attrs[`${p}BorderColor`];
  return out;
}

/** The border attributes of a part, with their defaults (empty). */
export function borderDefaults(p: string): Attrs {
  const out: Attrs = {};
  for (const s of ['', 'Tablet', 'Mobile']) {
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) out[`${p}Border${side}Width${s}`] = '';
    for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'])
      out[`${p}Border${corner}Radius${s}`] = '';
    out[`${p}BorderRadiusUnit${s}`] = 'px';
  }
  out[`${p}BorderStyle`] = '';
  out[`${p}BorderColor`] = '';
  out[`${p}BorderHColor`] = '';
  out[`${p}BorderLink`] = true;
  out[`${p}BorderRadiusLink`] = true;
  return out;
}

// ---- Shadows ---------------------------------------------------------------------------

/**
 * A box shadow `h v blur [spread] color [inset]`: nothing without a color,
 * nothing when the four sizes are all unset (a 0 counts as set).
 */
export function boxShadow(
  h: unknown,
  v: unknown,
  blur: unknown,
  spread: unknown,
  color: unknown,
  position: unknown,
  fallbackColor?: unknown,
): string {
  const tint = clean(color) || clean(fallbackColor);
  if (!tint) return '';
  const sizes = [h, v, blur, spread];
  if (sizes.every((s) => numeric(s) === null)) return '';
  const part = (s: unknown) => (numeric(s) === null ? '0' : `${numeric(s)}px`);
  const spreadPart = numeric(spread) ? ` ${part(spread)}` : '';
  return `${part(h)} ${part(v)} ${part(blur)}${spreadPart} ${tint}${position && position !== 'outset' ? ' inset' : ''}`;
}

// ---- Typography --------------------------------------------------------------------------

/**
 * Typography of a part (`<p>FontFamily`, `<p>FontSize[Tablet|Mobile]`,
 * `<p>FontSizeType[Tablet|Mobile]`, `<p>LineHeight…`, `<p>LetterSpacing…`,
 * weight, style, transform, decoration). Tablet and mobile change only
 * the sizes; their units fall back to the desktop unit.
 */
export function typography(attrs: Attrs, p: string, device: Device): Declarations {
  const s = suffix(device);
  const unit = (name: string) => attrs[`${p}${name}Type${s}`] || attrs[`${p}${name}Type`];
  const sizes: Declarations = {
    'font-size': px(attrs[`${p}FontSize${s}`], unit('FontSize')),
    'line-height': px(attrs[`${p}LineHeight${s}`], attrs[`${p}LineHeightType`]),
    'letter-spacing': px(attrs[`${p}LetterSpacing${s}`], attrs[`${p}LetterSpacingType`]),
  };
  if (device !== 'desktop') return sizes;
  return {
    'font-family': attrs[`${p}FontFamily`],
    'text-transform': attrs[`${p}Transform`],
    'text-decoration': attrs[`${p}Decoration`],
    'font-style': attrs[`${p}FontStyle`],
    'font-weight': attrs[`${p}FontWeight`],
    ...sizes,
  };
}

/** Spacing of four sides from `<p><Side><Name><Device>`-style attributes. */
export function sides(
  attrs: Attrs,
  key: (side: 'Top' | 'Right' | 'Bottom' | 'Left') => string,
  unit: unknown,
  property: 'padding' | 'margin',
): Declarations {
  return {
    [`${property}-top`]: px(attrs[key('Top')], unit),
    [`${property}-right`]: px(attrs[key('Right')], unit),
    [`${property}-bottom`]: px(attrs[key('Bottom')], unit),
    [`${property}-left`]: px(attrs[key('Left')], unit),
  };
}
