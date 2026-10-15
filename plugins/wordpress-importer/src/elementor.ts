/**
 * Pages built with Elementor (`_elementor_data`) become Fresco pages: sections,
 * columns and containers become Fresco containers, the common widgets their
 * Fresco counterparts with their main settings (texts, links, images, colors,
 * typography, spacing, per-device values). Widgets with no counterpart keep
 * their text and are reported.
 */
import type { CxdBlock } from '@cleitext/blocks';
import { newBlockId } from '@cleitext/blocks';

type Settings = Record<string, unknown>;

interface ElementorNode {
  id?: string;
  elType?: string;
  widgetType?: string;
  isInner?: boolean;
  settings?: Settings | unknown[];
  elements?: ElementorNode[];
}

export interface ElementorContext {
  /** WordPress attachment id → media ref of the transfer document. */
  mediaRef: (attachment: number) => string | undefined;
  warn: (message: string) => void;
}

const DEVICES: [string, string][] = [
  ['', ''],
  ['_tablet', '@tablet'],
  ['_mobile', '@mobile'],
];

const asSettings = (value: unknown): Settings =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Settings) : {};

const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number.parseFloat(str(value));
  return Number.isFinite(n) ? n : null;
};

/** Elementor `{ unit, size }` → Fresco size, or undefined when empty. */
function size(value: unknown): { size: number; unit: string } | undefined {
  const v = asSettings(value);
  const n = num(v.size);
  if (n === null) return undefined;
  return { size: n, unit: str(v.unit) || 'px' };
}

/** Elementor dimensions → Fresco box, or undefined when every side is empty. */
function box(value: unknown) {
  const v = asSettings(value);
  const side = (key: string) => {
    const n = num(v[key]);
    return n === null ? ('' as const) : n;
  };
  const result = {
    top: side('top'),
    right: side('right'),
    bottom: side('bottom'),
    left: side('left'),
    unit: str(v.unit) || 'px',
    linked: v.isLinked !== false,
  };
  return [result.top, result.right, result.bottom, result.left].every((s) => s === '')
    ? undefined
    : result;
}

/** A global color reference (`globals/colors?id=primary`) → the kit variable. */
function globalColor(globals: Settings, key: string): string | undefined {
  const ref = str(globals[key]);
  const id = /globals\/colors\?id=([\w-]+)/.exec(ref)?.[1];
  return id ? `var(--fr-c-${id})` : undefined;
}

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i;

/** Copies settings one to one (with per-device variants) through a transform. */
function copy(
  out: Settings,
  src: Settings,
  from: string,
  to: string,
  transform: (value: unknown) => unknown = (v) => (v === '' ? undefined : v),
  responsive = true,
) {
  for (const [suffix, target] of responsive ? DEVICES : DEVICES.slice(0, 1)) {
    const value = transform(src[`${from}${suffix}`]);
    if (value !== undefined && value !== null && value !== '') out[`${to}${target}`] = value;
  }
}

function color(out: Settings, src: Settings, from: string, to: string) {
  const globals = asSettings(src.__globals__);
  const global = globalColor(globals, from);
  if (global) out[to] = global;
  else if (COLOR.test(str(src[from]))) out[to] = str(src[from]);
  const hover = `${from}_hover`;
  if (COLOR.test(str(src[hover]))) out[`${to}:hover`] = str(src[hover]);
}

/** Elementor typography group (prefix `typography`) → Fresco typography (prefix `to`). */
function typography(out: Settings, src: Settings, from: string, to: string) {
  const globals = asSettings(src.__globals__);
  const global = /globals\/typography\?id=([\w-]+)/.exec(str(globals[`${from}_typography`]))?.[1];
  if (global) out[`${to}_global`] = global;
  if (src[`${from}_typography`] !== 'custom') return;
  copy(out, src, `${from}_font_family`, `${to}_family`, (v) => str(v) || undefined, false);
  copy(out, src, `${from}_font_size`, `${to}_size`, size);
  copy(out, src, `${from}_font_weight`, `${to}_weight`, (v) => str(v) || undefined, false);
  copy(out, src, `${from}_text_transform`, `${to}_transform`, (v) => str(v) || undefined, false);
  copy(out, src, `${from}_font_style`, `${to}_style`, (v) => str(v) || undefined, false);
  copy(out, src, `${from}_text_decoration`, `${to}_decoration`, (v) => str(v) || undefined, false);
  copy(out, src, `${from}_line_height`, `${to}_line`, size);
  copy(out, src, `${from}_letter_spacing`, `${to}_letter`, size);
  copy(out, src, `${from}_word_spacing`, `${to}_word`, size);
}

