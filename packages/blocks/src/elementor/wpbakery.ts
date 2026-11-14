/**
 * WPBakery Page Builder's layouts (shortcodes `[vc_row]…[/vc_row]` in the
 * post content) → Fresco: each row, column and element is rewritten as
 * Elementor's own (sections, columns, widgets), then converted as those, so
 * backgrounds, spacing, images, buttons and galleries share one conversion.
 * The rules of `css=".vc_custom_…{…}"` come from the page's
 * `_wpb_shortcodes_custom_css`. Elements without a counterpart keep their
 * text and are reported by name. The shortcode names and their attributes
 * are a data format: they appear here only to be read.
 */
import type { CxdBlock } from '../cxd.js';
import { parseShortcodeAttrs } from '../html/shortcodes.js';
import { elementorToFresco, type ElementorContext, type ElementorNode } from './convert.js';
import { type Settings } from './values.js';

export interface WpBakeryNode {
  tag: string;
  attrs: Record<string, string>;
  children: WpBakeryNode[];
  /** The text inside the element (its HTML), without its child elements. */
  content: string;
  /** The opening tag as written. */
  open?: string;
  /** Whether a closing tag ended it. */
  closed?: boolean;
}

export interface WpBakeryContext extends ElementorContext {
  /** A WordPress attachment's address (image ids of WPBakery's elements). */
  attachmentUrl?(id: number): string | undefined;
}

/** Elements this file converts; any other `vc_` element is reported. */
const CONTAINERS = new Set([
  'vc_row',
  'vc_row_inner',
  'vc_section',
  'vc_column',
  'vc_column_inner',
  'vc_tta_tabs',
  'vc_tta_accordion',
  'vc_tta_tour',
  'vc_tta_section',
]);

