/**
 * The CSS engine: settings become CSS rules, scoped by an element's selector,
 * with media queries for the smaller (and wider) devices and `:hover` variants. The same
 * code runs on the server (one `<style>` per page) and in editors (live).
 */
import {
  DEVICES,
  MAX_WIDTH_DEVICES,
  SHEET_ORDER,
  deviceMedia,
  isGroup,
  settingKey,
  type BoxValue,
  type Breakpoints,
  type Control,
  type Device,
  type GroupControl,
  type Settings,
  type SizeValue,
} from './model.js';

/** One CSS rule body per selector, per device. */
export type Sheet = Record<Device, Map<string, string[]>>;

export const emptySheet = (): Sheet => ({
  widescreen: new Map(),
  desktop: new Map(),
  laptop: new Map(),
  tablet_extra: new Map(),
  tablet: new Map(),
  mobile_extra: new Map(),
  mobile: new Map(),
});

export function add(sheet: Sheet, device: Device, selector: string, raw: string): void {
  // Compact output: `color:red`, not `color: red`.
  const declaration = raw.trim().replace(/^([\w-]+)\s*:\s*/, '$1:');
  const rules = sheet[device].get(selector);
  if (rules) {
    if (!rules.includes(declaration)) rules.push(declaration);
  } else sheet[device].set(selector, [declaration]);
}

// ---- Values ---------------------------------------------------------------------------

export const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === '';

export function isSize(value: unknown): value is SizeValue {
  return typeof value === 'object' && value !== null && 'size' in value && 'unit' in value;
}

export function isBox(value: unknown): value is BoxValue {
  return typeof value === 'object' && value !== null && 'top' in value && 'unit' in value;
}

/** A unit that cannot break out of a declaration. */
export const unit = (value: unknown): string =>
  typeof value === 'string' && /^(px|%|em|rem|vw|vh|deg|s|ms|fr|)$/.test(value) ? value : 'px';

/** Numbers only: anything else would let a setting write arbitrary CSS. */
export const num = (value: unknown): string | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())
      ? value.trim()
      : null;

/**
 * A color: hex, rgb()/hsl(), a named color, or a CSS variable (a global
 * color: `var(--fr-c-<id>)`, a theme's `var(--wp--preset--color--x)`).
 * Anything else is dropped.
 */
export function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%/-]+\)$/i.test(v)) return v;
  if (/^var\(--[a-z0-9-]+\)$/i.test(v)) return v;
  if (/^[a-z]{3,20}$/i.test(v)) return v;
  return null;
}

/** A plain CSS keyword or a list of them (e.g. `center`, `space-between`, `no-repeat`). */
export const keyword = (value: unknown): string | null =>
  typeof value === 'string' && /^[a-z0-9 -]{1,60}$/i.test(value) ? value : null;

