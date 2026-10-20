/**
 * Pages built with Elementor (`_elementor_data`) become Fresco pages:
 * sections, columns and containers become Fresco containers, widgets their
 * Fresco (and Fresco Pro) counterparts with their settings: texts, links,
 * images, colors (global ones too), typography, spacing, per-device values,
 * hover states, motion effects and dynamic tags. Where Elementor's defaults
 * differ from Fresco's, the value is written explicitly so the page looks
 * the same. Widgets with no counterpart keep their text and are reported.
 */
import type { CxdBlock } from '@cleitext/blocks';
import { newBlockId } from '@cleitext/blocks';
import { shortcodePlaceholder, splitShortcodes } from '@cleitext/blocks/html';
import { atomicElement, isAtomic } from './elementor-atomic.js';
import { proWidget } from './elementor-pro.js';
import {
  asSettings,
  box,
  color,
  colorOf,
  copy,
  dynamicTag,
  evenBox,
  hasLineHeight,
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
} from './elementor-values.js';

export type { Settings } from './elementor-values.js';

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
  kit?: ElementorKitInfo;
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
  zoomInUp: 'zoom-in',
  zoomInDown: 'zoom-in',
  zoomInLeft: 'zoom-in',
  zoomInRight: 'zoom-in',
  zoomOut: 'zoom-out',
  slideInUp: 'slide-up',
  slideInDown: 'slide-down',
  slideInLeft: 'slide-left',
  slideInRight: 'slide-right',
  bounceIn: 'bounce-in',
  bounceInUp: 'bounce-in',
  bounceInDown: 'bounce-in',
  bounceInLeft: 'bounce-in',
  bounceInRight: 'bounce-in',
  rotateIn: 'rotate-in',
  rotateInDownLeft: 'rotate-in',
  rotateInDownRight: 'rotate-in',
  rotateInUpLeft: 'rotate-in',
  rotateInUpRight: 'rotate-in',
  rollIn: 'rotate-in',
  flipInX: 'flip-x',
  flipInY: 'flip-y',
  lightSpeedIn: 'slide-right',
  bounce: 'pop',
  flash: 'fade-in',
  pulse: 'pop',
  rubberBand: 'pop',
  shake: 'pop',
  headShake: 'pop',
  swing: 'pop',
  tada: 'pop',
  wobble: 'pop',
  jello: 'pop',
};

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'p']);

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
    copy(out, src, `${from}_position`, `${to}_position`, (v) =>
      str(v) && str(v) !== 'initial' ? str(v).replace(/-/g, ' ') : undefined,
    );
    copy(out, src, `${from}_repeat`, `${to}_repeat`);
    copy(out, src, `${from}_size`, `${to}_size`, (v) =>
      str(v) && str(v) !== 'initial' ? str(v) : undefined,
    );
    if (str(src[`${from}_attachment`])) out[`${to}_attachment`] = str(src[`${from}_attachment`]);
  } else {
    color(out, src, `${from}_color_b`, `${to}_color_b`);
    // Elementor's default second color.
    if (!out[`${to}_color_b`]) out[`${to}_color_b`] = '#f2295b';
    const stop = size(src[`${from}_color_stop`]);
    if (stop) out[`${to}_stop`] = stop;
    const stopB = size(src[`${from}_color_b_stop`]);
    if (stopB) out[`${to}_stop_b`] = stopB;
    if (src[`${from}_gradient_type`] === 'radial') out[`${to}_gradient`] = 'radial';
    const angle = size(src[`${from}_gradient_angle`]);
    if (angle) out[`${to}_angle`] = angle;
  }
  return type;
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
      out._motion_scale = str(src[`${fx}scale_direction`]).startsWith('in') ? 'down' : 'up';
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
  copy(out, src, '_flex_order', '_order', (v) =>
    v === 'start' ? -99999 : v === 'end' ? 99999 : undefined,
  );
  copy(out, src, '_flex_order_custom', '_order', (v) => num(v) ?? undefined);
  const grow = str(src._flex_size);
  if (grow === 'grow') addCss(out, 'selector{flex-grow:1;flex-shrink:0}');
  else if (grow === 'shrink') addCss(out, 'selector{flex-grow:0;flex-shrink:1}');
  else if (grow === 'none') addCss(out, 'selector{flex-grow:0;flex-shrink:0}');
  else if (grow === 'custom') {
    addCss(
      out,
      `selector{flex-grow:${num(src._flex_grow) ?? 1};flex-shrink:${num(src._flex_shrink) ?? 1}}`,
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
  flexItem(out, src, true);
  proAdvanced(c, out, src);
}

function entrance(out: Settings, src: Settings, key: string, delayKey: string): void {
  const animation = ANIMATIONS[str(src[key])];
  if (!animation) return;
  out._animation = animation;
  const delay = num(src[delayKey]);
  if (delay) out._animation_delay = delay;
  const duration = str(src.animation_duration);
  if (duration === 'slow' || duration === 'fast') out._animation_duration = duration;
}

function hide(out: Settings, src: Settings): void {
  for (const device of ['desktop', 'tablet', 'mobile']) {
    const value = str(src[`hide_${device}`]);
    if (value.startsWith('hidden-') || value === 'yes') out[`_hide_${device}`] = true;
  }
}

/** Shapes Fresco's containers draw (the others are left out). */
const SHAPES = new Set(['tilt', 'triangle', 'curve', 'curve-asymmetrical', 'waves']);

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
    const first = c.media(list(src.background_slideshow_gallery)[0]);
    if (first) {
      out.background_type = 'classic';
      out.background_image = first;
      out.background_size = 'cover';
      out.background_position = 'center center';
    }
    c.note('background slideshows show their first image');
  }
  background(c, out, src, 'background_hover', 'background_hover');
  // Overlay: a plain color, or a gradient or an image (Fresco's overlay background), and its opacity.
  const overlay = str(src.background_overlay_background);
  const overlayImage = str(asSettings(src.background_overlay_image).url);
  if (overlay === 'gradient' || (overlay === 'classic' && overlayImage)) {
    background(c, out, src, 'background_overlay', 'overlay_bg');
    const opacity = num(asSettings(src.background_overlay_opacity).size);
    out.overlay_opacity = { size: opacity ?? 0.5, unit: '' };
  } else if (overlay === 'classic') {
    const value = colorOf(src, 'background_overlay_color');
    if (value) {
      out.overlay_color = value;
      const opacity = num(asSettings(src.background_overlay_opacity).size);
      out.overlay_opacity = { size: opacity ?? 0.5, unit: '' };
    }
  }
  border(out, src, 'border', 'border');
  const s = shadow(src, 'box_shadow');
  if (s) out.shadow = s;
  flexItem(out, src, false);
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
        if (link(src.link)) out.link = link(src.link);
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
        if (src.link_to === 'custom' && link(src.link)) {
          out.link_to = 'custom';
          out.link = link(src.link);
        }
        if (src.link_to === 'custom') c.dynamic(out, src, 'link', 'link', 'url');
        if (src.caption_source === 'custom') {
          out.caption_source = 'custom';
          out.caption = str(src.caption);
        } else if (src.caption_source === 'attachment') out.caption_source = 'alt';
        copy(out, src, 'width', 'width', (v) => size(v, c));
        copy(out, src, 'space', 'max_width', (v) => size(v, c));
        copy(out, src, 'height', 'height', (v) => size(v, c));
        if (str(src.object_fit)) out.object_fit = str(src.object_fit);
        const opacity = num(asSettings(src.opacity).size);
        if (opacity !== null) out.opacity = { size: opacity, unit: '' };
        border(out, src, 'image_border', 'image_border');
        copy(out, src, 'image_border_radius', 'image_border_radius', (v) => box(v));
        const s = shadow(src, 'image_box_shadow');
        if (s) out.image_shadow = s;
        if (['grow', 'shrink', 'float', 'rotate'].includes(str(src.hover_animation))) {
          out.hover_effect = str(src.hover_animation);
        }
        result = c.node('image', out);
        break;
      }
      case 'button': {
        out.text = str(src.text) || 'Click here';
        c.dynamic(out, src, 'text', 'text', 'text');
        out.link = link(src.link) ?? { url: '#' };
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
        if (src.background_background === 'gradient')
          c.note('gradient button backgrounds became their first color');
        const borderHover = colorOf(src, 'button_hover_border_color');
        if (borderHover) out.border_hover_color = borderHover;
        c.typography(out, src, 'typography', 'typography');
        copy(out, src, 'text_padding', 'padding', (v) => box(v, c));
        border(out, src, 'border', 'border');
        const s = shadow(src, 'button_box_shadow');
        if (s) out.shadow = s;
        if (['grow', 'shrink', 'float', 'pulse'].includes(str(src.hover_animation))) {
          out.hover_effect = str(src.hover_animation);
        }
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
          }
        }
        result = c.node('divider', out);
        break;
      case 'icon': {
        const value = c.icon(src.selected_icon);
        if (value) out.icon = value;
        if (['stacked', 'framed'].includes(str(src.view))) out.view = str(src.view);
        if (str(src.shape)) out.shape = str(src.shape);
        if (link(src.link)) out.link = link(src.link);
        c.dynamic(out, src, 'link', 'link', 'url');
        alignTo(out, src, 'align');
        color(out, src, 'primary_color', 'primary_color', 'hover_primary_color');
        color(out, src, 'secondary_color', 'secondary_color', 'hover_secondary_color');
        copy(out, src, 'size', 'size', (v) => size(v, c));
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
        if (link(src.link)) out.link = link(src.link);
        c.dynamic(out, src, 'link', 'link', 'url');
        const position = str(src.position);
        copy(out, src, 'position', 'position', (v) =>
          v === 'left' || v === 'inline-start'
            ? 'left'
            : v === 'right' || v === 'inline-end'
              ? 'right'
              : v === 'top' || v === 'block-start'
                ? 'top'
                : undefined,
        );
        if (position === 'block-end')
          c.note('icon boxes with the icon below the text show it above');
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
        if (type === 'icon-box') {
          const value = c.icon(src.selected_icon);
          if (value) out.icon = value;
          if (['stacked', 'framed'].includes(str(src.view))) out.view = str(src.view);
          if (str(src.shape)) out.shape = str(src.shape);
          color(out, src, 'primary_color', 'icon_primary_color', 'hover_primary_color');
          color(out, src, 'secondary_color', 'icon_secondary_color', 'hover_secondary_color');
          copy(out, src, 'icon_size', 'icon_size', (v) => size(v, c));
          copy(out, src, 'icon_space', 'media_spacing', (v) => size(v, c));
        } else {
          const image = c.media(src.image);
          if (image) out.image = image;
          copy(out, src, 'image_size', 'image_width', (v) => size(v, c));
          copy(out, src, 'image_space', 'media_spacing', (v) => size(v, c));
          border(out, src, 'image_border', 'image_border');
          copy(out, src, 'image_border_radius', 'image_border_radius', (v) => box(v));
        }
        result = c.node(type, out);
        break;
      }
      case 'icon-list':
        out.items = list(src.icon_list).map((item, i) => ({
          _id: str(item._id) || `i${i}`,
          text: str(item.text),
          ...(c.icon(item.selected_icon) ? { icon: c.icon(item.selected_icon) } : {}),
          ...(itemLink(item, ctx.entryRef) ? { link: itemLink(item, ctx.entryRef) } : {}),
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
        result = c.node('progress', out);
        break;
      case 'testimonial': {
        out.content = plainTitle(str(src.testimonial_content)).text;
        const image = c.media(src.testimonial_image);
        if (image) out.image = image;
        out.name = str(src.testimonial_name);
        out.job = str(src.testimonial_job);
        if (link(src.link)) out.link = link(src.link);
        alignTo(out, src, 'testimonial_alignment', 'align');
        if (['aside', 'top'].includes(str(src.testimonial_image_position))) {
          out.image_position = str(src.testimonial_image_position);
        }
        color(out, src, 'content_content_color', 'content_color');
        color(out, src, 'name_text_color', 'name_color');
        color(out, src, 'job_text_color', 'job_color');
        result = c.node('testimonial', out);
        break;
      }
      case 'social-icons':
        out.items = list(src.social_icon_list).map((item, i) => ({
          _id: str(item._id) || `s${i}`,
          ...(c.icon(item.social_icon) ? { icon: c.icon(item.social_icon) } : {}),
          ...(itemLink(item, ctx.entryRef) ? { link: itemLink(item, ctx.entryRef) } : {}),
        }));
        if (['rounded', 'square', 'circle'].includes(str(src.shape))) out.shape = str(src.shape);
        if (src.icon_color === 'custom') {
          out.look = 'custom';
          color(out, src, 'icon_primary_color', 'primary');
          color(out, src, 'icon_secondary_color', 'secondary');
        }
        copy(out, src, 'icon_size', 'size', (v) => size(v, c));
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
        result = c.node('alert', out);
        break;
      case 'video': {
        const source = str(src.video_type) || 'youtube';
        if (source === 'hosted') {
          out.source = 'hosted';
          const file =
            c.media(src.hosted_url) ??
            (str(src.external_url)
              ? { id: null, url: str(asSettings(src.external_url).url) }
              : undefined);
          if (file) out.file = file;
        } else {
          out.source = source === 'vimeo' ? 'vimeo' : 'youtube';
          out.url = str(src[`${out.source}_url`]);
          if (source === 'dailymotion' || source === 'videopress') {
            out.url = str(src[`${source}_url`]);
            c.note(`videos from ${source} became links to the video`);
          }
        }
        for (const key of ['autoplay', 'mute', 'loop']) if (yes(src[key])) out[key] = true;
        if (src.controls === '') out.controls = false;
        if (num(src.start) !== null) out.start = num(src.start);
        const poster = c.media(src.image_overlay);
        if (poster && yes(src.show_image_overlay)) out.poster = poster;
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
      case 'rating':
        if (num(src.rating) !== null) out.rating = num(src.rating);
        if (str(src.rating_scale) === '10') out.scale = '10';
        out.title = str(src.title);
        color(out, src, 'stars_color', 'color');
        color(out, src, 'stars_unmarked_color', 'empty');
        copy(out, src, 'icon_size', 'size', (v) => size(v, c));
        copy(out, src, 'icon_space', 'spacing', (v) => size(v, c));
        alignTo(out, src, 'align');
        result = c.node('star-rating', out);
        break;
      case 'image-carousel':
      case 'image-gallery': {
        const images = list(Array.isArray(src.carousel) ? src.carousel : src.wp_gallery)
          .map((image) => c.media(image))
          .filter(Boolean);
        out.images = images;
        if (type === 'image-carousel') {
          copy(out, src, 'slides_to_show', 'per_view', num);
          if (src.autoplay === 'no') out.autoplay = false;
          if (num(src.autoplay_speed)) out.interval = num(src.autoplay_speed)! / 1000;
          if (src.infinite === 'no') out.loop = false;
          if (str(src.navigation) && str(src.navigation) !== 'both')
            out.navigation = str(src.navigation);
          if (src.link_to === 'file') out.link_to = 'file';
          copy(out, src, 'image_spacing_custom', 'gap', (v) => size(v, c), false);
          result = c.node('image-carousel', out);
        } else {
          if (num(src.gallery_columns) !== null) out.columns = num(src.gallery_columns);
          if (src.gallery_link === 'none') out.link_to = 'none';
          copy(out, src, 'image_spacing_custom', 'gap', (v) => size(v, c), false);
          if (src.gallery_display_caption === 'none') out.captions = false;
          result = c.node('gallery', out);
        }
        break;
      }
      case 'text-path':
        out.text = str(src.text);
        if (str(src.path)) out.path = str(src.path);
        result = c.node('text-path', out);
        break;
      case 'audio':
        out.url = str(asSettings(src.link).url);
        result = c.node('audio', out);
        break;
      case 'tabs':
      case 'accordion':
      case 'toggle': {
        // Legacy widgets: each item's HTML becomes a container with a text.
        const items = list(src.tabs);
        const children = items.map((item) =>
          c.node('container', { _title: str(item.tab_title), content_width: 'full' }, [
            c.node('text', { content: str(item.tab_content) }),
          ]),
        );
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
          const converted = element(child);
          const first = converted[0];
          if (converted.length === 1 && first && first.type === 'fresco/container') {
            first.attrs = { ...first.attrs, _title: title, content_width: 'full' };
            return first;
          }
          return c.node('container', { _title: title, content_width: 'full' }, converted);
        });
        if (type === 'nested-accordion' && src.faq_schema === 'yes') out.faq = true;
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
        if (src[heightKey] === 'full' || src[heightKey] === 'min-height') {
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
        if (['', '_tablet', '_mobile'].some((device) => box(src[`margin${device}`]))) {
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
          for (const key of ['_hide_desktop', '_hide_tablet', '_hide_mobile']) {
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
          copy(extra, src, 'grid_columns_grid', 'grid_columns', (v) => {
            const n = num(asSettings(v).size);
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
        }
        copy(extra, src, 'flex_direction', 'flex_direction', (v) => str(v) || undefined);
        copy(extra, src, 'flex_justify_content', 'justify_content', (v) => str(v) || undefined);
        copy(extra, src, 'flex_align_items', 'align_items', (v) => str(v) || undefined);
        copy(extra, src, 'flex_wrap', 'flex_wrap', (v) => str(v) || undefined);
        // Gaps: one value per device; a different row gap goes to custom CSS.
        const gapKey = grid ? 'grid_gaps' : 'flex_gap';
        const rowGaps: string[] = [];
        copy(
          extra,
          src,
          gapKey,
          'gap',
          (v) => {
            const g = asSettings(v);
            const column = num(g.column) ?? num(g.size);
            const row = num(g.row);
            const unit = str(g.unit) === 'custom' ? 'px' : str(g.unit) || 'px';
            if (row !== null && column !== null && row !== column) rowGaps.push(`${row}${unit}`);
            return column !== null ? { size: column, unit } : undefined;
          },
          true,
        );
        if (rowGaps.length && !grid)
          addCss(extra, `selector > .fr-container__in{row-gap:${rowGaps[0]}}`);
        if (rowGaps.length && grid)
          addCss(extra, `selector > .fr-container__in{row-gap:${rowGaps[0]}}`);
        copy(extra, src, 'width', 'width', (v) => size(v, c));
        copy(extra, src, 'boxed_width', 'boxed_width', (v) => size(v, c));
        copy(extra, src, 'min_height', 'min_height', (v) => size(v, c));
        if (str(src.overflow) === 'hidden') extra.overflow = 'hidden';
        if (str(src.html_tag) && str(src.html_tag) !== 'div') extra.html_tag = str(src.html_tag);
        if (src.html_tag === 'a' && link(src.link)) extra.link = link(src.link);
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