const TAG = /\[(\/?)([a-z][a-z0-9_-]*)((?:[^\]"']|"[^"]*"|'[^']*')*?)(\/?)\]/gi;

/** Whether a text holds a WPBakery layout. */
export const isWpBakeryLayout = (text: string): boolean => /\[vc_row[\s\]]/.test(text);

/**
 * The elements of a layout as a tree: WPBakery's `vc_*` (and themes' elements
 * written as shortcodes inside its columns). Other shortcodes and HTML inside
 * an element are its content.
 */
export function parseWpBakery(text: string): WpBakeryNode[] {
  const root: WpBakeryNode = { tag: '', attrs: {}, children: [], content: '' };
  const stack: WpBakeryNode[] = [root];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const [, closing, rawTag, rawAttrs, selfClosing] = m;
    const tag = rawTag!.toLowerCase();
    const top = stack.at(-1)!;
    // Only rows, columns and their elements are elements; other shortcodes are text.
    const element = CONTAINERS.has(tag) || (top !== root && CONTAINERS.has(top.tag) && !closing);
    if (!element && !(closing && stack.some((s) => s.tag === tag))) continue;
    top.content += text.slice(last, m.index);
    last = m.index + m[0].length;
    if (closing) {
      const at = stack.findLastIndex((entry) => entry.tag === tag);
      if (at > 0) {
        stack[at]!.closed = true;
        stack.length = at;
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(parseShortcodeAttrs(rawAttrs ?? ''))) {
      if (!/^\d+$/.test(key)) attrs[key] = value;
    }
    const node: WpBakeryNode = { tag, attrs, children: [], content: '', open: m[0] };
    top.children.push(node);
    // Elements without a closing tag later in the text are single.
    const closes = new RegExp(`\\[/${tag}\\]`, 'i').test(text.slice(last));
    if (!selfClosing && (CONTAINERS.has(tag) || closes)) stack.push(node);
  }
  stack.at(-1)!.content += text.slice(last);
  return root.children;
}

/** `.vc_custom_123{margin-top:10px !important;…}` → declarations by class. */
export function customCss(css: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (const m of css.matchAll(/\.(vc_custom_\d+)\s*\{([^}]*)\}/g)) {
    const rules: Record<string, string> = {};
    for (const decl of m[2]!.split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      const name = decl.slice(0, at).trim().toLowerCase();
      const value = decl
        .slice(at + 1)
        .replace(/!important/gi, '')
        .trim();
      if (name && value) rules[name] = value;
    }
    out.set(m[1]!, rules);
  }
  return out;
}

const px = (value: string | undefined) => {
  const m = /^(-?\d+(?:\.\d+)?)(px|em|rem|%|vh|vw)?$/.exec((value ?? '').trim());
  return m ? { size: Number(m[1]), unit: m[2] ?? 'px' } : undefined;
};
const box = (top?: string, right?: string, bottom?: string, left?: string) => {
  let sides = [top, right, bottom, left].map((v) => px(v));
  if (sides.every((s) => !s)) return undefined;
  // One unit for the four sides: with px and %, the percentages are taken on
  // the default content width (1140px), as WPBakery's rows are.
  if (new Set(sides.filter((s) => s && s.size).map((s) => s!.unit)).size > 1)
    sides = sides.map((s) =>
      s && s.unit === '%' ? { size: Math.round(s.size * 11.4), unit: 'px' } : s,
    );
  const unit = sides.find((s) => s && s.size)?.unit ?? sides.find(Boolean)!.unit;
  return {
    unit,
    top: String(sides[0]?.size ?? 0),
    right: String(sides[1]?.size ?? 0),
    bottom: String(sides[2]?.size ?? 0),
    left: String(sides[3]?.size ?? 0),
    isLinked: false,
  };
};

/** `margin: 10px 0` style shorthands → the four sides. */
const sidesOf = (value: string | undefined): [string?, string?, string?, string?] => {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const [a, b = a, c = a, d = b] = parts;
  return [a, b, c, d];
};

/** URL parts of WPBakery's links: `url:https%3A%2F%2F…|title:…|target:_blank`. */
function vcLink(value: string | undefined): Settings | undefined {
  if (!value) return undefined;
  const parts = Object.fromEntries(
    value.split('|').map((p) => {
      const at = p.indexOf(':');
      return at < 0 ? [p, ''] : [p.slice(0, at), decodeURIComponent(p.slice(at + 1))];
    }),
  ) as Record<string, string>;
  if (!parts.url) return undefined;
  return { url: parts.url, is_external: /_blank/.test(parts.target ?? '') ? 'on' : '' };
}

/** `tag:h2|font_size:32|text_align:center|color:%23333` → its parts. */
const fontContainer = (value: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (value ?? '')
      .split('|')
      .filter(Boolean)
      .map((p) => {
        const at = p.indexOf(':');
        return [p.slice(0, at), decodeURIComponent(p.slice(at + 1))];
      }),
  );

const fraction = (width: string | undefined): number => {
  const m = /^(\d+)\/(\d+)$/.exec((width ?? '').trim());
  return m ? (Number(m[1]) / Number(m[2])) * 100 : 100;
};

/** WordPress's wpautop on an element's text, as far as these texts need it (and its stray `</p>`, `<p>`). */
export function vcAutop(html: string): string {
  const text = html
    .trim()
    .replace(/^(\s*<\/p>)+/i, '')
    .replace(/(<p>\s*)+$/i, '')
    .trim();
  if (!text) return '';
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.join('<br />\n')}</p>`);
    para = [];
  };
  const BLOCK = /(<(h[1-6]|ul|ol|table|blockquote|div|figure|pre)\b[\s\S]*?<\/\2>|<hr\s*\/?>)/gi;
  let last = 0;
  const lines = (chunk: string) => {
    for (const line of chunk.split('\n')) {
      if (!line.trim()) {
        flush();
        continue;
      }
      // Existing paragraphs: their content.
      const pieces = line.trim().split(/<\/?p\b[^>]*>/i);
      pieces.forEach((piece, i) => {
        if (piece.trim()) para.push(piece.trim());
        else if (i > 0 || pieces.length > 1) flush();
      });
    }
  };
  for (const m of text.matchAll(BLOCK)) {
    lines(text.slice(last, m.index));
    flush();
    out.push(m[0].trim());
    last = m.index + m[0].length;
  }
  lines(text.slice(last));
  flush();
  return out.join('\n');
}

/** A text that is one heading (with inline spans for its color): its parts, otherwise null. */
function loneHeading(html: string) {
  const m = /^\s*<(h[1-6])((?:\s[^>]*)?)>([\s\S]*?)<\/\1>\s*$/i.exec(html);
  if (!m || /<(?!\/?(span|strong|b|br|em)\b)[a-z]/i.test(m[3]!)) return null;
  const style = `${m[2] ?? ''} ${[...m[3]!.matchAll(/style="([^"]*)"/g)].map((x) => x[1]).join(' ')}`;
  return {
    tag: m[1]!.toLowerCase(),
    title: m[3]!
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim(),
    color: /(?<![-\w])color:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i.exec(style)?.[1],
    align: /text-align:\s*(left|center|right|justify)/i.exec(style)?.[1],
    bold: /<(strong|b)\b/i.test(m[3]!),
  };
}

/** WPBakery's color names (buttons, separators, icons) → their color. */
const VC_COLORS: Record<string, string> = {
  blue: '#5472d2',
  turquoise: '#00c1cf',
  pink: '#fe6c61',
  violet: '#8d6dc4',
  peacoc: '#4cadc9',
  chino: '#cec2ab',
  'mulled-wine': '#50485b',
  'vista-blue': '#75d69c',
  black: '#2a2a2a',
  grey: '#ebebeb',
  orange: '#f7be68',
  sky: '#5aa1e3',
  green: '#6dab3c',
  'juicy-pink': '#f4524d',
  'sandy-brown': '#f79468',
  purple: '#b97ebb',
  white: '#ffffff',
};

/** Font Awesome classes (`fa fa-gift`, `fab fa-x`) → Elementor's icon. */
const faIcon = (value: string) => ({
  value: value.trim().replace(/^fa /, 'fas '),
  library: /^fab /.test(value.trim())
    ? 'fa-brands'
    : /^far /.test(value.trim())
      ? 'fa-regular'
      : 'fa-solid',
});

/** A column's width on a device from `offset="vc_col-lg-4 vc_col-md-6"` (twelfths), if given. */
const offsetWidth = (offset: string | undefined, device: 'lg' | 'md' | 'sm' | 'xs') => {
  const m = new RegExp(`vc_col-${device}-(\\d+)(?:\\/5)?\\b`).exec(offset ?? '');
  return m ? (Number(m[1]) / 12) * 100 : undefined;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of ASCII text (WPBakery encodes URL-encoded text) → the text. */
function base64Ascii(value: string): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const ch of value.replace(/[^A-Za-z0-9+/]/g, '')) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 0xff);
    }
  }
  return out;
}