/** Elementor icon `{ value: 'fas fa-star', library }` → Fresco icon. */
function icon(value: unknown): { set: string; name: string } | undefined {
  const v = asSettings(value);
  const match = /\bfa([srb])\s+fa-([\w-]+)/.exec(str(v.value));
  if (!match) return undefined;
  const set = match[1] === 'r' ? 'regular' : match[1] === 'b' ? 'brands' : 'solid';
  // A few names changed between Font Awesome versions.
  const renamed: Record<string, string> = {
    home: 'house',
    'envelope-open': 'envelope-open',
    times: 'xmark',
    'times-circle': 'circle-xmark',
    'check-circle': 'circle-check',
    'map-marker-alt': 'location-dot',
    'map-marker': 'location-pin',
    'phone-alt': 'phone',
    twitter: 'x-twitter',
    'facebook-square': 'square-facebook',
    'external-link-alt': 'up-right-from-square',
    'arrow-right': 'arrow-right',
    'shopping-cart': 'cart-shopping',
    search: 'magnifying-glass',
    cog: 'gear',
    edit: 'pen-to-square',
  };
  return { set, name: renamed[match[2]!] ?? match[2]! };
}

function link(value: unknown) {
  const v = asSettings(value);
  const url = str(v.url);
  if (!url) return undefined;
  return {
    url,
    ...(v.is_external === 'on' || v.is_external === true ? { newTab: true } : {}),
    ...(v.nofollow === 'on' || v.nofollow === true ? { nofollow: true } : {}),
  };
}

/** Advanced tab and the background/border of any element. */
function common(out: Settings, src: Settings, media: (v: unknown) => unknown) {
  copy(out, src, '_margin', '_margin', box);
  copy(out, src, '_padding', '_padding', box);
  copy(out, src, '_z_index', '_z_index', num);
  if (str(src._element_id)) out._css_id = str(src._element_id);
  if (str(src._css_classes)) out._css_classes = str(src._css_classes);
  const animation = str(src._animation);
  const ANIM: Record<string, string> = {
    fadeIn: 'fade-in',
    fadeInUp: 'fade-up',
    fadeInDown: 'fade-down',
    fadeInLeft: 'fade-left',
    fadeInRight: 'fade-right',
    zoomIn: 'zoom-in',
    zoomOut: 'zoom-out',
    slideInUp: 'slide-up',
    slideInDown: 'slide-down',
    slideInLeft: 'slide-left',
    slideInRight: 'slide-right',
    bounceIn: 'bounce-in',
    rotateIn: 'rotate-in',
    flipInX: 'flip-x',
    flipInY: 'flip-y',
  };
  if (ANIM[animation]) {
    out._animation = ANIM[animation];
    const delay = num(src._animation_delay);
    if (delay) out._animation_delay = delay;
  }
  for (const device of ['desktop', 'tablet', 'mobile']) {
    if (
      src[`hide_${device}`] === 'hidden-' + device ||
      src[`hide_${device}`] === 'hidden-phone' ||
      src[`hide_${device}`] === 'yes'
    ) {
      out[`_hide_${device}`] = true;
    }
  }
  background(out, src, '_background', '_background', media);
  background(out, src, 'background', '_background', media);
  border(out, src, '_border', '_border');
  border(out, src, 'border', '_border');
}

