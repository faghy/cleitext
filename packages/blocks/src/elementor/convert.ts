/**
 * Pages built with Elementor (`_elementor_data`) become Fresco pages:
 * sections, columns and containers become Fresco containers, widgets their
 * Fresco (and Fresco Pro) counterparts with their settings: texts, links,
 * images, colors (global ones too), typography, spacing, per-device values,
 * hover states, motion effects and dynamic tags. Where Elementor's defaults
 * differ from Fresco's, the value is written explicitly so the page looks
 * the same. Widgets with no counterpart keep their text and are reported.
 */
import { newBlockId } from '../block-id.js';
import type { CxdBlock } from '../cxd.js';
import { shortcodePlaceholder, splitShortcodes } from '../html/shortcodes.js';
import { atomicElement, isAtomic, type ComponentInfo } from './atomic.js';
import { proWidget } from './pro.js';
import {
  asSettings,
  DEVICE_NAMES,
  DEVICES,
  box,
  color,
  colorOf,
  copy,
  dynamicTag,
  evenBox,
  fa4Icon,
  hasLineHeight,
  isColor,
  icon,
  itemLink,
  link,
  list,
  mediaValue,
  num,
  parseDynamic,
  shadow,
  size,
  str,
  typography,
  yes,
  type BoxValue,
  type Notes,
  type Settings,
} from './values.js';

export type { Settings } from './values.js';

export interface ElementorNode {
  id?: string;
  elType?: string;
  widgetType?: string;
  isInner?: boolean;
  settings?: Settings | unknown[];
  elements?: ElementorNode[];
  /** Global widgets: the template they show. */
  templateID?: number | string;
  /** Atomic elements: their local styles. */
  styles?: Record<string, unknown> | unknown[];
  /** Atomic elements: their interactions (Elementor 4), as JSON or as data. */
  interactions?: unknown;
}

/** What the kit says about defaults the conversion needs. */
export interface ElementorKitInfo {
  /** Default padding of containers (`container_padding`; Elementor's own is 10px). */
  containerPadding?: BoxValue;
  /** Global fonts (ids) that set a line height. */
  fontsWithLine?: string[];
}

export interface ElementorContext {
  /** WordPress attachment id → media ref of the transfer document. */
  mediaRef: (attachment: number) => string | undefined;
  warn: (message: string) => void;
  /** WordPress post id → entry ref (templates, popups), when it is imported. */
  entryRef?: (post: number) => string | undefined;
  /** A WordPress term by taxonomy and id → its Cleitext taxonomy and slug. */
  term?: (taxonomy: string, id: number) => { taxonomy: string; slug: string } | undefined;
  /** A WordPress post type → its Cleitext content type. */
  typeSlug?: (type: string) => string | undefined;
  /** A WordPress menu (id or slug) → the menu location given to it. */
  menuLocation?: (menu: string) => string | undefined;
  /** Font families used by the page (to load them). */
  font?: (family: string) => void;
  /** Address of the old site: links to it become paths of this one. */
  origin?: string;
  /** Spam protection given to every converted form (Fresco Pro's `captcha`). */
  formCaptcha?: 'site' | 'turnstile';
  /** Called for each form given that protection (to count them). */
  protectedForm?: () => void;
  kit?: ElementorKitInfo;
  /** Elementor 4 components (by post id), for their instances. */
  components?: Map<string, ComponentInfo>;
  /** Keep each atomic element's Elementor id (`__elementor_id`), when converting a component. */
  keepElementIds?: boolean;
  /** Widgets without a counterpart (their text is kept), by type, once per conversion. */
  unconverted?: (type: string, count: number) => void;
}

/** The tools widget converters share. */
export interface Converter extends Notes {
  ctx: ElementorContext;
  node(type: string, attrs: Settings, children?: CxdBlock[]): CxdBlock;
  media(value: unknown): Settings | undefined;
  icon(value: unknown): Settings | undefined;
  /** Elementor's dynamic tag on a setting → Fresco Pro's on another one. */
  dynamic(out: Settings, src: Settings, from: string, to: string, kind: DynamicKind): void;
  /** Converts child elements (nested widgets). */
  children(el: ElementorNode): CxdBlock[];
  element(el: ElementorNode): CxdBlock[];
  /** Counts a widget without a counterpart. */
  unknown(type: string): void;
  typography(out: Settings, src: Settings, from: string, to: string): void;
}

export type DynamicKind = 'text' | 'richtext' | 'url' | 'media';

/** Elementor entrance animations → Fresco's (the closest one). */
export const ANIMATIONS: Record<string, string> = {
  fadeIn: 'fade-in',
  fadeInUp: 'fade-up',
  fadeInDown: 'fade-down',
  fadeInLeft: 'fade-left',
  fadeInRight: 'fade-right',
  zoomIn: 'zoom-in',
  zoomInUp: 'zoom-in-up',
  zoomInDown: 'zoom-in-down',
  zoomInLeft: 'zoom-in-left',
  zoomInRight: 'zoom-in-right',
  zoomOut: 'zoom-out',
  slideInUp: 'slide-up',
  slideInDown: 'slide-down',
  slideInLeft: 'slide-left',
  slideInRight: 'slide-right',
  bounceIn: 'bounce-in',
  bounceInUp: 'bounce-in-up',
  bounceInDown: 'bounce-in-down',
  bounceInLeft: 'bounce-in-left',
  bounceInRight: 'bounce-in-right',
  rotateIn: 'rotate-in',
  rotateInDownLeft: 'rotate-in-down-left',
  rotateInDownRight: 'rotate-in-down-right',
  rotateInUpLeft: 'rotate-in-up-left',
  rotateInUpRight: 'rotate-in-up-right',
  rollIn: 'roll-in',
  flipInX: 'flip-x',
  flipInY: 'flip-y',
  lightSpeedIn: 'light-speed-in',
  bounce: 'bounce',
  flash: 'flash',
  pulse: 'pulse',
  rubberBand: 'rubber-band',
  shake: 'shake',
  headShake: 'head-shake',
  swing: 'swing',
  tada: 'tada',
  wobble: 'wobble',
  jello: 'jello',
};

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'p']);

const BLEND_MODES = new Set([
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'saturation',
  'color',
  'difference',
  'exclusion',
  'hue',
  'luminosity',
]);

/** Elementor's logical positions (nested tabs) → Fresco's sides. */
const SIDES: Record<string, string> = {
  'block-start': 'top',
  'block-end': 'bottom',
  'inline-start': 'left',
  'inline-end': 'right',
};

/** Inline HTML of a title (headings keep plain text with line breaks). */
export function plainTitle(html: string): { text: string; formatted: boolean } {
  const formatted = /<(strong|b|em|i|span|a|u|mark|sup|sub|font)\b/i.test(html);
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
  return { text, formatted };
}

/** Adds a rule to an element's custom CSS (Fresco Pro), `selector` being the element. */
export function addCss(out: Settings, css: string): void {
  const current = str(out._custom_css);
  out._custom_css = current ? `${current}\n${css}` : css;
}

/**
 * Shortcodes standing alone in a text, HTML or shortcode widget (on their
 * own line or paragraph) become placeholders that active plugins may turn
 * into their blocks on import (the `import.shortcode` filter), each inside a
 * plugin block element with the widget's Advanced settings. The rest of the
 * widget stays a widget of its own; a shortcode no plugin takes stays the
 * widget it was. Null when the widget has no such shortcode.
 */
export function withShortcodes(element: CxdBlock, field: 'content' | 'code'): CxdBlock[] | null {
  const value = element.attrs[field];
  if (typeof value !== 'string' || element.attrs.__dynamic) return null;
  const pieces = splitShortcodes(value);
  if (!pieces.some((piece) => 'shortcode' in piece)) return null;
  return pieces.map((piece, i) => {
    // One element keeps the CSS id.
    const attrs = { ...element.attrs };
    if (i > 0) delete attrs._css_id;
    const copy = (text: string): CxdBlock => ({
      ...element,
      id: newBlockId(),
      attrs: { ...attrs, [field]: text },
    });
    if ('html' in piece) return copy(piece.html);
    const { text } = piece.shortcode;
    const advanced = Object.fromEntries(
      Object.entries(attrs).filter(([key]) => key.startsWith('_') && !key.startsWith('__')),
    );
    return shortcodePlaceholder(
      piece.shortcode,
      [copy(field === 'code' ? text : `<p>${text}</p>`)],
      { type: 'fresco/block', v: 1, attrs: advanced },
    );
  });
}

// ---- Settings every element has ------------------------------------------------------------

/** Background group → Fresco background group, classic and gradient (per device images). */
function background(c: Converter, out: Settings, src: Settings, from: string, to: string): string {
  const type = str(src[`${from}_background`]);
  if (type !== 'classic' && type !== 'gradient') return type;
  out[`${to}_type`] = type;
  color(out, src, `${from}_color`, `${to}_color`);
  if (type === 'classic') {
    copy(out, src, `${from}_image`, `${to}_image`, (v) => c.media(v));
    // "Custom" (Elementor's `initial`): X and Y positions, and a width.
    copy(out, src, `${from}_position`, `${to}_position`, (v) =>
      str(v) === 'initial' ? 'custom' : str(v) ? str(v).replace(/-/g, ' ') : undefined,
    );
    copy(out, src, `${from}_xpos`, `${to}_xpos`, (v) => size(v));
    copy(out, src, `${from}_ypos`, `${to}_ypos`, (v) => size(v));
    copy(out, src, `${from}_repeat`, `${to}_repeat`);
    copy(out, src, `${from}_size`, `${to}_size`, (v) =>
      str(v) === 'initial' ? 'custom' : str(v) || undefined,
    );
    copy(out, src, `${from}_bg_width`, `${to}_bg_width`, (v) => size(v));
    if (str(src[`${from}_attachment`])) out[`${to}_attachment`] = str(src[`${from}_attachment`]);
  } else {
    color(out, src, `${from}_color_b`, `${to}_color_b`);
    // Elementor's default second color.
    if (!out[`${to}_color_b`]) out[`${to}_color_b`] = '#f2295b';
    // Locations, angle and radial position: per device.
    copy(out, src, `${from}_color_stop`, `${to}_stop`, (v) => size(v));
    copy(out, src, `${from}_color_b_stop`, `${to}_stop_b`, (v) => size(v));
    if (src[`${from}_gradient_type`] === 'radial') out[`${to}_gradient`] = 'radial';
    copy(out, src, `${from}_gradient_angle`, `${to}_angle`, (v) => size(v));
    copy(out, src, `${from}_gradient_position`, `${to}_gradient_position`, (v) =>
      /^(center|top|bottom) (center|left|right)$/.test(str(v)) ? str(v) : undefined,
    );
  }
  return type;
}

/** Elementor's Text Shadow group (`<name>_text_shadow_type`) → Fresco's. */
function textShadow(out: Settings, src: Settings, from: string, to: string): void {
  if (src[`${from}_text_shadow_type`] !== 'yes') return;
  const v = asSettings(src[`${from}_text_shadow`]);
  const shadowColor = str(v.color);
  out[to] = {
    x: num(v.horizontal) ?? 0,
    y: num(v.vertical) ?? 0,
    blur: num(v.blur) ?? 10,
    color: isColor(shadowColor) ? shadowColor : 'rgba(0,0,0,0.3)',
  };
}

/** Elementor's Text Stroke group → Fresco's width (`to`, per device) and color (`to_color`). */
function textStroke(out: Settings, src: Settings, from: string, to: string): void {
  if (src[`${from}_text_stroke_type`] !== 'yes') return;
  copy(out, src, `${from}_text_stroke`, to, (v) => size(v));
  color(out, src, `${from}_stroke_color`, `${to}_color`);
  // Elementor's default stroke color.
  if (!out[`${to}_color`]) out[`${to}_color`] = '#000';
}

/** Elementor's CSS Filters group (`<name>_css_filter: custom`) → Fresco's filters group. */
function cssFilters(out: Settings, src: Settings, from: string, to: string): void {
  if (src[`${from}_css_filter`] !== 'custom') return;
  const units: Record<string, string> = {
    blur: 'px',
    brightness: '%',
    contrast: '%',
    saturate: '%',
    hue: 'deg',
  };
  for (const [part, unit] of Object.entries(units)) {
    const n = num(asSettings(src[`${from}_${part}`]).size);
    if (n !== null) out[`${to}_${part}`] = { size: n, unit };
  }
}

