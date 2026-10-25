/**
 * Pages built with Divi (shortcodes in the content) become Fresco pages:
 * sections, rows and columns become Fresco containers laid out as Divi
 * lays them out (its widths, gutters and spacing, per device), modules their
 * Fresco counterparts with their settings (texts, fonts, colors, global
 * colors, spacing, backgrounds, borders and shadows). Where Divi's defaults
 * differ from Fresco's, the value is written explicitly so the page looks
 * the same. Modules with no counterpart keep their text and are reported.
 */
import { newBlockId } from '../block-id.js';
import type { CxdBlock } from '../cxd.js';
import { diviIcon } from './icons.js';
import { diviCode, parseDivi, type DiviAttrs, type DiviNode } from './shortcode.js';
import {
  DIVI_DEVICES,
  FRESCO_SUFFIX,
  MEDIA,
  boxShadow,
  color,
  cssLength,
  font,
  fontCss,
  length,
  lineHeight,
  link,
  on,
  responsive,
  shadowHovers,
  sides,
  str,
  textShadowCss,
  type DiviDevice,
  type DiviFont,
  type Settings,
  type SizeValue,
} from './values.js';

/** Presets of modules (Divi's global presets), by module: the default one and each by id. */
export type DiviPresets = Record<
  string,
  { default?: string; presets?: Record<string, { settings?: DiviAttrs } | undefined> }
>;

/** What the theme options say about the layout (Divi → Theme Options and Customizer). */
export interface DiviLayout {
  /** The width of rows (`content_width`, 1080px by default). */
  contentWidth?: number;
  /** The gutter of rows (`gutter_width`, 1 to 4; 3 by default). */
  gutter?: number;
  /** Vertical padding of sections, in % (`section_padding`, 4 by default). */
  sectionPadding?: number;
  /** Vertical padding of rows, in % (`row_padding`, 2 by default). */
  rowPadding?: number;
  /** The accent color (buttons and dividers without their own color). */
  accent?: string;
  /** Buttons without their own style (`all_buttons_*`). */
  button?: {
    size?: SizeValue;
    color?: string;
    background?: string;
    borderWidth?: SizeValue;
    borderColor?: string;
    radius?: SizeValue;
    spacing?: SizeValue;
    font?: DiviFont;
  };
}

export interface DiviContext {
  warn(message: string): void;
  /** The media ref of an image by its old address, when it is imported. */
  mediaByUrl?(url: string): string | undefined;
  /** A WordPress attachment (gallery ids): its media ref and address. */
  attachment?(id: number): { ref?: string; url: string } | undefined;
  /** Address of the old site: links to it become paths of this one. */
  origin?: string;
  /** Font families used by the page (to load them). */
  font?(family: string): void;
  /** A WordPress menu (its id; empty for the site's main menu) → the menu location given to it. */
  menuLocation?(menu: string): string | undefined;
  /** The title of the page (for the post title module and dynamic titles). */
  title?: string;
  /** The address of a WordPress post (dynamic links to it), as a path of this site. */
  postLink?(post: number): string | undefined;
  /** The page's gutter (`_et_pb_gutter_width`). */
  gutter?: number;
  layout?: DiviLayout;
  presets?: DiviPresets;
  /** Modules without a counterpart (their text is kept), by type, once per conversion. */
  unconverted?(type: string, count: number): void;
}

/** Divi's column widths by gutter: the margin between columns, in % of the row. */
const GUTTER_MARGIN: Record<number, number> = { 1: 0, 2: 3, 3: 5.5, 4: 8 };
/** The space under each module, in % of the row's width, by gutter. */
const MODULE_MARGIN: Record<number, number> = { 1: 0, 2: 1.5, 3: 2.75, 4: 4 };

const round = (n: number) => Math.round(n * 1000) / 1000;

/** A column type (`1_3`, `2_5`, `4_4`) as a fraction of the row. */
function fraction(type: unknown): number {
  const m = /^(\d+)_(\d+)$/.exec(str(type));
  if (!m) return 1;
  const value = Number(m[1]) / Number(m[2]);
  return value > 0 && value <= 1 ? value : 1;
}

/** Adds a rule to an element's imported CSS (`selector` is the element). */
export function addCss(out: Settings, css: string): void {
  if (!css) return;
  const current = str(out._custom_css);
  out._custom_css = current ? `${current}\n${css}` : css;
  out._custom_css_imported = true;
}

/** CSS rules for each device (desktop first), each wrapped in its media query. */
function deviceCss(rules: Partial<Record<DiviDevice, string>>): string {
  return DIVI_DEVICES.map((device) => {
    const rule = rules[device];
    if (!rule) return '';
    return device === 'desktop' ? rule : `${MEDIA[device]}{${rule}}`;
  }).join('');
}

/** Whether some attributes hold a responsive value of a setting. */
const isResponsive = (attrs: DiviAttrs, name: string) => {
  const values = responsive(attrs, name);
  return values.tablet !== undefined || values.phone !== undefined;
};

/**
 * Sets a Fresco setting from a Divi setting on each device that has its
 * own value (`transform` returns the Fresco value, or undefined).
 */
function perDevice(
  out: Settings,
  attrs: DiviAttrs,
  from: string,
  to: string,
  transform: (value: string) => unknown,
): void {
  const values = responsive(attrs, from);
  for (const device of DIVI_DEVICES) {
    const raw = values[device];
    if (raw === undefined) continue;
    const value = transform(raw);
    if (value !== undefined && value !== null && value !== '')
      out[`${to}${FRESCO_SUFFIX[device]}`] = value;
  }
}

type Sides = [string, string, string, string];

/** A box of four CSS lengths → Fresco box, when its sides share one unit. */
function nativeBox(box: Sides): Settings | null {
  let unit = '';
  const values: number[] = [];
  for (const side of box) {
    if (side === '0') {
      values.push(0);
      continue;
    }
    const size = length(side);
    if (!size) return null;
    if (unit && size.unit !== unit) return null;
    unit = size.unit;
    values.push(size.size);
  }
  return {
    top: values[0],
    right: values[1],
    bottom: values[2],
    left: values[3],
    unit: unit || 'px',
    linked: values.every((v) => v === values[0]),
  };
}

/**
 * Margin or padding on every device: Divi's defaults for the element, with
 * its own sides over them (a side left empty keeps the larger device's
 * value). As Fresco boxes (one unit) when it can, else as imported CSS.
 */
function spacing(
  out: Settings,
  attrs: DiviAttrs,
  from: string,
  to: string,
  property: 'margin' | 'padding',
  defaults: Record<DiviDevice, Sides>,
  always = false,
): void {
  const values = responsive(attrs, from);
  const resolved: Partial<Record<DiviDevice, Sides>> = {};
  let previous: Sides | null = null;
  let own: [string?, string?, string?, string?] = [];
  for (const device of DIVI_DEVICES) {
    const raw = values[device];
    const mine = raw !== undefined ? sides(raw) : [];
    own = [0, 1, 2, 3].map((i) => mine[i] ?? own[i]) as typeof own;
    const box = [0, 1, 2, 3].map((i) => own[i] ?? defaults[device][i]) as Sides;
    if (!previous || box.some((side, i) => side !== previous![i])) resolved[device] = box;
    previous = box;
  }
  // Negative side margins widen the element past its column (Divi lets it), so no 100% cap.
  if (
    property === 'margin' &&
    DIVI_DEVICES.some((device) =>
      resolved[device]?.some((side, i) => i % 2 === 1 && side.startsWith('-')),
    )
  )
    addCss(out, '.fr-container__in > selector.fr-e{max-width:none}');
  const boxes = DIVI_DEVICES.filter((device) => resolved[device]);
  const empty = (box: Sides) => box.every((side) => side === '0');
  if (!always && boxes.length === 1 && empty(resolved.desktop!)) return;
  const natives = boxes.map((device) => nativeBox(resolved[device]!));
  if (natives.every(Boolean)) {
    boxes.forEach((device, i) => {
      out[`${to}${FRESCO_SUFFIX[device]}`] = natives[i];
    });
    return;
  }
  addCss(
    out,
    deviceCss(
      Object.fromEntries(
        boxes.map((device) => [device, `selector{${property}:${resolved[device]!.join(' ')}}`]),
      ),
    ),
  );
}

const ZERO: Sides = ['0', '0', '0', '0'];
const same = (box: Sides): Record<DiviDevice, Sides> => ({ desktop: box, tablet: box, phone: box });

// ---- Borders ---------------------------------------------------------------------------------

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

interface Border {
  style: string;
  widths: Sides;
  colors: string[];
  styles: string[];
  radius?: Sides;
}

/** Divi's border settings (`border_width_all`, per side, `border_radii`), with its defaults. */
function border(attrs: DiviAttrs, suffix = ''): Border | undefined {
  const all = (name: string) => attrs[`border_${name}_all${suffix}`];
  const side = (name: string, s: string) => attrs[`border_${name}_${s}${suffix}`];
  const widthAll = cssLength(all('width'));
  const widths = SIDES.map((s) => cssLength(side('width', s)) ?? widthAll ?? '0') as Sides;
  const colorAll = color(all('color')) ?? '#333333';
  const colors = SIDES.map((s) => color(side('color', s)) ?? colorAll);
  const styleAll = str(all('style')) || 'solid';
  const styles = SIDES.map((s) => str(side('style', s)) || styleAll);
  const radii = str(attrs[`border_radii${suffix}`]).split('|');
  const radius =
    radii.length >= 5 && radii.slice(1, 5).some((r) => cssLength(r) && cssLength(r) !== '0')
      ? (radii.slice(1, 5).map((r) => cssLength(r) ?? '0') as Sides)
      : undefined;
  if (widths.every((w) => w === '0') && !radius) return undefined;
  return { style: styleAll, widths, colors, styles, radius };
}

