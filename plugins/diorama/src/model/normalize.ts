/**
 * Defaults and normalization of sliders: whatever comes from the editor, an
 * import or an older version becomes a complete, bounded `SliderData`.
 * Unknown keys are dropped, except `ext` (other plugins' data, kept as it is
 * within a size limit). Per-device values keep only valid overrides.
 */
import { ICONS } from './presets';
import type {
  Anchor,
  Background,
  Device,
  EasingId,
  FontFamily,
  HoverId,
  KenBurns,
  Layer,
  LayerContent,
  LayerPos,
  LayerStyle,
  LayerType,
  Link,
  LinkKind,
  MediaRef,
  Motion,
  MotionId,
  NavStyle,
  PerDevice,
  ShapeKind,
  SizeValues,
  Slide,
  SliderData,
  SliderSource,
  TextTag,
  TransitionId,
} from './types';

export const LIMITS = {
  slides: 100,
  layers: 40,
  children: 12,
  text: 2000,
  ext: 32_768,
  /** The whole document, as JSON. */
  bytes: 600_000,
};

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};

/** A short random id: letters and digits. */
export function newId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return (
    'd' +
    [...bytes]
      .map((b) => (b % 36).toString(36))
      .join('')
      .slice(0, 7)
  );
}

export const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9]{1,16}$/i.test(value);