function background(
  out: Settings,
  src: Settings,
  from: string,
  to: string,
  media: (v: unknown) => unknown,
) {
  const type = str(src[`${from}_background`]);
  if (type !== 'classic' && type !== 'gradient') return;
  out[`${to}_type`] = type;
  color(out, src, `${from}_color`, `${to}_color`);
  if (type === 'classic') {
    const image = media(src[`${from}_image`]);
    if (image) out[`${to}_image`] = image;
    copy(
      out,
      src,
      `${from}_position`,
      `${to}_position`,
      (v) => str(v).replace(/-/g, ' ') || undefined,
    );
    copy(out, src, `${from}_repeat`, `${to}_repeat`);
    copy(out, src, `${from}_size`, `${to}_size`);
    if (str(src[`${from}_attachment`])) out[`${to}_attachment`] = str(src[`${from}_attachment`]);
  } else {
    color(out, src, `${from}_color_b`, `${to}_color_b`);
    if (size(src[`${from}_color_stop`])) out[`${to}_stop`] = size(src[`${from}_color_stop`]);
    if (size(src[`${from}_color_b_stop`])) out[`${to}_stop_b`] = size(src[`${from}_color_b_stop`]);
    if (src[`${from}_gradient_type`] === 'radial') out[`${to}_gradient`] = 'radial';
    if (size(src[`${from}_gradient_angle`]))
      out[`${to}_angle`] = size(src[`${from}_gradient_angle`]);
  }
}

function border(out: Settings, src: Settings, from: string, to: string) {
  const style = str(src[`${from}_border`]);
  if (style && style !== 'default') {
    out[`${to}_style`] = style;
    copy(out, src, `${from}_width`, `${to}_width`, box);
    color(out, src, `${from}_color`, `${to}_color`);
  }
  copy(out, src, `${from}_radius`, `${to}_radius`, box);
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'p']);