/** Elementor's hover animations: all of them have a Fresco counterpart of the same name. */
const HOVER_ANIMATIONS = new Set([
  'grow',
  'shrink',
  'pulse',
  'pulse-grow',
  'pulse-shrink',
  'push',
  'pop',
  'bounce-in',
  'bounce-out',
  'rotate',
  'grow-rotate',
  'float',
  'sink',
  'bob',
  'hang',
  'skew',
  'skew-forward',
  'skew-backward',
  'wobble-vertical',
  'wobble-horizontal',
  'wobble-to-bottom-right',
  'wobble-to-top-right',
  'wobble-top',
  'wobble-bottom',
  'wobble-skew',
  'buzz',
  'buzz-out',
]);

function hoverAnimation(out: Settings, src: Settings, from = 'hover_animation'): void {
  if (HOVER_ANIMATIONS.has(str(src[from]))) out.hover_effect = str(src[from]);
}

/** A duration slider in seconds (Elementor's may be in ms). */
const duration = (v: unknown) => {
  const n = num(asSettings(v).size);
  if (n === null) return undefined;
  return { size: asSettings(v).unit === 'ms' ? n / 1000 : n, unit: 's' };
};

/** A background group's color only (Elementor's `<name>_color` with `<name>_background: classic`). */
function groupColor(out: Settings, src: Settings, from: string, to: string): void {
  const value = colorOf(src, `${from}_color`);
  if (value && str(src[`${from}_background`]) !== 'gradient') out[to] = value;
}

function border(out: Settings, src: Settings, from: string, to: string): void {
  const style = str(src[`${from}_border`]);
  if (style && style !== 'default') {
    out[`${to}_style`] = style;
    copy(out, src, `${from}_width`, `${to}_width`, (v) => box(v));
    color(out, src, `${from}_color`, `${to}_color`);
  }
  copy(out, src, `${from}_radius`, `${to}_radius`, (v) => box(v));
}

/** Motion effects, sticky, custom CSS and attributes (Fresco Pro's Advanced settings). */
function proAdvanced(c: Converter, out: Settings, src: Settings): void {
  const fx = 'motion_fx_';
  if (yes(src[`${fx}motion_fx_scrolling`])) {
    const speed = (effect: string, fallback = 4) =>
      num(asSettings(src[`${fx}${effect}_speed`]).size) ?? fallback;
    const range = asSettings(asSettings(src[`${fx}translateY_affectedRange`]).sizes);
    let any = false;
    if (yes(src[`${fx}translateY_effect`])) {
      const s = speed('translateY');
      out._motion_y = src[`${fx}translateY_direction`] === 'negative' ? -s : s;
      any = true;
    }
    if (yes(src[`${fx}translateX_effect`])) {
      const s = speed('translateX');
      out._motion_x = src[`${fx}translateX_direction`] === 'negative' ? -s : s;
      any = true;
    }
    const fade = (direction: unknown) =>
      direction === 'in-out'
        ? 'out'
        : direction === 'out-in-out' || direction === 'in-out-in'
          ? 'in-out'
          : 'in';
    if (yes(src[`${fx}opacity_effect`])) {
      out._motion_fade = fade(src[`${fx}opacity_direction`]);
      any = true;
    }
    if (yes(src[`${fx}blur_effect`])) {
      out._motion_blur = src[`${fx}blur_direction`] === 'in-out' ? 'out' : 'in';
      any = true;
    }
    if (yes(src[`${fx}rotateZ_effect`])) {
      const s = speed('rotateZ', 1) * 36;
      out._motion_rotate = src[`${fx}rotateZ_direction`] === 'negative' ? -s : s;
      any = true;
    }
    if (yes(src[`${fx}scale_effect`])) {
      // Elementor scales up from the element's own size: 1 + speed × progress / 10.
      const direction = str(src[`${fx}scale_direction`]) || 'out-in';
      out._motion_scale =
        direction === 'in-out'
          ? 'down'
          : direction === 'out-in-out'
            ? 'up-down'
            : direction === 'in-out-in'
              ? 'down-up'
              : 'up';
      out._motion_scale_speed = speed('scale');
      any = true;
    }
    if (any) {
      out._motion_scroll = true;
      const start = num(range.start);
      const end = num(range.end);
      if (start !== null && end !== null && (start !== 0 || end !== 100)) {
        out._motion_range = `${start}-${end}`;
      }
    }
  }
  if (yes(src[`${fx}motion_fx_mouse`])) {
    if (yes(src[`${fx}mouseTrack_effect`])) {
      out._motion_mouse = 'track';
      out._motion_mouse_speed = Math.max(
        1,
        Math.min(10, Math.round(num(asSettings(src[`${fx}mouseTrack_speed`]).size) ?? 3)),
      );
    } else if (yes(src[`${fx}tilt_effect`])) {
      out._motion_mouse = 'tilt';
      out._motion_mouse_speed = Math.max(
        1,
        Math.min(10, Math.round(num(asSettings(src[`${fx}tilt_speed`]).size) ?? 3)),
      );
    }
  }
  const sticky = str(src.sticky);
  if (sticky === 'top' || sticky === 'bottom') {
    out._sticky = sticky;
    if (num(src.sticky_offset)) out._sticky_offset = num(src.sticky_offset);
    if (yes(src.sticky_parent)) out._sticky_parent = true;
    const on = Array.isArray(src.sticky_on) ? src.sticky_on : ['desktop', 'tablet', 'mobile'];
    if (!on.includes('mobile')) out._sticky_mobile = false;
    if (num(src.sticky_effects_offset)) out._sticky_shrink = true;
  }
  if (str(src.custom_css).trim()) addCss(out, str(src.custom_css).trim());
  if (str(src._attributes).trim()) out._attributes = str(src._attributes).trim();
  if (src.e_display_conditions && JSON.stringify(src.e_display_conditions).length > 4) {
    c.note('display conditions of elements were not imported');
  }
}

/** Width, order, alignment and position of an element inside its container. */
function flexItem(out: Settings, src: Settings, widget: boolean): void {
  copy(out, src, '_flex_align_self', '_align_self', (v) =>
    ['flex-start', 'center', 'flex-end', 'stretch'].includes(str(v)) ? str(v) : undefined,
  );
  copy(out, src, '_flex_order', '_flex_order', (v) =>
    ['start', 'end', 'custom'].includes(str(v)) ? str(v) : undefined,
  );
  copy(out, src, '_flex_order_custom', '_order', (v) => num(v) ?? undefined);
  copy(out, src, '_flex_size', '_flex_size', (v) =>
    ['none', 'grow', 'shrink', 'custom'].includes(str(v)) ? str(v) : undefined,
  );
  copy(out, src, '_flex_grow', '_flex_grow', (v) => num(v) ?? undefined);
  copy(out, src, '_flex_shrink', '_flex_shrink', (v) => num(v) ?? undefined);
  copy(out, src, '_flex_basis_type', '_flex_basis_type', (v) =>
    v === 'custom' ? 'custom' : undefined,
  );
  copy(out, src, '_flex_basis', '_flex_basis', (v) => size(v));
  // Grid item: the columns and rows it spans, or its own lines.
  for (const axis of ['column', 'row']) {
    copy(out, src, `_grid_${axis}`, `_grid_${axis}`, (v) =>
      /^([1-9]|1[0-2]|custom)$/.test(str(v)) ? str(v) : undefined,
    );
    copy(
      out,
      src,
      `_grid_${axis}_custom`,
      `_grid_${axis}_custom`,
      (v) => str(v).trim() || undefined,
    );
  }
  if (widget) {
    copy(out, src, '_element_width', '_width', (v) =>
      v === 'inherit' ? 'full' : v === 'auto' ? 'auto' : v === 'initial' ? 'custom' : undefined,
    );
    copy(out, src, '_element_custom_width', '_width_custom', (v) => size(v));
  }
  const position = str(src[widget ? '_position' : 'position']);
  if (position === 'absolute' || position === 'fixed') {
    out._position = position;
    const h = src._offset_orientation_h === 'end' ? 'right' : 'left';
    const v = src._offset_orientation_v === 'end' ? 'bottom' : 'top';
    copy(out, src, h === 'right' ? '_offset_x_end' : '_offset_x', `_offset_${h}`, (x) => size(x));
    copy(out, src, v === 'bottom' ? '_offset_y_end' : '_offset_y', `_offset_${v}`, (x) => size(x));
  }
}

/** Elementor's Transform section (Normal and Hover) → Fresco's (shared on/off switches). */
function transform(out: Settings, src: Settings): void {
  const tabs = [
    ['', ''],
    ['_hover', ':hover'],
  ] as const;
  const on = (popover: string, tab: string) =>
    str(src[`_transform_${popover}_popover${tab}`]) !== '';
  const deg = (v: unknown) => {
    const s = size(v);
    return s ? { size: s.size, unit: 'deg' } : undefined;
  };
  const plain = (v: unknown) => {
    const n = num(asSettings(v).size);
    return n === null ? undefined : { size: n, unit: '' };
  };
  // Scale X and Y apart when either state keeps them apart (Elementor's default keeps the proportions).
  const separate = tabs.some(
    ([tab]) => on('scale', tab) && src[`_transform_keep_proportions${tab}`] === '',
  );
  for (const [tab, state] of tabs) {
    const set = (from: string, to: string, value: (v: unknown) => unknown) =>
      copy(out, src, `_transform_${from}${tab}`, `_transform_${to}${state}`, value);
    if (on('rotate', tab)) {
      out._transform_rotate_popover = true;
      set('rotateZ_effect', 'rotateZ_effect', deg);
      if (yes(src[`_transform_rotate_3d${tab}`])) {
        out._transform_rotate_3d = true;
        set('rotateX_effect', 'rotateX_effect', deg);
        set('rotateY_effect', 'rotateY_effect', deg);
        set('perspective_effect', 'perspective_effect', (v) => size(v));
      }
    }
    if (on('translate', tab)) {
      out._transform_translate_popover = true;
      set('translateX_effect', 'translateX_effect', (v) => size(v));
      set('translateY_effect', 'translateY_effect', (v) => size(v));
    }
    if (on('scale', tab)) {
      out._transform_scale_popover = true;
      if (src[`_transform_keep_proportions${tab}`] === '') {
        set('scaleX_effect', 'scaleX_effect', plain);
        set('scaleY_effect', 'scaleY_effect', plain);
      } else if (separate) {
        set('scale_effect', 'scaleX_effect', plain);
        set('scale_effect', 'scaleY_effect', plain);
      } else set('scale_effect', 'scale_effect', plain);
    }
    if (on('skew', tab)) {
      out._transform_skew_popover = true;
      set('skewX_effect', 'skewX_effect', deg);
      set('skewY_effect', 'skewY_effect', deg);
    }
    for (const axis of ['X', 'Y']) {
      if (str(src[`_transform_flip${axis}_effect${tab}`])) {
        out[`_transform_flip${axis}_effect${state}`] = true;
      }
    }
  }
  if (separate) out._transform_scale_separate = true;
  const any = Object.keys(out).some((key) => key.startsWith('_transform_'));
  if (!any) return;
  const duration = num(asSettings(src._transform_transition_hover).size);
  if (duration !== null) out._transform_transition_hover = { size: duration, unit: 'ms' };
  copy(out, src, 'motion_fx_transform_x_anchor_point', '_transform_origin_x', (v) =>
    ['left', 'center', 'right'].includes(str(v)) ? str(v) : undefined,
  );
  copy(out, src, 'motion_fx_transform_y_anchor_point', '_transform_origin_y', (v) =>
    ['top', 'center', 'bottom'].includes(str(v)) ? str(v) : undefined,
  );
}

/** A number on its own (not `1fr 2fr`, which parses as 1). */
const plainNumber = (v: unknown) => /^\s*-?\d+(\.\d+)?\s*$/.test(str(v));

/** A transition duration in seconds (Elementor's hover transitions). */
const seconds = (v: unknown) => {
  const n = num(asSettings(v).size);
  return n === null ? undefined : { size: n, unit: 's' };
};

/**
 * Border, radius and shadow on hover, and the durations of the hover changes
 * (`from` and `to`: `_` for widgets, `` for sections, columns and containers).
 */
