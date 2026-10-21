/**
 * Values of Elementor's settings (sizes, boxes, colors, typography, icons,
 * links, images, dynamic tags) as Fresco's. Elementor's data keys are a data
 * format: they appear here only to be read.
 */

export type Settings = Record<string, unknown>;

export interface SizeValue {
  size: number;
  unit: string;
}

export interface BoxValue {
  top: number | '';
  right: number | '';
  bottom: number | '';
  left: number | '';
  unit: string;
  linked: boolean;
}

/** What a conversion reports once per page (counted) and how it finds things. */
export interface Notes {
  /** Adds one to a note (the same text is reported once with its count). */
  note(text: string): void;
}

/** Elementor's device suffixes → Fresco's (desktop has none); the extra devices too. */
export const DEVICES: [string, string][] = [
  ['', ''],
  ['_widescreen', '@widescreen'],
  ['_laptop', '@laptop'],
  ['_tablet_extra', '@tablet_extra'],
  ['_tablet', '@tablet'],
  ['_mobile_extra', '@mobile_extra'],
  ['_mobile', '@mobile'],
];

/** Elementor's device names (all of them, as Fresco names them too). */
export const DEVICE_NAMES = [
  'widescreen',
  'desktop',
  'laptop',
  'tablet_extra',
  'tablet',
  'mobile_extra',
  'mobile',
];

export const asSettings = (value: unknown): Settings =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Settings) : {};

export const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

export const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number.parseFloat(str(value));
  return Number.isFinite(n) ? n : null;
};

export const yes = (value: unknown): boolean => value === 'yes' || value === true;

export const list = (value: unknown): Settings[] =>
  Array.isArray(value) ? value.map(asSettings) : [];

const UNITS = new Set(['px', '%', 'em', 'rem', 'vw', 'vh']);

/**
 * A length written as CSS (`clamp(1rem, 2vw, 3rem)`, `calc(…)`, `40px`):
 * Fresco sizes are a number and a unit, so the largest value of a clamp or
 * max(), or the first length otherwise.
 */
export function cssLength(text: string): SizeValue | undefined {
  const lengths = [...text.matchAll(/(-?\d*\.?\d+)(px|rem|em|vw|vh|%)/g)].map((m) => ({
    size: Number(m[1]),
    unit: m[2]!,
  }));
  if (lengths.length === 0) {
    const bare = num(text);
    return bare === null ? undefined : { size: bare, unit: 'px' };
  }
  return /^\s*(clamp|max)\(/.test(text) ? lengths.at(-1) : lengths[0];
}

/** Elementor `{ unit, size }` → Fresco size, or undefined when empty. */
export function size(value: unknown, notes?: Notes): SizeValue | undefined {
  const v = asSettings(value);
  const unit = str(v.unit) || 'px';
  if (unit === 'custom') {
    const text = str(v.size);
    if (!text.trim()) return undefined;
    const length = cssLength(text);
    if (length) notes?.note('a size written as CSS (clamp, calc) was approximated');
    return length;
  }
  const n = num(v.size);
  if (n === null) return undefined;
  return {
    size: n,
    unit:
      UNITS.has(unit) || unit === 'deg' || unit === 's' || unit === 'ms' || unit === 'fr'
        ? unit
        : 'px',
  };
}

/** A unitless size (line height in `em` stays em; `''` units stay unitless). */
export function lineSize(value: unknown, notes?: Notes): SizeValue | undefined {
  const v = asSettings(value);
  if (str(v.unit) === '' && num(v.size) !== null) return { size: num(v.size)!, unit: '' };
  return size(value, notes);
}

/** Elementor dimensions → Fresco box, or undefined when every side is empty. */
export function box(value: unknown, notes?: Notes): BoxValue | undefined {
  const v = asSettings(value);
  let unit = str(v.unit) || 'px';
  const side = (key: string): number | '' => {
    const raw = v[key];
    if (unit === 'custom' && typeof raw === 'string' && raw.trim()) {
      const length = cssLength(raw);
      if (length) {
        notes?.note('a size written as CSS (clamp, calc) was approximated');
        return length.size;
      }
    }
    const n = num(raw);
    return n === null ? '' : n;
  };
  if (unit === 'custom') {
    const first = ['top', 'right', 'bottom', 'left'].map((k) => cssLength(str(v[k]))).find(Boolean);
    unit = first?.unit ?? 'px';
  }
  const result: BoxValue = {
    top: side('top'),
    right: side('right'),
    bottom: side('bottom'),
    left: side('left'),
    unit: UNITS.has(unit) ? unit : 'px',
    linked: v.isLinked !== false,
  };
  return [result.top, result.right, result.bottom, result.left].every((s) => s === '')
    ? undefined
    : result;
}

/** A box with the same value on every side. */
export const evenBox = (n: number, unit = 'px'): BoxValue => ({
  top: n,
  right: n,
  bottom: n,
  left: n,
  unit,
  linked: true,
});

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|transparent)$/i;

