/**
 * Diorama's data model. A slider is one JSON document: its settings, its
 * slides, and the layers of each slide. Values that may differ by device
 * are `PerDevice`: the desktop value, plus only what changes on tablets and
 * phones (the smaller device inherits from the larger one). Media are
 * `{ id, url }` objects, so exports and imports remap them.
 */

export type Device = 'desktop' | 'tablet' | 'mobile';
export const DEVICES: readonly Device[] = ['desktop', 'tablet', 'mobile'];

/** Desktop values, and the ones that change on tablets and phones. */
export interface PerDevice<T> {
  base: T;
  tablet?: Partial<T>;
  mobile?: Partial<T>;
}

/** A file of the media library: `id` may be null for an address alone. */
export interface MediaRef {
  id: string | null;
  url: string;
}

export type LinkKind = 'none' | 'page' | 'url' | 'phone' | 'email' | 'scroll' | 'post';

/**
 * Where a button or a slide leads. `page`: an entry of the site (`entryId`;
 * `value` keeps its address at the time it was chosen); `scroll`: an anchor
 * of the page (`#contacts`), or below the slider when empty; `post`: the
 * post shown by the slide (latest posts).
 */
export interface Link {
  kind: LinkKind;
  value: string;
  entryId?: string;
  newTab?: boolean;
}

export type SliderType = 'slider' | 'hero';
export type SliderLayout = 'auto' | 'fullwidth' | 'fullscreen';
export type TransitionId =
  | 'fade'
  | 'crossfade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'slide-over'
  | 'zoom';
export type EasingId = 'ease' | 'ease-out' | 'ease-in-out' | 'linear' | 'smooth' | 'bounce';
export type NavStyle = 'minimal' | 'circle' | 'square' | 'pill' | 'line' | 'outline';
export type KenBurns = 'none' | 'zoom-in' | 'zoom-out' | 'pan';
export type MotionId =
  | 'none'
  | 'fade'
  | 'fade-up'
  | 'fade-down'
  | 'fade-left'
  | 'fade-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'blur'
  | 'flip'
  | 'rotate'
  | 'skew';
export type HoverId = 'none' | 'lift' | 'grow' | 'glow' | 'darken' | 'shift';
export type LayerType = 'heading' | 'text' | 'button' | 'image' | 'icon' | 'shape' | 'box';
export type Anchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';
export type ShapeKind = 'rect' | 'circle' | 'line' | 'blob';
export type TextTag = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div';
export type FontFamily = 'inherit' | 'sans' | 'serif' | 'display' | 'mono';

/** The size of the slider: height (auto and full width) and the header's offset (full screen). */
export interface SizeValues {
  /** Pixels. */
  height: number;
  /** Full screen: pixels subtracted from the window's height (a fixed header). */
  offset: number;
}

export interface SliderData {
  v: 1;
  type: SliderType;
  layout: SliderLayout;
  size: PerDevice<SizeValues>;
  /** Auto layout: the widest it gets, in pixels (0: the width of the content). */
  maxWidth: number;
  /** Texts and buttons get a readable layout on phones unless set by hand. */
  autoMobile: boolean;
  transition: { effect: TransitionId; duration: number; easing: EasingId };
  autoplay: { enabled: boolean; delay: number; pauseOnHover: boolean; loop: boolean };
  navigation: {
    arrows: boolean;
    bullets: boolean;
    progress: boolean;
    style: NavStyle;
    color: string;
    /** Pixels: the size of the arrows (bullets follow). */
    size: number;
    hideArrowsOnMobile: boolean;
  };
  source: SliderSource;
  slides: Slide[];
  /** Data of other plugins (Diorama Pro), kept as it is. */
  ext: Record<string, unknown>;
}

export type SliderSource =
  | { kind: 'manual' }
  | {
      kind: 'posts';
      count: number;
      /** A category's slug, or empty for every post. */
      category: string;
      /** Characters of the excerpt. */
      excerptLength: number;
    };

export interface Gradient {
  type: 'linear' | 'radial';
  angle: number;
  from: string;
  to: string;
}

export interface Background {
  kind: 'image' | 'color' | 'gradient' | 'video';
  color: string;
  gradient: Gradient;
  /** The picture (also the poster of a video). */
  image: MediaRef | null;
  /** The point kept in view, 0–100 % (null: the media library's, or the centre). */
  focal: { x: number; y: number } | null;
  /** Alternative text; empty: the media library's. A decorative picture has `decorative`. */
  alt: string;
  decorative: boolean;
  /** Latest posts: the post's featured image instead of `image`. */
  featured: boolean;
  video: { source: 'mp4' | 'youtube' | 'vimeo'; media: MediaRef | null; url: string };
}

export interface Slide {
  id: string;
  /** The editor's name of the slide (also its accessible name, when set). */
  name: string;
  hidden: boolean;
  background: Background;
  overlay: { color: string; opacity: number };
  kenBurns: KenBurns;
  /** Empty: the slider's. */
  transition: TransitionId | '';
  /** Milliseconds; 0: the slider's delay. */
  duration: number;
  link: Link;
  layers: Layer[];
  ext: Record<string, unknown>;
}

export interface Motion {
  preset: MotionId;
  /** Milliseconds. */
  delay: number;
  duration: number;
  easing: EasingId;
}

export interface LayerContent {
  /** Heading, text and button. Line breaks are kept. */
  text: string;
  tag: TextTag;
  link: Link;
  media: MediaRef | null;
  alt: string;
  icon: string;
  shape: ShapeKind;
}

export interface LayerStyle {
  fontFamily: FontFamily;
  /** Pixels at the device's full width. */
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  /** Em. */
  letterSpacing: number;
  uppercase: boolean;
  italic: boolean;
  textAlign: 'left' | 'center' | 'right';
  color: string;
  background: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  paddingX: number;
  paddingY: number;
  /** Box: space between its layers, pixels. */
  gap: number;
  shadow: boolean;
  opacity: number;
}

/** Where a layer sits: its anchor point at x/y (% of the slide); width and height in % (0: auto). */
export interface LayerPos {
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: Anchor;
}

export interface Layer {
  id: string;
  type: LayerType;
  /** The editor's name of the layer. */
  name: string;
  content: LayerContent;
  style: PerDevice<LayerStyle>;
  pos: PerDevice<LayerPos>;
  hide: Record<Device, boolean>;
  motion: { in: Motion; out: Motion | null; hover: HoverId };
  /** The layers of a box, one under the other. */
  children: Layer[];
  ext: Record<string, unknown>;
}

/** A slider as stored and as the API gives it. */
export interface SliderRecord {
  id: string;
  title: string;
  alias: string;
  data: SliderData;
  createdAt: string;
  updatedAt: string;
}

/** A slider in lists. */
export interface SliderSummary {
  id: string;
  title: string;
  alias: string;
  type: SliderType;
  slides: number;
  thumbnail: MediaRef | null;
  /** The first slide's colour or gradient, as CSS, when it has no picture. */
  cover: string;
  updatedAt: string;
}