function hoverBorder(out: Settings, src: Settings, from: string, to: string): void {
  border(out, src, `${from}border_hover`, `${to}border_hover`);
  // The hover radius is a setting of its own in Elementor.
  copy(out, src, `${from}border_radius_hover`, `${to}border_hover_radius`, (v) => box(v));
  const s = shadow(src, `${from}box_shadow_hover`);
  if (s) out[`${to}shadow_hover`] = s;
  copy(
    out,
    src,
    `${from}background_hover_transition`,
    `${to}background_hover_transition`,
    seconds,
    false,
  );
  copy(out, src, `${from}border_hover_transition`, `${to}border_hover_transition`, seconds, false);
}

/** Elementor's Mask section → Fresco's (the same shapes, drawn by Fresco). */
function mask(c: Converter, out: Settings, src: Settings): void {
  if (!yes(src._mask_switch)) return;
  out._mask_switch = true;
  const shape = str(src._mask_shape) || 'circle';
  out._mask_shape = MASK_SHAPES.has(shape) ? shape : 'circle';
  if (shape === 'custom') copy(out, src, '_mask_image', '_mask_image', (v) => c.media(v));
  copy(out, src, '_mask_size', '_mask_size', (v) =>
    ['contain', 'cover', 'custom'].includes(str(v)) ? str(v) : undefined,
  );
  copy(out, src, '_mask_size_scale', '_mask_size_scale', (v) => size(v));
  copy(out, src, '_mask_position', '_mask_position', (v) =>
    /^((center|top|bottom) (center|left|right)|custom)$/.test(str(v)) ? str(v) : undefined,
  );
  copy(out, src, '_mask_position_x', '_mask_position_x', (v) => size(v));
  copy(out, src, '_mask_position_y', '_mask_position_y', (v) => size(v));
  copy(out, src, '_mask_repeat', '_mask_repeat', (v) =>
    ['no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'round', 'space'].includes(str(v))
      ? str(v)
      : undefined,
  );
}

const MASK_SHAPES = new Set([
  'circle',
  'oval-vertical',
  'oval-horizontal',
  'pill-vertical',
  'pill-horizontal',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon-vertical',
  'hexagon-horizontal',
  'heptagon',
  'octagon',
  'parallelogram-right',
  'parallelogram-left',
  'trapezoid-up',
  'trapezoid-down',
  'flower',
  'sketch',
  'hexagon',
  'blob',
  'custom',
]);

/** The Advanced tab of a widget (spacing, background, border, motion…). */
function widgetCommon(c: Converter, out: Settings, src: Settings): void {
  copy(out, src, '_margin', '_margin', (v) => box(v, c));
  copy(out, src, '_padding', '_padding', (v) => box(v, c));
  copy(out, src, '_z_index', '_z_index', num);
  if (str(src._element_id)) out._css_id = str(src._element_id);
  if (str(src._css_classes)) out._css_classes = str(src._css_classes);
  entrance(out, src, '_animation', '_animation_delay');
  hide(out, src);
  background(c, out, src, '_background', '_background');
  background(c, out, src, '_background_hover', '_background_hover');
  border(out, src, '_border', '_border');
  const s = shadow(src, '_box_shadow');
  if (s) out._shadow = s;
  hoverBorder(out, src, '_', '_');
  flexItem(out, src, true);
  transform(out, src);
  mask(c, out, src);
  proAdvanced(c, out, src);
}

function entrance(out: Settings, src: Settings, key: string, delayKey: string): void {
  const animation = ANIMATIONS[str(src[key])];
  // Per device: its own animation, or none.
  let devices = false;
  for (const [suffix, target] of DEVICES.slice(1)) {
    const value = str(src[`${key}${suffix}`]);
    const own = value === 'none' ? 'none' : ANIMATIONS[value];
    if (own) {
      out[`_animation${target}`] = own;
      devices ||= own !== 'none';
    }
  }
  if (!animation && !devices) return;
  if (animation) out._animation = animation;
  const delay = num(src[delayKey]);
  if (delay) out._animation_delay = delay;
  const duration = str(src.animation_duration);
  if (duration === 'slow' || duration === 'fast') out._animation_duration = duration;
}

function hide(out: Settings, src: Settings): void {
  for (const device of DEVICE_NAMES) {
    const value = str(src[`hide_${device}`]);
    if (value.startsWith('hidden-') || value === 'yes') out[`_hide_${device}`] = true;
  }
}

/** The icon of an old social icon (Elementor 1/2: `social: 'fa fa-facebook'`, Font Awesome 4). */
function legacySocial(value: unknown): Settings | undefined {
  const name = /\bfa-([\w-]+)/.exec(str(value))?.[1];
  return name ? ({ ...fa4Icon(name) } as Settings) : undefined;
}

/** Shapes Fresco's containers draw: all of Elementor's, under the same names. */
const SHAPES = new Set([
  'mountains',
  'drops',
  'clouds',
  'zigzag',
  'pyramids',
  'triangle',
  'triangle-asymmetrical',
  'tilt',
  'opacity-tilt',
  'opacity-fan',
  'curve',
  'curve-asymmetrical',
  'waves',
  'wave-brush',
  'waves-pattern',
  'arrow',
  'split',
  'book',
]);

/** Elementor's shape dividers → Fresco's (shape, color, size, flip, invert, in front). */
function shapeDividers(c: Converter, out: Settings, src: Settings): void {
  for (const edge of ['top', 'bottom']) {
    const from = `shape_divider_${edge}`;
    const shape = str(src[from]);
    if (!shape) continue;
    if (!SHAPES.has(shape)) {
      c.note(`shape dividers "${shape}" were not imported`);
      continue;
    }
    const to = `shape_${edge}`;
    out[to] = shape;
    color(out, src, `${from}_color`, `${to}_color`);
    copy(out, src, `${from}_width`, `${to}_width`, (v) => size(v));
    copy(out, src, `${from}_height`, `${to}_height`, (v) => size(v));
    if (yes(src[`${from}_flip`])) out[`${to}_flip`] = true;
    if (yes(src[`${from}_negative`])) out[`${to}_negative`] = true;
    if (yes(src[`${from}_above_content`])) out[`${to}_front`] = true;
  }
}

/**
 * The settings of a section, column or container: spacing, background (with
 * overlay, video and slideshow), border, shadow, animation and the rest.
 */
function containerCommon(c: Converter, out: Settings, src: Settings): void {
  copy(out, src, 'margin', '_margin', (v) => box(v, c));
  copy(out, src, 'padding', '_padding', (v) => box(v, c));
  copy(out, src, 'z_index', '_z_index', num);
  if (str(src._element_id)) out._css_id = str(src._element_id);
  if (str(src.css_classes)) out._css_classes = str(src.css_classes);
  entrance(out, src, 'animation', 'animation_delay');
  hide(out, src);
  const type = background(c, out, src, 'background', 'background');
  if (type === 'video') {
    const url = str(src.background_video_link);
    const fallback = c.media(src.background_video_fallback);
    // Files, and YouTube and Vimeo links (Fresco plays them in a frame).
    if (
      /\.(mp4|webm|ogv)(\?.*)?$/i.test(url) ||
      /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)\//i.test(url)
    ) {
      out.background_video = { id: null, url };
      if (yes(src.background_play_on_mobile)) out.background_video_mobile = true;
    } else if (url) {
      c.note('background videos of other sites were replaced by their fallback image');
    }
    if (fallback) {
      out.background_type = 'classic';
      out.background_image = fallback;
      out.background_size = 'cover';
      out.background_position = 'center center';
    }
  } else if (type === 'slideshow') {
    const gallery = list(src.background_slideshow_gallery)
      .map((item) => c.media(item))
      .filter((item): item is Settings => Boolean(item));
    if (gallery.length) out.background_slideshow_gallery = gallery;
    if (src.background_slideshow_loop === '') out.background_slideshow_loop = 'no';
    const slide = num(src.background_slideshow_slide_duration);
    if (slide !== null && slide !== 5000) out.background_slideshow_slide_duration = slide;
    const effect = str(src.background_slideshow_slide_transition);
    if (['slide_right', 'slide_left', 'slide_up', 'slide_down'].includes(effect)) {
      out.background_slideshow_slide_transition = effect;
    }
    const speed = num(src.background_slideshow_transition_duration);
    if (speed !== null && speed !== 500) out.background_slideshow_transition_duration = speed;
    const fit = str(src.background_slideshow_background_size);
    if (fit === 'contain' || fit === 'auto') out.background_slideshow_background_size = fit;
    const position = str(src.background_slideshow_background_position).replace(/-/g, ' ');
    if (
      /^(center|top|bottom) (center|left|right)$/.test(position) &&
      position !== 'center center'
    ) {
      out.background_slideshow_background_position = position;
    }
    if (yes(src.background_slideshow_ken_burns)) {
      out.background_slideshow_ken_burns = true;
      if (src.background_slideshow_ken_burns_zoom_direction === 'out') {
        out.background_slideshow_ken_burns_zoom_direction = 'out';
      }
    }
    if (yes(src.background_slideshow_lazyload)) out.background_slideshow_lazyload = true;
  }
  background(c, out, src, 'background_hover', 'background_hover');
  // Overlay: a color, an image or a gradient (Fresco's overlay background), its
  // opacity, CSS filters and blend mode, and the same on hover.
  const overlay = str(src.background_overlay_background);
  const overlayImage = str(asSettings(src.background_overlay_image).url);
  if (
    overlay === 'gradient' ||
    (overlay === 'classic' && (overlayImage || colorOf(src, 'background_overlay_color')))
  ) {
    background(c, out, src, 'background_overlay', 'overlay_bg');
    const opacity = num(asSettings(src.background_overlay_opacity).size);
    out.overlay_opacity = { size: opacity ?? 0.5, unit: '' };
  }
  const hoverOverlay = str(src.background_overlay_hover_background);
  if (hoverOverlay === 'classic' || hoverOverlay === 'gradient') {
    background(c, out, src, 'background_overlay_hover', 'overlay_hover_bg');
    const opacity = num(asSettings(src.background_overlay_hover_opacity).size);
    out.overlay_hover_opacity = { size: opacity ?? 0.5, unit: '' };
  }
  cssFilters(out, src, 'css_filters', 'overlay_filters');
  cssFilters(out, src, 'css_filters_hover', 'overlay_hover_filters');
  if (BLEND_MODES.has(str(src.overlay_blend_mode))) out.overlay_blend = str(src.overlay_blend_mode);
  copy(
    out,
    src,
    'background_overlay_hover_transition',
    'overlay_hover_transition',
    duration,
    false,
  );
  border(out, src, 'border', 'border');
  const s = shadow(src, 'box_shadow');
  if (s) out.shadow = s;
  hoverBorder(out, src, '', '');
  flexItem(out, src, false);
  transform(out, src);
  mask(c, out, src);
  proAdvanced(c, out, src);
  // Text colors set on a section or column reach its widgets (as in Elementor).
  const text = colorOf(src, 'color_text');
  const heading = colorOf(src, 'heading_color');
  const linkColor = colorOf(src, 'color_link');
  const linkHover = colorOf(src, 'color_link_hover');
  if (text) addCss(out, `selector{color:${text}}selector .fr-text{color:${text}}`);
  if (heading) addCss(out, `selector .fr-heading__title{color:${heading}}`);
  if (linkColor) addCss(out, `selector a{color:${linkColor}}`);
  if (linkHover) addCss(out, `selector a:hover{color:${linkHover}}`);
  const align = str(src.text_align);
  if (['left', 'center', 'right', 'justify'].includes(align))
    addCss(out, `selector{text-align:${align}}`);
  shapeDividers(c, out, src);
}

// ---- Nested tabs and accordion ------------------------------------------------------------------