/** A global color reference (`globals/colors?id=primary`) → the kit variable. */
export function globalColor(globals: Settings, key: string): string | undefined {
  const ref = str(globals[key]);
  const id = /globals\/colors\?id=([\w-]+)/.exec(ref)?.[1];
  return id ? `var(--fr-c-${id.toLowerCase()})` : undefined;
}

/** The color of a setting: its global color, or its own value. */
export function colorOf(src: Settings, key: string): string | undefined {
  const global = globalColor(asSettings(src.__globals__), key);
  if (global) return global;
  const value = str(src[key]).trim();
  return COLOR.test(value) ? value : undefined;
}

export const isColor = (value: string): boolean => COLOR.test(value);

/** Copies settings one to one (with per-device variants) through a transform. */
export function copy(
  out: Settings,
  src: Settings,
  from: string,
  to: string,
  transform: (value: unknown) => unknown = (v) => (v === '' ? undefined : v),
  responsive = true,
): void {
  for (const [suffix, target] of responsive ? DEVICES : DEVICES.slice(0, 1)) {
    const value = transform(src[`${from}${suffix}`]);
    if (value !== undefined && value !== null && value !== '') out[`${to}${target}`] = value;
  }
}

/** A color setting (global or own), and its hover variant when Elementor has one. */
export function color(
  out: Settings,
  src: Settings,
  from: string,
  to: string,
  hover?: string,
): void {
  const value = colorOf(src, from);
  if (value) out[to] = value;
  const hoverValue = hover ? colorOf(src, hover) : undefined;
  if (hoverValue) out[`${to}:hover`] = hoverValue;
}

const keyword = (v: unknown) => (/^[a-z-]{1,30}$/.test(str(v)) ? str(v) : undefined);

/**
 * Elementor typography group (prefix `from`) → Fresco typography (prefix
 * `to`): its global font, or its own family, sizes and styles per device.
 */