/** A font family: letters, digits, spaces, dashes and commas, or a global font. */
export function safeFont(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (/^var\(--[a-z0-9-]+\)$/i.test(v)) return v;
  if (!/^[\w\s,'"-]{1,120}$/.test(v)) return null;
  // Quote family names with spaces; keep generic families bare.
  return v
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .map((part) =>
      /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(part) ? part : `"${part}"`,
    )
    .join(', ');
}

/** The CSS text of a value for `{{value}}`, or null when it cannot be used. */
export function cssValue(
  control: Pick<Control, 'type'> & Partial<Pick<Control, 'dictionary' | 'pattern'>>,
  value: unknown,
): string | null {
  if (isEmpty(value)) return null;
  const { dictionary, pattern } = control;
  if (dictionary && Object.hasOwn(dictionary, String(value))) {
    return dictionary[String(value)] || null;
  }
  if (pattern && typeof value === 'string' && !/[;{}<>"'\\]/.test(value)) {
    const text = value.trim().replace(/\s+/g, ' ');
    if (text.length <= 200 && new RegExp(`^(?:${pattern})$`, 'i').test(text)) return text;
  }
  switch (control.type) {
    case 'color':
      return safeColor(value);
    case 'slider':
      if (!isSize(value)) return num(value) === null ? null : `${num(value)}px`;
      return num(value.size) === null ? null : `${num(value.size)}${unit(value.unit)}`;
    case 'box':
      if (!isBox(value)) return null;
      return boxCss(value);
    case 'number':
      return num(value);
    case 'font':
      return safeFont(value);
    case 'media': {
      const url = (value as { url?: unknown }).url;
      return typeof url === 'string' && /^(https?:\/\/|\/)[^\s"'()\\]*$/.test(url)
        ? `url("${url}")`
        : null;
    }
    default:
      return typeof value === 'string' || typeof value === 'number' ? keyword(String(value)) : null;
  }
}

export function boxCss(box: BoxValue): string | null {
  const sides = [box.top, box.right, box.bottom, box.left].map((side) =>
    side === '' || side === undefined ? null : num(side),
  );
  if (sides.every((side) => side === null)) return null;
  const u = unit(box.unit);
  return sides.map((side) => (side === null ? '0' : side === '0' ? '0' : `${side}${u}`)).join(' ');
}

/** Replaces the placeholders of a selector's declaration with a value. */
export function fill(template: string, control: Control, value: unknown): string | null {
  const text = cssValue(control, value);
  if (text === null) return null;
  let out = template.replaceAll('{{value}}', text);
  if (isSize(value)) {
    out = out
      .replaceAll('{{size}}', num(value.size) ?? '0')
      .replaceAll('{{unit}}', unit(value.unit));
  }
  if (isBox(value)) {
    const u = unit(value.unit);
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const n = num(value[side]);
      out = out.replaceAll(`{{${side}}}`, n === null ? '0' : `${n}${u}`);
    }
  }
  return out;
}

// ---- Groups ---------------------------------------------------------------------------

const TYPOGRAPHY_PARTS: [string, string, Control['type'], boolean][] = [
  ['family', 'font-family', 'font', false],
  ['size', 'font-size', 'slider', true],
  ['weight', 'font-weight', 'select', false],
  ['transform', 'text-transform', 'select', false],
  ['style', 'font-style', 'select', false],
  ['decoration', 'text-decoration', 'select', false],
  ['line', 'line-height', 'slider', true],
  ['letter', 'letter-spacing', 'slider', true],
  ['word', 'word-spacing', 'slider', true],
];

/** The setting keys a group writes (for the panel and for clean-up). */
export function groupKeys(control: GroupControl): string[] {
  const n = control.name;
  switch (control.type) {
    case 'typography':
      return [
        `${n}_global`,
        `${n}_global_all`,
        ...TYPOGRAPHY_PARTS.map(([part]) => `${n}_${part}`),
      ];
    case 'background':
      return [
        `${n}_type`,
        `${n}_color`,
        `${n}_image`,
        `${n}_position`,
        `${n}_repeat`,
        `${n}_size`,
        `${n}_attachment`,
        `${n}_color_b`,
        `${n}_stop`,
        `${n}_stop_b`,
        `${n}_gradient`,
        `${n}_angle`,
        `${n}_xpos`,
        `${n}_ypos`,
        `${n}_bg_width`,
        `${n}_gradient_position`,
      ];
    case 'border':
      return [`${n}_style`, `${n}_width`, `${n}_color`, `${n}_radius`];
    case 'shadow':
    case 'textShadow':
      return [n];
    case 'filters':
      return [`${n}_blur`, `${n}_brightness`, `${n}_contrast`, `${n}_saturate`, `${n}_hue`];
  }
}

/** Value of a setting on a device: the device's own, else nothing (CSS cascades the rest). */
const own = (settings: Settings, key: string, device: Device, hover = false) =>
  settings[settingKey(key, device, hover)];

/** A part of a group on a device (its own value). */
const at2 = (settings: Settings, name: string, part: string, device: Device) =>
  own(settings, `${name}_${part}`, device);

/**
 * The devices a device's values fall back to, nearest first, desktop last
 * (every device, as a group's CSS does not know which ones are in use).
 */
function largerDevices(device: Device): Device[] {
  if (device === 'desktop') return [];
  if (device === 'widescreen') return ['desktop'];
  const index = MAX_WIDTH_DEVICES.indexOf(device);
  return [...MAX_WIDTH_DEVICES.slice(0, index).reverse(), 'desktop'];
}

export function groupCss(
  sheet: Sheet,
  control: GroupControl,
  settings: Settings,
  selector: string,
  prefix = 'fr',
) {
  const n = control.name;
  for (const device of DEVICES) {
    const at = (key: string) => own(settings, key, device);
    const decl = (d: string | null) => {
      if (d) add(sheet, device, selector, d);
    };
    switch (control.type) {
      case 'typography': {
        const global = device === 'desktop' ? keyword(settings[`${n}_global`]) : null;
        if (global) {
          for (const [part, prop] of TYPOGRAPHY_PARTS.slice(0, 4)) {
            decl(`${prop}: var(--${prefix}-t-${global}-${part})`);
          }
          decl(`line-height: var(--${prefix}-t-${global}-line)`);
          // Chosen since Fresco 2.3: the global font's style, decoration and spacing too.
          if (settings[`${n}_global_all`] === true) {
            for (const [part, prop] of TYPOGRAPHY_PARTS.slice(4)) {
              if (part !== 'line') decl(`${prop}: var(--${prefix}-t-${global}-${part})`);
            }
          }
        }
        for (const [part, prop, type, responsive] of TYPOGRAPHY_PARTS) {
          if (!responsive && device !== 'desktop') continue;
          // Sliders without unit (line height) stay unitless.
          const value = cssValue({ type }, at(`${n}_${part}`));
          if (value !== null) decl(`${prop}: ${value}`);
        }
        break;
      }
      case 'background': {
        const type = settings[`${n}_type`];
        if (type === 'gradient') {
          // Locations, angle and radial position may change per device (the colors do not).
          const parts = ['stop', 'stop_b', 'angle', 'gradient_position'];
          if (device !== 'desktop' && parts.every((part) => isEmpty(at(`${n}_${part}`)))) break;
          const inherited = (part: string) => {
            for (const d of [device, ...largerDevices(device)]) {
              const value = d === 'desktop' ? settings[`${n}_${part}`] : at2(settings, n, part, d);
              if (!isEmpty(value)) return value;
            }
            return undefined;
          };
          const a = safeColor(settings[`${n}_color`]) ?? 'transparent';
          const b = safeColor(settings[`${n}_color_b`]) ?? 'transparent';
          const stopA = num((inherited('stop') as SizeValue | undefined)?.size ?? 0) ?? '0';
          const stopB = num((inherited('stop_b') as SizeValue | undefined)?.size ?? 100) ?? '100';
          const radial = settings[`${n}_gradient`] === 'radial';
          const angle = num((inherited('angle') as SizeValue | undefined)?.size ?? 180) ?? '180';
          const at3 = keyword(inherited('gradient_position')) ?? 'center center';
          decl(
            `background-image: ${radial ? `radial-gradient(at ${at3}` : `linear-gradient(${angle}deg`}, ${a} ${stopA}%, ${b} ${stopB}%)`,
          );
        } else if (type === 'classic') {
          const color = safeColor(at(`${n}_color`));
          if (color) decl(`background-color: ${color}`);
          const image = cssValue({ type: 'media' }, at(`${n}_image`));
          if (image) decl(`background-image: ${image}`);
          // "Custom": X and Y positions, and a width, of their own (per device).
          const custom = (part: string) =>
            at(`${n}_${part}`) === 'custom' ||
            (isEmpty(at(`${n}_${part}`)) && settings[`${n}_${part}`] === 'custom');
          const position = keyword(at(`${n}_position`));
          if (position && position !== 'custom') decl(`background-position: ${position}`);
          if (custom('position')) {
            for (const axis of ['x', 'y'] as const) {
              const value = cssValue({ type: 'slider' }, at(`${n}_${axis}pos`));
              if (value !== null) decl(`background-position-${axis}: ${value}`);
            }
          }
          const repeat = keyword(at(`${n}_repeat`));
          if (repeat) decl(`background-repeat: ${repeat}`);
          const size = keyword(at(`${n}_size`));
          if (size && size !== 'custom') decl(`background-size: ${size}`);
          if (custom('size')) {
            const width = cssValue({ type: 'slider' }, at(`${n}_bg_width`));
            if (width !== null) decl(`background-size: ${width} auto`);
          }
          const attachment = device === 'desktop' ? keyword(at(`${n}_attachment`)) : null;
          if (attachment) decl(`background-attachment: ${attachment}`);
        }
        break;
      }
      case 'border': {
        const style = keyword(at(`${n}_style`));
        if (style && style !== 'default') {
          decl(`border-style: ${style}`);
        }
        const width = isBox(at(`${n}_width`)) ? boxCss(at(`${n}_width`) as BoxValue) : null;
        if (width && style !== 'none') decl(`border-width: ${width}`);
        const color = safeColor(at(`${n}_color`));
        if (color) decl(`border-color: ${color}`);
        const radius = isBox(at(`${n}_radius`)) ? boxCss(at(`${n}_radius`) as BoxValue) : null;
        if (radius) decl(`border-radius: ${radius}`);
        break;
      }
      case 'shadow': {
        const s = at(n) as
          | {
              x?: number;
              y?: number;
              blur?: number;
              spread?: number;
              color?: string;
              inset?: boolean;
            }
          | undefined;
        if (s && typeof s === 'object') {
          const parts = [s.x, s.y, s.blur, s.spread].map((v) => `${num(v ?? 0) ?? 0}px`);
          const color = safeColor(s.color) ?? 'rgba(0,0,0,0.5)';
          decl(`box-shadow: ${s.inset ? 'inset ' : ''}${parts.join(' ')} ${color}`);
        }
        break;
      }
      case 'textShadow': {
        const s = at(n) as { x?: number; y?: number; blur?: number; color?: string } | undefined;
        if (s && typeof s === 'object') {
          const parts = [s.x, s.y, s.blur].map((v) => `${num(v ?? 0) ?? 0}px`);
          decl(`text-shadow: ${parts.join(' ')} ${safeColor(s.color) ?? 'rgba(0,0,0,0.3)'}`);
        }
        break;
      }
      case 'filters': {
        if (device !== 'desktop') break;
        const parts: string[] = [];
        const f = (key: string, fn: string, u: string, neutral: number) => {
          const value = settings[`${n}_${key}`] as SizeValue | undefined;
          const v = value ? num(value.size) : null;
          if (v !== null && Number(v) !== neutral) parts.push(`${fn}(${v}${u})`);
        };
        f('blur', 'blur', 'px', 0);
        f('brightness', 'brightness', '%', 100);
        f('contrast', 'contrast', '%', 100);
        f('saturate', 'saturate', '%', 100);
        f('hue', 'hue-rotate', 'deg', 0);
        if (parts.length) decl(`filter: ${parts.join(' ')}`);
        break;
      }
    }
  }
}

// ---- Settings → CSS ------------------------------------------------------------------

/** Settings of a control shown only when its condition matches. */
export function conditionMet(control: Control, settings: Settings): boolean {
  if (!control.condition) return true;
  return Object.entries(control.condition).every(([key, expected]) => {
    // `key!`: the setting is NOT one of these values (as in Elementor).
    const negated = key.endsWith('!');
    const actual = settings[negated ? key.slice(0, -1) : key];
    const met = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    return negated ? !met : met;
  });
}

/** Settings with the defaults of their controls. */
export function withControlDefaults(controls: readonly Control[], attrs: Settings): Settings {
  const settings: Settings = {};
  for (const control of controls) {
    if (control.default !== undefined) settings[control.name] = control.default;
  }
  return { ...settings, ...attrs };
}

export interface SettingsCssOptions {
  /** Prefix of global variables: `var(--<prefix>-t-<id>-size)`. Default `fr`. */
  prefix?: string;
}

/**
 * The CSS rules of an element's settings: each control's `selectors` (with
 * `{{el}}` the element's `scope`) for every device and hover state, and the
 * groups (typography, background…). `settings` hold the defaults, `attrs`
 * only what was set (tablet, mobile and hover values have no defaults).
 */
export function settingsSheet(
  controls: readonly Control[],
  settings: Settings,
  attrs: Settings,
  scope: string,
  options: SettingsCssOptions = {},
): Sheet {
  const sheet = emptySheet();
  const at = (selector: string) => selector.replaceAll('{{el}}', scope);
  for (const control of controls) {
    if (control.noCss || !conditionMet(control, settings)) continue;
    if (isGroup(control)) {
      groupCss(sheet, control, settings, at(control.selector), options.prefix);
      continue;
    }
    if (!control.selectors) continue;
    for (const device of control.responsive ? DEVICES : (['desktop'] as const)) {
      for (const hover of control.hover ? [false, true] : [false]) {
        const key = settingKey(control.name, device, hover);
        const value = device === 'desktop' && !hover ? settings[key] : attrs[key];
        if (isEmpty(value)) continue;
        for (const [selector, template] of Object.entries(control.selectors)) {
          const declarations = fill(template, control, value);
          if (declarations === null) continue;
          const target = hover ? hoverSelector(at(selector)) : at(selector);
          for (const declaration of declarations.split(';')) {
            if (declaration.trim()) add(sheet, device, target, declaration.trim());
          }
        }
      }
    }
  }
  return sheet;
}

/** `.a .b, .c` → `.a .b:hover, .c:hover` (the first part only is the element). */
export function hoverSelector(selector: string): string {
  return selector
    .split(',')
    .map((part) => {
      const p = part.trim();
      return p.includes(':hover') ? p : `${p}:hover`;
    })
    .join(', ');
}

export function printSheet(sheet: Sheet, breakpoints: Breakpoints): string {
  const block = (rules: Map<string, string[]>) =>
    [...rules].map(([selector, body]) => `${selector}{${body.join(';')}}`).join('');
  let css = block(sheet.desktop);
  for (const device of SHEET_ORDER) {
    // Devices that are off (no breakpoint) are left out.
    const media = deviceMedia(device, breakpoints);
    if (media && sheet[device].size) css += `@media ${media}{${block(sheet[device])}}`;
  }
  // Nothing in a setting may close the <style> element.
  return css.replace(/<\/?style/gi, '');
}