/** Elementor's nested tabs: direction, titles (normal, hover, active), icons and content box. */
function nestedTabs(c: Converter, out: Settings, src: Settings): void {
  copy(out, src, 'tabs_direction', 'tabs_direction', (v) => SIDES[str(v)]);
  copy(out, src, 'tabs_width', 'tabs_width', (v) => size(v, c));
  copy(out, src, 'title_alignment', 'title_align', (v) =>
    ['start', 'center', 'end'].includes(str(v)) ? str(v) : undefined,
  );
  if (src.horizontal_scroll === 'enable') out.horizontal_scroll = true;
  if (src.breakpoint_selector === 'none') out.mobile = 'tabs';
  copy(out, src, 'tabs_title_space_between', 'title_gap', (v) => size(v, c));
  copy(out, src, 'tabs_title_spacing', 'nav_gap', (v) => size(v, c));
  groupColor(out, src, 'tabs_title_background_color', 'title_bg');
  groupColor(out, src, 'tabs_title_background_color_hover', 'title_bg:hover');
  groupColor(out, src, 'tabs_title_background_color_active', 'active_bg');
  border(out, src, 'tabs_title_border', 'title_border');
  border(out, src, 'tabs_title_border_hover', 'title_border_hover');
  border(out, src, 'tabs_title_border_active', 'title_border_active');
  copy(out, src, 'tabs_title_border_radius', 'title_border_radius', (v) => box(v, c));
  for (const [from, to] of [
    ['tabs_title_box_shadow', 'title_box_shadow'],
    ['tabs_title_box_shadow_hover', 'title_box_shadow_hover'],
    ['tabs_title_box_shadow_active', 'title_box_shadow_active'],
  ] as const) {
    const s = shadow(src, from);
    if (s) out[to] = s;
  }
  copy(out, src, 'padding', 'title_padding', (v) => box(v, c));
  c.typography(out, src, 'title_typography', 'title_typography');
  color(out, src, 'title_text_color', 'title_color', 'title_text_color_hover');
  color(out, src, 'title_text_color_active', 'active_color');
  textShadow(out, src, 'title_text_shadow', 'title_text_shadow');
  textShadow(out, src, 'title_text_shadow_hover', 'title_text_shadow_hover');
  textShadow(out, src, 'title_text_shadow_active', 'title_text_shadow_active');
  textStroke(out, src, 'title_text_stroke', 'title_stroke');
  hoverAnimation(out, src);
  copy(out, src, 'tabs_title_transition_duration', 'title_hover_transition', duration, false);
  copy(out, src, 'icon_position', 'icon_position', (v) => SIDES[str(v)]);
  copy(out, src, 'icon_size', 'icon_size', (v) => size(v, c));
  copy(out, src, 'icon_spacing', 'icon_spacing', (v) => size(v, c));
  color(out, src, 'icon_color', 'icon_color');
  color(out, src, 'icon_color_hover', 'icon_hover_color');
  color(out, src, 'icon_color_active', 'icon_active_color');
  groupColor(out, src, 'box_background_color', 'panel_bg');
  border(out, src, 'box_border', 'panel_border');
  copy(out, src, 'box_border_radius', 'panel_border_radius', (v) => box(v, c));
  const boxShadow = shadow(src, 'box_shadow_box_shadow');
  if (boxShadow) out.panel_shadow = boxShadow;
  copy(out, src, 'box_padding', 'panel_padding', (v) => box(v, c));
}

/** Elementor's nested accordion: items, title states (normal, hover, open), icons and content. */
function nestedAccordion(c: Converter, out: Settings, src: Settings): void {
  copy(out, src, 'accordion_item_title_position_horizontal', 'title_align', (v) =>
    ['start', 'center', 'end', 'stretch'].includes(str(v)) ? str(v) : undefined,
  );
  if (src.accordion_item_title_icon_position === 'start') out.icon_position = 'start';
  const expand = c.icon(src.accordion_item_title_icon);
  if (expand) out.icon = expand;
  const collapse = c.icon(src.accordion_item_title_icon_active);
  if (collapse) out.icon_open = collapse;
  if (HEADING_TAGS.has(str(src.title_tag))) out.title_tag = str(src.title_tag);
  if (src.default_state === 'all_collapsed') out.open = 'none';
  if (src.max_items_expended === 'multiple') out.multiple = true;
  const ms = num(asSettings(src.n_accordion_animation_duration).size);
  if (ms !== null)
    out.animation_duration =
      asSettings(src.n_accordion_animation_duration).unit === 's' ? ms * 1000 : ms;
  copy(out, src, 'accordion_item_title_space_between', 'item_gap', (v) => size(v, c));
  copy(out, src, 'accordion_padding', 'title_padding', (v) => box(v, c));
  groupColor(out, src, 'accordion_background_normal', 'title_bg');
  groupColor(out, src, 'accordion_background_hover', 'title_bg:hover');
  groupColor(out, src, 'accordion_background_active', 'title_open_bg');
  border(out, src, 'accordion_border_normal', 'title_border');
  border(out, src, 'accordion_border_hover', 'title_border_hover');
  border(out, src, 'accordion_border_active', 'title_border_open');
  groupColor(out, src, 'content_background', 'content_bg');
  border(out, src, 'content_border', 'content_border');
  copy(out, src, 'content_padding', 'content_padding', (v) => box(v, c));
  c.typography(out, src, 'title_typography', 'title_typography');
  color(out, src, 'normal_title_color', 'title_color', 'hover_title_color');
  color(out, src, 'active_title_color', 'title_open_color');
  textShadow(out, src, 'title_normal_text_shadow', 'title_text_shadow');
  textShadow(out, src, 'title_active_text_shadow', 'title_open_text_shadow');
  textStroke(out, src, 'title_normal_stroke', 'title_stroke');
  copy(out, src, 'icon_size', 'icon_size', (v) => size(v, c), false);
  copy(out, src, 'icon_spacing', 'icon_spacing', (v) => size(v, c));
  color(out, src, 'normal_icon_color', 'icon_color');
  color(out, src, 'hover_icon_color', 'icon_hover_color');
  color(out, src, 'active_icon_color', 'icon_open_color');
}

// ---- Conversion ------------------------------------------------------------------------------

export function elementorToFresco(data: string, ctx: ElementorContext): CxdBlock[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    ctx.warn('the Elementor data could not be read; the page content was imported instead.');
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const blocks = convertElements(parsed as ElementorNode[], ctx);
  // Widgets at the top level go into a container, as Fresco expects.
  const result: CxdBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'fresco/container') result.push(block);
    else {
      const last = result.at(-1);
      if (last && last.attrs.__wrapper) last.children!.push(block);
      else
        result.push({
          id: newBlockId(),
          type: 'fresco/container',
          v: 1,
          attrs: { __wrapper: true },
          children: [block],
        });
    }
  }
  for (const block of result) {
    delete block.attrs.__wrapper;
    // Elementor centers top-level containers narrower than the page.
    if (block.attrs.width || block.attrs['width@tablet']) {
      addCss(block.attrs, 'selector{margin-left:auto;margin-right:auto}');
    }
  }
  return result;
}