export function typography(
  out: Settings,
  src: Settings,
  from: string,
  to: string,
  notes?: Notes & { font?(family: string): void },
): void {
  const globals = asSettings(src.__globals__);
  const global = /globals\/typography\?id=([\w-]+)/.exec(str(globals[`${from}_typography`]))?.[1];
  if (global) out[`${to}_global`] = global.toLowerCase();
  if (src[`${from}_typography`] !== 'custom') return;
  const family = str(src[`${from}_font_family`]).trim();
  if (family && /^[\w\s'"-]{1,80}$/.test(family)) {
    out[`${to}_family`] = family;
    notes?.font?.(family);
  }
  copy(out, src, `${from}_font_size`, `${to}_size`, (v) => size(v, notes));
  const weight = str(src[`${from}_font_weight`]);
  if (/^([1-9]00|normal|bold)$/.test(weight)) out[`${to}_weight`] = weight;
  copy(out, src, `${from}_text_transform`, `${to}_transform`, keyword, false);
  copy(out, src, `${from}_font_style`, `${to}_style`, keyword, false);
  copy(out, src, `${from}_text_decoration`, `${to}_decoration`, keyword, false);
  copy(out, src, `${from}_line_height`, `${to}_line`, (v) => lineSize(v, notes));
  copy(out, src, `${from}_letter_spacing`, `${to}_letter`, (v) => size(v, notes));
  copy(out, src, `${from}_word_spacing`, `${to}_word`, (v) => size(v, notes));
}

/** Whether a typography group sets a line height (its own or through a global). */
export const hasLineHeight = (src: Settings, from: string): boolean =>
  src[`${from}_typography`] === 'custom' && Boolean(size(src[`${from}_line_height`]));

/** Elementor box shadow `{ horizontal, vertical, blur, spread, color }` → Fresco shadow. */
export function shadow(src: Settings, prefix: string): Settings | undefined {
  if (src[`${prefix}_box_shadow_type`] !== 'yes') return undefined;
  const v = asSettings(src[`${prefix}_box_shadow`]);
  const shadowColor = str(v.color);
  return {
    x: num(v.horizontal) ?? 0,
    y: num(v.vertical) ?? 0,
    blur: num(v.blur) ?? 10,
    spread: num(v.spread) ?? 0,
    color: COLOR.test(shadowColor) ? shadowColor : 'rgba(0,0,0,0.5)',
    ...(str(src[`${prefix}_box_shadow_position`]).trim() === 'inset' ? { inset: true } : {}),
  };
}

// ---- Icons ------------------------------------------------------------------------------

/** Font Awesome 5 names that Font Awesome 6 (Fresco's icons) renamed. */
const RENAMED: Record<string, string> = {
  home: 'house',
  times: 'xmark',
  close: 'xmark',
  'times-circle': 'circle-xmark',
  'check-circle': 'circle-check',
  'check-square': 'square-check',
  'info-circle': 'circle-info',
  'question-circle': 'circle-question',
  'exclamation-circle': 'circle-exclamation',
  'exclamation-triangle': 'triangle-exclamation',
  'plus-circle': 'circle-plus',
  'minus-circle': 'circle-minus',
  'play-circle': 'circle-play',
  'arrow-circle-right': 'circle-arrow-right',
  'arrow-circle-left': 'circle-arrow-left',
  'arrow-circle-up': 'circle-arrow-up',
  'arrow-circle-down': 'circle-arrow-down',
  'chevron-circle-right': 'circle-chevron-right',
  'chevron-circle-left': 'circle-chevron-left',
  'user-circle': 'circle-user',
  'map-marker-alt': 'location-dot',
  'map-marker': 'location-pin',
  'phone-alt': 'phone',
  'phone-square': 'square-phone',
  'phone-square-alt': 'square-phone',
  'mobile-alt': 'mobile-screen-button',
  'envelope-square': 'square-envelope',
  twitter: 'x-twitter',
  'twitter-square': 'square-x-twitter',
  'facebook-square': 'square-facebook',
  'facebook-f': 'facebook-f',
  'instagram-square': 'square-instagram',
  'linkedin-in': 'linkedin-in',
  'youtube-square': 'square-youtube',
  'pinterest-square': 'square-pinterest',
  'whatsapp-square': 'square-whatsapp',
  'external-link-alt': 'up-right-from-square',
  'external-link': 'arrow-up-right-from-square',
  'shopping-cart': 'cart-shopping',
  'shopping-bag': 'bag-shopping',
  search: 'magnifying-glass',
  cog: 'gear',
  cogs: 'gears',
  edit: 'pen-to-square',
  'pencil-alt': 'pencil',
  'trash-alt': 'trash-can',
  'long-arrow-alt-right': 'right-long',
  'long-arrow-alt-left': 'left-long',
  'long-arrow-right': 'arrow-right-long',
  'long-arrow-left': 'arrow-left-long',
  'angle-double-right': 'angles-right',
  'angle-double-left': 'angles-left',
  'angle-double-down': 'angles-down',
  'angle-double-up': 'angles-up',
  'sign-out-alt': 'right-from-bracket',
  'sign-in-alt': 'right-to-bracket',
  'calendar-alt': 'calendar-days',
  'clock-o': 'clock',
  'file-alt': 'file-lines',
  'comment-alt': 'message',
  'comments-alt': 'comments',
  'thumbs-o-up': 'thumbs-up',
  'heart-o': 'heart',
  'star-half-alt': 'star-half-stroke',
  'quote-left': 'quote-left',
  'quote-right': 'quote-right',
  'tachometer-alt': 'gauge-high',
  'hand-holding-usd': 'hand-holding-dollar',
  'money-bill-alt': 'money-bill-1',
  'globe-americas': 'earth-americas',
  'globe-europe': 'earth-europe',
  'shipping-fast': 'truck-fast',
  utensils: 'utensils',
  'glass-cheers': 'champagne-glasses',
  cocktail: 'martini-glass-citrus',
  'concierge-bell': 'bell-concierge',
  hamburger: 'burger',
  bars: 'bars',
  wifi: 'wifi',
  parking: 'square-parking',
  'swimming-pool': 'person-swimming',
  swimmer: 'person-swimming',
  walking: 'person-walking',
  running: 'person-running',
  biking: 'person-biking',
  hiking: 'person-hiking',
  'user-friends': 'user-group',
  'users-cog': 'users-gear',
  medkit: 'suitcase-medical',
  'first-aid': 'kit-medical',
  ambulance: 'truck-medical',
  'hospital-alt': 'hospital',
  'clinic-medical': 'house-chimney-medical',
  tooth: 'tooth',
  'sort-down': 'sort-down',
  'caret-square-down': 'square-caret-down',
  'arrow-alt-circle-right': 'circle-right',
  'arrow-alt-circle-left': 'circle-left',
  'arrow-alt-circle-down': 'circle-down',
  'arrow-alt-circle-up': 'circle-up',
  'level-up-alt': 'turn-up',
  'level-down-alt': 'turn-down',
  redo: 'arrow-rotate-right',
  undo: 'arrow-rotate-left',
  sync: 'arrows-rotate',
  'sync-alt': 'rotate',
  'expand-alt': 'up-right-and-down-left-from-center',
  'compress-alt': 'down-left-and-up-right-to-center',
  'map-signs': 'signs-post',
  'mail-bulk': 'envelopes-bulk',
  'paper-plane': 'paper-plane',
  headset: 'headset',
  'store-alt': 'shop',
  'graduation-cap': 'graduation-cap',
  award: 'award',
  trophy: 'trophy',
};

export interface IconValue {
  set: string;
  name: string;
  url?: string;
  id?: string | null;
}

/** Elementor icon `{ value: 'fas fa-star', library }` (or an SVG file) → Fresco icon. */
export function icon(
  value: unknown,
  mediaRef?: (attachment: number) => string | undefined,
): IconValue | undefined {
  const v = asSettings(value);
  if (v.library === 'svg') {
    const file = asSettings(v.value);
    const url = str(file.url);
    if (!/\.svg(\?.*)?$/i.test(url)) return undefined;
    const ref = num(file.id) !== null ? mediaRef?.(num(file.id)!) : undefined;
    return { set: 'custom', name: 'svg', url, id: ref ?? null };
  }
  const match = /\bfa([srb]|-solid|-regular|-brands)?\s+fa-([\w-]+)/.exec(str(v.value));
  if (!match) return undefined;
  // `fa fa-…` alone: a Font Awesome 4 name (Elementor's old icons).
  if (!match[1]) return fa4Icon(match[2]!);
  const style = match[1];
  const set =
    style === 'r' || style === '-regular'
      ? 'regular'
      : style === 'b' || style === '-brands'
        ? 'brands'
        : 'solid';
  const name = match[2]!;
  return { set, name: RENAMED[name] ?? name };
}

/**
 * Font Awesome 4 brand names → Font Awesome 6/7 (as Elementor's own FA4 shim
 * does): some kept their name but not their glyph, e.g. FA4 `facebook` is the
 * plain "f", which FA5+ calls `facebook-f` (`facebook` is now "f" in a circle).
 */
const FA4_BRANDS: Record<string, string> = {
  facebook: 'facebook-f',
  'facebook-f': 'facebook-f',
  'facebook-official': 'facebook',
  'facebook-square': 'square-facebook',
  linkedin: 'linkedin-in',
  'linkedin-square': 'linkedin',
  'google-plus': 'google-plus-g',
  'google-plus-official': 'google-plus',
  'google-plus-square': 'square-google-plus',
  vimeo: 'vimeo-v',
  'vimeo-square': 'square-vimeo',
  'youtube-play': 'youtube',
  'youtube-square': 'square-youtube',
  'twitter-square': 'square-twitter',
  'pinterest-square': 'square-pinterest',
  'tumblr-square': 'square-tumblr',
  'github-square': 'square-github',
  'reddit-square': 'square-reddit',
  'xing-square': 'square-xing',
  'behance-square': 'square-behance',
  instagram: 'instagram',
  twitter: 'twitter',
  youtube: 'youtube',
  pinterest: 'pinterest',
  'pinterest-p': 'pinterest-p',
  tumblr: 'tumblr',
  dribbble: 'dribbble',
  behance: 'behance',
  github: 'github',
  whatsapp: 'whatsapp',
  skype: 'skype',
  flickr: 'flickr',
  vk: 'vk',
  xing: 'xing',
  reddit: 'reddit',
  'snapchat-ghost': 'snapchat',
  tripadvisor: 'tripadvisor',
  spotify: 'spotify',
  soundcloud: 'soundcloud',
  telegram: 'telegram',
  foursquare: 'foursquare',
  yelp: 'yelp',
  amazon: 'amazon',
  apple: 'apple',
  android: 'android',
  windows: 'windows',
  wordpress: 'wordpress',
  'stack-overflow': 'stack-overflow',
  medium: 'medium',
  slack: 'slack',
  twitch: 'twitch',
};

/** A Font Awesome 4 icon name as Fresco's (Font Awesome 6/7) icon. */
export function fa4Icon(name: string): IconValue {
  if (FA4_BRANDS[name]) return { set: 'brands', name: FA4_BRANDS[name]! };
  // `-o`: the outlined version (Font Awesome 5+: the regular style).
  const outline = name.endsWith('-o');
  const base = outline ? name.slice(0, -2) : name;
  return { set: outline ? 'regular' : 'solid', name: RENAMED[base] ?? base };
}

// ---- Links and media ---------------------------------------------------------------------

/** Elementor link `{ url, is_external, nofollow }` → Fresco link. */
export function link(value: unknown): Settings | undefined {
  const v = asSettings(value);
  const url = str(v.url).trim();
  if (!url) return undefined;
  return {
    url,
    ...(v.is_external === 'on' || v.is_external === true ? { newTab: true } : {}),
    ...(v.nofollow === 'on' || v.nofollow === true ? { nofollow: true } : {}),
  };
}

/** An Elementor image `{ id, url }` → Fresco media value (id = media ref when imported). */
export function mediaValue(
  value: unknown,
  mediaRef: (attachment: number) => string | undefined,
): Settings | undefined {
  const v = asSettings(value);
  const url = str(v.url);
  if (!url || /placeholder\.png$/.test(url)) return undefined;
  const ref = num(v.id) !== null ? mediaRef(num(v.id)!) : undefined;
  return { id: ref ?? null, url, ...(str(v.alt) ? { alt: str(v.alt) } : {}) };
}

// ---- Dynamic tags ------------------------------------------------------------------------

export interface DynamicTag {
  name: string;
  settings: Settings;
}

/** `[elementor-tag id="…" name="post-title" settings="%7B…%7D"]` → name and settings. */
export function parseDynamic(text: unknown): DynamicTag | undefined {
  const shortcode = /\[elementor-tag\b([^\]]*)\]/.exec(str(text))?.[1];
  const name = shortcode && /\bname="([\w-]+)"/.exec(shortcode)?.[1];
  if (!name) return undefined;
  const raw = /\bsettings="([^"]*)"/.exec(shortcode)?.[1];
  let settings: Settings = {};
  if (raw) {
    try {
      settings = asSettings(JSON.parse(decodeURIComponent(raw)));
    } catch {
      settings = {};
    }
  }
  return { name, settings };
}