/** A border as a Fresco border group (`prefix`), or as imported CSS (`selector`) when it cannot be. */
function applyBorder(out: Settings, b: Border | undefined, prefix: string, selector: string): void {
  if (!b) return;
  const hasWidth = b.widths.some((w) => w !== '0');
  const widths = nativeBox(b.widths);
  const oneColor = b.colors.every((c) => c === b.colors[0]);
  const oneStyle = b.styles.every((s) => s === b.styles[0]);
  if (hasWidth && widths && oneColor && oneStyle) {
    out[`${prefix}_style`] = b.styles[0];
    out[`${prefix}_width`] = widths;
    out[`${prefix}_color`] = b.colors[0];
  } else if (hasWidth) {
    addCss(
      out,
      `${selector}{${SIDES.map(
        (s, i) => `border-${s}:${b.widths[i]} ${b.styles[i]} ${b.colors[i]}`,
      ).join(';')}}`,
    );
  }
  if (b.radius) {
    const radius = nativeBox(b.radius);
    if (radius) out[`${prefix}_radius`] = radius;
    else addCss(out, `${selector}{border-radius:${b.radius.join(' ')};overflow:hidden}`);
  }
}

// ---- Backgrounds ------------------------------------------------------------------------------

const POSITIONS: Record<string, string> = {
  top_left: 'top left',
  top_center: 'top center',
  top_right: 'top right',
  center_left: 'center left',
  center: 'center center',
  center_center: 'center center',
  center_right: 'center right',
  bottom_left: 'bottom left',
  bottom_center: 'bottom center',
  bottom_right: 'bottom right',
};

/** A gradient (`<prefix>color_gradient_*`) as CSS, and as Fresco's when it has two stops. */
function gradient(
  attrs: DiviAttrs,
  prefix: string,
): { css: string; native?: Settings } | undefined {
  const at = (name: string) => attrs[`${prefix}color_gradient_${name}`];
  let stops = str(at('stops'))
    .split('|')
    .map((stop) => {
      const m = /^\s*(.+?)\s+(-?[\d.]+(?:%|px|em|vw)?)\s*$/.exec(stop);
      return m ? { color: color(m[1]), at: m[2]! } : null;
    })
    .filter((stop): stop is { color: string; at: string } => Boolean(stop?.color));
  if (stops.length < 2) {
    // Gradients made before Divi 4.16: a start and an end.
    const start = color(at('start')) ?? '#2b87da';
    const end = color(at('end')) ?? '#29c4a9';
    stops = [
      { color: start, at: cssLength(at('start_position')) ?? '0%' },
      { color: end, at: cssLength(at('end_position')) ?? '100%' },
    ];
  }
  const type = str(at('type')) || 'linear';
  const direction = length(at('direction'))?.size ?? 180;
  const position = POSITIONS[str(at('direction_radial')).replace(/\s+/g, '_')] ?? 'center center';
  const repeat = on(at('repeat'));
  const list = stops.map((stop) => `${stop.color} ${stop.at === '0' ? '0%' : stop.at}`).join(',');
  const fn =
    type === 'circular'
      ? `radial-gradient(circle at ${position},${list})`
      : type === 'elliptical'
        ? `radial-gradient(ellipse at ${position},${list})`
        : type === 'conic'
          ? `conic-gradient(from ${direction}deg at ${position},${list})`
          : `linear-gradient(${direction}deg,${list})`;
  const css = repeat ? `repeating-${fn}` : fn;
  const percent = (value: string) => (/^-?[\d.]+%$/.test(value) ? Number.parseFloat(value) : null);
  const [a, b] = stops;
  if (
    stops.length === 2 &&
    !repeat &&
    type !== 'conic' &&
    percent(a!.at) !== null &&
    percent(b!.at) !== null
  ) {
    const native: Settings = {
      type: 'gradient',
      color: a!.color,
      color_b: b!.color,
      stop: { size: percent(a!.at), unit: '%' },
      // A stop before the one above draws a sharp line there (as CSS does).
      stop_b: { size: Math.max(percent(a!.at)!, percent(b!.at)!), unit: '%' },
    };
    if (type === 'linear') native.angle = { size: direction, unit: 'deg' };
    else {
      native.gradient = 'radial';
      native.gradient_position = position;
      if (type === 'circular') return { css };
    }
    return { css, native };
  }
  return { css };
}

interface BackgroundOptions {
  /** The Fresco group's name (`background` for containers, `_background` for modules). */
  to: string;
  /** Divi's attribute prefix (`` or `button_` …). */
  prefix?: string;
  /** Divi's default color (sections are white). */
  fallback?: string;
  /** The element has Fresco's overlay (containers). */
  overlay?: boolean;
}

/**
 * Divi's background (color, gradient, image, parallax, per device) → a
 * Fresco background group; combinations Fresco draws in other ways (a
 * gradient over an image: its overlay) or not at all (more stops) become
 * imported CSS.
 */
function background(
  c: Converter,
  out: Settings,
  attrs: DiviAttrs,
  { to, prefix = '', fallback, overlay = false }: BackgroundOptions,
): void {
  const enabled = (name: string) => str(attrs[`${prefix}background_enable_${name}`]) !== 'off';
  const colorValue = enabled('color') ? color(attrs[`${prefix}background_color`]) : undefined;
  const image = enabled('image') ? str(attrs[`${prefix}background_image`]).trim() : '';
  const useGradient =
    on(attrs[`${prefix}use_background_color_gradient`]) &&
    str(attrs[`${prefix}background_enable_color_gradient`]) !== 'off';
  const g = useGradient ? gradient(attrs, `${prefix}background_`) : undefined;
  const set = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') out[`${to}_${key}`] = value;
  };
  const imageValue = image ? c.media(image) : undefined;
  const position =
    POSITIONS[str(attrs[`${prefix}background_position`]) || 'center'] ?? 'center center';
  const sizeName = str(attrs[`${prefix}background_size`]) || 'cover';
  const size = sizeName === 'initial' ? 'auto' : sizeName;
  const repeat = str(attrs[`${prefix}background_repeat`]) || 'no-repeat';
  const parallax = on(attrs[`${prefix}parallax`]);
  if (g && imageValue) {
    const above = on(attrs[`${prefix}background_color_gradient_overlays_image`]);
    if (above && overlay && g.native) {
      // The gradient over the image: Fresco's overlay.
      out.overlay_bg_type = 'gradient';
      for (const [key, value] of Object.entries(g.native))
        if (key !== 'type') out[`overlay_bg_${key}`] = value;
      out.overlay_opacity = { size: 1, unit: '' };
    } else {
      const url = str(imageValue.url).replace(/["\\]/g, '');
      addCss(
        out,
        `selector{background-image:${above ? `${g.css},url("${url}")` : `url("${url}"),${g.css}`};background-size:${above ? `100% 100%,${size}` : `${size},100% 100%`};background-position:${position};background-repeat:${repeat}${parallax ? ';background-attachment:fixed' : ''}}`,
      );
      if (colorValue) {
        set('type', 'classic');
        set('color', colorValue);
      }
      return;
    }
  } else if (g) {
    if (g.native) {
      set('type', 'gradient');
      for (const [key, value] of Object.entries(g.native)) if (key !== 'type') set(key, value);
    } else addCss(out, `selector{background-image:${g.css}}`);
    if (!g.native && colorValue) addCss(out, `selector{background-color:${colorValue}}`);
    return;
  }
  if (!colorValue && !imageValue && !fallback && !isResponsive(attrs, `${prefix}background_color`))
    return;
  set('type', 'classic');
  set('color', colorValue ?? fallback);
  perDevice(out, attrs, `${prefix}background_color`, `${to}_color`, (v) => color(v));
  if (imageValue) {
    set('image', imageValue);
    set('size', size);
    set('position', position);
    set('repeat', repeat);
    if (parallax) set('attachment', 'fixed');
  }
  const hover = color(attrs[`${prefix}background_color__hover`]);
  if (hover && on(str(attrs[`${prefix}background_color__hover_enabled`]).split('|')[0])) {
    addCss(out, `selector:hover{background-color:${hover}}`);
  }
}

// ---- Typography -------------------------------------------------------------------------------

/**
 * A Divi font group (`<from>_font`, `_font_size`, `_text_color`,
 * `_line_height`, `_letter_spacing`, per device) → a Fresco typography
 * (`<to>_family`…) and color.
 */
function typography(
  c: Converter,
  out: Settings,
  attrs: DiviAttrs,
  from: string,
  to: string,
  colorTo?: string,
): DiviFont {
  const f = font(attrs[`${from}_font`]);
  if (f.family) {
    out[`${to}_family`] = f.family;
    c.ctx.font?.(f.family);
  } else if (f.global) out[`${to}_global`] = f.global;
  if (f.weight) out[`${to}_weight`] = f.weight;
  if (f.italic) out[`${to}_style`] = 'italic';
  if (f.uppercase) out[`${to}_transform`] = 'uppercase';
  if (f.underline || f.lineThrough)
    out[`${to}_decoration`] = f.underline ? 'underline' : 'line-through';
  perDevice(out, attrs, `${from}_font_size`, `${to}_size`, (v) => length(v));
  perDevice(out, attrs, `${from}_line_height`, `${to}_line`, (v) => lineHeight(v));
  perDevice(out, attrs, `${from}_letter_spacing`, `${to}_letter`, (v) => length(v));
  if (colorTo) {
    const value = color(attrs[`${from}_text_color`]);
    if (value) out[colorTo] = value;
    perDevice(out, attrs, `${from}_text_color`, colorTo, (v) => color(v));
  }
  if (f.smallCaps) addCss(out, 'selector{font-variant:small-caps}');
  return f;
}

/**
 * The same group as CSS declarations for a selector inside the element
 * (headings and links of a text), per device.
 */
function typographyCss(
  c: Converter,
  attrs: DiviAttrs,
  from: string,
  selector: string,
  extra: string[] = [],
): string {
  const f = font(attrs[`${from}_font`]);
  if (f.family) c.ctx.font?.(f.family);
  const rules: Partial<Record<DiviDevice, string>> = {};
  for (const device of DIVI_DEVICES) {
    const declarations = device === 'desktop' ? [...extra, ...fontCss(f)] : [];
    const value = (name: string) => {
      const values = responsive(attrs, `${from}_${name}`);
      return values[device];
    };
    const sizeValue = cssLength(value('font_size'));
    if (sizeValue) declarations.push(`font-size:${sizeValue}`);
    const line = str(value('line_height'));
    if (line) {
      const lh = /^[\d.]+$/.test(line) ? line : cssLength(line);
      if (lh) declarations.push(`line-height:${lh}`);
    }
    const letter = cssLength(value('letter_spacing'));
    if (letter) declarations.push(`letter-spacing:${letter}`);
    const textColor = color(value('text_color'));
    if (textColor) declarations.push(`color:${textColor}`);
    const align = str(value('text_align'));
    if (/^(left|center|right|justified)$/.test(align))
      declarations.push(`text-align:${align === 'justified' ? 'justify' : align}`);
    if (declarations.length) rules[device] = `${selector}{${declarations.join(';')}}`;
  }
  const shadow = textShadowCss(attrs, from);
  if (shadow) rules.desktop = `${rules.desktop ?? ''}${selector}{text-shadow:${shadow}}`;
  const hover = color(attrs[`${from}_text_color__hover`]);
  if (hover && on(str(attrs[`${from}_text_color__hover_enabled`]).split('|')[0])) {
    rules.desktop = `${rules.desktop ?? ''}${selector}:hover{color:${hover}}`;
  }
  return deviceCss(rules);
}

const ALIGN: Record<string, string> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justified: 'justify',
  justify: 'justify',
};