export function num(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

export function text(value: unknown, max = LIMITS.text): string {
  if (typeof value !== 'string') return '';
  // No control characters but line breaks and tabs.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max);
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa` or `transparent`; anything else: the fallback. */
export function color(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return v;
  if (/^#[0-9a-f]{3}$/.test(v) || /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) return v;
  return fallback;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An address the site may print in `src`/`href`: local paths and https (http) only. */
export function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim().slice(0, 2000);
  if (/^\/(?!\/)/.test(v)) return v;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return v;
  return '';
}

export function mediaRef(value: unknown): MediaRef | null {
  const o = obj(value);
  const url = safeUrl(o.url);
  const id = typeof o.id === 'string' && UUID.test(o.id) ? o.id.toLowerCase() : null;
  if (!url && !id) return null;
  return { id, url };
}

const LINK_KINDS: readonly LinkKind[] = ['none', 'page', 'url', 'phone', 'email', 'scroll', 'post'];

export function link(value: unknown): Link {
  const o = obj(value);
  const kind = oneOf(o.kind, LINK_KINDS, 'none');
  const raw = typeof o.value === 'string' ? o.value.trim().slice(0, 2000) : '';
  const out: Link = { kind, value: '' };
  if (kind === 'url')
    out.value = safeUrl(raw) || (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(raw) ? `https://${raw}` : '');
  else if (kind === 'page') {
    out.value = safeUrl(raw);
    if (typeof o.entryId === 'string' && UUID.test(o.entryId)) out.entryId = o.entryId;
  } else if (kind === 'phone') out.value = raw.replace(/[^\d+]/g, '').slice(0, 20);
  else if (kind === 'email')
    out.value = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(raw) ? raw.slice(0, 200) : '';
  else if (kind === 'scroll') out.value = /^#[\w-]{1,80}$/.test(raw) ? raw : '';
  if (o.newTab === true && (kind === 'url' || kind === 'page' || kind === 'post'))
    out.newTab = true;
  return out;
}

/** Other plugins' data: any JSON object within a size limit. */
function ext(value: unknown): Record<string, unknown> {
  const o = obj(value);
  try {
    const json = JSON.stringify(o);
    return json.length <= LIMITS.ext ? (JSON.parse(json) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Per-device values: a complete desktop value, and the valid overrides of the others. */
function perDevice<T extends object>(
  value: unknown,
  normalizeOne: (input: unknown, fallback: T) => T,
  fallback: T,
): PerDevice<T> {
  const o = obj(value);
  const base = normalizeOne(o.base, fallback);
  const out: PerDevice<T> = { base };
  let previous = base;
  for (const device of ['tablet', 'mobile'] as const) {
    const given = obj(o[device]);
    if (Object.keys(given).length === 0) continue;
    const full = normalizeOne({ ...previous, ...given }, previous);
    const partial: Partial<T> = {};
    for (const key of Object.keys(given) as (keyof T)[]) {
      if (key in full) partial[key] = full[key];
    }
    if (Object.keys(partial).length > 0) out[device] = partial;
    previous = full;
  }
  return out;
}

// ---- Defaults ------------------------------------------------------------------------

export const DEFAULT_SIZE: SizeValues = { height: 600, offset: 0 };

export function defaultMotion(preset: MotionId = 'fade-up', delay = 0): Motion {
  return { preset, delay, duration: 700, easing: 'ease-out' };
}

const BASE_STYLE: LayerStyle = {
  fontFamily: 'inherit',
  fontSize: 18,
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: 0,
  uppercase: false,
  italic: false,
  textAlign: 'left',
  color: '#ffffff',
  background: 'transparent',
  borderColor: '#ffffff',
  borderWidth: 0,
  radius: 0,
  paddingX: 0,
  paddingY: 0,
  gap: 16,
  shadow: false,
  opacity: 1,
};

/** The style a new layer of a type starts with. */
export function defaultStyle(type: LayerType): LayerStyle {
  switch (type) {
    case 'heading':
      return { ...BASE_STYLE, fontSize: 56, fontWeight: 700, lineHeight: 1.1 };
    case 'text':
      return { ...BASE_STYLE, fontSize: 20, lineHeight: 1.5 };
    case 'button':
      return {
        ...BASE_STYLE,
        fontSize: 17,
        fontWeight: 600,
        lineHeight: 1.2,
        textAlign: 'center',
        color: '#111827',
        background: '#ffffff',
        radius: 999,
        paddingX: 28,
        paddingY: 14,
      };
    case 'icon':
      return { ...BASE_STYLE, fontSize: 48 };
    case 'shape':
      return { ...BASE_STYLE, background: '#ffffff33', radius: 0 };
    case 'image':
      return { ...BASE_STYLE, radius: 0 };
    case 'box':
      return { ...BASE_STYLE, paddingX: 0, paddingY: 0, gap: 18 };
  }
}

const DEFAULT_POS: Record<LayerType, LayerPos> = {
  heading: { x: 8, y: 30, w: 60, h: 0, anchor: 'tl' },
  text: { x: 8, y: 50, w: 50, h: 0, anchor: 'tl' },
  button: { x: 8, y: 70, w: 0, h: 0, anchor: 'tl' },
  image: { x: 70, y: 50, w: 24, h: 0, anchor: 'c' },
  icon: { x: 50, y: 20, w: 0, h: 0, anchor: 'c' },
  shape: { x: 75, y: 50, w: 30, h: 50, anchor: 'c' },
  box: { x: 50, y: 50, w: 70, h: 0, anchor: 'c' },
};

const DEFAULT_TEXT: Partial<Record<LayerType, string>> = {
  heading: 'Your headline here',
  text: 'A short sentence that says what makes it worth a look.',
  button: 'Find out more',
};

export function defaultLayer(type: LayerType, overrides: Partial<Layer> = {}): Layer {
  const content: LayerContent = {
    text: DEFAULT_TEXT[type] ?? '',
    tag: type === 'heading' ? 'h2' : type === 'text' ? 'p' : 'div',
    link: { kind: 'none', value: '' },
    media: null,
    alt: '',
    icon: 'star',
    shape: 'rect',
  };
  return {
    id: newId(),
    type,
    name: '',
    content,
    style: { base: defaultStyle(type) },
    pos: { base: { ...DEFAULT_POS[type] } },
    hide: { desktop: false, tablet: false, mobile: false },
    motion: {
      in: defaultMotion(type === 'shape' || type === 'image' ? 'fade' : 'fade-up'),
      out: null,
      hover: type === 'button' ? 'lift' : 'none',
    },
    children: [],
    ext: {},
    ...overrides,
  };
}

/** A content box with a heading, a text and a button: the slide of the fast path. */
export function contentBox(
  parts: { heading?: string; text?: string; button?: string; link?: Link },
  place: { anchor: Anchor; x: number; y: number } = { anchor: 'c', x: 50, y: 50 },
): Layer {
  const textAlign =
    place.anchor.endsWith('l') || place.anchor === 'l'
      ? 'left'
      : place.anchor.endsWith('r') || place.anchor === 'r'
        ? 'right'
        : 'center';
  const children: Layer[] = [];
  if (parts.heading !== undefined)
    children.push(
      defaultLayer('heading', {
        content: { ...defaultLayer('heading').content, text: parts.heading, tag: 'h2' },
        motion: { in: defaultMotion('fade-up', 100), out: null, hover: 'none' },
      }),
    );
  if (parts.text)
    children.push(
      defaultLayer('text', {
        content: { ...defaultLayer('text').content, text: parts.text },
        motion: { in: defaultMotion('fade-up', 300), out: null, hover: 'none' },
      }),
    );
  if (parts.button)
    children.push(
      defaultLayer('button', {
        content: {
          ...defaultLayer('button').content,
          text: parts.button,
          link: parts.link ?? { kind: 'none', value: '' },
        },
        motion: { in: defaultMotion('fade-up', 500), out: null, hover: 'lift' },
      }),
    );
  return defaultLayer('box', {
    name: 'Content',
    style: { base: { ...defaultStyle('box'), textAlign } },
    pos: { base: { x: place.x, y: place.y, w: 64, h: 0, anchor: place.anchor } },
    motion: { in: defaultMotion('none'), out: null, hover: 'none' },
    children,
  });
}

export function defaultBackground(): Background {
  return {
    kind: 'gradient',
    color: '#1f2937',
    gradient: { type: 'linear', angle: 135, from: '#1e3a8a', to: '#7c3aed' },
    image: null,
    focal: null,
    alt: '',
    decorative: false,
    featured: false,
    video: { source: 'mp4', media: null, url: '' },
  };
}

export function defaultSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: newId(),
    name: '',
    hidden: false,
    background: defaultBackground(),
    overlay: { color: '#000000', opacity: 0 },
    kenBurns: 'none',
    transition: '',
    duration: 0,
    link: { kind: 'none', value: '' },
    layers: [],
    ext: {},
    ...overrides,
  };
}

export function defaultSlider(overrides: Partial<SliderData> = {}): SliderData {
  return {
    v: 1,
    type: 'slider',
    layout: 'fullwidth',
    size: { base: { ...DEFAULT_SIZE }, tablet: { height: 520 }, mobile: { height: 480 } },
    maxWidth: 0,
    autoMobile: true,
    transition: { effect: 'fade', duration: 800, easing: 'ease-in-out' },
    autoplay: { enabled: true, delay: 6000, pauseOnHover: true, loop: true },
    navigation: {
      arrows: true,
      bullets: true,
      progress: false,
      style: 'circle',
      color: '#ffffff',
      size: 44,
      hideArrowsOnMobile: true,
    },
    source: { kind: 'manual' },
    slides: [],
    ext: {},
    ...overrides,
  };
}

// ---- Normalization -------------------------------------------------------------------

const TRANSITIONS: readonly TransitionId[] = [
  'fade',
  'crossfade',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'slide-over',
  'zoom',
];
const EASINGS: readonly EasingId[] = [
  'ease',
  'ease-out',
  'ease-in-out',
  'linear',
  'smooth',
  'bounce',
];
const NAVS: readonly NavStyle[] = ['minimal', 'circle', 'square', 'pill', 'line', 'outline'];
const KBS: readonly KenBurns[] = ['none', 'zoom-in', 'zoom-out', 'pan'];
const MOTIONS: readonly MotionId[] = [
  'none',
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'zoom-in',
  'zoom-out',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'blur',
  'flip',
  'rotate',
  'skew',
];
const HOVERS: readonly HoverId[] = ['none', 'lift', 'grow', 'glow', 'darken', 'shift'];
const TYPES: readonly LayerType[] = ['heading', 'text', 'button', 'image', 'icon', 'shape', 'box'];
const ANCHORS: readonly Anchor[] = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];
const SHAPES: readonly ShapeKind[] = ['rect', 'circle', 'line', 'blob'];
const TAGS: readonly TextTag[] = ['h1', 'h2', 'h3', 'h4', 'p', 'div'];
const FONTS: readonly FontFamily[] = ['inherit', 'sans', 'serif', 'display', 'mono'];

function size(input: unknown, fallback: SizeValues): SizeValues {
  const o = obj(input);
  return {
    height: num(o.height, 120, 2000, fallback.height),
    offset: num(o.offset, 0, 400, fallback.offset),
  };
}

function motion(input: unknown, fallback: Motion): Motion {
  const o = obj(input);
  return {
    preset: oneOf(o.preset, MOTIONS, fallback.preset),
    delay: num(o.delay, 0, 10_000, fallback.delay),
    duration: num(o.duration, 100, 5000, fallback.duration),
    easing: oneOf(o.easing, EASINGS, fallback.easing),
  };
}

function style(input: unknown, fallback: LayerStyle): LayerStyle {
  const o = obj(input);
  return {
    fontFamily: oneOf(o.fontFamily, FONTS, fallback.fontFamily),
    fontSize: num(o.fontSize, 8, 240, fallback.fontSize),
    fontWeight: num(o.fontWeight, 100, 900, fallback.fontWeight),
    lineHeight: num(o.lineHeight, 0.8, 3, fallback.lineHeight),
    letterSpacing: num(o.letterSpacing, -0.2, 1, fallback.letterSpacing),
    uppercase: bool(o.uppercase, fallback.uppercase),
    italic: bool(o.italic, fallback.italic),
    textAlign: oneOf(o.textAlign, ['left', 'center', 'right'] as const, fallback.textAlign),
    color: color(o.color, fallback.color),
    background: color(o.background, fallback.background),
    borderColor: color(o.borderColor, fallback.borderColor),
    borderWidth: num(o.borderWidth, 0, 20, fallback.borderWidth),
    radius: num(o.radius, 0, 999, fallback.radius),
    paddingX: num(o.paddingX, 0, 200, fallback.paddingX),
    paddingY: num(o.paddingY, 0, 200, fallback.paddingY),
    gap: num(o.gap, 0, 120, fallback.gap),
    shadow: bool(o.shadow, fallback.shadow),
    opacity: num(o.opacity, 0, 1, fallback.opacity),
  };
}

function pos(input: unknown, fallback: LayerPos): LayerPos {
  const o = obj(input);
  return {
    x: num(o.x, -50, 150, fallback.x),
    y: num(o.y, -50, 150, fallback.y),
    w: num(o.w, 0, 100, fallback.w),
    h: num(o.h, 0, 100, fallback.h),
    anchor: oneOf(o.anchor, ANCHORS, fallback.anchor),
  };
}

export function normalizeLayer(input: unknown, depth = 0): Layer | null {
  const o = obj(input);
  const type = oneOf(o.type, TYPES, 'text');
  if (!TYPES.includes(o.type as LayerType)) return null;
  // Boxes hold other layers, never boxes.
  if (type === 'box' && depth > 0) return null;
  const fallback = defaultLayer(type);
  const c = obj(o.content);
  const m = obj(o.motion);
  const hide = obj(o.hide);
  const icon = typeof c.icon === 'string' && c.icon in ICONS ? c.icon : fallback.content.icon;
  const children =
    type === 'box' && Array.isArray(o.children)
      ? o.children
          .slice(0, LIMITS.children)
          .map((child) => normalizeLayer(child, depth + 1))
          .filter((l): l is Layer => l !== null)
      : [];
  return {
    id: isId(o.id) ? o.id : newId(),
    type,
    name: text(o.name, 80),
    content: {
      text: text(c.text),
      tag: oneOf(c.tag, TAGS, fallback.content.tag),
      link: link(c.link),
      media: mediaRef(c.media),
      alt: text(c.alt, 300),
      icon,
      shape: oneOf(c.shape, SHAPES, 'rect'),
    },
    style: perDevice(o.style, style, fallback.style.base),
    pos: perDevice(o.pos, pos, fallback.pos.base),
    hide: {
      desktop: bool(hide.desktop, false),
      tablet: bool(hide.tablet, false),
      mobile: bool(hide.mobile, false),
    },
    motion: {
      in: motion(m.in, fallback.motion.in),
      out: m.out ? motion(m.out, { ...defaultMotion('fade'), duration: 400 }) : null,
      hover: oneOf(m.hover, HOVERS, fallback.motion.hover),
    },
    children,
    ext: ext(o.ext),
  };
}

function background(input: unknown): Background {
  const o = obj(input);
  const fallback = defaultBackground();
  const g = obj(o.gradient);
  const f = obj(o.focal);
  const v = obj(o.video);
  return {
    kind: oneOf(o.kind, ['image', 'color', 'gradient', 'video'] as const, fallback.kind),
    color: color(o.color, fallback.color),
    gradient: {
      type: oneOf(g.type, ['linear', 'radial'] as const, 'linear'),
      angle: num(g.angle, 0, 360, 135),
      from: color(g.from, fallback.gradient.from),
      to: color(g.to, fallback.gradient.to),
    },
    image: mediaRef(o.image),
    focal:
      typeof f.x === 'number' && typeof f.y === 'number'
        ? { x: num(f.x, 0, 100, 50), y: num(f.y, 0, 100, 50) }
        : null,
    alt: text(o.alt, 300),
    decorative: bool(o.decorative, false),
    featured: bool(o.featured, false),
    video: {
      source: oneOf(v.source, ['mp4', 'youtube', 'vimeo'] as const, 'mp4'),
      media: mediaRef(v.media),
      url: safeUrl(v.url),
    },
  };
}

export function normalizeSlide(input: unknown): Slide {
  const o = obj(input);
  const overlay = obj(o.overlay);
  return {
    id: isId(o.id) ? o.id : newId(),
    name: text(o.name, 80),
    hidden: bool(o.hidden, false),
    background: background(o.background),
    overlay: { color: color(overlay.color, '#000000'), opacity: num(overlay.opacity, 0, 1, 0) },
    kenBurns: oneOf(o.kenBurns, KBS, 'none'),
    transition: o.transition === '' ? '' : oneOf(o.transition, TRANSITIONS, '' as never) || '',
    duration: num(o.duration, 0, 60_000, 0),
    link: link(o.link),
    layers: (Array.isArray(o.layers) ? o.layers : [])
      .slice(0, LIMITS.layers)
      .map((layer) => normalizeLayer(layer))
      .filter((l): l is Layer => l !== null),
    ext: ext(o.ext),
  };
}

function source(input: unknown): SliderSource {
  const o = obj(input);
  if (o.kind === 'posts') {
    return {
      kind: 'posts',
      count: num(o.count, 1, 20, 5),
      category:
        typeof o.category === 'string' && /^[\w-]{1,200}$/.test(o.category) ? o.category : '',
      excerptLength: num(o.excerptLength, 0, 600, 140),
    };
  }
  return { kind: 'manual' };
}

/** Any input as a complete slider. */
export function normalizeSlider(input: unknown): SliderData {
  const o = obj(input);
  const fallback = defaultSlider();
  const t = obj(o.transition);
  const a = obj(o.autoplay);
  const n = obj(o.navigation);
  const slides = (Array.isArray(o.slides) ? o.slides : [])
    .slice(0, LIMITS.slides)
    .map(normalizeSlide);
  // Ids are unique in a slider: the runtime and the editor find slides and layers by them.
  const seen = new Set<string>();
  const unique = (id: string) => {
    let next = id;
    while (seen.has(next)) next = newId();
    seen.add(next);
    return next;
  };
  for (const slide of slides) {
    slide.id = unique(slide.id);
    for (const layer of slide.layers) {
      layer.id = unique(layer.id);
      for (const child of layer.children) child.id = unique(child.id);
    }
  }
  return {
    v: 1,
    type: oneOf(o.type, ['slider', 'hero'] as const, fallback.type),
    layout: oneOf(o.layout, ['auto', 'fullwidth', 'fullscreen'] as const, fallback.layout),
    size: o.size ? perDevice(o.size, size, DEFAULT_SIZE) : fallback.size,
    maxWidth: num(o.maxWidth, 0, 4000, 0),
    autoMobile: bool(o.autoMobile, true),
    transition: {
      effect: oneOf(t.effect, TRANSITIONS, fallback.transition.effect),
      duration: num(t.duration, 0, 4000, fallback.transition.duration),
      easing: oneOf(t.easing, EASINGS, fallback.transition.easing),
    },
    autoplay: {
      enabled: bool(a.enabled, fallback.autoplay.enabled),
      delay: num(a.delay, 1500, 60_000, fallback.autoplay.delay),
      pauseOnHover: bool(a.pauseOnHover, true),
      loop: bool(a.loop, true),
    },
    navigation: {
      arrows: bool(n.arrows, fallback.navigation.arrows),
      bullets: bool(n.bullets, fallback.navigation.bullets),
      progress: bool(n.progress, fallback.navigation.progress),
      style: oneOf(n.style, NAVS, fallback.navigation.style),
      color: color(n.color, fallback.navigation.color),
      size: num(n.size, 24, 80, fallback.navigation.size),
      hideArrowsOnMobile: bool(n.hideArrowsOnMobile, true),
    },
    source: source(o.source),
    slides,
    ext: ext(o.ext),
  };
}

/** A title as typed, or a default. */
export function cleanTitle(value: unknown): string {
  const t = text(value, 120).replace(/\s+/g, ' ').trim();
  return t || 'Slider';
}

/** The short name of a slider used by the shortcode: `[diorama alias="home"]`. */
export function aliasOf(value: unknown): string {
  const base = (typeof value === 'string' ? value : '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'slider';
}

/** The media a slider uses, by id (for render and the media usage). */
export function mediaIdsOf(data: SliderData): string[] {
  const ids = new Set<string>();
  const add = (ref: MediaRef | null) => {
    if (ref?.id) ids.add(ref.id);
  };
  const walk = (layers: Layer[]) => {
    for (const layer of layers) {
      add(layer.content.media);
      walk(layer.children);
    }
  };
  for (const slide of data.slides) {
    add(slide.background.image);
    add(slide.background.video.media);
    walk(slide.layers);
  }
  return [...ids];
}

/** Every layer of a slide, boxes' layers included. */
export function allLayers(layers: Layer[]): Layer[] {
  return layers.flatMap((layer) => [layer, ...layer.children]);
}

export type { Device };