export function elementorToFresco(data: string, ctx: ElementorContext): CxdBlock[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    ctx.warn('the Elementor data could not be read; the page content was imported instead.');
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const unknown = new Map<string, number>();

  /** An Elementor image `{ id, url }` → Fresco media value (id = media ref when imported). */
  const media = (value: unknown) => {
    const v = asSettings(value);
    const url = str(v.url);
    if (!url) return undefined;
    const ref = num(v.id) !== null ? ctx.mediaRef(num(v.id)!) : undefined;
    return { id: ref ?? null, url, ...(str(v.alt) ? { alt: str(v.alt) } : {}) };
  };

  const node = (type: string, attrs: Settings, children?: CxdBlock[]): CxdBlock => ({
    id: newBlockId(),
    type: `fresco/${type}`,
    v: 1,
    attrs,
    ...(children ? { children } : {}),
  });

  const container = (src: Settings, children: CxdBlock[], extra: Settings = {}): CxdBlock => {
    const out: Settings = { ...extra };
    common(out, src, media);
    copy(out, src, 'padding', '_padding', box);
    copy(out, src, 'margin', '_margin', box);
    return node('container', out, children);
  };

  const widget = (el: ElementorNode): CxdBlock[] => {
    const src = asSettings(el.settings);
    const out: Settings = {};
    const type = el.widgetType ?? '';
    const alignTo = (from: string, to = 'align') =>
      copy(out, src, from, to, (v) =>
        ['left', 'center', 'right', 'justify'].includes(str(v)) ? str(v) : undefined,
      );
    let result: CxdBlock | null = null;
    switch (type) {
      case 'heading': {
        out.title = str(src.title)
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '');
        if (HEADING_TAGS.has(str(src.header_size))) out.tag = str(src.header_size);
        if (link(src.link)) out.link = link(src.link);
        alignTo('align');
        color(out, src, 'title_color', 'title_color');
        typography(out, src, 'typography', 'title_typography');
        result = node('heading', out);
        break;
      }
      case 'text-editor':
        out.content = str(src.editor);
        alignTo('align');
        color(out, src, 'text_color', 'color');
        typography(out, src, 'typography', 'typography');
        result = node('text', out);
        break;
      case 'image':
        if (media(src.image)) out.image = media(src.image);
        if (str(src.image_size))
          out.image_size = ['thumbnail', 'medium', 'large', 'full'].includes(str(src.image_size))
            ? str(src.image_size).replace('thumbnail', 'thumb')
            : 'large';
        alignTo('align');
        if (src.link_to === 'file') out.link_to = 'file';
        if (src.link_to === 'custom' && link(src.link)) {
          out.link_to = 'custom';
          out.link = link(src.link);
        }
        if (src.caption_source === 'custom') {
          out.caption_source = 'custom';
          out.caption = str(src.caption);
        } else if (src.caption_source === 'attachment') out.caption_source = 'alt';
        copy(out, src, 'width', 'width', size);
        copy(out, src, 'height', 'height', size);
        border(out, src, 'image_border', 'image_border');
        result = node('image', out);
        break;
      case 'button':
        out.text = str(src.text) || 'Click here';
        if (link(src.link)) out.link = link(src.link);
        alignTo('align');
        if (['xs', 'sm', 'md', 'lg', 'xl'].includes(str(src.size))) out.size = str(src.size);
        if (icon(src.selected_icon)) out.icon = icon(src.selected_icon);
        if (src.icon_align === 'right') out.icon_position = 'after';
        color(out, src, 'button_text_color', 'text_color');
        color(out, src, 'background_color', 'background_color');
        typography(out, src, 'typography', 'typography');
        copy(out, src, 'text_padding', 'padding', box);
        border(out, src, 'border', 'border');
        result = node('button', out);
        break;
      case 'spacer':
        copy(out, src, 'space', 'space', size);
        result = node('spacer', out);
        break;
      case 'divider':
        if (str(src.style)) out.style = str(src.style);
        copy(out, src, 'width', 'width', size);
        color(out, src, 'color', 'color');
        if (size(src.weight)) out.weight = size(src.weight);
        copy(out, src, 'gap', 'gap', size);
        if (str(src.align)) out.align = str(src.align);
        result = node('divider', out);
        break;
      case 'icon':
        if (icon(src.selected_icon)) out.icon = icon(src.selected_icon);
        if (['stacked', 'framed'].includes(str(src.view))) out.view = str(src.view);
        if (str(src.shape)) out.shape = str(src.shape);
        if (link(src.link)) out.link = link(src.link);
        alignTo('align');
        color(out, src, 'primary_color', 'primary_color');
        color(out, src, 'secondary_color', 'secondary_color');
        copy(out, src, 'size', 'size', size);
        result = node('icon', out);
        break;
      case 'icon-box':
      case 'image-box': {
        out.title = str(src.title_text);
        out.description = str(src.description_text).replace(/<[^>]+>/g, '');
        if (link(src.link)) out.link = link(src.link);
        if (['left', 'right', 'top'].includes(str(src.position))) out.position = str(src.position);
        if (HEADING_TAGS.has(str(src.title_size))) out.title_tag = str(src.title_size);
        alignTo('text_align', 'align');
        color(out, src, 'title_color', 'title_color');
        color(out, src, 'description_color', 'description_color');
        typography(out, src, 'title_typography', 'title_typography');
        typography(out, src, 'description_typography', 'description_typography');
        if (type === 'icon-box') {
          if (icon(src.selected_icon)) out.icon = icon(src.selected_icon);
          if (['stacked', 'framed'].includes(str(src.view))) out.view = str(src.view);
          color(out, src, 'primary_color', 'icon_primary_color');
          copy(out, src, 'icon_size', 'icon_size', size);
        } else if (media(src.image)) out.image = media(src.image);
        result = node(type, out);
        break;
      }
      case 'icon-list':
        out.items = (Array.isArray(src.icon_list) ? src.icon_list : []).map((raw, i) => {
          const item = asSettings(raw);
          return {
            _id: str(item._id) || `i${i}`,
            text: str(item.text),
            ...(icon(item.selected_icon) ? { icon: icon(item.selected_icon) } : {}),
            ...(link(item.link) ? { link: link(item.link) } : {}),
          };
        });
        if (src.view === 'inline') out.layout = 'inline';
        color(out, src, 'icon_color', 'icon_color');
        color(out, src, 'text_color', 'text_color');
        result = node('icon-list', out);
        break;
      case 'counter':
        if (num(src.starting_number) !== null) out.start = num(src.starting_number);
        if (num(src.ending_number) !== null) out.end = num(src.ending_number);
        if (str(src.prefix)) out.prefix = str(src.prefix);
        if (str(src.suffix)) out.suffix = str(src.suffix);
        out.title = str(src.title);
        if (num(src.duration) !== null) out.duration = num(src.duration);
        if (src.thousand_separator === '') out.separator = false;
        color(out, src, 'number_color', 'number_color');
        color(out, src, 'title_color', 'title_color');
        result = node('counter', out);
        break;
      case 'progress':
        out.title = str(src.title);
        if (size(src.percent)) out.percent = { size: size(src.percent)!.size, unit: '%' };
        if (str(src.inner_text)) out.inner = str(src.inner_text);
        if (src.display_percentage === 'hide') out.show_percent = false;
        color(out, src, 'bar_color', 'bar_color');
        color(out, src, 'bar_bg_color', 'track_color');
        result = node('progress', out);
        break;
      case 'testimonial':
        out.content = str(src.testimonial_content).replace(/<[^>]+>/g, '');
        if (media(src.testimonial_image)) out.image = media(src.testimonial_image);
        out.name = str(src.testimonial_name);
        out.job = str(src.testimonial_job);
        if (link(src.link)) out.link = link(src.link);
        alignTo('testimonial_alignment', 'align');
        result = node('testimonial', out);
        break;
      case 'social-icons':
        out.items = (Array.isArray(src.social_icon_list) ? src.social_icon_list : []).map(
          (raw, i) => {
            const item = asSettings(raw);
            return {
              _id: str(item._id) || `s${i}`,
              ...(icon(item.social_icon) ? { icon: icon(item.social_icon) } : {}),
              ...(link(item.link) ? { link: link(item.link) } : {}),
            };
          },
        );
        if (['rounded', 'square', 'circle'].includes(str(src.shape))) out.shape = str(src.shape);
        if (src.icon_color === 'custom') out.look = 'custom';
        alignTo('align');
        result = node('social-icons', out);
        break;
      case 'alert':
        out.kind = ['info', 'success', 'warning', 'danger'].includes(str(src.alert_type))
          ? str(src.alert_type)
          : 'info';
        out.title = str(src.alert_title);
        out.description = str(src.alert_description).replace(/<[^>]+>/g, '');
        if (src.show_dismiss === 'hide') out.dismiss = false;
        result = node('alert', out);
        break;
      case 'video': {
        const source = str(src.video_type) || 'youtube';
        if (source === 'hosted') {
          out.source = 'hosted';
          if (media(src.hosted_url)) out.file = media(src.hosted_url);
        } else {
          out.source = source === 'vimeo' ? 'vimeo' : 'youtube';
          out.url = str(src[`${out.source}_url`]);
        }
        for (const key of ['autoplay', 'mute', 'loop']) if (src[key] === 'yes') out[key] = true;
        if (src.controls === '') out.controls = false;
        if (media(src.image_overlay) && src.show_image_overlay === 'yes')
          out.poster = media(src.image_overlay);
        result = node('video', out);
        break;
      }
      case 'google_maps':
        out.address = str(src.address);
        if (size(src.zoom)) out.zoom = size(src.zoom)!.size;
        copy(out, src, 'height', 'height', size);
        result = node('google-maps', out);
        break;
      case 'html':
        out.code = str(src.html);
        result = node('html', out);
        break;
      case 'shortcode':
        out.content = `<p>${str(src.shortcode)}</p>`;
        ctx.warn('a shortcode was kept as text.');
        result = node('text', out);
        break;
      case 'menu-anchor':
        out.anchor = str(src.anchor);
        result = node('menu-anchor', out);
        break;
      case 'star-rating':
      case 'rating':
        if (num(src.rating) !== null) out.rating = num(src.rating);
        if (str(src.rating_scale) === '10') out.scale = '10';
        out.title = str(src.title);
        result = node('star-rating', out);
        break;
      case 'image-carousel':
      case 'image-gallery': {
        const list = (
          Array.isArray(src.carousel)
            ? src.carousel
            : Array.isArray(src.wp_gallery)
              ? src.wp_gallery
              : []
        )
          .map(media)
          .filter(Boolean);
        out.images = list;
        if (type === 'image-carousel') {
          copy(out, src, 'slides_to_show', 'per_view', num);
          if (src.autoplay === 'no') out.autoplay = false;
          if (str(src.navigation) && str(src.navigation) !== 'both')
            out.navigation = str(src.navigation);
          result = node('image-carousel', out);
        } else {
          if (num(src.gallery_columns) !== null) out.columns = num(src.gallery_columns);
          if (src.gallery_link === 'none') out.link_to = 'none';
          result = node('gallery', out);
        }
        break;
      }
      case 'text-path':
        out.text = str(src.text);
        if (str(src.path)) out.path = str(src.path);
        result = node('text-path', out);
        break;
      case 'tabs':
      case 'accordion':
      case 'toggle': {
        // Legacy widgets: each item's HTML becomes a container with a text.
        const items = Array.isArray(src.tabs) ? src.tabs.map(asSettings) : [];
        const children = items.map((item) =>
          node('container', { _title: str(item.tab_title), content_width: 'full' }, [
            node('text', { content: str(item.tab_content) }),
          ]),
        );
        if (type !== 'tabs' && src.faq_schema === 'yes') out.faq = true;
        result = node(type, out, children);
        break;
      }
      case 'nested-tabs':
      case 'nested-accordion': {
        const titles = (
          Array.isArray(src.tabs) ? src.tabs : Array.isArray(src.items) ? src.items : []
        ).map(asSettings);
        const children = (el.elements ?? []).map((child, i) => {
          const converted = element(child);
          const first = converted[0];
          if (first && first.type === 'fresco/container') {
            first.attrs = {
              ...first.attrs,
              _title: str(titles[i]?.tab_title ?? titles[i]?.item_title),
              content_width: 'full',
            };
            return first;
          }
          return node(
            'container',
            { _title: str(titles[i]?.tab_title ?? titles[i]?.item_title) },
            converted,
          );
        });
        if (type === 'nested-accordion' && src.faq_schema === 'yes') out.faq = true;
        result = node(type === 'nested-tabs' ? 'tabs' : 'accordion', out, children);
        break;
      }
      default: {
        unknown.set(type, (unknown.get(type) ?? 0) + 1);
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
        return text ? [node('text', { content: /</.test(text) ? text : `<p>${text}</p>` })] : [];
      }
    }
    if (!result) return [];
    common(result.attrs, src, media);
    return [result];
  };

  const element = (el: ElementorNode): CxdBlock[] => {
    const src = asSettings(el.settings);
    const children = () => (el.elements ?? []).flatMap(element);
    switch (el.elType) {
      case 'section': {
        // A section: its columns side by side (stacked on phones).
        const extra: Settings = {
          flex_direction: 'row',
          'flex_direction@mobile': 'column',
          content_width: src.layout === 'full_width' ? 'full' : 'boxed',
        };
        if (size(src.content_width)) extra.boxed_width = size(src.content_width);
        if (src.height === 'min-height') copy(extra, src, 'custom_height', 'min_height', size);
        if (str(src.gap) === 'no') extra.gap = { size: 0, unit: 'px' };
        return [container(src, children(), extra)];
      }
      case 'column': {
        const width = num(src._column_size);
        const extra: Settings = { content_width: 'full' };
        const inline = num(src._inline_size);
        if (inline ?? width) extra.width = { size: inline ?? width!, unit: '%' };
        copy(extra, src, '_inline_size', 'width', (v) =>
          num(v) !== null ? { size: num(v)!, unit: '%' } : undefined,
        );
        return [container(src, children(), extra)];
      }
      case 'container': {
        const extra: Settings = { content_width: src.content_width === 'full' ? 'full' : 'boxed' };
        if (src.container_type === 'grid') {
          extra.container_type = 'grid';
          copy(extra, src, 'grid_columns_grid', 'grid_columns', (v) => size(v)?.size);
          copy(extra, src, 'grid_rows_grid', 'grid_rows', (v) => size(v)?.size);
        }
        copy(extra, src, 'flex_direction', 'flex_direction', (v) => str(v) || undefined);
        copy(extra, src, 'flex_justify_content', 'justify_content', (v) => str(v) || undefined);
        copy(extra, src, 'flex_align_items', 'align_items', (v) => str(v) || undefined);
        copy(extra, src, 'flex_wrap', 'flex_wrap', (v) => str(v) || undefined);
        copy(extra, src, 'flex_gap', 'gap', size);
        copy(extra, src, 'width', 'width', size);
        copy(extra, src, 'boxed_width', 'boxed_width', size);
        copy(extra, src, 'min_height', 'min_height', size);
        if (str(src.html_tag) && str(src.html_tag) !== 'div') extra.html_tag = str(src.html_tag);
        return [container(src, children(), extra)];
      }
      case 'widget':
        return widget(el);
      default:
        return children();
    }
  };

  const blocks = parsed.flatMap((el) => element(el as ElementorNode));
  for (const [type, n] of unknown) {
    ctx.warn(
      `${n} Elementor widget(s) "${type}" have no Fresco counterpart yet: their text was kept.`,
    );
  }
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
  for (const block of result) delete block.attrs.__wrapper;
  return result;
}