/** Elementor elements → Fresco blocks (reported once per page). */
export function convertElements(elements: ElementorNode[], ctx: ElementorContext): CxdBlock[] {
  const unknown = new Map<string, number>();
  const notes = new Map<string, number>();
  const padding = ctx.kit?.containerPadding ?? evenBox(10);

  const c: Converter = {
    ctx,
    note(text) {
      notes.set(text, (notes.get(text) ?? 0) + 1);
    },
    node: (type, attrs, children) => ({
      id: newBlockId(),
      type: type.includes('/') ? type : `fresco/${type}`,
      v: 1,
      attrs,
      ...(children ? { children } : {}),
    }),
    media: (value) => mediaValue(value, ctx.mediaRef),
    icon: (value) => icon(value, ctx.mediaRef) as Settings | undefined,
    dynamic(out, src, from, to, kind) {
      const tag = parseDynamic(asSettings(src.__dynamic__)[from]);
      if (!tag) return;
      const value = dynamicTag(tag, ctx.entryRef);
      if (!value) {
        c.note(`the dynamic tag "${tag.name}" has no counterpart: its static value was kept`);
        return;
      }
      out.__dynamic = { ...asSettings(out.__dynamic), [to]: { ...value, kind } };
    },
    children: (el) => (el.elements ?? []).flatMap((child) => element(child)),
    element: (el) => element(el),
    unknown(type) {
      unknown.set(type, (unknown.get(type) ?? 0) + 1);
    },
    typography: (out, src, from, to) =>
      typography(out, src, from, to, { note: c.note, ...(ctx.font ? { font: ctx.font } : {}) }),
  };

  const alignTo = (out: Settings, src: Settings, from: string, to = 'align') =>
    copy(out, src, from, to, (v) =>
      ['left', 'center', 'right', 'justify'].includes(str(v))
        ? str(v)
        : v === 'start'
          ? 'left'
          : v === 'end'
            ? 'right'
            : undefined,
    );

  const container = (src: Settings, children: CxdBlock[], extra: Settings = {}): CxdBlock => {
    const out: Settings = { ...extra };
    containerCommon(c, out, src);
    return c.node('container', out, children);
  };

  /** Free widgets; Pro and atomic ones go to their own converters. */
  const widget = (el: ElementorNode): CxdBlock[] => {
    const src = asSettings(el.settings);
    const out: Settings = {};
    const type = el.widgetType ?? '';
    let result: CxdBlock;
    switch (type) {
      case 'heading': {
        const { text, formatted } = plainTitle(str(src.title));
        out.title = text;
        if (formatted) c.note('inline formatting inside headings was removed');
        c.dynamic(out, src, 'title', 'title', 'text');
        if (HEADING_TAGS.has(str(src.header_size))) out.tag = str(src.header_size);
        else out.tag = 'h2';
        if (['small', 'medium', 'large', 'xl', 'xxl'].includes(str(src.size)))
          out.size = str(src.size);
        if (link(src.link, ctx.origin)) out.link = link(src.link, ctx.origin);
        c.dynamic(out, src, 'link', 'link', 'url');
        alignTo(out, src, 'align');
        color(out, src, 'title_color', 'title_color', 'title_hover_color');
        c.typography(out, src, 'typography', 'title_typography');
        // Elementor's headings have a line height of 1 unless their font sets one.
        if (!hasLineHeight(src, 'typography')) {
          const custom = src.typography_typography === 'custom';
          const font = custom ? undefined : str(out.title_typography_global) || 'primary';
          if (font && ctx.kit?.fontsWithLine?.includes(font)) out.title_typography_global = font;
          else out.title_typography_line = { size: 1, unit: '' };
        }
        if (str(src.blend_mode)) out.blend = str(src.blend_mode);
        textShadow(out, src, 'text_shadow', 'title_shadow');
        textStroke(out, src, 'text_stroke', 'title_stroke');
        copy(
          out,
          src,
          'title_hover_color_transition_duration',
          'title_hover_transition',
          duration,
          false,
        );
        result = c.node('heading', out);
        break;
      }
      case 'text-editor':
        out.content = str(src.editor);
        c.dynamic(out, src, 'editor', 'content', 'richtext');
        alignTo(out, src, 'align');
        color(out, src, 'text_color', 'color');
        color(out, src, 'link_color', 'link_color', 'link_hover_color');
        c.typography(out, src, 'typography', 'typography');
        if (yes(src.drop_cap)) out.drop_cap = true;
        if (num(src.text_columns)) out.columns = num(src.text_columns);
        copy(out, src, 'column_gap', 'column_gap', (v) => size(v, c));
        copy(out, src, 'paragraph_spacing', 'paragraph_spacing', (v) => size(v, c));
        textShadow(out, src, 'text_shadow', 'text_shadow');
        copy(
          out,
          src,
          'link_hover_color_transition_duration',
          'link_hover_transition',
          duration,
          false,
        );
        if (yes(src.drop_cap)) {
          if (['stacked', 'framed'].includes(str(src.drop_cap_view)))
            out.drop_cap_view = str(src.drop_cap_view);
          color(out, src, 'drop_cap_primary_color', 'drop_cap_primary_color');
          color(out, src, 'drop_cap_secondary_color', 'drop_cap_secondary_color');
          copy(out, src, 'drop_cap_size', 'drop_cap_size', (v) => size(v, c), false);
          copy(out, src, 'drop_cap_space', 'drop_cap_space', (v) => size(v, c), false);
          copy(out, src, 'drop_cap_border_radius', 'drop_cap_radius', (v) => size(v, c), false);
          copy(
            out,
            src,
            'drop_cap_border_width',
            'drop_cap_border_width',
            (v) => size(v, c),
            false,
          );
          c.typography(out, src, 'drop_cap_typography', 'drop_cap_typography');
          textShadow(out, src, 'drop_cap_shadow', 'drop_cap_shadow');
        }
        result = c.node('text', out);
        break;
      case 'image': {
        const image = c.media(src.image);
        if (image) out.image = image;
        c.dynamic(out, src, 'image', 'image', 'media');
        const imageSize = str(src.image_size);
        if (imageSize)
          out.image_size = ['thumbnail', 'medium', 'large', 'full'].includes(imageSize)
            ? imageSize.replace('thumbnail', 'thumb')
            : imageSize === 'custom'
              ? 'full'
              : 'large';
        alignTo(out, src, 'align');
        // Elementor centers images unless told otherwise; Fresco keeps the text alignment.
        if (!out.align) out.align = 'center';
        if (src.link_to === 'file') out.link_to = 'file';
        if (src.link_to === 'custom' && link(src.link, ctx.origin)) {
          out.link_to = 'custom';
          out.link = link(src.link, ctx.origin);
        }
        if (src.link_to === 'custom') c.dynamic(out, src, 'link', 'link', 'url');
        if (src.caption_source === 'custom') {
          out.caption_source = 'custom';
          out.caption = str(src.caption);
        } else if (src.caption_source === 'attachment') out.caption_source = 'attachment';
        // The caption's look.
        alignTo(out, src, 'caption_align', 'caption_align');
        color(out, src, 'text_color', 'caption_color');
        color(out, src, 'caption_background_color', 'caption_bg');
        c.typography(out, src, 'caption_typography', 'caption_typography');
        textShadow(out, src, 'caption_text_shadow', 'caption_shadow');
        copy(out, src, 'caption_space', 'caption_space', (v) => size(v, c));
        copy(out, src, 'width', 'width', (v) => size(v, c));
        copy(out, src, 'space', 'max_width', (v) => size(v, c));
        copy(out, src, 'height', 'height', (v) => size(v, c));
        if (str(src.object_fit)) out.object_fit = str(src.object_fit);
        copy(out, src, 'object-fit', 'object_fit', (v) =>
          ['cover', 'contain', 'fill'].includes(str(v)) ? str(v) : undefined,
        );
        copy(out, src, 'object-position', 'object_position', (v) =>
          /^(center|top|bottom) (center|left|right)$/.test(str(v)) ? str(v) : undefined,
        );
        const opacity = num(asSettings(src.opacity).size);
        if (opacity !== null) out.opacity = { size: opacity, unit: '' };
        const opacityHover = num(asSettings(src.opacity_hover).size);
        if (opacityHover !== null) out['opacity:hover'] = { size: opacityHover, unit: '' };
        cssFilters(out, src, 'css_filters', 'filters');
        cssFilters(out, src, 'css_filters_hover', 'filters_hover');
        copy(out, src, 'background_hover_transition', 'hover_transition', duration, false);
        border(out, src, 'image_border', 'image_border');
        copy(out, src, 'image_border_radius', 'image_border_radius', (v) => box(v));
        const s = shadow(src, 'image_box_shadow');
        if (s) out.image_shadow = s;
        hoverAnimation(out, src);
        result = c.node('image', out);
        break;
      }
      case 'button': {
        out.text = str(src.text) || 'Click here';
        c.dynamic(out, src, 'text', 'text', 'text');
        out.link = link(src.link, ctx.origin) ?? { url: '#' };
        c.dynamic(out, src, 'link', 'link', 'url');
        alignTo(out, src, 'align');
        out.size = ['xs', 'sm', 'md', 'lg', 'xl'].includes(str(src.size)) ? str(src.size) : 'sm';
        const buttonIcon = c.icon(src.selected_icon);
        if (buttonIcon) out.icon = buttonIcon;
        if (src.icon_align === 'right' || src.icon_align === 'row-reverse')
          out.icon_position = 'after';
        copy(out, src, 'icon_indent', 'icon_spacing', (v) => size(v, c), false);
        color(out, src, 'button_text_color', 'text_color', 'hover_color');
        // Its background (a color, or a group in recent versions) and hover background.
        const bg = colorOf(src, 'background_color');
        if (bg) out.background_color = bg;
        const bgHover = colorOf(src, 'button_background_hover_color');
        if (bgHover) out['background_color:hover'] = bgHover;
        // Gradients (normal and hover): Fresco's background groups of the button.
        if (src.background_background === 'gradient')
          background(c, out, src, 'background', 'button_background');
        if (src.button_background_hover_background === 'gradient')
          background(c, out, src, 'button_background_hover', 'button_background_hover');
        if (['info', 'success', 'warning', 'danger'].includes(str(src.button_type)))
          out.button_type = str(src.button_type);
        copy(out, src, 'content_align', 'content_align', (v) =>
          v === 'start'
            ? 'flex-start'
            : v === 'end'
              ? 'flex-end'
              : v === 'center' || v === 'space-between'
                ? str(v)
                : undefined,
        );
        textShadow(out, src, 'text_shadow', 'text_shadow');
        const shadowHover = shadow(src, 'button_hover_box_shadow');
        if (shadowHover) out.shadow_hover = shadowHover;
        copy(out, src, 'button_hover_transition_duration', 'hover_transition', duration, false);
        const borderHover = colorOf(src, 'button_hover_border_color');
        if (borderHover) out.border_hover_color = borderHover;
        c.typography(out, src, 'typography', 'typography');
        copy(out, src, 'text_padding', 'padding', (v) => box(v, c));
        border(out, src, 'border', 'border');
        const s = shadow(src, 'button_box_shadow');
        if (s) out.shadow = s;
        hoverAnimation(out, src);
        if (/^[A-Za-z][\w-]*$/.test(str(src.button_css_id))) out.button_id = str(src.button_css_id);
        result = c.node('button', out);
        break;
      }
      case 'spacer':
        copy(out, src, 'space', 'space', (v) => size(v, c));
        if (!out.space) out.space = { size: 50, unit: 'px' };
        result = c.node('spacer', out);
        break;
      case 'divider':
        out.style = ['solid', 'double', 'dotted', 'dashed'].includes(str(src.style))
          ? str(src.style)
          : 'solid';
        copy(out, src, 'width', 'width', (v) => size(v, c));
        // Elementor's divider is the secondary color by default.
        out.color = colorOf(src, 'color') ?? 'var(--fr-c-secondary)';
        out.weight = size(src.weight) ?? { size: 1, unit: 'px' };
        copy(out, src, 'gap', 'gap', (v) => size(v, c));
        alignTo(out, src, 'align');
        if (src.look === 'line_text' && str(src.text)) {
          out.element = 'text';
          out.text = str(src.text);
          color(out, src, 'text_color', 'element_color');
          c.typography(out, src, 'typography', 'element_typography');
        } else if (src.look === 'line_icon') {
          const dividerIcon = c.icon(src.icon);
          if (dividerIcon) {
            out.element = 'icon';
            out.icon = dividerIcon;
            color(out, src, 'primary_color', 'element_color');
            copy(out, src, 'icon_size', 'element_size', (v) => size(v, c));
          }
        }
        if (out.element) {
          if (src.text_align === 'left' || src.text_align === 'right')
            out.element_position = str(src.text_align);
          copy(out, src, 'text_spacing', 'element_spacing', (v) => size(v, c));
          textStroke(out, src, 'text_stroke', 'element_stroke');
        }
        result = c.node('divider', out);
        break;
      case 'icon': {
        const value = c.icon(src.selected_icon);
        if (value) out.icon = value;
        if (['stacked', 'framed'].includes(str(src.view))) out.view = str(src.view);
        if (str(src.shape)) out.shape = str(src.shape);
        if (link(src.link, ctx.origin)) out.link = link(src.link, ctx.origin);
        c.dynamic(out, src, 'link', 'link', 'url');
        alignTo(out, src, 'align');
        color(out, src, 'primary_color', 'primary_color', 'hover_primary_color');
        color(out, src, 'secondary_color', 'secondary_color', 'hover_secondary_color');
        copy(out, src, 'size', 'size', (v) => size(v, c));
        copy(out, src, 'icon_padding', 'padding', (v) => size(v, c));
        copy(out, src, 'rotate', 'rotate', (v) => size(v));
        copy(out, src, 'border_width', 'border_width', (v) => size(v, c), false);
        copy(out, src, 'border_radius', 'radius', (v) => box(v, c));
        if (yes(src.fit_to_size)) out.fit_to_size = true;
        hoverAnimation(out, src);
        result = c.node('icon', out);
        break;
      }
      case 'icon-box':
      case 'image-box': {
        out.title = plainTitle(str(src.title_text)).text;
        c.dynamic(out, src, 'title_text', 'title', 'text');
        const description = plainTitle(str(src.description_text));
        out.description = description.text;
        if (description.formatted) c.note('inline formatting inside box descriptions was removed');
        c.dynamic(out, src, 'description_text', 'description', 'text');
        if (link(src.link, ctx.origin)) out.link = link(src.link, ctx.origin);
        c.dynamic(out, src, 'link', 'link', 'url');
        copy(out, src, 'position', 'position', (v) =>
          v === 'left' || v === 'inline-start'
            ? 'left'
            : v === 'right' || v === 'inline-end'
              ? 'right'
              : v === 'top' || v === 'block-start'
                ? 'top'
                : v === 'bottom' || v === 'block-end'
                  ? 'bottom'
                  : undefined,
        );
        out.title_tag = HEADING_TAGS.has(str(src.title_size)) ? str(src.title_size) : 'h3';
        alignTo(out, src, 'text_align', 'align');
        const vertical = str(src.content_vertical_alignment);
        if (vertical === 'middle') out.vertical_align = 'center';
        else if (vertical === 'bottom') out.vertical_align = 'flex-end';
        color(out, src, 'title_color', 'title_color', 'hover_title_color');
        color(out, src, 'description_color', 'description_color');
        c.typography(out, src, 'title_typography', 'title_typography');
        c.typography(out, src, 'description_typography', 'description_typography');
        copy(out, src, 'title_bottom_space', 'title_spacing', (v) => size(v, c));
        textStroke(out, src, type === 'icon-box' ? 'text_stroke' : 'title_stroke', 'title_stroke');
        textShadow(out, src, 'title_shadow', 'title_shadow');
        textShadow(out, src, 'description_shadow', 'description_shadow');
        copy(
          out,
          src,
          'hover_title_color_transition_duration',
          'title_hover_transition',
          duration,
          false,
        );
        hoverAnimation(out, src);
        if (type === 'icon-box') {
          const value = c.icon(src.selected_icon);
          if (value) out.icon = value;
          if (['stacked', 'framed'].includes(str(src.view))) out.view = str(src.view);
          if (str(src.shape)) out.shape = str(src.shape);
          color(out, src, 'primary_color', 'icon_primary_color', 'hover_primary_color');
          color(out, src, 'secondary_color', 'icon_secondary_color', 'hover_secondary_color');
          copy(out, src, 'icon_size', 'icon_size', (v) => size(v, c));
          copy(out, src, 'icon_space', 'media_spacing', (v) => size(v, c));
          copy(out, src, 'icon_padding', 'icon_padding', (v) => size(v, c));
          copy(out, src, 'rotate', 'icon_rotate', (v) => size(v));
          copy(out, src, 'border_width', 'icon_border_width', (v) => size(v, c), false);
          copy(out, src, 'border_radius', 'icon_radius', (v) => box(v, c));
          copy(
            out,
            src,
            'hover_icon_colors_transition_duration',
            'icon_hover_transition',
            duration,
            false,
          );
        } else {
          const image = c.media(src.image);
          if (image) out.image = image;
          copy(out, src, 'image_size', 'image_width', (v) => size(v, c));
          copy(out, src, 'image_space', 'media_spacing', (v) => size(v, c));
          border(out, src, 'image_border', 'image_border');
          copy(out, src, 'image_border_radius', 'image_border_radius', (v) => box(v));
          copy(out, src, 'image_height', 'image_height', (v) => size(v, c));
          copy(out, src, 'image_object_fit', 'image_object_fit', (v) =>
            ['cover', 'contain', 'fill'].includes(str(v)) ? str(v) : undefined,
          );
          copy(out, src, 'image_object_position', 'image_object_position', (v) =>
            /^(center|top|bottom) (center|left|right)$/.test(str(v)) ? str(v) : undefined,
          );
          const imageShadow = shadow(src, 'image_box_shadow');
          if (imageShadow) out.image_shadow = imageShadow;
          const opacity = num(asSettings(src.image_opacity).size);
          if (opacity !== null) out.image_opacity = { size: opacity, unit: '' };
          const opacityHover = num(asSettings(src.image_opacity_hover).size);
          if (opacityHover !== null) out['image_opacity:hover'] = { size: opacityHover, unit: '' };
          cssFilters(out, src, 'css_filters', 'image_filters');
          cssFilters(out, src, 'css_filters_hover', 'image_filters_hover');
          copy(out, src, 'background_hover_transition', 'image_hover_transition', duration, false);
        }
        result = c.node(type, out);
        break;
      }
      case 'icon-list':
        out.items = list(src.icon_list).map((item, i) => ({
          _id: str(item._id) || `i${i}`,
          text: str(item.text),
          ...(c.icon(item.selected_icon) ? { icon: c.icon(item.selected_icon) } : {}),
          ...(itemLink(item, ctx.entryRef, ctx.origin)
            ? { link: itemLink(item, ctx.entryRef, ctx.origin) }
            : {}),
        }));
        if (src.view === 'inline') out.layout = 'inline';
        copy(out, src, 'space_between', 'space', (v) => size(v, c));
        alignTo(out, src, 'icon_align', 'align');
        if (yes(src.divider)) {
          out.divider = true;
          color(out, src, 'divider_color', 'divider_color');
        }
        color(out, src, 'icon_color', 'icon_color', 'icon_color_hover');
        color(out, src, 'text_color', 'text_color', 'text_color_hover');
        copy(out, src, 'icon_size', 'icon_size', (v) => size(v, c));
        copy(out, src, 'text_indent', 'icon_gap', (v) => size(v, c));
        c.typography(out, src, 'icon_typography', 'text_typography');
        if (src.link_click === 'inline') out.link_click = 'inline';
        if (out.divider) {
          if (['solid', 'double', 'dotted', 'dashed'].includes(str(src.divider_style)))
            out.divider_style = str(src.divider_style);
          copy(out, src, 'divider_weight', 'divider_weight', (v) => size(v, c), false);
        }
        copy(out, src, 'icon_self_align', 'icon_self_align', (v) =>
          v === 'left' || v === 'start'
            ? 'flex-start'
            : v === 'right' || v === 'end'
              ? 'flex-end'
              : v === 'center'
                ? 'center'
                : undefined,
        );
        copy(out, src, 'icon_self_vertical_align', 'icon_self_vertical_align', (v) =>
          ['flex-start', 'center', 'flex-end'].includes(str(v)) ? str(v) : undefined,
        );
        copy(out, src, 'icon_vertical_offset', 'icon_vertical_offset', (v) => size(v, c));
        textShadow(out, src, 'text_shadow', 'text_shadow');
        copy(out, src, 'icon_color_hover_transition', 'icon_hover_transition', duration, false);
        copy(out, src, 'text_color_hover_transition', 'text_hover_transition', duration, false);
        result = c.node('icon-list', out);
        break;
      case 'counter':
        out.start = num(src.starting_number) ?? 0;
        out.end = num(src.ending_number) ?? 100;
        if (str(src.prefix)) out.prefix = str(src.prefix);
        if (str(src.suffix)) out.suffix = str(src.suffix);
        out.title = str(src.title);
        if (num(src.duration) !== null) out.duration = num(src.duration);
        if (src.thousand_separator === '') out.separator = false;
        color(out, src, 'number_color', 'number_color');
        color(out, src, 'title_color', 'title_color');
        c.typography(out, src, 'typography_number', 'number_typography');
        c.typography(out, src, 'typography_title', 'title_typography');
        if (/^[. _']$/.test(str(src.thousand_separator_char)))
          out.separator_char = str(src.thousand_separator_char);
        if (HEADING_TAGS.has(str(src.title_tag)) && src.title_tag !== 'div')
          out.title_tag = str(src.title_tag);
        if (['before', 'start', 'end'].includes(str(src.title_position)))
          out.title_position = str(src.title_position);
        copy(
          out,
          src,
          'title_vertical_alignment',
          'title_vertical_align',
          (v) =>
            v === 'start'
              ? 'flex-start'
              : v === 'end'
                ? 'flex-end'
                : v === 'center'
                  ? 'center'
                  : undefined,
          false,
        );
        copy(out, src, 'title_gap', 'title_gap', (v) => size(v, c));
        copy(out, src, 'number_gap', 'number_gap', (v) => size(v, c));
        textStroke(out, src, 'number_stroke', 'number_stroke');
        textShadow(out, src, 'number_shadow', 'number_shadow');
        textStroke(out, src, 'title_stroke', 'title_stroke');
        textShadow(out, src, 'title_shadow', 'title_shadow');
        result = c.node('counter', out);
        break;
      case 'progress':
        out.title = str(src.title);
        if (size(src.percent)) out.percent = { size: size(src.percent)!.size, unit: '%' };
        if (str(src.inner_text)) out.inner = str(src.inner_text);
        if (src.display_percentage === 'hide') out.show_percent = false;
        color(out, src, 'bar_color', 'bar_color');
        color(out, src, 'bar_bg_color', 'track_color');
        color(out, src, 'bar_inline_color', 'inner_color');
        copy(out, src, 'bar_height', 'height', (v) => size(v, c), false);
        if (['info', 'success', 'warning', 'danger'].includes(str(src.progress_type)))
          out.progress_type = str(src.progress_type);
        if (HEADING_TAGS.has(str(src.title_tag)) && src.title_tag !== 'span')
          out.title_tag = str(src.title_tag);
        if (src.title_display === '') out.show_title = false;
        color(out, src, 'title_color', 'title_color');
        c.typography(out, src, 'typography', 'title_typography');
        textShadow(out, src, 'title_shadow', 'title_shadow');
        c.typography(out, src, 'bar_inner_typography', 'inner_typography');
        textShadow(out, src, 'bar_inner_shadow', 'inner_shadow');
        result = c.node('progress', out);
        break;
      case 'testimonial': {
        out.content = plainTitle(str(src.testimonial_content)).text;
        const image = c.media(src.testimonial_image);
        if (image) out.image = image;
        out.name = str(src.testimonial_name);
        out.job = str(src.testimonial_job);
        if (link(src.link, ctx.origin)) out.link = link(src.link, ctx.origin);
        alignTo(out, src, 'testimonial_alignment', 'align');
        if (['aside', 'top'].includes(str(src.testimonial_image_position))) {
          out.image_position = str(src.testimonial_image_position);
        }
        color(out, src, 'content_content_color', 'content_color');
        color(out, src, 'name_text_color', 'name_color');
        color(out, src, 'job_text_color', 'job_color');
        copy(out, src, 'image_size', 'image_size', (v) => size(v, c));
        textShadow(out, src, 'content_shadow', 'content_shadow');
        textShadow(out, src, 'name_shadow', 'name_shadow');
        textShadow(out, src, 'job_shadow', 'job_shadow');
        result = c.node('testimonial', out);
        break;
      }
      case 'social-icons':
        out.items = list(src.social_icon_list).map((item, i) => ({
          _id: str(item._id) || `s${i}`,
          ...((c.icon(item.social_icon) ?? legacySocial(item.social))
            ? { icon: c.icon(item.social_icon) ?? legacySocial(item.social) }
            : {}),
          ...(itemLink(item, ctx.entryRef, ctx.origin)
            ? { link: itemLink(item, ctx.entryRef, ctx.origin) }
            : {}),
          // A network's own colors.
          ...(item.item_icon_color === 'custom'
            ? {
                item_color: 'custom',
                ...(colorOf(item, 'item_icon_primary_color')
                  ? { item_primary: colorOf(item, 'item_icon_primary_color') }
                  : {}),
                ...(colorOf(item, 'item_icon_secondary_color')
                  ? { item_secondary: colorOf(item, 'item_icon_secondary_color') }
                  : {}),
              }
            : {}),
        }));
        if (['rounded', 'square', 'circle'].includes(str(src.shape))) out.shape = str(src.shape);
        copy(out, src, 'columns', 'columns', (v) => num(v) ?? undefined);
        copy(out, src, 'row_gap', 'row_gap', (v) => size(v, c));
        color(out, src, 'hover_border_color', 'hover_border_color');
        hoverAnimation(out, src);
        if (src.icon_color === 'custom') {
          out.look = 'custom';
          color(out, src, 'icon_primary_color', 'primary', 'hover_primary_color');
          color(out, src, 'icon_secondary_color', 'secondary', 'hover_secondary_color');
        }
        // Elementor's icons: 25px with 0.5em around unless set.
        copy(out, src, 'icon_size', 'size', (v) => size(v, c));
        if (!out.size) out.size = { size: 25, unit: 'px' };
        copy(out, src, 'icon_padding', 'padding', (v) => size(v, c), false);
        copy(out, src, 'icon_spacing', 'spacing', (v) => size(v, c));
        alignTo(out, src, 'align');
        result = c.node('social-icons', out);
        break;
      case 'alert':
        out.kind = ['info', 'success', 'warning', 'danger'].includes(str(src.alert_type))
          ? str(src.alert_type)
          : 'info';
        out.title = str(src.alert_title);
        out.description = plainTitle(str(src.alert_description)).text;
        if (src.show_dismiss === 'hide') out.dismiss = false;
        color(out, src, 'background', 'background');
        color(out, src, 'border_color', 'border_color');
        copy(out, src, 'border_left-width', 'border_left_width', (v) => size(v, c));
        color(out, src, 'title_color', 'title_color');
        color(out, src, 'description_color', 'description_color');
        textShadow(out, src, 'title_shadow', 'title_shadow');
        textShadow(out, src, 'description_shadow', 'description_shadow');
        if (out.dismiss !== false) {
          const close = c.icon(src.dismiss_icon);
          if (close) out.dismiss_icon = close;
          copy(out, src, 'dismiss_icon_size', 'dismiss_size', (v) => size(v, c));
          copy(out, src, 'dismiss_icon_vertical_position', 'dismiss_top', (v) => size(v, c));
          copy(out, src, 'dismiss_icon_horizontal_position', 'dismiss_right', (v) => size(v, c));
          color(out, src, 'dismiss_icon_normal_color', 'dismiss_color');
          const closeHover = colorOf(src, 'dismiss_icon_hover_color');
          if (closeHover) out['dismiss_color:hover'] = closeHover;
          copy(
            out,
            src,
            'dismiss_icon_hover_transition_duration',
            'dismiss_transition',
            duration,
            false,
          );
        }
        result = c.node('alert', out);
        break;
      case 'video': {
        const source = str(src.video_type) || 'youtube';
        if (source === 'hosted') {
          out.source = 'hosted';
          const external = str(asSettings(src.external_url).url);
          if (yes(src.insert_url) && external) {
            out.external = true;
            out.external_url = external;
          } else {
            const file =
              c.media(src.hosted_url) ?? (external ? { id: null, url: external } : undefined);
            if (file) out.file = file;
          }
          // Elementor hides the download button unless asked.
          if (!yes(src.download_button)) out.download = false;
          if (['auto', 'none'].includes(str(src.preload))) out.preload = str(src.preload);
        } else {
          out.source = source === 'vimeo' || source === 'dailymotion' ? source : 'youtube';
          out.url = str(src[`${out.source}_url`]);
          if (source === 'videopress') {
            out.url = str(src.videopress_url);
            c.note('videos from videopress became links to the video');
          }
        }
        for (const key of ['autoplay', 'mute', 'loop']) if (yes(src[key])) out[key] = true;
        if (src.controls === '') out.controls = false;
        if (num(src.start) !== null) out.start = num(src.start);
        if (num(src.end) !== null) out.end = num(src.end);
        if (src.rel === 'yes') out.rel = 'yes';
        for (const key of ['vimeo_title', 'vimeo_portrait', 'vimeo_byline', 'logo']) {
          if (src[key] === '') out[key] = false;
        }
        const playerColor = str(src.color);
        if (/^#[0-9a-f]{6}$/i.test(playerColor)) out.player_color = playerColor;
        const poster = c.media(src.image_overlay);
        if (poster && yes(src.show_image_overlay)) {
          out.poster = poster;
          if (src.show_play_icon === '') out.show_play_icon = false;
          const play = c.icon(src.play_icon);
          if (play) out.play_icon = play;
          if (yes(src.lightbox)) {
            out.lightbox = true;
            color(out, src, 'lightbox_color', 'lightbox_color');
            const width = num(asSettings(src.lightbox_video_width).size);
            if (width !== null) out.lightbox_width = { size: width, unit: '%' };
          }
          color(out, src, 'play_icon_color', 'play_icon_color');
          copy(out, src, 'play_icon_size', 'play_icon_size', (v) => size(v, c));
          textShadow(out, src, 'play_icon_text_shadow', 'play_icon_shadow');
        }
        cssFilters(out, src, 'css_filters', 'filters');
        if (['169', '219', '43', '32', '11', '916'].includes(str(src.aspect_ratio))) {
          const r = str(src.aspect_ratio);
          out.ratio =
            r === '169'
              ? '16/9'
              : r === '219'
                ? '21/9'
                : r === '43'
                  ? '4/3'
                  : r === '32'
                    ? '3/2'
                    : r === '11'
                      ? '1/1'
                      : '9/16';
        }
        result = c.node('video', out);
        break;
      }
      case 'google_maps':
        out.address = str(src.address);
        // Elementor's default zoom is 10.
        out.zoom = size(src.zoom)?.size ?? 10;
        copy(out, src, 'height', 'height', (v) => size(v, c));
        cssFilters(out, src, 'css_filters', 'filters');
        cssFilters(out, src, 'css_filters_hover', 'filters_hover');
        copy(out, src, 'hover_transition', 'hover_transition', duration, false);
        result = c.node('google-maps', out);
        break;
      case 'html':
        out.code = str(src.html);
        result = c.node('html', out);
        break;
      case 'shortcode':
        // Plugins may turn it into their block on import (below); otherwise it is text.
        out.content = `<p>${str(src.shortcode)}</p>`;
        result = c.node('text', out);
        break;
      case 'menu-anchor':
        out.anchor = str(src.anchor);
        result = c.node('menu-anchor', out);
        break;
      case 'star-rating':
      case 'rating': {
        if (num(src.rating) !== null) out.rating = num(src.rating);
        if (num(src.rating_value) !== null) out.rating = num(src.rating_value);
        // The scale: 5 or 10 (Star rating), or 1 to 10 (Rating).
        const scale = num(asSettings(src.rating_scale).size) ?? num(src.rating_scale);
        if (scale !== null && scale !== 5 && scale >= 1 && scale <= 10)
          out.scale = String(Math.round(scale));
        out.title = str(src.title);
        color(out, src, 'stars_color', 'color');
        color(out, src, 'icon_color', 'color');
        color(out, src, 'stars_unmarked_color', 'empty');
        color(out, src, 'icon_unmarked_color', 'empty');
        copy(out, src, 'icon_size', 'size', (v) => size(v, c));
        copy(out, src, 'icon_space', 'spacing', (v) => size(v, c));
        copy(out, src, 'icon_gap', 'spacing', (v) => size(v, c), false);
        const ratingIcon = c.icon(src.rating_icon);
        if (ratingIcon) out.icon = ratingIcon;
        alignTo(out, src, 'align');
        if (src.star_style === 'star_unicode') out.star_style = 'unicode';
        if (src.unmarked_star_style === 'outline') out.unmarked_style = 'outline';
        color(out, src, 'title_color', 'title_color');
        c.typography(out, src, 'title_typography', 'title_typography');
        textShadow(out, src, 'title_shadow', 'title_shadow');
        copy(out, src, 'title_gap', 'title_gap', (v) => size(v, c));
        result = c.node('star-rating', out);
        break;
      }
      case 'image-carousel':
      case 'image-gallery': {
        const images = list(Array.isArray(src.carousel) ? src.carousel : src.wp_gallery)
          .map((image) => c.media(image))
          .filter(Boolean);
        out.images = images;
        if (type === 'image-carousel') {
          copy(out, src, 'slides_to_show', 'per_view', num);
          copy(out, src, 'slides_to_scroll', 'per_scroll', (v) => num(v) ?? undefined);
          if (src.autoplay === 'no') out.autoplay = false;
          // Elementor's autoplay speed is in milliseconds, as Fresco's.
          if (num(src.autoplay_speed)) out.interval = num(src.autoplay_speed);
          if (src.infinite === 'no') out.loop = false;
          if (src.pause_on_hover === 'no' || src.pause_on_hover === '') out.pause = false;
          if (yes(src.pause_on_interaction)) out.pause_interaction = true;
          if (src.effect === 'fade') out.effect = 'fade';
          if (num(src.speed) !== null && num(src.speed) !== 500) out.speed = num(src.speed);
          if (str(src.navigation) && str(src.navigation) !== 'both')
            out.navigation = str(src.navigation);
          const prev = c.icon(src.navigation_previous_icon);
          if (prev) out.prev_icon = prev;
          const next = c.icon(src.navigation_next_icon);
          if (next) out.next_icon = next;
          if (src.link_to === 'file') out.link_to = 'file';
          if (src.link_to === 'custom' && link(src.link, ctx.origin)) {
            out.link_to = 'custom';
            out.link = link(src.link, ctx.origin);
          }
          // Captions: the attachment's (Fresco has no titles nor descriptions of images).
          if (src.caption_type === 'caption') out.caption_type = 'attachment';
          else if (src.caption_type === 'title' || src.caption_type === 'description') {
            out.caption_type = 'alt';
            c.note(
              'carousel captions from image titles or descriptions show the image description',
            );
          }
          copy(out, src, 'image_spacing_custom', 'gap', (v) => size(v, c), false);
          // Arrows and dots.
          if (src.arrows_position === 'outside') out.arrows_position = 'outside';
          copy(out, src, 'arrows_size', 'arrows_size', (v) => size(v, c));
          color(out, src, 'arrows_color', 'arrow_color');
          if (src.dots_position === 'inside') out.dots_position = 'inside';
          copy(out, src, 'dots_size', 'dots_size', (v) => size(v, c));
          copy(out, src, 'dots_gap', 'dots_gap', (v) => size(v, c));
          color(out, src, 'dots_inactive_color', 'dot_color');
          color(out, src, 'dots_color', 'dot_active');
          alignTo(out, src, 'caption_align', 'caption_align');
          color(out, src, 'caption_text_color', 'caption_color');
          c.typography(out, src, 'caption_typography', 'caption_typography');
          textShadow(out, src, 'caption_shadow', 'caption_shadow');
          copy(out, src, 'caption_space', 'caption_space', (v) => size(v, c));
          result = c.node('image-carousel', out);
        } else {
          if (num(src.gallery_columns) !== null) out.columns = num(src.gallery_columns);
          if (src.gallery_link === 'none') out.link_to = 'none';
          copy(out, src, 'image_spacing_custom', 'gap', (v) => size(v, c), false);
          if (src.gallery_display_caption === 'none') out.captions = false;
          if (src.gallery_rand === 'rand') out.random = true;
          alignTo(out, src, 'align', 'caption_align');
          color(out, src, 'text_color', 'caption_color');
          c.typography(out, src, 'typography', 'caption_typography');
          textShadow(out, src, 'caption_shadow', 'caption_shadow');
          copy(out, src, 'caption_space', 'caption_space', (v) => size(v, c));
          result = c.node('gallery', out);
        }
        break;
      }
      case 'text-path': {
        out.text = str(src.text);
        if (str(src.path)) out.path = str(src.path);
        if (src.path === 'custom') {
          const svg = c.media(src.custom_path);
          if (svg) out.custom_path = svg;
        }
        if (link(src.link, ctx.origin)) out.link = link(src.link, ctx.origin);
        alignTo(out, src, 'align');
        if (src.text_path_direction === 'rtl' || src.text_path_direction === 'ltr')
          out.text_direction = str(src.text_path_direction);
        if (yes(src.show_path)) out.show_path = true;
        copy(out, src, 'size', 'width', (v) => size(v, c));
        copy(out, src, 'rotation', 'rotation', (v) => size(v));
        const start = num(asSettings(src.start_point).size);
        if (start !== null) out.offset = { size: start, unit: '%' };
        c.typography(out, src, 'text_typography', 'typography');
        textStroke(out, src, 'text_stroke', 'text_stroke');
        copy(out, src, 'word_spacing', 'word_spacing', (v) => size(v, c));
        color(out, src, 'text_color_normal', 'color', 'text_color_hover');
        copy(out, src, 'hover_transition', 'text_transition', duration, false);
        color(out, src, 'path_fill_normal', 'path_fill');
        color(out, src, 'stroke_color_normal', 'stroke', 'stroke_color_hover');
        copy(out, src, 'stroke_width_normal', 'stroke_width', (v) => size(v, c), false);
        copy(out, src, 'stroke_transition', 'stroke_transition', duration, false);
        hoverAnimation(out, src);
        result = c.node('text-path', out);
        break;
      }
      case 'audio':
        out.url = str(asSettings(src.link).url);
        if (src.visual === 'no') out.visual = false;
        if (yes(src.sc_auto_play)) out.autoplay = true;
        if (/^#[0-9a-f]{6}$/i.test(str(src.sc_color))) out.color = str(src.sc_color);
        // The player's options Elementor switched off.
        for (const key of [
          'buying',
          'liking',
          'download',
          'show_artwork',
          'sharing',
          'show_comments',
          'show_playcount',
          'show_user',
        ]) {
          if (src[`sc_${key}`] === '') out[`sc_${key}`] = false;
        }
        result = c.node('audio', out);
        break;
      case 'tabs':
      case 'accordion':
      case 'toggle': {
        // Legacy widgets: each item's HTML becomes a container with a text.
        const items = list(src.tabs);
        // The content's color and font go to each item's text.
        const textStyle: Settings = {};
        if (type !== 'tabs') {
          color(textStyle, src, 'content_color', 'color');
          c.typography(textStyle, src, 'content_typography', 'typography');
        }
        const children = items.map((item) =>
          c.node('container', { _title: str(item.tab_title), content_width: 'full' }, [
            c.node('text', { content: str(item.tab_content), ...textStyle }),
          ]),
        );
        if (type !== 'tabs') {
          // Elementor's look: its icons (plus and minus, at the start), title and content styles.
          const closed = c.icon(src.selected_icon);
          const opened = c.icon(src.selected_active_icon);
          if (closed) out.icon = closed;
          if (opened) out.icon_open = opened;
          out.icon_position = str(src.icon_align) === 'right' ? 'end' : 'start';
          if (HEADING_TAGS.has(str(src.title_html_tag))) out.title_tag = str(src.title_html_tag);
          color(out, src, 'title_color', 'title_color');
          color(out, src, 'tab_active_color', 'title_open_color');
          color(out, src, 'title_background', 'title_bg');
          color(out, src, 'icon_color', 'icon_color');
          c.typography(out, src, 'title_typography', 'title_typography');
          color(out, src, 'content_background_color', 'content_bg');
          copy(out, src, 'title_padding', 'title_padding', (v) => box(v, c));
          copy(out, src, 'content_padding', 'content_padding', (v) => box(v, c));
        }
        textStroke(out, src, 'text_stroke', 'title_stroke');
        textShadow(out, src, 'title_shadow', 'title_text_shadow');
        if (type !== 'tabs' && src.faq_schema === 'yes') out.faq = true;
        if (type === 'toggle') out.multiple = true;
        if (type === 'accordion') out.open = 'first';
        else if (type === 'toggle') out.open = 'none';
        result = c.node(type === 'toggle' ? 'accordion' : type, out, children);
        break;
      }
      case 'nested-tabs':
      case 'nested-accordion': {
        const titles = list(Array.isArray(src.tabs) ? src.tabs : src.items);
        const children = (el.elements ?? []).map((child, i) => {
          const title = str(titles[i]?.tab_title ?? titles[i]?.item_title);
          // Each tab's icons.
          const own: Settings = { _title: title, content_width: 'full' };
          const tabIcon = titles[i] ? c.icon(titles[i]!.tab_icon) : undefined;
          const tabIconActive = titles[i] ? c.icon(titles[i]!.tab_icon_active) : undefined;
          if (tabIcon) own._icon = tabIcon;
          if (tabIcon && tabIconActive) own._icon_active = tabIconActive;
          const converted = element(child);
          const first = converted[0];
          if (converted.length === 1 && first && first.type === 'fresco/container') {
            first.attrs = { ...first.attrs, ...own };
            return first;
          }
          return c.node('container', own, converted);
        });
        if (type === 'nested-accordion' && src.faq_schema === 'yes') out.faq = true;
        if (type === 'nested-tabs') nestedTabs(c, out, src);
        else nestedAccordion(c, out, src);
        result = c.node(type === 'nested-tabs' ? 'tabs' : 'accordion', out, children);
        break;
      }
      case 'global': {
        // A global widget: the template it shows (Fresco Pro's Template element).
        const ref = num(el.templateID) !== null ? ctx.entryRef?.(num(el.templateID)!) : undefined;
        if (!ref) {
          c.note('global widgets whose template is not in the export were left out');
          return [];
        }
        return [c.node('fresco-pro/template', { template: { $entry: ref } })];
      }
      default: {
        const converted = proWidget(c, el, src);
        if (converted !== undefined) {
          if (converted === null) return [];
          for (const block of converted)
            if (!block.attrs.__common) widgetCommon(c, block.attrs, src);
          for (const block of converted) delete block.attrs.__common;
          return converted;
        }
        c.unknown(type);
        const text = [
          'title',
          'editor',
          'text',
          'description_text',
          'title_text',
          'content',
          'html',
        ]
          .map((key) => str(src[key]))
          .filter(Boolean)
          .join(' ');
        return text ? [c.node('text', { content: /</.test(text) ? text : `<p>${text}</p>` })] : [];
      }
    }
    widgetCommon(c, result.attrs, src);
    if (type === 'text-editor' || type === 'html' || type === 'shortcode') {
      const pieces = withShortcodes(result, type === 'html' ? 'code' : 'content');
      if (pieces) return pieces;
      if (type === 'shortcode') c.note('shortcodes were kept as text');
    }
    return [result];
  };

  /** Explicit padding where Elementor's default (10px) differs from Fresco's. */
  const defaultPadding = (out: Settings, src: Settings) => {
    if (!box(src.padding)) out._padding = { ...padding };
  };

  const element = (el: ElementorNode): CxdBlock[] => {
    const src = asSettings(el.settings);
    const children = () => (el.elements ?? []).flatMap(element);
    if (isAtomic(el)) return atomicElement(c, el);
    switch (el.elType) {
      case 'section': {
        // A section: its columns side by side (stacked on phones).
        const extra: Settings = {
          flex_direction: 'row',
          'flex_direction@mobile':
            src.reverse_order_mobile === 'reverse-mobile' ? 'column-reverse' : 'column',
          content_width: src.layout === 'full_width' ? 'full' : 'boxed',
          gap: { size: 0, unit: 'px' },
        };
        if (src.reverse_order_tablet === 'reverse-tablet')
          extra['flex_direction@tablet'] = 'row-reverse';
        // Columns with a width of their own on phones stay side by side there
        // (Elementor wraps them: the others take the whole row).
        const phoneWidths = (el.elements ?? []).some((column) => {
          const width = num(asSettings(column.settings)._inline_size_mobile);
          return width !== null && width < 100;
        });
        if (phoneWidths && src.reverse_order_mobile !== 'reverse-mobile') {
          extra['flex_direction@mobile'] = 'row';
          extra['flex_wrap@mobile'] = 'wrap';
        }
        if (size(src.content_width)) extra.boxed_width = size(src.content_width, c);
        const heightKey = el.isInner ? 'height_inner' : 'height';
        if (src[heightKey] === 'min-height') {
          copy(
            extra,
            src,
            el.isInner ? 'custom_height_inner' : 'custom_height',
            'min_height',
            (v) => size(v, c),
          );
        } else if (src[heightKey] === 'full') {
          // Elementor fits the window from tablets up; on phones the content decides.
          extra.min_height = { size: 100, unit: 'vh' };
          extra['min_height@mobile'] = { size: 0, unit: 'px' };
        }
        // "Column position" belongs to the height of top sections only (Elementor's
        // condition): in inner sections the columns stretch to the row's height.
        if (!el.isInner && (src.height === 'full' || src.height === 'min-height')) {
          const position = str(src.column_position) || 'middle';
          extra.align_items =
            position === 'top'
              ? 'flex-start'
              : position === 'bottom'
                ? 'flex-end'
                : position === 'stretch'
                  ? 'stretch'
                  : 'center';
        }
        if (str(src.overflow) === 'hidden') extra.overflow = 'hidden';
        if (str(src.html_tag) && str(src.html_tag) !== 'div') extra.html_tag = str(src.html_tag);
        // Columns are spaced by their padding (the section's "columns gap").
        const gap = str(src.gap) || 'default';
        const columnPadding =
          gap === 'custom'
            ? (size(src.gap_columns_custom)?.size ?? 20) / 2
            : ((
                { no: 0, narrow: 5, default: 10, extended: 15, wide: 20, wider: 30 } as Record<
                  string,
                  number
                >
              )[gap] ?? 10);
        const vertical = str(src.content_position);
        const columns = (el.elements ?? []).map((column) => {
          const converted = element(column);
          for (const outer of converted) {
            if (outer.type !== 'fresco/container') continue;
            // A column with a margin: its spacing and position go to the box inside.
            const wrapped = outer.attrs.__wrapped === true;
            delete outer.attrs.__wrapped;
            const block = wrapped && outer.children?.[0] ? outer.children[0] : outer;
            const own = asSettings(column.settings);
            if (!box(own.padding)) block.attrs._padding = evenBox(columnPadding);
            if (!str(own.content_position) && vertical) {
              block.attrs.justify_content =
                vertical === 'top'
                  ? 'flex-start'
                  : vertical === 'bottom'
                    ? 'flex-end'
                    : vertical === 'middle'
                      ? 'center'
                      : vertical;
            }
          }
          return converted;
        });
        if (str(src.stretch_section) === 'section-stretched') extra.__stretched = true;
        const block = container(src, columns.flat(), extra);
        // A section has no padding of its own (Fresco's top containers have 10px).
        if (!box(src.padding)) block.attrs._padding = evenBox(0);
        return [block];
      }
      case 'column': {
        const width = num(src._column_size);
        const extra: Settings = { content_width: 'full' };
        const inline = num(src._inline_size);
        if (inline ?? width) extra.width = { size: inline ?? width!, unit: '%' };
        copy(extra, src, '_inline_size', 'width', (v) =>
          num(v) !== null ? { size: num(v)!, unit: '%' } : undefined,
        );
        // Columns fill the row on phones, unless they have their own width there.
        if (!extra['width@mobile']) extra['width@mobile'] = { size: 100, unit: '%' };
        const position = str(src.content_position);
        if (position) {
          extra.justify_content =
            position === 'top'
              ? 'flex-start'
              : position === 'bottom'
                ? 'flex-end'
                : position === 'center' || position === 'middle'
                  ? 'center'
                  : position;
        }
        const align = str(src.align);
        if (
          [
            'flex-start',
            'center',
            'flex-end',
            'space-between',
            'space-around',
            'space-evenly',
          ].includes(align)
        ) {
          extra.align_items = align;
        }
        copy(extra, src, 'space_between_widgets', 'gap', (v) => size(v, c));
        if (str(src.html_tag) && str(src.html_tag) !== 'div') extra.html_tag = str(src.html_tag);
        if (DEVICES.some(([device]) => box(src[`margin${device}`]))) {
          // Elementor puts a column's margin (with its padding, background and
          // border) on the box inside it: the column keeps its width. Fresco's
          // margin is on the container itself, so the column becomes a
          // container of that width holding one with everything else.
          const { width: _w, ...own } = extra;
          void _w;
          for (const key of Object.keys(own)) if (key.startsWith('width@')) delete own[key];
          const inner = container(src, children(), own);
          // It fills the column, less its margin (as Elementor's inner box does).
          addCss(inner.attrs, 'selector{flex-grow:1;width:auto}');
          const outer: Settings = { content_width: 'full', _padding: evenBox(0), __wrapped: true };
          for (const [key, value] of Object.entries(extra)) {
            if (key === 'width' || key.startsWith('width@')) outer[key] = value;
          }
          for (const key of DEVICE_NAMES.map((device) => `_hide_${device}`)) {
            if (inner.attrs[key]) outer[key] = inner.attrs[key];
            delete inner.attrs[key];
          }
          return [c.node('container', outer, [inner])];
        }
        return [container(src, children(), extra)];
      }
      case 'container': {
        const extra: Settings = { content_width: src.content_width === 'full' ? 'full' : 'boxed' };
        const grid = src.container_type === 'grid';
        if (grid) {
          extra.container_type = 'grid';
          // A template written as CSS (`1fr 2fr`, `repeat(auto-fill, …)`) is kept as it is too.
          for (const [from, to] of [
            ['grid_columns_grid', 'grid_columns_custom'],
            ['grid_rows_grid', 'grid_rows_custom'],
          ] as const) {
            copy(extra, src, from, to, (v) =>
              str(asSettings(v).unit) === 'custom' && !plainNumber(asSettings(v).size)
                ? str(asSettings(v).size).trim() || undefined
                : undefined,
            );
          }
          copy(extra, src, 'grid_columns_grid', 'grid_columns', (v) => {
            const n = plainNumber(asSettings(v).size) ? num(asSettings(v).size) : null;
            if (n !== null) return n;
            const text = str(asSettings(v).size);
            return /repeat\(\s*(\d+)/.exec(text)?.[1]
              ? Number(/repeat\(\s*(\d+)/.exec(text)![1])
              : text.split(/\s+/).filter(Boolean).length || undefined;
          });
          copy(
            extra,
            src,
            'grid_rows_grid',
            'grid_rows',
            (v) => num(asSettings(v).size) ?? undefined,
          );
          copy(extra, src, 'grid_auto_flow', 'grid_flow', (v) => str(v) || undefined);
          copy(extra, src, 'grid_justify_items', 'grid_justify_items', (v) => str(v) || undefined);
          copy(extra, src, 'grid_align_items', 'grid_align_items', (v) => str(v) || undefined);
          copy(
            extra,
            src,
            'grid_justify_content',
            'grid_justify_content',
            (v) => str(v) || undefined,
          );
          copy(extra, src, 'grid_align_content', 'grid_align_content', (v) => str(v) || undefined);
        }
        copy(extra, src, 'flex_direction', 'flex_direction', (v) => str(v) || undefined);
        copy(extra, src, 'flex_justify_content', 'justify_content', (v) => str(v) || undefined);
        copy(extra, src, 'flex_align_items', 'align_items', (v) => str(v) || undefined);
        copy(extra, src, 'flex_wrap', 'flex_wrap', (v) => str(v) || undefined);
        copy(extra, src, 'flex_align_content', 'align_content', (v) => str(v) || undefined);
        // Gaps: the column gap for both, and the row gap when it differs.
        const gapKey = grid ? 'grid_gaps' : 'flex_gap';
        const gapUnit = (g: Settings) => (str(g.unit) === 'custom' ? 'px' : str(g.unit) || 'px');
        copy(extra, src, gapKey, 'gap', (v) => {
          const g = asSettings(v);
          const column = num(g.column) ?? num(g.size);
          return column !== null ? { size: column, unit: gapUnit(g) } : undefined;
        });
        copy(extra, src, gapKey, 'row_gap', (v) => {
          const g = asSettings(v);
          const column = num(g.column) ?? num(g.size);
          const row = num(g.row);
          return row !== null && column !== null && row !== column
            ? { size: row, unit: gapUnit(g) }
            : undefined;
        });
        copy(extra, src, 'width', 'width', (v) => size(v, c));
        copy(extra, src, 'boxed_width', 'boxed_width', (v) => size(v, c));
        copy(extra, src, 'min_height', 'min_height', (v) => size(v, c));
        if (str(src.overflow) === 'hidden' || str(src.overflow) === 'auto')
          extra.overflow = str(src.overflow);
        if (str(src.html_tag) && str(src.html_tag) !== 'div') extra.html_tag = str(src.html_tag);
        if (src.html_tag === 'a' && link(src.link, ctx.origin))
          extra.link = link(src.link, ctx.origin);
        // On phones, Elementor's containers fill the width and their items wrap.
        if (extra.width && !extra['width@mobile']) extra['width@mobile'] = { size: 100, unit: '%' };
        const row = [extra.flex_direction, extra['flex_direction@tablet']].some((d) =>
          str(d).startsWith('row'),
        );
        if (row && !grid && !src.flex_wrap_mobile) extra['flex_wrap@mobile'] = 'wrap';
        const block = container(src, children(), extra);
        defaultPadding(block.attrs, src);
        return [block];
      }
      case 'widget':
        return widget(el);
      default:
        return children();
    }
  };

  const blocks = elements.flatMap((el) => element(el));
  for (const [type, n] of unknown) {
    ctx.unconverted?.(type, n);
    ctx.warn(
      `${n} Elementor widget(s) "${type}" have no Fresco counterpart yet: their text was kept.`,
    );
  }
  for (const [text, n] of notes) ctx.warn(`${text}${n > 1 ? ` (${n}×)` : ''}.`);
  return blocks;
}

/** Whether a converted page used stretched sections (they break out of the content column). */
export function takeStretched(blocks: CxdBlock[]): boolean {
  let found = false;
  const walk = (list: CxdBlock[]) => {
    for (const block of list) {
      if (block.attrs.__stretched) {
        found = true;
        delete block.attrs.__stretched;
      }
      if (block.children) walk(block.children);
    }
  };
  walk(blocks);
  return found;
}