/** WPBakery's `vc_raw_html` content: base64 of the URL-encoded HTML. */
function rawHtml(content: string): string {
  try {
    return decodeURIComponent(base64Ascii(content.trim()));
  } catch {
    return content;
  }
}

/** Attributes WPBakery encodes as `#E-8_` + base64 of the URL-encoded text (links, map frames). */
export function vcEncoded(value: string | undefined): string {
  const v = (value ?? '').trim();
  return v.startsWith('#E-8_') ? rawHtml(v.slice(5)) : v;
}

let counter = 0;
const id = () => `wb${(counter++).toString(36)}`;

/** A layout (the post content and its custom CSS) → Fresco blocks, or null when it has no row. */
export function wpbakeryToFresco(
  content: string,
  css: string,
  ctx: WpBakeryContext,
): CxdBlock[] | null {
  const tree = parseWpBakery(content);
  if (!tree.length) return null;
  const rules = customCss(css);
  const unknown = new Map<string, number>();

  const image = (value: string | undefined): Settings | undefined => {
    const n = Number((value ?? '').split(',')[0]);
    if (!Number.isInteger(n) || n <= 0) {
      const url = (value ?? '').trim();
      return /^https?:\/\//.test(url) ? { id: '', url } : undefined;
    }
    const url = ctx.attachmentUrl?.(n);
    return url ? { id: n, url } : undefined;
  };

  /** The `css` attribute's rules (spacing, background, border radius) as Elementor settings. */
  const cssOf = (
    attrs: Record<string, string>,
    prefix = '',
    widget = false,
    defaults: { margin?: string[]; padding?: string[] } = {},
  ): Settings => {
    const name = /vc_custom_\d+/.exec(attrs.css ?? '')?.[0];
    // The rules are in the page's custom CSS, and written in the attribute too.
    const r = (name ? (rules.get(name) ?? customCss(attrs.css ?? '').get(name)) : undefined) ?? {};
    const out: Settings = {};
    // WPBakery's own spacing (under elements, beside columns), unless the design options set it.
    const side = (kind: 'margin' | 'padding') => {
      const short = sidesOf(r[kind]);
      const sides = (['top', 'right', 'bottom', 'left'] as const).map(
        (s, i) => r[`${kind}-${s}`] ?? short[i] ?? defaults[kind]?.[i],
      );
      return box(...sides);
    };
    const padding = side('padding');
    const margin = side('margin');
    if (padding) out[`${widget ? '_' : prefix}padding`] = padding;
    if (margin) out[`${widget ? '_' : prefix}margin`] = margin;
    const bgColor =
      r['background-color'] ?? (/^#|^rgb/.test(r.background ?? '') ? r.background : undefined);
    const bgUrl = /url\(["']?([^"')]+)["']?\)/.exec(
      r['background-image'] ?? r.background ?? '',
    )?.[1];
    if (bgColor || bgUrl) {
      out[`${widget ? '_' : ''}background_background`] = 'classic';
      if (bgColor) out[`${widget ? '_' : ''}background_color`] = bgColor;
      if (bgUrl) {
        const attachment = Number(/[?&]id=(\d+)/.exec(bgUrl)?.[1]);
        out[`${widget ? '_' : ''}background_image`] = {
          url: bgUrl.replace(/\?id=\d+$/, ''),
          id: Number.isInteger(attachment) && attachment > 0 ? attachment : '',
        };
        out[`${widget ? '_' : ''}background_size`] = /contain/.test(r['background-size'] ?? '')
          ? 'contain'
          : 'cover';
        out[`${widget ? '_' : ''}background_position`] = 'center center';
      }
    }
    const p = widget ? '_' : '';
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    const [wt, wr, wb, wl] = sidesOf(r['border-width']);
    const widths = sides.map((s, i) => r[`border-${s}-width`] ?? [wt, wr, wb, wl][i]);
    const style = r['border-style'] ?? sides.map((s) => r[`border-${s}-style`]).find(Boolean);
    const borderWidth = box(...widths);
    if (style && style !== 'none' && borderWidth) {
      out[`${p}border_border`] = style.split(/\s+/)[0];
      out[`${p}border_width`] = borderWidth;
      const borderColor =
        r['border-color'] ?? sides.map((s) => r[`border-${s}-color`]).find(Boolean);
      if (borderColor) out[`${p}border_color`] = borderColor;
    }
    const radius = px(r['border-radius']);
    if (radius) {
      out[`${widget ? '_' : ''}border_radius`] = {
        unit: radius.unit,
        top: String(radius.size),
        right: String(radius.size),
        bottom: String(radius.size),
        left: String(radius.size),
        isLinked: true,
      };
    }
    return out;
  };

  /** An element's id, classes and design options; `gap` is WPBakery's space under it. */
  const common = (attrs: Record<string, string>, gap = 35): Settings => ({
    ...(attrs.el_id ? { _element_id: attrs.el_id } : {}),
    ...(attrs.el_class ? { _css_classes: attrs.el_class } : {}),
    ...cssOf(attrs, '', true, gap ? { margin: ['0', '0', `${gap}px`, '0'] } : {}),
  });

  const widget = (widgetType: string, settings: Settings): ElementorNode => ({
    id: id(),
    elType: 'widget',
    widgetType,
    settings,
    elements: [],
  });

  /** Plain HTML of an element (and of what is inside it), e.g. for tabs. */
  const htmlOf = (node: WpBakeryNode): string =>
    [
      node.content,
      ...node.children.map((child) =>
        child.tag === 'vc_raw_html' ? rawHtml(child.content) : htmlOf(child),
      ),
    ]
      .join('\n')
      .trim();

  const element = (node: WpBakeryNode): ElementorNode[] => {
    const a = node.attrs;
    switch (node.tag) {
      case 'vc_row':
      case 'vc_row_inner':
      case 'vc_section':
        return [row(node)];
      case 'vc_column_text': {
        const html = vcAutop(node.content);
        if (!html) return [];
        // A text that is one heading is a heading.
        const heading = loneHeading(node.content.replace(/^(\s*<\/p>)+|(<p>\s*)+$/gi, ''));
        if (heading)
          return [
            widget('heading', {
              title: heading.title,
              header_size: heading.tag,
              ...(heading.align ? { align: heading.align } : {}),
              ...(heading.color ? { title_color: heading.color } : {}),
              ...(heading.bold
                ? { typography_typography: 'custom', typography_font_weight: '700' }
                : {}),
              ...common(a),
            }),
          ];
        return [widget('text-editor', { editor: html, ...common(a) })];
      }
      case 'vc_custom_heading': {
        const font = fontContainer(a.font_container);
        const family = /font_family:([^%|:]+)/.exec(decodeURIComponent(a.google_fonts ?? ''))?.[1];
        const weight = /font_style:(\d{3})/.exec(decodeURIComponent(a.google_fonts ?? ''))?.[1];
        return [
          widget('heading', {
            title: a.text ?? node.content,
            header_size: /^h[1-6]$|^p$|^div$/.test(font.tag ?? '') ? font.tag : 'h2',
            ...(font.text_align ? { align: font.text_align } : {}),
            ...(font.color ? { title_color: font.color } : {}),
            ...(font.font_size || family || weight
              ? {
                  typography_typography: 'custom',
                  ...(px(font.font_size) ? { typography_font_size: px(font.font_size) } : {}),
                  ...(px(font.line_height)
                    ? { typography_line_height: { unit: 'em', size: Number(font.line_height) } }
                    : {}),
                  ...(family ? { typography_font_family: family } : {}),
                  ...(weight ? { typography_font_weight: weight } : {}),
                }
              : {}),
            ...(vcLink(a.link) ? { link: vcLink(a.link) } : {}),
            ...common(a),
          }),
        ];
      }
      case 'vc_single_image': {
        const picture =
          image(a.image) ?? (a.source === 'external_link' ? image(a.custom_src) : undefined);
        if (!picture) return [];
        const link =
          a.link && (a.onclick === 'custom_link' || !a.onclick)
            ? { url: a.link, is_external: /_blank/.test(a.img_link_target ?? '') ? 'on' : '' }
            : undefined;
        return [
          widget('image', {
            image: picture,
            // WPBakery's size: a name of WordPress's sizes, or a crop `600x700`.
            ...(/^\d+x\d+$/.test(a.img_size ?? '')
              ? {
                  image_size: 'custom',
                  image_custom_dimension: {
                    width: Number(a.img_size!.split('x')[0]),
                    height: Number(a.img_size!.split('x')[1]),
                  },
                }
              : { image_size: a.img_size || 'thumbnail' }),
            align: a.alignment === 'center' || a.alignment === 'right' ? a.alignment : 'left',
            ...(a.onclick === 'img_link_large' ||
            a.onclick === 'link_image' ||
            a.img_link_large === 'yes'
              ? { link_to: 'file', open_lightbox: 'yes' }
              : link
                ? { link_to: 'custom', link }
                : {}),
            ...(a.add_caption === 'yes' ? { caption_source: 'attachment' } : {}),
            ...(a.title ? { _title: a.title } : {}),
            ...common(a),
          }),
        ];
      }
      case 'vc_btn':
      case 'vc_button':
      case 'vc_button2': {
        const link = vcLink(a.link ?? a.url);
        const named = VC_COLORS[a.color ?? 'grey'] ?? VC_COLORS.grey!;
        const custom = a.color === 'custom' || a.style === 'custom';
        const look: Settings =
          a.style === 'outline' || a.style === 'outline-custom'
            ? {
                background_color: 'transparent',
                button_text_color: a.outline_custom_color ?? (a.color ? named : '#ffffff'),
                border_border: 'solid',
                border_width: {
                  unit: 'px',
                  top: '2',
                  right: '2',
                  bottom: '2',
                  left: '2',
                  isLinked: true,
                },
                border_color: a.outline_custom_color ?? (a.color ? named : '#ffffff'),
              }
            : custom
              ? {
                  ...(a.custom_background ? { background_color: a.custom_background } : {}),
                  ...(a.custom_text ? { button_text_color: a.custom_text } : {}),
                }
              : a.color
                ? {
                    background_color: named,
                    button_text_color:
                      a.color === 'white' || a.color === 'grey' ? '#2a2a2a' : '#ffffff',
                  }
                : {};
        return [
          widget('button', {
            text: a.title ?? 'Text on the button',
            ...(link ? { link } : {}),
            align:
              a.button_block === 'true'
                ? 'justify'
                : a.align === 'center' || a.align === 'right' || a.align === 'left'
                  ? a.align
                  : '',
            size: { xs: 'xs', sm: 'sm', md: 'md', lg: 'lg' }[a.size ?? ''] ?? 'sm',
            ...look,
            ...(a.add_icon === 'true' && a.i_icon_fontawesome
              ? {
                  selected_icon: faIcon(a.i_icon_fontawesome),
                  icon_align: a.i_align === 'right' ? 'right' : 'left',
                }
              : {}),
            // WPBakery's buttons have 21.735px under them.
            ...common(a, 22),
          }),
        ];
      }
      case 'vc_gallery':
      case 'vc_images_carousel': {
        const pictures = (a.images ?? '')
          .split(',')
          .map((v) => image(v.trim()))
          .filter((p): p is Settings => Boolean(p));
        if (!pictures.length) return [];
        // A gallery is a slideshow unless it is a grid (WPBakery's default is a slider).
        const carousel = node.tag === 'vc_images_carousel' || a.type !== 'image_grid';
        const slideshow = node.tag === 'vc_gallery';
        const links = vcEncoded(a.custom_links)
          .split(/[,\n]/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (a.onclick === 'custom_link' && links.length > 1)
          ctx.warn(
            `A WPBakery carousel linked each image to its own address: the images were kept, their links (${links.join(', ')}) were not.`,
          );
        return [
          carousel
            ? widget('image-carousel', {
                carousel: pictures,
                // A gallery's slideshow: one picture at a time, fading by default, every `interval` seconds.
                slides_to_show: String(slideshow ? 1 : Number(a.slides_per_view) || 1),
                ...(a.autoplay === 'yes' || slideshow ? {} : { autoplay: 'no' }),
                ...(slideshow
                  ? { autoplay_speed: (Number(a.interval) || 5) * 1000 }
                  : Number(a.speed) > 0
                    ? { autoplay_speed: Number(a.speed) }
                    : {}),
                ...(a.wrap === 'yes' || slideshow ? {} : { infinite: 'no' }),
                ...(slideshow && (a.type ?? 'flexslider_fade') === 'flexslider_fade'
                  ? { effect: 'fade' }
                  : {}),
                ...(a.hide_pagination_control === 'yes' && a.hide_prev_next_buttons === 'yes'
                  ? { navigation: 'none' }
                  : a.hide_pagination_control === 'yes'
                    ? { navigation: 'arrows' }
                    : a.hide_prev_next_buttons === 'yes'
                      ? { navigation: 'dots' }
                      : {}),
                ...(a.onclick === 'link_image' ? { link_to: 'file' } : {}),
                ...(a.onclick === 'custom_link' && links.length === 1
                  ? {
                      link_to: 'custom',
                      link: {
                        url: links[0],
                        is_external: /_blank/.test(a.custom_links_target ?? '') ? 'on' : '',
                      },
                    }
                  : {}),
                ...common(a),
              })
            : widget('image-gallery', {
                wp_gallery: pictures,
                gallery_columns: String(Math.min(10, Number(a.columns) || 3)),
                gallery_link: a.onclick === 'link_image' ? 'file' : 'none',
                ...common(a),
              }),
        ];
      }
      case 'vc_separator':
      case 'vc_text_separator':
        return [
          widget('divider', {
            color: a.accent_color ?? VC_COLORS[a.color ?? 'grey'] ?? VC_COLORS.grey,
            ...(['solid', 'double', 'dotted', 'dashed'].includes(a.style ?? '')
              ? { style: a.style }
              : {}),
            weight: { size: Number(a.border_width) || 1, unit: 'px' },
            ...(a.el_width ? { width: { unit: '%', size: Number(a.el_width) } } : {}),
            align:
              a.align === 'align_left' ? 'left' : a.align === 'align_right' ? 'right' : 'center',
            ...(node.tag === 'vc_text_separator' && a.title
              ? { look: 'line_text', text: a.title }
              : {}),
            ...common(a),
          }),
        ];
      case 'vc_empty_space':
        return [
          widget('spacer', {
            space: px(a.height ?? '32px') ?? { size: 32, unit: 'px' },
            ...common(a, 0),
          }),
        ];
      case 'vc_video': {
        const url = a.link ?? '';
        const vimeo = /vimeo\.com/.test(url);
        return url
          ? [
              widget(
                'video',
                vimeo
                  ? { video_type: 'vimeo', vimeo_url: url }
                  : { video_type: 'youtube', youtube_url: url, ...common(a) },
              ),
            ]
          : [];
      }
      case 'vc_gmaps': {
        const frame = vcEncoded(a.link);
        const src =
          /src=["']([^"']+)["']/.exec(frame)?.[1] ?? (/^https?:/.test(frame) ? frame : '');
        // The address: the `q` of the address, the place's name of a `pb` embed, or its coordinates.
        const named = /[?&]q=([^&"]+)/.exec(frame)?.[1] ?? /!2s([^!]+)!/.exec(frame)?.[1];
        const point = /!2d(-?[\d.]+)!3d(-?[\d.]+)/.exec(frame);
        const query = named ?? (point ? `${point[2]},${point[1]}` : undefined);
        const height = { size: Number(a.size) > 0 ? Number(a.size) : 300, unit: 'px' };
        if (query)
          return [
            widget('google_maps', {
              address: decodeURIComponent(query.replace(/\+/g, ' ')),
              height,
              zoom: { size: 15, unit: 'px' },
              ...common(a),
            }),
          ];
        return src
          ? [
              widget('html', {
                html: `<iframe src="${src.replace(/"/g, '&quot;')}" width="100%" height="${height.size}" style="border:0" loading="lazy" allowfullscreen></iframe>`,
                ...common(a),
              }),
            ]
          : [];
      }
      case 'vc_hoverbox': {
        const picture = image(a.image);
        const title = a.primary_title ?? a.hover_title ?? '';
        const color = fontContainer(a.primary_title_font_container).color;
        return [
          widget('image-box', {
            ...(picture ? { image: picture } : {}),
            title_text: title,
            description_text:
              node.content.trim() ||
              (a.hover_title && a.hover_title !== title ? a.hover_title : ''),
            ...(color ? { title_color: color } : {}),
            ...(vcLink(a.hover_btn_link) ? { link: vcLink(a.hover_btn_link) } : {}),
            ...common(a),
          }),
        ];
      }
      case 'vc_raw_html':
        return [widget('html', { html: rawHtml(node.content), ...common(a) })];
      case 'vc_icon': {
        // WPBakery's default icon is Font Awesome's "adjust"; other sets show the closest.
        const value =
          a.type && a.type !== 'fontawesome'
            ? 'fa fa-circle'
            : (a.icon_fontawesome ?? 'fa fa-adjust');
        if (a.type && a.type !== 'fontawesome')
          ctx.warn(
            `A WPBakery icon of the set "${a.type}" became a Font Awesome circle: choose its icon in Fresco.`,
          );
        const link = vcLink(a.link);
        return [
          widget('icon', {
            selected_icon: faIcon(value),
            align: a.align === 'center' || a.align === 'right' ? a.align : 'left',
            primary_color:
              a.color === 'custom'
                ? (a.custom_color ?? '#5472d2')
                : (VC_COLORS[a.color ?? 'blue'] ?? '#5472d2'),
            size: {
              size: { xs: 14, sm: 21, md: 28, lg: 42, xl: 56 }[a.size ?? 'md'] ?? 28,
              unit: 'px',
            },
            ...(link ? { link } : {}),
            ...common(a),
          }),
        ];
      }
      case 'vc_message':
        return [
          widget('alert', {
            alert_type: 'info',
            alert_title: '',
            alert_description: node.content.trim(),
            ...common(a),
          }),
        ];
      case 'vc_tta_tabs':
      case 'vc_tta_tour':
      case 'vc_tta_accordion': {
        const sections = node.children.filter((child) => child.tag === 'vc_tta_section');
        const items = sections.map((section, i) => ({
          _id: id(),
          tab_title: section.attrs.title ?? `${i + 1}`,
          tab_content: htmlOf(section),
        }));
        return [
          widget(node.tag === 'vc_tta_accordion' ? 'accordion' : 'tabs', {
            tabs: items,
            ...common(a),
          }),
        ];
      }
      default: {
        // Other plugins' shortcodes (shops, forms…): active plugins may take them on import.
        if (!node.tag.startsWith('vc_') && node.open) {
          const text = `${node.open}${node.content}${node.closed ? `[/${node.tag}]` : ''}`;
          return [widget('shortcode', { shortcode: text, ...common(a) })];
        }
        // Elements without a counterpart (of WPBakery or of a theme): their text stays.
        unknown.set(node.tag, (unknown.get(node.tag) ?? 0) + 1);
        const text = htmlOf(node);
        return text ? [widget('text-editor', { editor: text })] : [];
      }
    }
  };

  /** Whether an element's design options give it a background (WPBakery's "has fill"). */
  const filled = (attrs: Record<string, string>) => {
    const r = cssOf(attrs);
    return Boolean(r.background_background);
  };

  /**
   * A column. WPBakery's columns have 15px on each side, and their row 15px
   * less on each side: the content of the first and last columns lines up
   * with the page's. In Fresco the row is the page's width, so those two
   * have no padding on that side (on phones, where columns stack, they have
   * both). Rows with a background (and columns with one) add 35px above the
   * content, for the 35px under the last element.
   */
  const column = (
    node: WpBakeryNode,
    place: { first: boolean; last: boolean; spacing: 'edges' | 'gutters' | 'none'; fill: boolean },
  ): ElementorNode => {
    const size = offsetWidth(node.attrs.offset, 'lg') ?? fraction(node.attrs.width);
    const tablet = offsetWidth(node.attrs.offset, 'md') ?? offsetWidth(node.attrs.offset, 'sm');
    const mobile = offsetWidth(node.attrs.offset, 'xs');
    const round = (n: number) => Math.round(n * 1000) / 1000;
    const gutter = place.spacing === 'none' ? '0' : '15px';
    const top = place.fill || filled(node.attrs) ? '35px' : '0';
    const own = cssOf(node.attrs, '', false, {
      padding: [
        top,
        place.spacing === 'edges' && place.last ? '0' : gutter,
        '0',
        place.spacing === 'edges' && place.first ? '0' : gutter,
      ],
    });
    const phone = place.spacing === 'edges' && (place.first || place.last);
    return {
      id: id(),
      elType: 'column',
      settings: {
        _column_size: Math.round(size),
        _inline_size: size === 100 ? null : round(size),
        ...(tablet !== undefined ? { _inline_size_tablet: round(tablet) } : {}),
        ...(mobile !== undefined ? { _inline_size_mobile: round(mobile) } : {}),
        space_between_widgets: { size: 0, unit: 'px' },
        ...own,
        ...(phone && !/padding/.test(JSON.stringify(cssOf(node.attrs)))
          ? {
              padding_mobile: {
                unit: 'px',
                top: String(parseFloat(top)),
                right: '15',
                bottom: '0',
                left: '15',
                isLinked: false,
              },
            }
          : {}),
        ...(node.attrs.el_id ? { _element_id: node.attrs.el_id } : {}),
        ...(node.attrs.el_class ? { css_classes: node.attrs.el_class } : {}),
      },
      elements: [
        ...(node.content.trim()
          ? [widget('text-editor', { editor: vcAutop(node.content), ...common({}) })]
          : []),
        ...node.children.flatMap(element),
      ],
    };
  };

  const row = (node: WpBakeryNode): ElementorNode => {
    const a = node.attrs;
    const inner = node.tag === 'vc_row_inner';
    const columns = node.children.filter((c) => /^vc_column(_inner)?$/.test(c.tag));
    const others = node.children.filter((c) => !/^vc_column(_inner)?$/.test(c.tag));
    const stretched =
      a.full_width === 'stretch_row' ||
      a.full_width === 'stretch_row_content' ||
      a.full_width === 'stretch_row_content_no_spaces';
    const spacing =
      a.full_width === 'stretch_row_content_no_spaces'
        ? 'none'
        : a.full_width === 'stretch_row_content'
          ? 'gutters'
          : 'edges';
    const fill = filled(a) || Boolean(a.parallax_image) || a.video_bg === 'yes';
    const list = columns.length
      ? columns
      : [{ tag: 'vc_column', attrs: {}, children: others, content: node.content }];
    return {
      id: id(),
      elType: 'section',
      ...(inner ? { isInner: true } : {}),
      settings: {
        ...(stretched ? { stretch_section: 'section-stretched' } : {}),
        layout:
          a.full_width === 'stretch_row_content' || a.full_width === 'stretch_row_content_no_spaces'
            ? 'full_width'
            : 'boxed',
        ...(a.full_height === 'yes' ? { height: 'full' } : {}),
        ...(a.full_height === 'yes'
          ? {
              column_position:
                a.columns_placement === 'top'
                  ? 'top'
                  : a.columns_placement === 'bottom'
                    ? 'bottom'
                    : a.columns_placement === 'stretch'
                      ? 'stretch'
                      : 'middle',
            }
          : {}),
        ...(a.content_placement === 'middle'
          ? { content_position: 'middle' }
          : a.content_placement === 'bottom'
            ? { content_position: 'bottom' }
            : {}),
        ...(a.parallax ? { background_attachment: 'fixed' } : {}),
        ...(a.parallax_image
          ? {
              background_background: 'classic',
              background_image: image(a.parallax_image),
              background_size: 'cover',
            }
          : {}),
        ...(a.video_bg === 'yes' && a.video_bg_url
          ? { background_background: 'video', background_video_link: a.video_bg_url }
          : {}),
        ...cssOf(a),
        ...(a.el_id ? { _element_id: a.el_id } : {}),
        ...(a.el_class ? { css_classes: a.el_class } : {}),
      },
      elements: list.map((c, i) =>
        column(c, { first: i === 0, last: i === list.length - 1, spacing, fill }),
      ),
    };
  };

  // Columns outside a row (WPBakery shows them as one) share a row.
  const elements: ElementorNode[] = [];
  let loose: WpBakeryNode[] = [];
  const flush = () => {
    if (loose.length)
      elements.push(row({ tag: 'vc_row', attrs: {}, children: loose, content: '' }));
    loose = [];
  };
  for (const node of tree) {
    if (node.tag === 'vc_column') {
      loose.push(node);
      continue;
    }
    flush();
    elements.push(...(/^vc_(row|section)$/.test(node.tag) ? [row(node)] : element(node)));
  }
  flush();
  for (const [tag, n] of unknown) {
    ctx.warn(
      `${n} WPBakery element(s) "${tag}" have no Fresco counterpart yet: their text, if any, was kept.`,
    );
  }
  return elementorToFresco(JSON.stringify(elements), ctx);
}