/** Fresco Pro's dynamic tag for one of Elementor's, or undefined when it has none. */
export function dynamicTag(
  tag: DynamicTag,
  entryRef?: (post: number) => string | undefined,
): Settings | undefined {
  const s = tag.settings;
  const extra = {
    ...(str(s.before) ? { before: str(s.before) } : {}),
    ...(str(s.after) ? { after: str(s.after) } : {}),
    ...(str(s.fallback) ? { fallback: str(s.fallback) } : {}),
  };
  const simple: Record<string, string> = {
    'post-title': 'post-title',
    'page-title': 'post-title',
    'post-excerpt': 'post-excerpt',
    'post-date': 'post-date',
    'post-url': 'post-url',
    'post-terms': 'post-terms',
    'post-featured-image': 'featured-image',
    'archive-title': 'archive-title',
    'archive-description': 'archive-description',
    'site-title': 'site-title',
    'site-tagline': 'site-tagline',
    'site-url': 'site-url',
    'author-name': 'author-name',
  };
  if (simple[tag.name]) return { tag: simple[tag.name], ...extra };
  if (tag.name === 'current-date-time') {
    const format = str(s.date_format) === 'custom' ? str(s.custom_format) : str(s.date_format);
    return format === 'Y' ? { tag: 'current-year', ...extra } : undefined;
  }
  if (tag.name === 'post-custom-field') {
    const key = str(s.key) || str(s.custom_key);
    return key ? { tag: 'field', key, ...extra } : undefined;
  }
  if (/^(acf|toolset|pods|jet)-/.test(tag.name)) {
    // ACF keys are `field_abc123:name`: the name is what the importer keeps.
    const key = str(s.key).split(':').pop() ?? '';
    return key ? { tag: 'field', key, ...extra } : undefined;
  }
  if (tag.name === 'contact-url') {
    const type = str(s.link_type);
    const key =
      type === 'email'
        ? str(s.mail_to)
        : type === 'tel'
          ? str(s.tel_number)
          : type === 'whatsapp'
            ? `wa:${str(s.whatsapp_number)}`
            : '';
    return key && key !== 'wa:' ? { tag: 'contact-url', key } : undefined;
  }
  if (tag.name === 'popup') {
    // Fresco Pro's popup tag links to `#popup-<key>`; `#popup-close` closes the popup.
    const action = str(s.action || 'open');
    if (action === 'close') return { tag: 'popup', key: 'close' };
    if (action !== 'open' && action !== 'toggle') return undefined;
    const ref = num(s.popup) !== null ? entryRef?.(num(s.popup)!) : undefined;
    return ref ? { tag: 'popup', key: { $entry: ref } } : undefined;
  }
  return undefined;
}

/**
 * The link of a repeater item (icon list, social icons…): its own, or the
 * address an Elementor popup tag stands for (Fresco Pro opens and closes
 * popups from links to `#popup-<id>` and `#popup-close`), which needs no
 * dynamic tag on the item.
 */
export function itemLink(
  item: Settings,
  entryRef?: (post: number) => string | undefined,
): Settings | undefined {
  const tag = parseDynamic(asSettings(item.__dynamic__).link);
  const value = tag?.name === 'popup' ? dynamicTag(tag, entryRef) : undefined;
  if (value?.key === 'close') return { url: '#popup-close' };
  if (value?.key) return { url: { ...asSettings(value.key), prefix: '#popup-' } };
  return link(item.link);
}