// ---- The converter --------------------------------------------------------------------------

interface Converter {
  ctx: DiviContext;
  node(type: string, attrs: Settings, children?: CxdBlock[]): CxdBlock;
  /** An image address → Fresco media value (its media ref when imported). */
  media(url: string): Settings | undefined;
  /** A Divi link (an address, or dynamic content) and its "new window" switch → Fresco link. */
  link(url: unknown, newWindow: unknown): Settings | undefined;
  /** A text or address that may be Divi's dynamic content (`@ET-DC@…@`): its value here. */
  dynamic(value: unknown): string;
  note(text: string): void;
  unknown(type: string): void;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 → UTF-8 text (Divi's dynamic content), in any JavaScript runtime. */
function base64Text(value: string): string {
  let bits = 0;
  let buffer = 0;
  let encoded = '';
  for (const char of value.replace(/=+$/, '')) {
    const n = BASE64.indexOf(char);
    if (n < 0) throw new Error('not base64');
    buffer = (buffer << 6) | n;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      encoded += `%${((buffer >> bits) & 0xff).toString(16).padStart(2, '0')}`;
    }
  }
  return decodeURIComponent(encoded);
}

/** Divi's entrance animations → Fresco's (the closest one). */
function animation(out: Settings, attrs: DiviAttrs): void {
  const style = str(attrs.animation_style);
  if (!style || style === 'none') return;
  const direction = str(attrs.animation_direction) || 'center';
  const towards: Record<string, string> = {
    top: 'down',
    bottom: 'up',
    left: 'left',
    right: 'right',
  };
  const dir = towards[direction];
  const name =
    style === 'fade'
      ? dir
        ? `fade-${dir === 'left' ? 'right' : dir === 'right' ? 'left' : dir}`
        : 'fade-in'
      : style === 'slide'
        ? dir
          ? `slide-${dir === 'left' ? 'right' : dir === 'right' ? 'left' : dir}`
          : 'zoom-in'
        : style === 'zoom'
          ? dir
            ? `zoom-in-${dir}`
            : 'zoom-in'
          : style === 'bounce'
            ? dir
              ? `bounce-in-${dir}`
              : 'bounce-in'
            : style === 'flip'
              ? direction === 'left' || direction === 'right'
                ? 'flip-y'
                : 'flip-x'
              : style === 'roll'
                ? 'roll-in'
                : 'fade-in';
  out._animation = name;
  const time = (value: unknown) => {
    const m = /^\s*([\d.]+)\s*(ms|s)?\s*$/.exec(str(value));
    return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : undefined;
  };
  const delay = time(attrs.animation_delay);
  if (delay) out._animation_delay = delay;
  const ms = time(attrs.animation_duration);
  if (ms !== undefined && ms >= 1500) out._animation_duration = 'slow';
  else if (ms !== undefined && ms <= 600) out._animation_duration = 'fast';
}

/** Divi's custom CSS fields of an element (`custom_css_main_element`, before, after…). */
function customCss(c: Converter, out: Settings, attrs: DiviAttrs, parts: Record<string, string>) {
  for (const [key, value] of Object.entries(attrs)) {
    if (!key.startsWith('custom_css_') || !value.trim()) continue;
    const part = key.slice('custom_css_'.length);
    const target =
      part === 'main_element'
        ? 'selector'
        : part === 'before'
          ? 'selector::before'
          : part === 'after'
            ? 'selector::after'
            : parts[part];
    const css = value.replace(/\|\|/g, '\n').trim();
    if (!target || /[{}<]/.test(css)) {
      c.note(`custom CSS of a module's part ("${part}") was left out`);
      continue;
    }
    addCss(out, `${target}{${css}}`);
  }
}

/**
 * Settings every element has (Divi's Advanced and Design tabs): id and
 * classes, visibility per device, z-index, sizes, position, transforms,
 * animation and custom CSS.
 */
function common(c: Converter, out: Settings, attrs: DiviAttrs, parts: Record<string, string> = {}) {
  if (str(attrs.module_id).trim()) out._css_id = str(attrs.module_id).trim();
  if (str(attrs.module_class).trim()) out._css_classes = str(attrs.module_class).trim();
  const hidden = str(attrs.disabled_on).split('|');
  if (hidden[0] === 'on') out._hide_mobile = true;
  if (hidden[1] === 'on') out._hide_tablet = true;
  if (hidden[2] === 'on') out._hide_desktop = true;
  perDevice(out, attrs, 'z_index', '_z_index', (v) =>
    /^-?\d+$/.test(v.trim()) ? Number(v) : undefined,
  );
  // Height and its limits.
  const heights: Partial<Record<DiviDevice, string>> = {};
  for (const device of DIVI_DEVICES) {
    const rules: string[] = [];
    for (const [name, prop] of [
      ['height', 'height'],
      ['max_height', 'max-height'],
    ] as const) {
      const value = cssLength(responsive(attrs, name)[device]);
      if (value && value !== 'auto' && value !== 'none') rules.push(`${prop}:${value}`);
    }
    if (rules.length) heights[device] = `selector{${rules.join(';')}}`;
  }
  addCss(out, deviceCss(heights));
  // Divi 4.6's position: absolute or fixed, from a corner, with offsets.
  const positioning = str(attrs.positioning);
  if (positioning === 'absolute' || positioning === 'fixed') {
    out._position = positioning;
    const origin =
      str(attrs[`position_origin_${positioning === 'absolute' ? 'a' : 'f'}`]) || 'top_left';
    const [v = 'top', h = 'left'] = origin.split('_');
    const x = length(attrs.horizontal_offset) ?? { size: 0, unit: 'px' };
    const y = length(attrs.vertical_offset) ?? { size: 0, unit: 'px' };
    out[`_offset_${h === 'right' ? 'right' : 'left'}`] = x;
    out[`_offset_${v === 'bottom' ? 'bottom' : 'top'}`] = y;
  }
  // Transforms.
  const transforms: string[] = [];
  const pair = (name: string) => str(attrs[name]).split('|');
  const [tx, ty] = pair('transform_translate');
  if (cssLength(tx) || cssLength(ty))
    transforms.push(`translate(${cssLength(tx) ?? '0'},${cssLength(ty) ?? '0'})`);
  const [sx, sy] = pair('transform_scale');
  if (length(sx) || length(sy))
    transforms.push(
      `scale(${(length(sx)?.size ?? 100) / 100},${(length(sy)?.size ?? length(sx)?.size ?? 100) / 100})`,
    );
  const [rx, ry, rz] = pair('transform_rotate');
  for (const [axis, value] of [
    ['X', rx],
    ['Y', ry],
    ['Z', rz],
  ] as const) {
    const deg = Number.parseFloat(str(value));
    if (deg) transforms.push(`rotate${axis}(${deg}deg)`);
  }
  const [kx, ky] = pair('transform_skew');
  const skew = [kx, ky].map((v) => Number.parseFloat(str(v)) || 0);
  if (skew.some(Boolean)) transforms.push(`skew(${skew[0]}deg,${skew[1]}deg)`);
  if (transforms.length) addCss(out, `selector{transform:${transforms.join(' ')}}`);
  const overflowX = str(attrs.overflow_x);
  const overflowY = str(attrs.overflow_y);
  if (overflowX === 'hidden' || overflowY === 'hidden') {
    addCss(
      out,
      `selector{${overflowX === 'hidden' ? 'overflow-x:hidden;' : ''}${overflowY === 'hidden' ? 'overflow-y:hidden' : ''}}`,
    );
  }
  animation(out, attrs);
  customCss(c, out, attrs, parts);
  if (str(attrs.sticky_position) && str(attrs.sticky_position) !== 'none')
    c.note('sticky elements were imported as not sticky');
}

/** A module's own width and maximum width (per device), and its alignment when narrower. */
function moduleWidth(out: Settings, attrs: DiviAttrs): void {
  perDevice(out, attrs, 'max_width', '_max_width', (v) =>
    v === 'none' ? { size: 100, unit: '%' } : length(v),
  );
  const widths = responsive(attrs, 'width');
  if (DIVI_DEVICES.some((device) => length(widths[device]))) {
    for (const device of DIVI_DEVICES) {
      const value = length(widths[device]);
      if (!value) continue;
      out[`_width${FRESCO_SUFFIX[device]}`] = 'custom';
      out[`_width_custom${FRESCO_SUFFIX[device]}`] = value;
    }
  }
  const narrow =
    DIVI_DEVICES.some((device) => length(widths[device])) ||
    Object.keys(out).some((key) => key.startsWith('_max_width'));
  if (!narrow) return;
  const rules: Partial<Record<DiviDevice, string>> = {};
  for (const device of DIVI_DEVICES) {
    const align = responsive(attrs, 'module_alignment')[device];
    if (align === 'center') rules[device] = 'selector{margin-left:auto;margin-right:auto}';
    else if (align === 'right') rules[device] = 'selector{margin-left:auto;margin-right:0}';
    else if (align === 'left' && device !== 'desktop')
      rules[device] = 'selector{margin-left:0;margin-right:auto}';
  }
  addCss(out, deviceCss(rules));
}

/** The text a module without a counterpart keeps: its titles and content. */
function fallbackText(node: DiviNode): string {
  const titles = ['title', 'heading', 'name', 'button_text', 'subhead', 'button_one_text']
    .map((key) => str(node.attrs[key]).trim())
    .filter(Boolean)
    .map((text) => `<p><strong>${text}</strong></p>`);
  const own = node.content.trim();
  const children = node.children.map(fallbackText).filter(Boolean);
  return [...titles, ...(own ? [own] : []), ...children].join('\n');
}

/** Light `wpautop`: text without block tags becomes paragraphs (Divi shows module texts so). */
function paragraphs(html: string): string {
  const text = html.trim();
  if (!text) return '';
  if (/<(p|div|h[1-6]|ul|ol|table|blockquote|figure|pre|section)[\s>]/i.test(text)) return text;
  return text
    .split(/\n\s*\n/)
    .map((part) => `<p>${part.trim().replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

/** Inline HTML of a title → plain text (headings keep line breaks). */
function plainText(html: string): string {
  return html
    .replace(/[ \t]*\r?\n[ \t\r\n]*/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#8217;/g, '’')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

/** The Divi look of texts: paragraphs, headings and lists as Divi spaces them. */
const TEXT_RESET =
  'selector .fr-text__body :is(p,h1,h2,h3,h4,h5,h6){margin-top:0;margin-bottom:0}' +
  'selector .fr-text__body p{padding-bottom:1em}' +
  'selector .fr-text__body p:last-child{padding-bottom:0}' +
  'selector .fr-text__body :is(h1,h2,h3,h4,h5,h6){padding-bottom:10px;line-height:1em}';
const LIST_RESET =
  'selector .fr-text__body :is(ul,ol){margin:0;padding:0 0 23px 1em;line-height:26px}' +
  'selector .fr-text__body ul{list-style-type:disc}';

export interface DiviConversion {
  blocks: CxdBlock[];
}

/** A Divi layout (the post content) → Fresco blocks, or null when it holds no Divi section. */
export function diviToFresco(content: string, ctx: DiviContext): CxdBlock[] | null {
  const tree = parseDivi(content);
  if (tree.length === 0) return null;
  const blocks = convertDivi(tree, ctx);
  return blocks.length > 0 ? blocks : null;
}

/** Divi elements → Fresco blocks (with what could not be converted reported once). */
export function convertDivi(tree: DiviNode[], ctx: DiviContext): CxdBlock[] {
  const unknown = new Map<string, number>();
  const notes = new Map<string, number>();
  const layout = ctx.layout ?? {};
  const contentWidth = layout.contentWidth ?? 1080;
  const pageGutter = Math.min(4, Math.max(1, Math.round(ctx.gutter ?? layout.gutter ?? 3)));
  const sectionPadding = layout.sectionPadding ?? 4;
  const rowPadding = layout.rowPadding ?? 2;

  const c: Converter = {
    ctx,
    node: (type, attrs, children) => ({
      id: newBlockId(),
      type: type.includes('/') ? type : `fresco/${type}`,
      v: 1,
      attrs,
      ...(children ? { children } : {}),
    }),
    media(url) {
      const address = str(url).trim();
      if (!address || !/^(https?:)?\/\/|^\//.test(address)) return undefined;
      const ref = ctx.mediaByUrl?.(address);
      return { id: ref ?? null, url: address };
    },
    link(url, newWindow) {
      return link(c.dynamic(url), newWindow, ctx.origin);
    },
    dynamic(value) {
      const text = str(value);
      const m = /^@ET-DC@([A-Za-z0-9+/=]+)@$/.exec(text.trim());
      if (!m) return text;
      let data: Settings;
      try {
        data = JSON.parse(base64Text(m[1]!)) as Settings;
      } catch {
        c.note('dynamic content that could not be read was left out');
        return '';
      }
      const content = str(data.content);
      const settings = (
        data.settings && typeof data.settings === 'object' ? data.settings : {}
      ) as Settings;
      const before = str(settings.before);
      const after = str(settings.after);
      if (content.startsWith('post_link_url')) {
        const id = Number(str(settings.post_id));
        const path = Number.isInteger(id) && id > 0 ? ctx.postLink?.(id) : undefined;
        if (path) return path;
      } else if (content === 'post_title' && ctx.title) return `${before}${ctx.title}${after}`;
      else if (content === 'custom_url' || content === 'url') return str(settings.url);
      c.note(`the dynamic content "${content || 'unknown'}" was left out`);
      return '';
    },
    note(text) {
      notes.set(text, (notes.get(text) ?? 0) + 1);
    },
    unknown(type) {
      unknown.set(type, (unknown.get(type) ?? 0) + 1);
    },
  };

  /** A module's settings with its preset's under them. */
  const withPreset = (node: DiviNode): DiviAttrs => {
    const presets = ctx.presets?.[node.tag];
    if (!presets) return node.attrs;
    const id = str(node.attrs._module_preset) || 'default';
    const preset = presets.presets?.[id === 'default' ? (presets.default ?? '') : id];
    return preset?.settings ? { ...preset.settings, ...node.attrs } : node.attrs;
  };

  /**
   * Space under the modules of a column (Divi's margin: a share of the row,
   * written as a share of the column, `share` % of the row), by device.
   */
  const moduleGap = (gutter: number, share: number): Record<DiviDevice, string> => {
    const desktop = MODULE_MARGIN[gutter] ?? 2.75;
    return {
      desktop: desktop ? `${round((desktop * 100) / Math.max(share, 1))}%` : '0',
      tablet: gutter === 1 ? '0' : '30px',
      phone: gutter === 1 ? '0' : '30px',
    };
  };

  /** The modules of a column, with Divi's space under each but the last. */
  const modules = (nodes: DiviNode[], gutter: number, share: number): CxdBlock[] => {
    const gap = moduleGap(gutter, share);
    const list = nodes.filter((n) => !on(withPreset(n).disabled));
    return list.flatMap((child, i) => module(child, i === list.length - 1 ? null : gap, share));
  };

  /** Margin and padding of a module, with Divi's space under it. */
  const moduleSpacing = (
    out: Settings,
    attrs: DiviAttrs,
    gap: Record<DiviDevice, string> | null,
    marginTo = '_margin',
    paddingTo = '_padding',
  ) => {
    const bottom = (device: DiviDevice): Sides => ['0', '0', gap ? gap[device] : '0', '0'];
    spacing(out, attrs, 'custom_margin', marginTo, 'margin', {
      desktop: bottom('desktop'),
      tablet: bottom('tablet'),
      phone: bottom('phone'),
    });
    spacing(out, attrs, 'custom_padding', paddingTo, 'padding', same(ZERO));
  };

  /** What every module shares: spacing, background, border, shadow, sizes and the rest. */
  const moduleCommon = (
    out: Settings,
    attrs: DiviAttrs,
    gap: Record<DiviDevice, string> | null,
    options: { border?: boolean; shadow?: boolean; parts?: Record<string, string> } = {},
  ) => {
    moduleSpacing(out, attrs, gap);
    background(c, out, attrs, { to: '_background' });
    if (options.border !== false) applyBorder(out, border(attrs), '_border', 'selector');
    if (options.shadow !== false) {
      const s = boxShadow(attrs);
      if (s) out._shadow = s;
    }
    moduleWidth(out, attrs);
    common(c, out, attrs, options.parts);
  };

  const dark = (attrs: DiviAttrs) => str(attrs.background_layout) === 'dark';

  // ---- Modules ----------------------------------------------------------------------------

  const text = (attrs: DiviAttrs, content: string, gap: Record<DiviDevice, string> | null) => {
    const out: Settings = { content: paragraphs(content) };
    for (const family of str(attrs.inline_fonts).split(','))
      if (family.trim()) ctx.font?.(family.trim());
    typography(c, out, attrs, 'text', 'typography', 'color');
    if (!out.color && dark(attrs)) out.color = '#ffffff';
    perDevice(out, attrs, 'text_orientation', 'align', (v) => ALIGN[v]);
    addCss(out, TEXT_RESET);
    if (/<(ul|ol)[\s>]/i.test(content)) addCss(out, LIST_RESET);
    // Headings (`header_` is h1), links, lists and quotes of the text.
    const headingColor = dark(attrs) ? ['color:#ffffff'] : [];
    for (let level = 1; level <= 6; level++) {
      const from = level === 1 ? 'header' : `header_${level}`;
      addCss(out, typographyCss(c, attrs, from, `selector .fr-text__body h${level}`, headingColor));
    }
    addCss(out, typographyCss(c, attrs, 'link', 'selector .fr-text__body a'));
    addCss(out, typographyCss(c, attrs, 'ul', 'selector .fr-text__body ul li'));
    addCss(out, typographyCss(c, attrs, 'ol', 'selector .fr-text__body ol li'));
    addCss(out, typographyCss(c, attrs, 'quote', 'selector .fr-text__body blockquote'));
    moduleCommon(out, attrs, gap);
    return c.node('text', out);
  };

  const heading = (attrs: DiviAttrs, gap: Record<DiviDevice, string> | null) => {
    const out: Settings = { title: plainText(c.dynamic(attrs.title)) };
    const level = str(attrs.title_level);
    out.tag = /^h[1-6]$/.test(level) ? level : 'h1';
    const f = typography(c, out, attrs, 'title', 'title_typography', 'title_color');
    if (!f.family && !f.global) out.title_theme_font = true;
    if (!out.title_typography_weight) out.title_typography_weight = '500';
    if (!out.title_typography_line) out.title_typography_line = { size: 1, unit: 'em' };
    perDevice(out, attrs, 'title_text_align', 'align', (v) => ALIGN[v]);
    const shadow = textShadowCss(attrs, 'title');
    if (shadow) addCss(out, `selector .fr-heading__title{text-shadow:${shadow}}`);
    moduleCommon(out, attrs, gap);
    return c.node('heading', out);
  };

  const image = (attrs: DiviAttrs, gap: Record<DiviDevice, string> | null) => {
    const out: Settings = {};
    const media = c.media(str(attrs.src));
    if (!media) return [];
    const alt = str(attrs.alt).trim();
    out.image = alt ? { ...media, alt } : media;
    out.image_size = 'full';
    perDevice(out, attrs, 'align', 'align', (v) =>
      ['left', 'center', 'right'].includes(v) ? v : undefined,
    );
    if (!out.align) out.align = 'left';
    if (on(attrs.force_fullwidth)) out.width = { size: 100, unit: '%' };
    if (on(attrs.show_in_lightbox)) out.link_to = 'file';
    else {
      const href = c.link(attrs.url, attrs.url_new_window);
      if (href) {
        out.link_to = 'custom';
        out.link = href;
      }
    }
    // The border and shadow of Divi's image are the picture's.
    applyBorder(out, border(attrs), 'image_border', 'selector img');
    const s = boxShadow(attrs);
    if (s) out.image_shadow = s;
    const gapUnder = str(attrs.show_bottom_space) === 'off' ? null : gap;
    // Its width (a share of the column) limits the picture, as Divi's does.
    const widths = responsive(attrs, 'width');
    for (const device of DIVI_DEVICES) {
      const value = length(widths[device]);
      if (value) out[`max_width${FRESCO_SUFFIX[device]}`] = value;
    }
    const rest: DiviAttrs = { ...attrs };
    delete rest.width;
    delete rest.width_tablet;
    delete rest.width_phone;
    moduleCommon(out, rest, gapUnder, { border: false, shadow: false });
    return [c.node('image', out)];
  };

  const button = (attrs: DiviAttrs, gap: Record<DiviDevice, string> | null) => {
    const out: Settings = {
      text: c.dynamic(attrs.button_text) || 'Click here',
      link: c.link(attrs.button_url, attrs.url_new_window) ?? { url: '#' },
      size: 'sm',
    };
    perDevice(out, attrs, 'button_alignment', 'align', (v) =>
      ['left', 'center', 'right'].includes(v) ? v : undefined,
    );
    if (!out.align) out.align = 'left';
    const theme = layout.button ?? {};
    const custom = on(attrs.custom_button);
    // Divi's button: 20px, weight 500, line height 1.7em, a 2px border, 3px radius, transparent.
    const own = (name: string) => (custom ? attrs[`button_${name}`] : undefined);
    const fontSize = length(own('text_size')) ?? theme.size ?? { size: 20, unit: 'px' };
    out.typography_size = fontSize;
    perDevice(out, custom ? attrs : {}, 'button_text_size', 'typography_size', (v) => length(v));
    out.typography_line = { size: 1.7, unit: 'em' };
    out.typography_weight = '500';
    const f = custom ? font(attrs.button_font) : (theme.font ?? {});
    if (f.family) {
      out.typography_family = f.family;
      ctx.font?.(f.family);
    }
    if (f.weight) out.typography_weight = f.weight;
    if (f.italic) out.typography_style = 'italic';
    if (f.uppercase) out.typography_transform = 'uppercase';
    const letter = length(own('letter_spacing')) ?? theme.spacing;
    if (letter) out.typography_letter = letter;
    out.text_color =
      color(own('text_color')) ??
      theme.color ??
      (dark(attrs) ? '#ffffff' : (layout.accent ?? '#2ea3f2'));
    out.background_color = color(own('bg_color')) ?? theme.background ?? 'transparent';
    out.border_style = 'solid';
    out.border_width = (() => {
      const w = length(own('border_width')) ?? theme.borderWidth ?? { size: 2, unit: 'px' };
      return {
        top: w.size,
        right: w.size,
        bottom: w.size,
        left: w.size,
        unit: w.unit,
        linked: true,
      };
    })();
    out.border_color =
      color(own('border_color')) ?? theme.borderColor ?? (out.text_color as string);
    const radius = length(own('border_radius')) ?? theme.radius ?? { size: 3, unit: 'px' };
    out.border_radius = {
      top: radius.size,
      right: radius.size,
      bottom: radius.size,
      left: radius.size,
      unit: radius.unit,
      linked: true,
    };
    // Hover colors.
    const hover = (name: string) =>
      custom && on(str(attrs[`button_${name}__hover_enabled`]).split('|')[0])
        ? color(attrs[`button_${name}__hover`])
        : undefined;
    const textHover = hover('text_color');
    if (textHover) out['text_color:hover'] = textHover;
    const bgHover = hover('bg_color');
    if (bgHover) out['background_color:hover'] = bgHover;
    const borderHover = hover('border_color');
    if (borderHover) out.border_hover_color = borderHover;
    // The icon: shown on hover only by Divi unless told otherwise; Fresco shows it always.
    if (custom && str(attrs.button_use_icon) !== 'off' && str(attrs.button_icon)) {
      const value = diviIcon(attrs.button_icon);
      if (value) {
        out.icon = value;
        out.icon_position = str(attrs.button_icon_placement) === 'left' ? 'before' : 'after';
      }
    }
    // Its padding is the button's own (Divi's default .3em 1em).
    spacing(
      out,
      attrs,
      'custom_padding',
      'padding',
      'padding',
      same(['0.3em', '1em', '0.3em', '1em']),
      true,
    );
    if (out._custom_css) {
      out._custom_css = str(out._custom_css).replace(
        /selector\{padding/g,
        'selector .fr-button__link{padding',
      );
    }
    const s = boxShadow(attrs);
    if (s) out.shadow = s;
    if (shadowHovers(attrs)) {
      const h = boxShadow(attrs, '', 'desktop', true);
      if (h) out.shadow_hover = h;
    }
    const rest: DiviAttrs = { ...attrs };
    for (const key of Object.keys(rest))
      if (key.startsWith('custom_padding') || key.startsWith('box_shadow')) delete rest[key];
    moduleCommon(out, rest, gap, { border: false, shadow: false });
    // The rule above put the button's own padding first; the wrapper's spacing follows.
    return c.node('button', out);
  };

  const iconValue = (value: unknown) => {
    const found = diviIcon(value);
    if (!found && str(value)) c.note("some of Divi's icons have no match and became a circle");
    return found ?? { set: 'solid', name: 'circle' };
  };

  const blurb = (attrs: DiviAttrs, content: string, gap: Record<DiviDevice, string> | null) => {
    const out: Settings = { title: plainText(c.dynamic(attrs.title)) };
    const description = plainText(paragraphs(content).replace(/<\/p>\s*<p[^>]*>/gi, '\n\n'));
    out.description = description;
    if (/<(strong|b|em|i|a|span)\b/i.test(content))
      c.note('inline formatting inside blurb texts was removed');
    const href = c.link(attrs.url, attrs.url_new_window);
    if (href) out.link = href;
    const level = str(attrs.header_level);
    out.title_tag = /^h[1-6]$/.test(level) ? level : 'h4';
    const placement = str(attrs.icon_placement) || 'top';
    out.position = placement === 'left' ? 'left' : 'top';
    const useIcon = on(attrs.use_icon);
    if (useIcon) {
      out.icon = iconValue(attrs.font_icon);
      const iconColor = color(attrs.icon_color) ?? layout.accent ?? '#2ea3f2';
      const plate = color(attrs.image_icon_background_color);
      const circle = on(attrs.use_circle);
      if (plate || circle) {
        out.view = 'stacked';
        out.shape = 'circle';
        out.icon_primary_color = plate ?? color(attrs.circle_color) ?? iconColor;
        out.icon_secondary_color = iconColor;
        if (circle && on(attrs.use_circle_border)) {
          out.view = 'framed';
          out.icon_primary_color = color(attrs.circle_border_color) ?? iconColor;
          out.icon_secondary_color = plate ?? color(attrs.circle_color) ?? 'transparent';
        }
      } else out.icon_primary_color = iconColor;
      const size = length(attrs.image_icon_width) ??
        (on(attrs.use_icon_font_size) ? length(attrs.icon_font_size) : undefined) ?? {
          size: circle ? 46 : placement === 'left' ? 32 : 96,
          unit: 'px',
        };
      out.icon_size = size;
      const pad = sides(attrs.image_icon_custom_padding)[0];
      out.icon_padding =
        length(pad) ?? (circle && !plate ? { size: 25, unit: 'px' } : { size: 0, unit: 'px' });
      const radii = str(attrs.border_radii_image).split('|');
      if (radii.length >= 5) {
        const r = length(radii[1]);
        if (r)
          out.icon_radius = {
            top: r.size,
            right: r.size,
            bottom: r.size,
            left: r.size,
            unit: r.unit,
            linked: true,
          };
        if (r && r.unit === '%' && r.size >= 50) out.shape = 'circle';
        else if (r) out.shape = 'rounded';
      }
    } else {
      const media = c.media(str(attrs.image));
      if (media) out.image = str(attrs.alt) ? { ...media, alt: str(attrs.alt) } : media;
      out.image_size = 'full';
      // The picture at its own size (up to the box), unless Divi limits it.
      perDevice(out, attrs, 'image_max_width', 'image_width', (v) => length(v));
      if (!out.image_width) {
        if (placement === 'left') out.image_width = { size: 32, unit: 'px' };
        else
          addCss(
            out,
            'selector .fr-box__media{width:auto}selector .fr-box__media img{width:auto;max-width:100%;margin:0 auto}',
          );
      }
      applyBorder(out, border(attrs, '_image'), 'image_border', 'selector .fr-box__media img');
    }
    out.media_spacing = { size: placement === 'left' ? 15 : 30, unit: 'px' };
    const align = str(attrs.text_orientation) || (placement === 'left' ? 'left' : 'center');
    out.align = ALIGN[align] ?? 'center';
    if (placement === 'left') out.vertical_align = 'flex-start';
    out.title_spacing = { size: 10, unit: 'px' };
    typography(c, out, attrs, 'header', 'title_typography', 'title_color');
    if (!out.title_typography_weight) out.title_typography_weight = '500';
    if (!out.title_typography_size) out.title_typography_size = { size: 18, unit: 'px' };
    if (!out.title_typography_line) out.title_typography_line = { size: 1, unit: 'em' };
    typography(c, out, attrs, 'body', 'description_typography', 'description_color');
    if (dark(attrs)) {
      out.title_color ??= '#ffffff';
      out.description_color ??= '#ffffff';
    }
    const maxWidth = cssLength(attrs.content_max_width) ?? '550px';
    addCss(out, `selector .fr-box{max-width:${maxWidth};margin-left:auto;margin-right:auto}`);
    moduleCommon(out, attrs, gap, {
      parts: {
        blurb_title: 'selector .fr-box__title',
        blurb_content: 'selector .fr-box__description',
        blurb_image: 'selector .fr-box__icon',
      },
    });
    return c.node(useIcon ? 'icon-box' : 'image-box', out);
  };

  const divider = (attrs: DiviAttrs, gap: Record<DiviDevice, string> | null) => {
    const out: Settings = {};
    const heights = responsive(attrs, 'height');
    if (str(attrs.show_divider) === 'off') {
      out.space = length(heights.desktop) ?? { size: 23, unit: 'px' };
      if (heights.tablet && length(heights.tablet)) out['space@tablet'] = length(heights.tablet);
      if (heights.phone && length(heights.phone)) out['space@mobile'] = length(heights.phone);
      moduleCommon(out, attrs, gap);
      return c.node('spacer', out);
    }
    const style = str(attrs.divider_style) || 'solid';
    out.style = ['solid', 'double', 'dotted', 'dashed'].includes(style) ? style : 'solid';
    out.color = color(attrs.color) ?? layout.accent ?? '#2ea3f2';
    out.weight = length(attrs.divider_weight) ?? { size: 1, unit: 'px' };
    out.width = { size: 100, unit: '%' };
    const height = length(heights.desktop) ?? { size: 23, unit: 'px' };
    const position = str(attrs.divider_position) || 'top';
    // The line sits at the top, middle or bottom of the divider's height.
    const rest = Math.max(0, height.size - (out.weight as SizeValue).size);
    if (height.unit === 'px') {
      const before = position === 'center' ? rest / 2 : position === 'bottom' ? rest : 0;
      addCss(
        out,
        `selector{padding-top:${round(before)}px;padding-bottom:${round(rest - before)}px}`,
      );
    }
    out.gap = { size: 0, unit: 'px' };
    moduleCommon(out, attrs, gap);
    return c.node('divider', out);
  };

  const gallery = (attrs: DiviAttrs, gap: Record<DiviDevice, string> | null) => {
    const ids = str(attrs.gallery_ids)
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => id > 0);
    let images = ids
      .map((id) => ctx.attachment?.(id))
      .filter((found): found is { ref?: string; url: string } => Boolean(found))
      .map((found) => ({ id: found.ref ?? null, url: found.url }));
    if (images.length < ids.length) c.note('gallery images missing from the export were left out');
    const out: Settings = {};
    if (on(attrs.fullwidth)) {
      out.images = images;
      out.per_view = 1;
      out.image_size = 'full';
      if (str(attrs.auto) !== 'on') out.autoplay = false;
      else {
        out.autoplay = true;
        const speed = length(attrs.auto_speed)?.size;
        if (speed) out.interval = speed;
      }
      if (str(attrs.show_pagination) === 'off') out.pagination = 'none';
      moduleCommon(out, attrs, gap);
      return c.node('image-carousel', out);
    }
    const perPage = Number(str(attrs.posts_number) || 4);
    if (str(attrs.show_pagination) !== 'off' && images.length > perPage)
      c.note('galleries split into pages show all their images at once');
    else if (perPage > 0 && images.length > perPage) images = images.slice(0, perPage);
    out.images = images;
    out.image_size = 'medium';
    out.columns = 4;
    out['columns@tablet'] = 3;
    out['columns@mobile'] = 2;
    // Divi crops grid images to 400×284.
    out.ratio = str(attrs.orientation) === 'portrait' ? '3/4' : '38/27';
    out.gap = { size: 0, unit: 'px' };
    out.link_to = 'file';
    if (str(attrs.show_title_and_caption) !== 'off') {
      out.captions = true;
      out.caption_source = 'attachment';
    }
    moduleCommon(out, attrs, gap);
    return c.node('gallery', out);
  };

  const icon = (attrs: DiviAttrs, gap: Record<DiviDevice, string> | null) => {
    const out: Settings = { icon: iconValue(attrs.font_icon) };
    out.primary_color = color(attrs.icon_color) ?? layout.accent ?? '#2ea3f2';
    perDevice(out, attrs, 'icon_width', 'size', (v) => length(v));
    if (!out.size) out.size = { size: 96, unit: 'px' };
    perDevice(out, attrs, 'icon_alignment', 'align', (v) =>
      ['left', 'center', 'right'].includes(v) ? v : undefined,
    );
    if (!out.align) out.align = 'center';
    const href = c.link(attrs.url, attrs.url_new_window);
    if (href) out.link = href;
    moduleCommon(out, attrs, gap);
    return c.node('icon', out);
  };

  const code = (attrs: DiviAttrs, content: string, gap: Record<DiviDevice, string> | null) => {
    const out: Settings = { code: diviCode(content).trim() };
    if (/<iframe\b/i.test(str(out.code))) addCss(out, 'selector iframe{max-width:100%}');
    moduleCommon(out, attrs, gap);
    return c.node('html', out);
  };

  const postTitle = (attrs: DiviAttrs, gap: Record<DiviDevice, string> | null) => {
    if (str(attrs.title) === 'off') return [];
    const out: Settings = { title: ctx.title ?? '', tag: 'h1' };
    const f = typography(c, out, attrs, 'title', 'title_typography', 'title_color');
    if (!f.family && !f.global) out.title_theme_font = true;
    if (!out.title_typography_weight) out.title_typography_weight = '500';
    if (!out.title_typography_line) out.title_typography_line = { size: 1, unit: 'em' };
    perDevice(out, attrs, 'title_text_align', 'align', (v) => ALIGN[v]);
    if (!out.align && str(attrs.text_orientation)) out.align = ALIGN[str(attrs.text_orientation)];
    if (dark(attrs)) out.title_color ??= '#ffffff';
    const shadow = textShadowCss(attrs, 'title');
    if (shadow) addCss(out, `selector .fr-heading__title{text-shadow:${shadow}}`);
    addCss(out, 'selector .fr-heading__title{padding-bottom:10px}');
    if (str(attrs.meta) !== 'off')
      c.note('the post information under titles (author, date) was left out');
    moduleCommon(out, attrs, gap);
    return [c.node('heading', out)];
  };

  const menu = (attrs: DiviAttrs, gap: Record<DiviDevice, string> | null) => {
    const nav: Settings = {
      location: ctx.menuLocation?.(str(attrs.menu_id)) ?? 'primary',
      toggle: 'tablet',
      spacing: { size: 22, unit: 'px' },
    };
    const style = str(attrs.menu_style) || 'left_aligned';
    nav.align = style === 'centered' ? 'center' : 'flex-end';
    typography(c, nav, attrs, 'menu', 'typography', 'link_color');
    if (!nav.typography_weight) nav.typography_weight = '600';
    if (!nav.typography_size) nav.typography_size = { size: 14, unit: 'px' };
    if (!nav.link_color) nav.link_color = dark(attrs) ? '#ffffff' : 'rgba(0,0,0,0.6)';
    const active = color(attrs.active_link_color);
    if (active) nav.current_color = active;
    const sub = color(attrs.dropdown_menu_bg_color);
    if (sub) nav.sub_bg = sub;
    const subText = color(attrs.dropdown_menu_text_color);
    if (subText) nav.sub_color = subText;
    const mobileBg = color(attrs.mobile_menu_bg_color);
    if (mobileBg) nav.mobile_bg = mobileBg;
    const toggleColor = color(attrs.menu_icon_color);
    if (toggleColor) nav.toggle_color = toggleColor;
    const toggleSize = length(attrs.menu_icon_font_size);
    if (toggleSize) nav.toggle_size = toggleSize;
    if (style === 'centered') nav.toggle_align = 'center';
    const children: CxdBlock[] = [];
    const logo = c.media(str(attrs.logo));
    if (logo) {
      const image: Settings = {
        image: str(attrs.logo_alt) ? { ...logo, alt: str(attrs.logo_alt) } : logo,
        image_size: 'full',
        align: style === 'centered' ? 'center' : 'left',
      };
      const href = c.link(attrs.logo_url, attrs.logo_url_new_window);
      if (href) {
        image.link_to = 'custom';
        image.link = href;
      }
      perDevice(image, attrs, 'logo_max_width', 'max_width', (v) => length(v));
      perDevice(image, attrs, 'logo_max_height', 'height', (v) => length(v));
      children.push(c.node('image', image));
    }
    children.push(c.node('nav-menu', nav));
    const out: Settings = {
      content_width: 'full',
      flex_direction: style === 'centered' ? 'column' : 'row',
      align_items: 'center',
      justify_content: style === 'centered' ? 'center' : 'space-between',
      gap: { size: style === 'centered' ? 20 : 0, unit: 'px' },
      _padding: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
    };
    if (style === 'inline_centered_logo')
      c.note('menus with the logo in their middle show it before the links');
    moduleCommon(out, attrs, gap);
    if (!out.background_type && out._background_type) {
      for (const key of Object.keys(out)) {
        if (key.startsWith('_background_')) {
          out[key.slice(1)] = out[key];
          delete out[key];
        }
      }
    }
    return c.node('container', out, children);
  };

  const fullwidthHeader = (attrs: DiviAttrs, content: string) => {
    const align = ALIGN[str(attrs.text_orientation) || 'left'] ?? 'left';
    const darkText = str(attrs.background_layout) !== 'light';
    const children: CxdBlock[] = [];
    const logo = c.media(str(attrs.logo_image_url));
    if (logo)
      children.push(
        c.node('image', {
          image: logo,
          image_size: 'full',
          align: align === 'justify' ? 'left' : align,
        }),
      );
    if (str(attrs.title).trim()) {
      const out: Settings = {
        title: plainText(str(attrs.title)),
        tag: /^h[1-6]$/.test(str(attrs.title_level)) ? str(attrs.title_level) : 'h1',
      };
      typography(c, out, attrs, 'title', 'title_typography', 'title_color');
      if (!out.title_color && darkText) out.title_color = '#ffffff';
      if (!out.title_typography_family) out.title_theme_font = true;
      perDevice(out, attrs, 'title_text_align', 'align', (v) => ALIGN[v]);
      out.align ??= align;
      children.push(c.node('heading', out));
    }
    if (str(attrs.subhead).trim()) {
      const out: Settings = { title: plainText(str(attrs.subhead)), tag: 'span' };
      typography(c, out, attrs, 'subhead', 'title_typography', 'title_color');
      if (!out.title_color && darkText) out.title_color = '#ffffff';
      out.title_theme_font = true;
      out.align = align;
      children.push(c.node('heading', out));
    }
    if (content.trim()) {
      const out: Settings = { content: paragraphs(content), align };
      typography(c, out, attrs, 'content', 'typography', 'color');
      if (!out.color && darkText) out.color = '#ffffff';
      perDevice(out, attrs, 'title_text_align', 'align', (v) => ALIGN[v]);
      addCss(out, TEXT_RESET);
      children.push(c.node('text', out));
    }
    for (const which of ['one', 'two']) {
      const textValue = str(attrs[`button_${which}_text`]).trim();
      if (!textValue) continue;
      const prefixed: DiviAttrs = {
        button_text: textValue,
        button_url: str(attrs[`button_${which}_url`]),
        url_new_window: str(attrs[`button_${which}_url_new_window`]),
      };
      for (const [key, value] of Object.entries(attrs)) {
        if (key.startsWith(`button_${which}_`))
          prefixed[`button_${key.slice(`button_${which}_`.length)}`] = value;
      }
      prefixed.custom_button = str(attrs[`custom_button_${which}`]);
      prefixed.button_alignment = align === 'justify' ? 'left' : align;
      if (darkText) prefixed.background_layout = 'dark';
      children.push(button(prefixed, null));
    }
    const inner = c.node(
      'container',
      {
        content_width: 'full',
        width: { size: 80, unit: '%' },
        _max_width: { size: contentWidth, unit: 'px' },
        gap: { size: 0, unit: 'px' },
        _padding: { top: 10, right: 10, bottom: 10, left: 10, unit: 'px', linked: true },
        _align_self: 'center',
      },
      children,
    );
    const out: Settings = {
      content_width: 'full',
      gap: { size: 0, unit: 'px' },
    };
    spacing(
      out,
      attrs,
      'custom_padding',
      '_padding',
      'padding',
      same(['50px', '0', '50px', '0']),
      true,
    );
    spacing(out, attrs, 'custom_margin', '_margin', 'margin', same(ZERO));
    background(c, out, attrs, {
      to: 'background',
      fallback: darkText ? '#2ea3f2' : undefined,
      overlay: true,
    });
    if (on(attrs.header_fullscreen)) out.min_height = { size: 100, unit: 'vh' };
    const s = boxShadow(attrs);
    if (s) out.shadow = s;
    common(c, out, attrs);
    return c.node('container', out, [inner]);
  };

  /** One module (with the space Divi leaves under it, or none for the last of a column). */
  const module = (
    node: DiviNode,
    gap: Record<DiviDevice, string> | null,
    share: number,
  ): CxdBlock[] => {
    const attrs = withPreset(node);
    if (on(attrs.disabled)) return [];
    switch (node.tag) {
      case 'et_pb_text':
        return [text(attrs, node.content, gap)];
      case 'et_pb_heading':
        return [heading(attrs, gap)];
      case 'et_pb_image':
      case 'et_pb_fullwidth_image':
        return image(attrs, gap);
      case 'et_pb_button':
        return [button(attrs, gap)];
      case 'et_pb_blurb':
        return [blurb(attrs, node.content, gap)];
      case 'et_pb_divider':
        return [divider(attrs, gap)];
      case 'et_pb_gallery':
        return [gallery(attrs, gap)];
      case 'et_pb_icon':
        return [icon(attrs, gap)];
      case 'et_pb_code':
      case 'et_pb_fullwidth_code':
        return [code(attrs, node.content, gap)];
      case 'et_pb_post_title':
      case 'et_pb_fullwidth_post_title':
        return postTitle(attrs, gap);
      case 'et_pb_menu':
      case 'et_pb_fullwidth_menu':
        return [menu(attrs, gap)];
      case 'et_pb_fullwidth_header':
        return [fullwidthHeader(attrs, node.content)];
      case 'et_pb_split_track':
        return [];
      // Structure found where modules go (e.g. a library item): converted as such.
      case 'et_pb_section':
        return [section(node)];
      case 'et_pb_row':
      case 'et_pb_row_inner':
        return [row(node, pageGutter, share)];
      default: {
        c.unknown(node.tag);
        const html = fallbackText(node);
        if (!html.trim()) return [];
        const out: Settings = { content: paragraphs(html) };
        addCss(out, TEXT_RESET);
        moduleSpacing(out, attrs, gap);
        return [c.node('text', out)];
      }
    }
  };

  // ---- Structure --------------------------------------------------------------------------

  /** The settings a specialty section or a row keeps for its N-th column (`bg_img_1`…). */
  const columnAttrs = (parent: DiviAttrs, index: number, own: DiviAttrs): DiviAttrs => {
    const n = String(index + 1);
    const out: DiviAttrs = {};
    for (const [key, value] of Object.entries(parent)) {
      const m = /^(.+)_(\d+)((?:_tablet|_phone|_last_edited|__hover|__hover_enabled)?)$/.exec(key);
      if (!m || m[2] !== n || !value) continue;
      const base = m[1]!;
      const name = base === 'bg_img' ? 'background_image' : base;
      if (/^padding_(top|right|bottom|left)$/.test(name)) continue;
      out[`${name}${m[3]}`] = value;
    }
    // Old paddings of columns (`padding_top_1`…) → their custom padding.
    const paddings = ['top', 'right', 'bottom', 'left'].map((s) =>
      str(parent[`padding_${s}_${n}`]),
    );
    if (paddings.some(Boolean) && !own.custom_padding) out.custom_padding = paddings.join('|');
    return { ...out, ...own };
  };

  /**
   * A column: its modules (or inner rows) in a container of Divi's width
   * (`width` % of its row, `share` % of the section's row).
   */
  const column = (
    node: DiviNode,
    attrs: DiviAttrs,
    width: number,
    gutter: number,
    share: number,
  ): CxdBlock => {
    const out: Settings = {
      content_width: 'full',
      width: { size: round(width), unit: '%' },
      'width@tablet': { size: 100, unit: '%' },
      gap: { size: 0, unit: 'px' },
    };
    const children = node.children.some((child) => child.tag === 'et_pb_row_inner')
      ? node.children
          .filter((child) => !on(child.attrs.disabled))
          .flatMap((child) =>
            child.tag === 'et_pb_row_inner'
              ? [
                  row(
                    child,
                    gutter,
                    share,
                    str(attrs.type) || str(attrs.saved_specialty_column_type),
                  ),
                ]
              : module(child, null, share),
          )
      : modules(node.children, gutter, share);
    spacing(out, attrs, 'custom_padding', '_padding', 'padding', same(ZERO), true);
    spacing(out, attrs, 'custom_margin', '_margin', 'margin', same(ZERO));
    background(c, out, attrs, { to: 'background', overlay: true });
    applyBorder(out, border(attrs), 'border', 'selector');
    const s = boxShadow(attrs);
    if (s) out.shadow = s;
    common(c, out, attrs);
    return c.node('container', out, children);
  };

  /**
   * A row (or a specialty section's columns): its columns side by side with
   * Divi's gutter, stacked on tablets and phones; 80% of the section, up to
   * the content width, by default.
   */
  const row = (
    node: DiviNode,
    inheritedGutter: number,
    share: number,
    parentType?: string,
    sectionAttrs?: DiviAttrs,
  ): CxdBlock => {
    const attrs = withPreset(node);
    const inner = node.tag === 'et_pb_row_inner';
    const specialty = Boolean(sectionAttrs);
    const own = specialty ? sectionAttrs! : attrs;
    const gutter =
      on(own.use_custom_gutter) && Number(own.gutter_width) >= 1
        ? Math.min(4, Math.round(Number(own.gutter_width)))
        : inheritedGutter;
    const margin = GUTTER_MARGIN[gutter] ?? 5.5;
    const columns = node.children.filter((child) => /^et_pb_column(_inner)?$/.test(child.tag));
    const parentFraction = inner ? fraction(parentType) : 1;
    const fractions = columns.map((col) => {
      const type = str(col.attrs.type);
      return inner
        ? type
          ? fraction(type) / parentFraction
          : 1 / columns.length
        : fraction(type || '4_4');
    });
    // Inner rows: the gutter is the row's, as a share of the column.
    const g = inner ? margin / parentFraction : margin;
    const out: Settings = {
      content_width: 'full',
      flex_direction: 'row',
      'flex_direction@tablet': 'column',
      gap: { size: round(g), unit: '%' },
      'gap@tablet': { size: gutter === 1 ? 0 : 30, unit: 'px' },
      align_items: on(own.make_equal) ? 'stretch' : 'flex-start',
      'align_items@tablet': 'stretch',
    };
    // Quarter (and smaller) columns go two by two on tablets, as in Divi.
    if (!inner && columns.length >= 4 && fractions.every((f) => f <= 0.25)) {
      out['flex_direction@tablet'] = 'row';
      out['flex_wrap@tablet'] = 'wrap';
      out['flex_direction@mobile'] = 'column';
    }
    // Width: 80% up to the content width (rows), the whole column (inner rows).
    const widthName = specialty ? 'inner_width' : 'width';
    const maxName = specialty ? 'inner_max_width' : 'max_width';
    if (!inner) {
      out.width = { size: 80, unit: '%' };
      out._max_width = { size: contentWidth, unit: 'px' };
    }
    perDevice(out, own, widthName, 'width', (v) => length(v));
    perDevice(out, own, maxName, '_max_width', (v) =>
      v === 'none' ? { size: 100, unit: '%' } : length(v),
    );
    const alignment = responsive(own, specialty ? 'inner_module_alignment' : 'module_alignment');
    for (const device of DIVI_DEVICES) {
      const value = alignment[device];
      if (value === 'left') out[`_align_self${FRESCO_SUFFIX[device]}`] = 'flex-start';
      else if (value === 'right') out[`_align_self${FRESCO_SUFFIX[device]}`] = 'flex-end';
      else if (value === 'center' && device !== 'desktop')
        out[`_align_self${FRESCO_SUFFIX[device]}`] = 'center';
    }
    if (!specialty) {
      perDevice(out, attrs, 'min_height', 'min_height', (v) => length(v));
      const vertical = rowPadding;
      spacing(
        out,
        attrs,
        'custom_padding',
        '_padding',
        'padding',
        // Rows and inner rows alike (Divi's `.et_pb_row, .et_pb_column .et_pb_row_inner`).
        {
          desktop: [`${vertical}%`, '0', `${vertical}%`, '0'],
          tablet: ['30px', '0', '30px', '0'],
          phone: ['30px', '0', '30px', '0'],
        },
        true,
      );
      spacing(out, attrs, 'custom_margin', '_margin', 'margin', same(ZERO));
      background(c, out, attrs, { to: 'background', overlay: true });
      applyBorder(out, border(attrs), 'border', 'selector');
      const s = boxShadow(attrs);
      if (s) out.shadow = s;
      common(c, out, attrs);
    } else {
      out._padding = { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true };
    }
    const children = columns.map((col, i) => {
      const colAttrs = columnAttrs(own, i, withPreset(col));
      const f = fractions[i]!;
      const width = gutter === 1 ? f * 100 : f * (100 + g) - g;
      return column(col, colAttrs, width, gutter, (share * width) / 100);
    });
    return c.node('container', out, children);
  };

  /** A section: full width, Divi's padding, its background; its rows (or columns) inside. */
  const section = (node: DiviNode): CxdBlock => {
    const attrs = withPreset(node);
    const fullwidth = on(attrs.fullwidth);
    const specialty = on(attrs.specialty);
    const out: Settings = {
      content_width: 'full',
      flex_direction: 'column',
      gap: { size: 0, unit: 'px' },
    };
    if (!fullwidth) out.align_items = 'center';
    const padding = fullwidth
      ? same(ZERO)
      : {
          desktop: [`${sectionPadding}%`, '0', `${sectionPadding}%`, '0'] as Sides,
          tablet: ['50px', '0', '50px', '0'] as Sides,
          phone: ['50px', '0', '50px', '0'] as Sides,
        };
    spacing(out, attrs, 'custom_padding', '_padding', 'padding', padding, true);
    spacing(out, attrs, 'custom_margin', '_margin', 'margin', same(ZERO));
    perDevice(out, attrs, 'min_height', 'min_height', (v) => length(v));
    perDevice(out, attrs, 'width', 'width', (v) => length(v));
    perDevice(out, attrs, 'max_width', '_max_width', (v) => (v === 'none' ? undefined : length(v)));
    background(c, out, attrs, { to: 'background', fallback: '#ffffff', overlay: true });
    applyBorder(out, border(attrs), 'border', 'selector');
    const s = boxShadow(attrs);
    if (s) out.shadow = s;
    common(c, out, attrs);
    dividers(out, attrs);
    let children: CxdBlock[];
    if (fullwidth) {
      children = node.children.flatMap((child) => module(child, null, 100));
    } else if (specialty) {
      const implied: DiviNode = {
        tag: 'et_pb_row',
        attrs: {},
        children: node.children,
        content: '',
      };
      children = [row(implied, pageGutter, 100, undefined, attrs)];
    } else {
      children = node.children.flatMap((child) =>
        child.tag === 'et_pb_row' || child.tag === 'et_pb_row_inner'
          ? on(withPreset(child).disabled)
            ? []
            : [row(child, pageGutter, 100)]
          : module(child, null, 100),
      );
    }
    return c.node('container', out, children);
  };

  /** Divi's section dividers (top and bottom): Fresco's shape dividers, the closest shape. */
  const dividers = (out: Settings, attrs: DiviAttrs) => {
    for (const edge of ['top', 'bottom'] as const) {
      const style = str(attrs[`${edge}_divider_style`]);
      if (!style || style === 'none') continue;
      const shape = DIVIDER_SHAPES[style];
      if (!shape) {
        c.note(`the section divider "${style}" has no counterpart and was left out`);
        continue;
      }
      out[`shape_${edge}`] = shape.name;
      out[`shape_${edge}_color`] =
        color(attrs[`${edge}_divider_color`]) ?? layout.accent ?? '#2ea3f2';
      const height = length(attrs[`${edge}_divider_height`]);
      out[`shape_${edge}_height`] =
        height && height.unit === 'px' ? height : { size: 100, unit: 'px' };
      perDevice(out, attrs, `${edge}_divider_height`, `shape_${edge}_height`, (v) => {
        const value = length(v);
        return value && value.unit === 'px' ? value : undefined;
      });
      // Divi draws its shapes pointing out of the section: Fresco's are the other way round.
      const flip = str(attrs[`${edge}_divider_flip`]);
      if (shape.flip !== flip.includes('horizontal')) out[`shape_${edge}_flip`] = true;
      if (shape.negative) out[`shape_${edge}_negative`] = true;
      if (str(attrs[`${edge}_divider_arrangement`]) === 'above_content')
        out[`shape_${edge}_front`] = true;
      const repeat = length(attrs[`${edge}_divider_repeat`]);
      if (repeat && repeat.size > 1) c.note('repeated section dividers are drawn once');
    }
  };

  const blocks = tree.flatMap((node) => {
    if (node.tag === 'et_pb_section') return on(withPreset(node).disabled) ? [] : [section(node)];
    // A layout of rows or modules only (a library item): in a section of its own.
    if (node.tag === 'et_pb_row' || node.tag === 'et_pb_row_inner') {
      const wrapper: DiviNode = { tag: 'et_pb_section', attrs: {}, children: [node], content: '' };
      return [section(wrapper)];
    }
    if (node.tag.startsWith('et_pb_column')) return [];
    const wrapper: DiviNode = {
      tag: 'et_pb_section',
      attrs: {},
      children: [
        {
          tag: 'et_pb_row',
          attrs: {},
          children: [
            { tag: 'et_pb_column', attrs: { type: '4_4' }, children: [node], content: '' },
          ],
          content: '',
        },
      ],
      content: '',
    };
    return [section(wrapper)];
  });

  for (const [type, n] of unknown) {
    ctx.unconverted?.(type, n);
    ctx.warn(`${n} Divi module(s) "${type}" have no Fresco counterpart yet: their text was kept.`);
  }
  for (const [text, n] of notes) ctx.warn(`${text}${n > 1 ? ` (${n}×)` : ''}.`);
  return blocks;
}

/**
 * Divi's section dividers → Fresco's shapes: the name, whether it is drawn
 * flipped and inverted to look like Divi's.
 */
const DIVIDER_SHAPES: Record<string, { name: string; flip: boolean; negative?: boolean }> = {
  arrow: { name: 'arrow', flip: false },
  arrow2: { name: 'arrow', flip: false },
  arrow3: { name: 'arrow', flip: false },
  asymmetric: { name: 'triangle-asymmetrical', flip: false },
  asymmetric2: { name: 'triangle-asymmetrical', flip: true },
  asymmetric3: { name: 'mountains', flip: false },
  asymmetric4: { name: 'mountains', flip: true },
  clouds: { name: 'clouds', flip: false },
  clouds2: { name: 'clouds', flip: true },
  curve: { name: 'curve', flip: false },
  curve2: { name: 'curve-asymmetrical', flip: false },
  graph: { name: 'opacity-tilt', flip: false },
  graph2: { name: 'opacity-tilt', flip: true },
  graph3: { name: 'tilt', flip: false },
  graph4: { name: 'tilt', flip: true },
  mountains: { name: 'mountains', flip: false },
  mountains2: { name: 'mountains', flip: true },
  ramp: { name: 'tilt', flip: false },
  ramp2: { name: 'tilt', flip: true },
  slant: { name: 'tilt', flip: false },
  slant2: { name: 'tilt', flip: true },
  triangle: { name: 'triangle', flip: false },
  wave: { name: 'waves', flip: false },
  wave2: { name: 'waves', flip: true },
  waves: { name: 'waves-layered', flip: false },
  waves2: { name: 'waves-layered', flip: true },
  zigzag: { name: 'zigzag', flip: false },
};

/** The device of a media query of Divi's page CSS (its breakpoints: 980px and 767px). */
function cssDevice(query: string): 'desktop' | 'tablet' | 'mobile' | null {
  if (!query) return 'desktop';
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);
  if (min && !max && Number(min[1]) >= 768) return 'desktop';
  if (max && !min) {
    const n = Number(max[1]);
    return n >= 768 ? 'tablet' : 'mobile';
  }
  return null;
}

/**
 * A page's custom CSS (Divi's page settings): the rules that give Divi's
 * galleries their number of columns (`.my-class .et_pb_gallery_item {
 * width: 16.66% }`, per media query) become the columns of the galleries
 * with that class; the rest is returned, for the page's custom CSS.
 */
export function diviPageCss(blocks: CxdBlock[], css: string): string {
  const columns = new Map<string, Record<string, number>>();
  const rule = /([^{}@]*?)\.et_pb_gallery_item\s*\{([^{}]*)\}/g;
  const take = (body: string, device: string): string =>
    body.replace(rule, (whole, selector: string, declarations: string) => {
      const cls = /\.([\w-]+)\s*$/.exec(selector.trim())?.[1];
      const width = /(?:^|;)\s*width\s*:\s*([\d.]+)%/.exec(declarations)?.[1];
      if (!cls || !width || !device) return whole;
      const n = Math.max(1, Math.min(10, Math.round(100 / Number(width))));
      const own = columns.get(cls) ?? {};
      // The widest media query of a device wins (phones: 767px over 479px).
      if (own[device] === undefined) own[device] = n;
      columns.set(cls, own);
      return '';
    });
  let rest = css.replace(
    /@media\s*([^{]*)\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g,
    (whole, query: string, body: string) => {
      const device = cssDevice(query.replace(/[()]/g, ' ').trim());
      if (!device) return whole;
      const left = take(body, device);
      return left.replace(/\/\*[\s\S]*?\*\//g, '').trim() ? `@media ${query.trim()}{${left}}` : '';
    },
  );
  rest = take(rest, 'desktop');
  if (columns.size === 0) return css.trim();
  const walk = (list: CxdBlock[]) => {
    for (const block of list) {
      if (block.type === 'fresco/gallery') {
        const classes = str(block.attrs._css_classes).split(/\s+/);
        for (const cls of classes) {
          const found = columns.get(cls);
          if (!found) continue;
          for (const [device, n] of Object.entries(found))
            block.attrs[device === 'desktop' ? 'columns' : `columns@${device}`] = n;
        }
      }
      if (block.children) walk(block.children);
    }
  };
  walk(blocks);
  return rest
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@media[^{]*\{\s*\}/g, '')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
