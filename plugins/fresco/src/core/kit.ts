/**
 * Site settings ("kit"): global colors and fonts, breakpoints, the width of
 * boxed containers and the space between widgets. Elements refer to global
 * colors and fonts through CSS variables, so changing the kit restyles every
 * page at once.
 */
import { atomicKitCss, normalizeVariants, type GlobalClass, type Variable } from './atomic.js';
import { googleFonts } from '@cleitext/shared/google-fonts';
import { safeColor, safeFont } from './css.js';
import { isGoogleFont } from './fonts.js';
import {
  DEFAULT_BREAKPOINTS,
  MAX_WIDTH_DEVICES,
  SHEET_ORDER,
  deviceMedia,
  deviceRange,
  rangeMedia,
  type Breakpoints,
  type Device,
  type SizeValue,
} from './model.js';

export interface KitColor {
  id: string;
  title: string;
  value: string;
}

/** Devices other than desktop: where the kit's responsive values go. */
export type KitDevice = Exclude<Device, 'desktop'>;

/** Sizes and spacing of a text on one device. */
export interface ResponsiveText {
  size?: SizeValue;
  line?: SizeValue;
  letter?: SizeValue;
  word?: SizeValue;
}

export interface KitFont {
  id: string;
  title: string;
  family: string;
  weight: string;
  size?: SizeValue;
  line?: SizeValue;
  transform?: string;
  style?: string;
  decoration?: string;
  letter?: SizeValue;
  word?: SizeValue;
  /** The generic family shown while the font loads, or when it is missing. */
  fallback?: string;
  /** Size, line height and spacing on the other devices. */
  devices?: Partial<Record<KitDevice, ResponsiveText>>;
}

/** Typography of a theme style (texts, links, buttons, fields): a global font, or its own values. */
export interface TypoStyle extends ResponsiveText {
  /** Id of a global font. */
  font?: string;
  /**
   * The global font gives all its values (size, line height, spacing, style…),
   * as set from Fresco 2.3; before, only its family, weight and transform.
   */
  fontAll?: boolean;
  family?: string;
  weight?: string;
  transform?: string;
  style?: string;
  decoration?: string;
  devices?: Partial<Record<KitDevice, ResponsiveText>>;
}

/** A text style of the theme style: a global font, or its own family, size, weight and color. */
export interface TextStyle extends TypoStyle {
  color?: string;
}

/** A shadow: offsets, blur and spread in px, and its color. */
export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset?: boolean;
}

/** CSS filters, in the units of the Filters group (px, %, deg). */
export interface Filters {
  blur?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  hue?: number;
}

/** A box of four sides (padding). */
export interface KitBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
  unit: string;
}

export const THEME_TEXTS = ['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
export type ThemeText = (typeof THEME_TEXTS)[number];

/** Theme style: how texts, buttons, images, form fields and the lightbox look by default. */
export interface ThemeStyle {
  texts?: Partial<Record<ThemeText, TextStyle>>;
  /** Links: typography and decoration (their colors are `Kit.style.link` and `linkHover`). */
  link?: TypoStyle & { hoverDecoration?: string };
  /** Space after paragraphs, per device. */
  paragraph?: { spacing?: SizeValue; devices?: Partial<Record<KitDevice, SizeValue>> };
  button?: TypoStyle & {
    color?: string;
    background?: string;
    /** A second color: the background is a gradient. */
    backgroundB?: string;
    angle?: number;
    hoverColor?: string;
    hoverBackground?: string;
    hoverBackgroundB?: string;
    borderStyle?: string;
    borderColor?: string;
    hoverBorderColor?: string;
    borderWidth?: SizeValue;
    radius?: SizeValue;
    hoverRadius?: SizeValue;
    paddingY?: SizeValue;
    paddingX?: SizeValue;
    shadow?: Shadow;
    hoverShadow?: Shadow;
    textShadow?: Shadow;
    /** Seconds. */
    transition?: number;
    /** Padding on the other devices. */
    padding?: Partial<Record<KitDevice, { y?: SizeValue; x?: SizeValue }>>;
  };
  image?: {
    radius?: SizeValue;
    borderStyle?: string;
    borderColor?: string;
    borderWidth?: SizeValue;
    opacity?: number;
    hoverOpacity?: number;
    shadow?: Shadow;
    filters?: Filters;
    hoverRadius?: SizeValue;
    hoverBorderColor?: string;
    hoverShadow?: Shadow;
    hoverFilters?: Filters;
    /** Seconds. */
    transition?: number;
  };
  field?: TypoStyle & {
    color?: string;
    background?: string;
    borderStyle?: string;
    borderColor?: string;
    focusBorderColor?: string;
    borderWidth?: SizeValue;
    radius?: SizeValue;
    accent?: string;
    shadow?: Shadow;
    paddingY?: SizeValue;
    paddingX?: SizeValue;
    focusColor?: string;
    focusBackground?: string;
    focusShadow?: Shadow;
    /** Seconds. */
    transition?: number;
    label?: TypoStyle & { color?: string };
  };
  lightbox?: {
    background?: string;
    uiColor?: string;
    uiHoverColor?: string;
    textColor?: string;
    /** Sizes of the toolbar, close and navigation icons (px). */
    iconSize?: number;
    closeSize?: number;
    navSize?: number;
    /** Links to image files of Fresco elements open in the lightbox. */
    images?: boolean;
    counter?: boolean;
    fullscreen?: boolean;
    zoom?: boolean;
    download?: boolean;
    /** What the lightbox shows under the image. */
    caption?: 'caption' | 'alt' | 'none';
  };
  /** The page's background on Fresco pages. */
  background?: {
    type?: 'classic' | 'gradient';
    color?: string;
    image?: { url: string; id?: string };
    position?: string;
    repeat?: string;
    size?: string;
    attachment?: string;
    colorB?: string;
    angle?: number;
    gradient?: 'linear' | 'radial';
    /** The color of the browser's bar on phones (`theme-color`). */
    mobileColor?: string;
  };
}

export interface Kit {
  /** Theme style beyond the colors of texts and links (see `style`). */
  theme: ThemeStyle;
  colors: KitColor[];
  fonts: KitFont[];
  breakpoints: Breakpoints;
  /** Width of boxed containers. */
  containerWidth: SizeValue;
  /** Gap between the elements of a container. */
  gap: SizeValue;
  /** Theme style: page background and the default text and link colors. */
  style: {
    background?: string;
    text?: string;
    link?: string;
    linkHover?: string;
  };
  /** Fonts to load from Google Fonts (family names, any family Google serves). */
  googleFonts: string[];
  /**
   * How pages get their Google Fonts (Site settings → Global fonts): copies
   * kept on this site (`local`, the default, kept unset: no visitor reaches Google), from
   * Google's servers (`google`), or not at all (`none`: the theme or the
   * site provides them).
   */
  googleFontsMode?: 'local' | 'google' | 'none';
  /** The theme's page title, hidden by the page setting "Hide the page title". */
  titleSelector?: string;
  /** Atomic styling: classes shared by elements. */
  classes: GlobalClass[];
  /** Atomic styling: named colors, fonts and sizes. */
  variables: Variable[];
  /** Layout beyond the content width and the gap: container padding, page layout, devices. */
  layout?: KitLayout;
  /**
   * Elements take the theme's colors (Fresco 2.11.4, Elementor's "Disable
   * Default Colors"): headings, texts and the other elements with a global
   * color as their default leave it to the theme. The global colors stay, for
   * the elements that choose one.
   */
  themeColors?: boolean;
  /** Elements take the theme's fonts (Elementor's "Disable Default Fonts"), as `themeColors`. */
  themeFonts?: boolean;
}

export interface KitLayout {
  /** Padding of top-level containers (10px when unset). */
  padding?: KitBox;
  /** The layout of pages that keep the default one. */
  pageLayout?: 'full' | 'canvas';
  /** Content width, gap and container padding on the other devices. */
  devices?: Partial<Record<KitDevice, { width?: SizeValue; gap?: SizeValue; padding?: KitBox }>>;
}

/** The four system colors and fonts, always there (they can be changed, not removed). */
export const SYSTEM_IDS = ['primary', 'secondary', 'text', 'accent'] as const;

export const DEFAULT_KIT: Kit = {
  theme: {},
  colors: [
    { id: 'primary', title: 'Primary', value: '#1d4ed8' },
    { id: 'secondary', title: 'Secondary', value: '#0f172a' },
    { id: 'text', title: 'Text', value: '#334155' },
    { id: 'accent', title: 'Accent', value: '#f59e0b' },
  ],
  fonts: [
    { id: 'primary', title: 'Primary', family: 'Inter', weight: '600' },
    { id: 'secondary', title: 'Secondary', family: 'Inter', weight: '400' },
    { id: 'text', title: 'Text', family: 'Inter', weight: '400' },
    { id: 'accent', title: 'Accent', family: 'Inter', weight: '500' },
  ],
  breakpoints: DEFAULT_BREAKPOINTS,
  containerWidth: { size: 1140, unit: 'px' },
  gap: { size: 20, unit: 'px' },
  style: {},
  googleFonts: [],
  classes: [],
  variables: [],
  titleSelector:
    'h1.entry-title, .entry-title, .page-title, .entry-header h1, main h1:first-of-type',
};

/** A CSS selector list without anything that could end the rule. */
export function safeSelector(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && /^[\w\s.#,>:()*+~[\]="'-]{1,300}$/.test(value)
    ? value.trim()
    : null;
}

const ID = /^[a-z0-9-]{1,40}$/;

/** A kit read from storage: unknown or unsafe values fall back to the defaults. */
export function normalizeKit(value: unknown): Kit {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Kit>;
  const colors = Array.isArray(input.colors)
    ? input.colors.filter(
        (c): c is KitColor =>
          Boolean(c) &&
          ID.test(String(c.id)) &&
          safeColor(c.value) !== null &&
          typeof c.title === 'string',
      )
    : [];
  const fonts = Array.isArray(input.fonts)
    ? input.fonts
        .filter(
          (f): f is KitFont =>
            Boolean(f) &&
            ID.test(String(f.id)) &&
            typeof f.title === 'string' &&
            typeof f.family === 'string',
        )
        .map(normalizeFont)
    : [];
  const withSystem = <T extends { id: string }>(list: T[], defaults: T[]) => [
    ...defaults.map((d) => list.find((item) => item.id === d.id) ?? d),
    ...list.filter((item) => !defaults.some((d) => d.id === item.id)),
  ];
  const breakpoints = normalizeBreakpoints(input.breakpoints);
  const size = (v: unknown, fallback: SizeValue): SizeValue =>
    v && typeof v === 'object' && typeof (v as SizeValue).size === 'number'
      ? {
          size: (v as SizeValue).size,
          unit: ['px', '%', 'em', 'rem', 'vw'].includes((v as SizeValue).unit)
            ? (v as SizeValue).unit
            : 'px',
        }
      : fallback;
  const style = (input.style ?? {}) as Kit['style'];
  return {
    theme: normalizeTheme(input.theme),
    colors: withSystem(colors, DEFAULT_KIT.colors),
    fonts: withSystem(fonts, DEFAULT_KIT.fonts),
    breakpoints,
    containerWidth: size(input.containerWidth, DEFAULT_KIT.containerWidth),
    gap: size(input.gap, DEFAULT_KIT.gap),
    style: Object.fromEntries(
      Object.entries(style).filter(([, v]) => safeColor(v) !== null),
    ) as Kit['style'],
    titleSelector: safeSelector(input.titleSelector) ?? DEFAULT_KIT.titleSelector!,
    ...(normalizeLayout(input.layout) ? { layout: normalizeLayout(input.layout)! } : {}),
    classes: Array.isArray(input.classes)
      ? input.classes
          .filter((c) => c && ID.test(String(c.id)) && typeof c.label === 'string')
          .slice(0, 500)
          .map((c) => ({
            id: c.id,
            label: c.label.slice(0, 60),
            variants: normalizeVariants(c.variants),
          }))
      : [],
    variables: Array.isArray(input.variables)
      ? input.variables
          .filter(
            (v) =>
              v &&
              ID.test(String(v.id)) &&
              typeof v.label === 'string' &&
              ['color', 'font', 'size'].includes(v.type) &&
              typeof v.value === 'string',
          )
          .slice(0, 500)
          .map((v) => ({
            id: v.id,
            label: v.label.slice(0, 60),
            type: v.type,
            value: v.value.slice(0, 200),
            ...(v.deleted === true ? { deleted: true } : {}),
          }))
      : [],
    ...(input.themeColors === true ? { themeColors: true } : {}),
    ...(input.themeFonts === true ? { themeFonts: true } : {}),
    ...(input.googleFontsMode === 'google' || input.googleFontsMode === 'none'
      ? { googleFontsMode: input.googleFontsMode }
      : {}),
    googleFonts: Array.isArray(input.googleFonts)
      ? [
          ...new Set(
            input.googleFonts.filter(
              (f) => typeof f === 'string' && GOOGLE_FAMILY.test(f) && f.trim() === f,
            ),
          ),
        ].slice(0, 30)
      : [],
  };
}

/**
 * Breakpoints read from storage. Tablet and mobile are always there (the
 * defaults when invalid); an optional device is kept when its value is a
 * whole number in order with the others (each max-width breakpoint above the
 * next smaller one, widescreen above them all); otherwise it is off.
 */
export function normalizeBreakpoints(value: unknown): Breakpoints {
  const bp = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  const base =
    int(bp.mobile, 320, 2400) && int(bp.tablet, 321, 2400) && bp.mobile < bp.tablet
      ? { tablet: bp.tablet, mobile: bp.mobile }
      : { ...DEFAULT_BREAKPOINTS };
  const out: Breakpoints = { ...base };
  if (int(bp.mobile_extra, out.mobile + 1, out.tablet - 1)) out.mobile_extra = bp.mobile_extra;
  if (int(bp.tablet_extra, out.tablet + 1, 2999)) out.tablet_extra = bp.tablet_extra;
  if (int(bp.laptop, (out.tablet_extra ?? out.tablet) + 1, 2999)) out.laptop = bp.laptop;
  if (int(bp.widescreen, (out.laptop ?? out.tablet_extra ?? out.tablet) + 2, 5000))
    out.widescreen = bp.widescreen;
  return out;
}

/** A family name Google Fonts may serve: letters, digits and spaces. */
const GOOGLE_FAMILY = /^[A-Za-z0-9][\w ]{0,59}$/;

/**
 * A kit with another (partial) kit laid over it, e.g. one converted from
 * another page builder on import: its colors, fonts, classes and variables
 * replace those with the same id and add the others; the other settings it
 * has replace the current ones.
 */
export function mergeKit(current: Kit, incoming: unknown): Kit {
  const next = (incoming && typeof incoming === 'object' ? incoming : {}) as Partial<Kit>;
  const byId = <T extends { id: string }>(base: T[], extra: unknown): T[] => {
    const list = Array.isArray(extra)
      ? (extra as T[]).filter((i) => i && typeof i === 'object')
      : [];
    return [
      ...base.map((item) => list.find((i) => i.id === item.id) ?? item),
      ...list.filter((i) => !base.some((item) => item.id === i.id)),
    ];
  };
  return normalizeKit({
    ...current,
    colors: byId(current.colors, next.colors),
    fonts: byId(current.fonts, next.fonts),
    classes: byId(current.classes, next.classes),
    variables: byId(current.variables, next.variables),
    googleFonts: [
      ...current.googleFonts,
      ...(Array.isArray(next.googleFonts) ? next.googleFonts : []),
    ],
    ...(next.breakpoints ? { breakpoints: next.breakpoints } : {}),
    ...(next.containerWidth ? { containerWidth: next.containerWidth } : {}),
    ...(next.gap ? { gap: next.gap } : {}),
    ...(next.style ? { style: { ...current.style, ...next.style } } : {}),
    ...(next.theme ? { theme: mergeTheme(current.theme, next.theme) } : {}),
    ...(next.titleSelector ? { titleSelector: next.titleSelector } : {}),
    ...(next.layout ? { layout: { ...current.layout, ...next.layout } } : {}),
    ...(typeof next.themeColors === 'boolean' ? { themeColors: next.themeColors } : {}),
    ...(typeof next.themeFonts === 'boolean' ? { themeFonts: next.themeFonts } : {}),
  });
}

function mergeTheme(current: ThemeStyle, incoming: ThemeStyle): ThemeStyle {
  return {
    ...current,
    ...incoming,
    texts: { ...current.texts, ...incoming.texts },
  };
}

const length = (v: SizeValue | undefined): string | null =>
  v && typeof v.size === 'number' ? `${v.size}${v.unit}` : null;

const sizeOf = (v: unknown): SizeValue | undefined =>
  v &&
  typeof v === 'object' &&
  typeof (v as SizeValue).size === 'number' &&
  Number.isFinite((v as SizeValue).size) &&
  ['px', '%', 'em', 'rem', 'vw', 'vh'].includes((v as SizeValue).unit)
    ? { size: (v as SizeValue).size, unit: (v as SizeValue).unit }
    : undefined;
/** A line height: a size, or a number without unit. */
const lineOf = (v: unknown): SizeValue | undefined =>
  v &&
  typeof v === 'object' &&
  (v as SizeValue).unit === '' &&
  typeof (v as SizeValue).size === 'number' &&
  Number.isFinite((v as SizeValue).size)
    ? { size: (v as SizeValue).size, unit: '' }
    : sizeOf(v);
const colorOf = (v: unknown): string | undefined => (safeColor(v) ? String(v) : undefined);
const prune = <T extends object>(o: T): T | undefined => {
  const kept = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length ? (kept as T) : undefined;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;
const numberIn = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export const TRANSFORMS = ['uppercase', 'lowercase', 'capitalize', 'none'] as const;
export const FONT_STYLES = ['normal', 'italic', 'oblique'] as const;
export const DECORATIONS = ['none', 'underline', 'overline', 'line-through'] as const;
export const BORDER_STYLES = ['none', 'solid', 'double', 'dotted', 'dashed', 'groove'] as const;
export const FALLBACKS = ['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui'] as const;
const KIT_DEVICES: readonly KitDevice[] = SHEET_ORDER.filter(
  (d): d is KitDevice => d !== 'desktop',
);
const weightOf = (v: unknown) => (typeof v === 'string' && /^\d{3}$/.test(v) ? v : undefined);

/** Per-device values, each read by `read`; undefined when none is left. */
function devicesOf<T>(
  value: unknown,
  read: (v: unknown) => T | undefined,
): Partial<Record<KitDevice, T>> | undefined {
  const input = obj(value);
  const out: Partial<Record<KitDevice, T>> = {};
  for (const device of KIT_DEVICES) {
    const v = read(input[device]);
    if (v !== undefined) out[device] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const responsiveTextOf = (v: unknown): ResponsiveText | undefined => {
  const t = obj(v);
  return prune<ResponsiveText>({
    size: sizeOf(t.size),
    line: lineOf(t.line),
    letter: sizeOf(t.letter),
    word: sizeOf(t.word),
  });
};

/** A global font read from storage: the values added in Fresco 2.3 are checked, the rest kept. */
function normalizeFont(font: KitFont): KitFont {
  const out: KitFont = { ...font };
  const set = <K extends keyof KitFont>(key: K, value: KitFont[K] | undefined) => {
    if (value === undefined) delete out[key];
    else out[key] = value;
  };
  if ('decoration' in font) set('decoration', oneOf(font.decoration, DECORATIONS));
  if ('letter' in font) set('letter', sizeOf(font.letter));
  if ('word' in font) set('word', sizeOf(font.word));
  if ('fallback' in font) set('fallback', oneOf(font.fallback, FALLBACKS));
  if ('devices' in font) set('devices', devicesOf(font.devices, responsiveTextOf));
  return out;
}

function typoOf(value: unknown): TypoStyle {
  const t = obj(value);
  return {
    font: typeof t.font === 'string' && ID.test(t.font) ? t.font : undefined,
    fontAll: t.fontAll === true ? true : undefined,
    family: typeof t.family === 'string' && safeFont(t.family) ? t.family : undefined,
    size: sizeOf(t.size),
    weight: weightOf(t.weight),
    transform: oneOf(t.transform, TRANSFORMS),
    style: oneOf(t.style, FONT_STYLES),
    decoration: oneOf(t.decoration, DECORATIONS),
    line: lineOf(t.line),
    letter: sizeOf(t.letter),
    word: sizeOf(t.word),
    devices: devicesOf(t.devices, responsiveTextOf),
  };
}

function shadowOf(value: unknown): Shadow | undefined {
  const s = obj(value);
  const color = colorOf(s.color);
  const x = numberIn(s.x, -200, 200);
  const y = numberIn(s.y, -200, 200);
  const blur = numberIn(s.blur, 0, 200);
  const spread = numberIn(s.spread, -200, 200);
  if (!color || x === undefined || y === undefined || blur === undefined || spread === undefined)
    return undefined;
  return { x, y, blur, spread, color, ...(s.inset === true ? { inset: true } : {}) };
}

function filtersOf(value: unknown): Filters | undefined {
  const f = obj(value);
  return prune<Filters>({
    blur: numberIn(f.blur, 0, 10),
    brightness: numberIn(f.brightness, 0, 200),
    contrast: numberIn(f.contrast, 0, 200),
    saturate: numberIn(f.saturate, 0, 200),
    hue: numberIn(f.hue, 0, 360),
  });
}

function boxOf(value: unknown): KitBox | undefined {
  const b = obj(value);
  const side = (v: unknown) => numberIn(v, -500, 2000);
  const [top, right, bottom, left] = [side(b.top), side(b.right), side(b.bottom), side(b.left)];
  const unit = oneOf(b.unit, ['px', 'em', 'rem', '%', 'vw'] as const);
  if (top === undefined || right === undefined || bottom === undefined || left === undefined)
    return undefined;
  return { top, right, bottom, left, unit: unit ?? 'px' };
}

const transitionOf = (v: unknown) => numberIn(v, 0, 5);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

function normalizeLayout(value: unknown): KitLayout | undefined {
  const l = obj(value);
  return prune<KitLayout>({
    padding: boxOf(l.padding),
    pageLayout: oneOf(l.pageLayout, ['full', 'canvas'] as const),
    devices: devicesOf(l.devices, (v) => {
      const d = obj(v);
      return prune({ width: sizeOf(d.width), gap: sizeOf(d.gap), padding: boxOf(d.padding) });
    }),
  });
}

/** The theme style read from storage: only known, safe values. */
export function normalizeTheme(value: unknown): ThemeStyle {
  const input = obj(value);
  const texts: Partial<Record<ThemeText, TextStyle>> = {};
  for (const key of THEME_TEXTS) {
    const t = obj(obj(input.texts)[key]);
    // The values of earlier versions first, in their order.
    const typo = typoOf(t);
    const style = prune<TextStyle>({
      font: typo.font,
      family: typo.family,
      size: typo.size,
      weight: typo.weight,
      color: colorOf(t.color),
      fontAll: typo.fontAll,
      transform: typo.transform,
      style: typo.style,
      decoration: typo.decoration,
      line: typo.line,
      letter: typo.letter,
      word: typo.word,
      devices: typo.devices,
    });
    if (style) texts[key] = style;
  }
  const b = obj(input.button);
  const i = obj(input.image);
  const f = obj(input.field);
  const l = obj(input.lightbox);
  const bg = obj(input.background);
  const opacity = (v: unknown) =>
    typeof v === 'number' && v >= 0 && v <= 1 ? Math.round(v * 100) / 100 : undefined;
  const buttonTypo = typoOf(b);
  const fieldTypo = typoOf(f);
  const image = obj(bg.image);
  return (
    prune<ThemeStyle>({
      texts: Object.keys(texts).length ? texts : undefined,
      link: prune({
        ...typoOf(input.link),
        hoverDecoration: oneOf(obj(input.link).hoverDecoration, DECORATIONS),
      }),
      paragraph: prune({
        spacing: sizeOf(obj(input.paragraph).spacing),
        devices: devicesOf(obj(input.paragraph).devices, sizeOf),
      }),
      button: prune({
        font: buttonTypo.font,
        color: colorOf(b.color),
        background: colorOf(b.background),
        hoverColor: colorOf(b.hoverColor),
        hoverBackground: colorOf(b.hoverBackground),
        borderColor: colorOf(b.borderColor),
        borderWidth: sizeOf(b.borderWidth),
        radius: sizeOf(b.radius),
        paddingY: sizeOf(b.paddingY),
        paddingX: sizeOf(b.paddingX),
        ...buttonTypo,
        backgroundB: colorOf(b.backgroundB),
        angle: numberIn(b.angle, 0, 360),
        hoverBackgroundB: colorOf(b.hoverBackgroundB),
        borderStyle: oneOf(b.borderStyle, BORDER_STYLES),
        hoverBorderColor: colorOf(b.hoverBorderColor),
        hoverRadius: sizeOf(b.hoverRadius),
        shadow: shadowOf(b.shadow),
        hoverShadow: shadowOf(b.hoverShadow),
        textShadow: shadowOf(b.textShadow),
        transition: transitionOf(b.transition),
        padding: devicesOf(b.padding, (v) => prune({ y: sizeOf(obj(v).y), x: sizeOf(obj(v).x) })),
      }),
      image: prune({
        radius: sizeOf(i.radius),
        borderColor: colorOf(i.borderColor),
        borderWidth: sizeOf(i.borderWidth),
        opacity: opacity(i.opacity),
        hoverOpacity: opacity(i.hoverOpacity),
        borderStyle: oneOf(i.borderStyle, BORDER_STYLES),
        shadow: shadowOf(i.shadow),
        filters: filtersOf(i.filters),
        hoverRadius: sizeOf(i.hoverRadius),
        hoverBorderColor: colorOf(i.hoverBorderColor),
        hoverShadow: shadowOf(i.hoverShadow),
        hoverFilters: filtersOf(i.hoverFilters),
        transition: transitionOf(i.transition),
      }),
      field: prune({
        color: colorOf(f.color),
        background: colorOf(f.background),
        borderColor: colorOf(f.borderColor),
        focusBorderColor: colorOf(f.focusBorderColor),
        borderWidth: sizeOf(f.borderWidth),
        radius: sizeOf(f.radius),
        ...fieldTypo,
        borderStyle: oneOf(f.borderStyle, BORDER_STYLES),
        accent: colorOf(f.accent),
        shadow: shadowOf(f.shadow),
        paddingY: sizeOf(f.paddingY),
        paddingX: sizeOf(f.paddingX),
        focusColor: colorOf(f.focusColor),
        focusBackground: colorOf(f.focusBackground),
        focusShadow: shadowOf(f.focusShadow),
        transition: transitionOf(f.transition),
        label: prune({ ...typoOf(f.label), color: colorOf(obj(f.label).color) }),
      }),
      lightbox: prune({
        background: colorOf(l.background),
        uiColor: colorOf(l.uiColor),
        uiHoverColor: colorOf(l.uiHoverColor),
        textColor: colorOf(l.textColor),
        iconSize: numberIn(l.iconSize, 8, 80),
        closeSize: numberIn(l.closeSize, 8, 120),
        navSize: numberIn(l.navSize, 8, 120),
        images: bool(l.images),
        counter: bool(l.counter),
        fullscreen: bool(l.fullscreen),
        zoom: bool(l.zoom),
        download: bool(l.download),
        caption: oneOf(l.caption, ['caption', 'alt', 'none'] as const),
      }),
      background: prune({
        type: oneOf(bg.type, ['classic', 'gradient'] as const),
        color: colorOf(bg.color),
        image:
          typeof image.url === 'string' && /^(https?:\/\/|\/)[^\s"'()\\<>]{1,500}$/.test(image.url)
            ? {
                url: image.url,
                ...(typeof image.id === 'string' && /^[\w-]{1,64}$/.test(image.id)
                  ? { id: image.id }
                  : {}),
              }
            : undefined,
        position: oneOf(bg.position, [
          'center center',
          'center top',
          'center bottom',
          'left top',
          'right top',
          'left center',
          'right center',
          'left bottom',
          'right bottom',
        ] as const),
        repeat: oneOf(bg.repeat, ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'] as const),
        size: oneOf(bg.size, ['auto', 'cover', 'contain'] as const),
        attachment: oneOf(bg.attachment, ['scroll', 'fixed'] as const),
        colorB: colorOf(bg.colorB),
        angle: numberIn(bg.angle, 0, 360),
        gradient: oneOf(bg.gradient, ['linear', 'radial'] as const),
        mobileColor: colorOf(bg.mobileColor),
      }),
    }) ?? {}
  );
}

/** What `themeCss` needs to know of the rest of the kit. */
export interface ThemeCssContext {
  /** The global fonts (texts with `fontAll` take their sizes and spacing). */
  fonts?: readonly KitFont[];
  breakpoints?: Breakpoints;
}

const shadowCss = (s: Shadow | undefined): string | null =>
  s ? `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}` : null;

function filtersCss(f: Filters | undefined): string | null {
  if (!f) return null;
  const parts = [
    f.blur !== undefined && `blur(${f.blur}px)`,
    f.brightness !== undefined && `brightness(${f.brightness}%)`,
    f.contrast !== undefined && `contrast(${f.contrast}%)`,
    f.saturate !== undefined && `saturate(${f.saturate}%)`,
    f.hue !== undefined && `hue-rotate(${f.hue}deg)`,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

const boxCss = (b: KitBox) =>
  [b.top, b.right, b.bottom, b.left].map((n) => (n === 0 ? '0' : `${n}${b.unit}`)).join(' ');

const gradientCss = (a: string, b: string, angle = 180, kind: 'linear' | 'radial' = 'linear') =>
  kind === 'radial'
    ? `radial-gradient(circle,${a},${b})`
    : `linear-gradient(${angle}deg,${a},${b})`;

/** The theme style as CSS, on pages using Fresco (the kit's CSS goes only there). */
export function themeCss(theme: ThemeStyle, context: ThemeCssContext = {}): string {
  const out: string[] = [];
  const bp = context.breakpoints ?? DEFAULT_BREAKPOINTS;
  // Rules of the other devices, printed after the others in the order of the sheet.
  const byDevice = new Map<KitDevice, string[]>();
  const rule = (selector: string, decls: (string | null | undefined | false)[]) => {
    const list = decls.filter(Boolean);
    if (list.length) out.push(`${selector}{${list.join(';')}}`);
  };
  const deviceRule = (
    device: KitDevice,
    selector: string,
    decls: (string | null | undefined | false)[],
  ) => {
    const list = decls.filter(Boolean);
    if (!list.length) return;
    byDevice.set(device, [...(byDevice.get(device) ?? []), `${selector}{${list.join(';')}}`]);
  };
  const font = (id: string | undefined) =>
    id
      ? [
          `font-family:var(--fr-t-${id}-family)`,
          `font-weight:var(--fr-t-${id}-weight)`,
          `text-transform:var(--fr-t-${id}-transform,none)`,
        ]
      : [];
  /** With `fontAll`, the global font's other values (those it has). */
  const fontRest = (t: TypoStyle | undefined) => {
    const global = t?.fontAll && t.font ? context.fonts?.find((f) => f.id === t.font) : undefined;
    if (!global || !t?.font) return [];
    const id = t.font;
    const has = (key: keyof ResponsiveText) =>
      global[key] !== undefined ||
      Object.values(global.devices ?? {}).some((d) => d?.[key] !== undefined);
    return [
      has('size') && `font-size:var(--fr-t-${id}-size)`,
      has('line') && `line-height:var(--fr-t-${id}-line)`,
      has('letter') && `letter-spacing:var(--fr-t-${id}-letter)`,
      has('word') && `word-spacing:var(--fr-t-${id}-word)`,
      global.style && `font-style:var(--fr-t-${id}-style)`,
      global.decoration && `text-decoration:var(--fr-t-${id}-decoration)`,
    ];
  };
  /** The values added in Fresco 2.3, after those of earlier versions. */
  const typoMore = (t: TypoStyle | undefined) => [
    t?.transform && `text-transform:${t.transform}`,
    t?.style && `font-style:${t.style}`,
    t?.decoration && `text-decoration:${t.decoration}`,
    length(t?.line) && `line-height:${length(t?.line)}`,
    length(t?.letter) && `letter-spacing:${length(t?.letter)}`,
    length(t?.word) && `word-spacing:${length(t?.word)}`,
  ];
  /** A typography in full: global font, family, size, weight and the rest. */
  const typo = (t: TypoStyle | undefined) => [
    ...font(t?.font),
    ...fontRest(t),
    t?.family && !t.font ? `font-family:${safeFont(t.family)}` : null,
    length(t?.size) && `font-size:${length(t?.size)}`,
    t?.weight && `font-weight:${t.weight}`,
    ...typoMore(t),
  ];
  const typoDevices = (selector: string, t: TypoStyle | undefined) => {
    for (const [device, v] of Object.entries(t?.devices ?? {}) as [KitDevice, ResponsiveText][]) {
      deviceRule(device, selector, [
        length(v.size) && `font-size:${length(v.size)}`,
        length(v.line) && `line-height:${length(v.line)}`,
        length(v.letter) && `letter-spacing:${length(v.letter)}`,
        length(v.word) && `word-spacing:${length(v.word)}`,
      ]);
    }
  };
  const text = (t: TextStyle | undefined) => [
    ...font(t?.font),
    ...fontRest(t),
    t?.family && !t.font ? `font-family:${safeFont(t.family)}` : null,
    length(t?.size) && `font-size:${length(t?.size)}`,
    t?.weight && `font-weight:${t.weight}`,
    t?.color && safeColor(t.color) && `color:${safeColor(t.color)}`,
    ...typoMore(t),
  ];
  for (const key of THEME_TEXTS) {
    const selector = key === 'body' ? 'body' : `body ${key}`;
    rule(selector, text(theme.texts?.[key]));
    typoDevices(selector, theme.texts?.[key]);
  }
  const p = theme.paragraph;
  if (p) {
    rule('.fr-e p', [length(p.spacing) && `margin-block-end:${length(p.spacing)}`]);
    for (const [device, v] of Object.entries(p.devices ?? {}) as [KitDevice, SizeValue][])
      deviceRule(device, '.fr-e p', [length(v) && `margin-block-end:${length(v)}`]);
  }
  const link = theme.link;
  if (link) {
    // Not buttons (they have their own colors), and no more specific than an element's own links.
    const selector = '.fr-e a:not(:where(.fr-button__link))';
    rule(selector, typo(link));
    typoDevices(selector, link);
    rule(`${selector}:hover`, [link.hoverDecoration && `text-decoration:${link.hoverDecoration}`]);
  }
  const b = theme.button;
  if (b) {
    const gradient = b.backgroundB
      ? gradientCss(b.background ?? 'transparent', b.backgroundB, b.angle)
      : null;
    // `body` outweighs fresco.css (loaded after the kit), not the button's own settings.
    const button = 'body .fr-button__link';
    rule(button, [
      ...font(b.font),
      b.color && `color:${safeColor(b.color)}`,
      b.background && `background-color:${safeColor(b.background)}`,
      b.borderColor && `border-color:${safeColor(b.borderColor)}`,
      length(b.borderWidth) && `border-style:solid;border-width:${length(b.borderWidth)}`,
      length(b.radius) && `border-radius:${length(b.radius)}`,
      (length(b.paddingY) || length(b.paddingX)) &&
        `padding:${length(b.paddingY) ?? '12px'} ${length(b.paddingX) ?? '24px'}`,
      // Fresco 2.3.
      ...fontRest(b),
      b.family && !b.font ? `font-family:${safeFont(b.family)}` : null,
      length(b.size) && `font-size:${length(b.size)}`,
      b.weight && `font-weight:${b.weight}`,
      ...typoMore(b),
      gradient && `background-image:${gradient}`,
      b.borderStyle && `border-style:${b.borderStyle}`,
      shadowCss(b.shadow) && `box-shadow:${shadowCss(b.shadow)}`,
      shadowCss(b.textShadow) && `text-shadow:${shadowCss(b.textShadow)}`,
      b.transition !== undefined && `transition:all ${b.transition}s`,
    ]);
    typoDevices(button, b);
    rule('.fr-button__link:hover,.fr-button__link:focus-visible', [
      b.hoverColor && `color:${safeColor(b.hoverColor)}`,
      b.hoverBackground && `background-color:${safeColor(b.hoverBackground)}`,
      // Fresco 2.3.
      b.hoverBackgroundB
        ? `background-image:${gradientCss(b.hoverBackground ?? 'transparent', b.hoverBackgroundB, b.angle)}`
        : gradient && b.hoverBackground && 'background-image:none',
      b.hoverBorderColor && `border-color:${b.hoverBorderColor}`,
      length(b.hoverRadius) && `border-radius:${length(b.hoverRadius)}`,
      shadowCss(b.hoverShadow) && `box-shadow:${shadowCss(b.hoverShadow)}`,
    ]);
    for (const [device, v] of Object.entries(b.padding ?? {}) as [
      KitDevice,
      { y?: SizeValue; x?: SizeValue },
    ][]) {
      deviceRule(device, button, [
        (length(v.y) || length(v.x)) &&
          `padding:${length(v.y) ?? length(b.paddingY) ?? '12px'} ${length(v.x) ?? length(b.paddingX) ?? '24px'}`,
      ]);
    }
  }
  const i = theme.image;
  if (i) {
    rule('.fr-image img', [
      length(i.radius) && `border-radius:${length(i.radius)}`,
      i.borderColor && `border-color:${safeColor(i.borderColor)}`,
      length(i.borderWidth) && `border-style:solid;border-width:${length(i.borderWidth)}`,
      i.opacity !== undefined && `opacity:${i.opacity}`,
      i.hoverOpacity !== undefined && 'transition:opacity .3s',
      // Fresco 2.3.
      i.borderStyle && `border-style:${i.borderStyle}`,
      shadowCss(i.shadow) && `box-shadow:${shadowCss(i.shadow)}`,
      filtersCss(i.filters) && `filter:${filtersCss(i.filters)}`,
      i.transition !== undefined && `transition:all ${i.transition}s`,
    ]);
    rule('.fr-image img:hover', [
      i.hoverOpacity !== undefined && `opacity:${i.hoverOpacity}`,
      // Fresco 2.3.
      length(i.hoverRadius) && `border-radius:${length(i.hoverRadius)}`,
      i.hoverBorderColor && `border-color:${i.hoverBorderColor}`,
      shadowCss(i.hoverShadow) && `box-shadow:${shadowCss(i.hoverShadow)}`,
      filtersCss(i.hoverFilters) && `filter:${filtersCss(i.hoverFilters)}`,
    ]);
  }
  const f = theme.field;
  if (f) {
    const fields =
      '.frp-form__input,.fr-e input:not([type=checkbox]):not([type=radio]):not([type=submit]),.fr-e textarea,.fr-e select';
    rule(fields, [
      f.color && `color:${safeColor(f.color)}`,
      f.background && `background-color:${safeColor(f.background)}`,
      f.borderColor && `border-color:${safeColor(f.borderColor)}`,
      length(f.borderWidth) && `border-style:solid;border-width:${length(f.borderWidth)}`,
      length(f.radius) && `border-radius:${length(f.radius)}`,
      // Fresco 2.3.
      ...typo(f),
      f.borderStyle && `border-style:${f.borderStyle}`,
      (length(f.paddingY) || length(f.paddingX)) &&
        `padding:${length(f.paddingY) ?? '8px'} ${length(f.paddingX) ?? '12px'}`,
      shadowCss(f.shadow) && `box-shadow:${shadowCss(f.shadow)}`,
      f.transition !== undefined && `transition:all ${f.transition}s`,
    ]);
    typoDevices(fields, f);
    rule(
      fields
        .split(',')
        .map((s) => `${s}:focus`)
        .join(','),
      [
        f.focusBorderColor &&
          `border-color:${safeColor(f.focusBorderColor)};outline-color:${safeColor(f.focusBorderColor)}`,
        // Fresco 2.3.
        f.focusColor && `color:${f.focusColor}`,
        f.focusBackground && `background-color:${f.focusBackground}`,
        shadowCss(f.focusShadow) && `box-shadow:${shadowCss(f.focusShadow)}`,
      ],
    );
    rule('.frp-form__input,.fr-e input,.fr-e textarea,.fr-e select', [
      f.accent && `accent-color:${f.accent}`,
    ]);
    if (f.label) {
      rule('.frp-form__label,.fr-e label', [
        f.label.color && `color:${f.label.color}`,
        ...typo(f.label),
      ]);
      typoDevices('.frp-form__label,.fr-e label', f.label);
    }
  }
  const lb = theme.lightbox;
  if (lb) {
    // `body .fr-lb …` outweighs fresco.css (`.fr-lb`, `.fr-lb button`, `.fr-lb .fr-lb__tool`),
    // which is loaded after the kit.
    const lbx = (...names: string[]) => names.map((n) => `body .fr-lb ${n}`).join(',');
    rule('body .fr-lb', [lb.background && `background:${safeColor(lb.background)}`]);
    rule(lbx('.fr-lb__close', '.fr-lb__nav'), [lb.uiColor && `color:${safeColor(lb.uiColor)}`]);
    // Fresco 2.3.
    const tools = lb.fullscreen || lb.zoom || lb.download;
    rule(lbx('.fr-lb__tool'), [tools && lb.uiColor && `color:${lb.uiColor}`]);
    rule(lbx('.fr-lb__close:hover', '.fr-lb__nav:hover', '.fr-lb__tool:hover'), [
      lb.uiHoverColor && `color:${lb.uiHoverColor}`,
    ]);
    rule(lbx('figcaption', '.fr-lb__counter'), [lb.textColor && `color:${lb.textColor}`]);
    rule(lbx('.fr-lb__tool'), [lb.iconSize !== undefined && `font-size:${lb.iconSize}px`]);
    rule(lbx('.fr-lb__close'), [lb.closeSize !== undefined && `font-size:${lb.closeSize}px`]);
    rule(lbx('.fr-lb__nav'), [lb.navSize !== undefined && `font-size:${lb.navSize}px`]);
    // What the page's script reads (on/off as 1/0).
    const flag = (name: string, v: boolean | undefined) =>
      v !== undefined && `--fr-lb-${name}:${v ? 1 : 0}`;
    rule(':root', [
      flag('images', lb.images),
      flag('counter', lb.counter),
      flag('fullscreen', lb.fullscreen),
      flag('zoom', lb.zoom),
      flag('download', lb.download),
      lb.caption && `--fr-lb-caption:${lb.caption}`,
    ]);
  }
  const bg = theme.background;
  if (bg) {
    const gradient = bg.type === 'gradient';
    rule('body', [
      bg.color && `background-color:${bg.color}`,
      gradient
        ? `background-image:${gradientCss(bg.color ?? 'transparent', bg.colorB ?? 'transparent', bg.angle, bg.gradient)}`
        : bg.image && `background-image:url("${bg.image.url}")`,
      !gradient && bg.image && bg.position && `background-position:${bg.position}`,
      !gradient && bg.image && bg.repeat && `background-repeat:${bg.repeat}`,
      !gradient && bg.image && bg.size && `background-size:${bg.size}`,
      (gradient || bg.image) && bg.attachment && `background-attachment:${bg.attachment}`,
      gradient && 'min-height:100vh',
    ]);
  }
  for (const device of KIT_DEVICES) {
    const rules = byDevice.get(device);
    const media = deviceMedia(device, bp);
    if (rules && media) out.push(`@media ${media}{${rules.join('')}}`);
  }
  return out.join('');
}

/**
 * The layout of a page: its own, else the site's default ("theme" is the
 * theme's layout, chosen on a page when the site has another default).
 */
/**
 * The attributes of `<html>` that turn off the elements' default global
 * colors and fonts (fresco.css reads them), for kits that take the theme's.
 */
export function kitRootAttributes(kit: Pick<Kit, 'themeColors' | 'themeFonts'>): string[] {
  return [
    ...(kit.themeColors === true ? ['data-fr-theme-colors'] : []),
    ...(kit.themeFonts === true ? ['data-fr-theme-fonts'] : []),
  ];
}

/** A page's HTML with the kit's attributes on `<html>` (once, not twice). */
export function withKitRootAttributes(
  html: string,
  kit: Pick<Kit, 'themeColors' | 'themeFonts'>,
): string {
  const attributes = kitRootAttributes(kit);
  if (!attributes.length) return html;
  return html.replace(/<html\b([^>]*)>/i, (tag: string, rest: string) => {
    const missing = attributes.filter((a) => !new RegExp(`\\s${a}(?=[\\s=>])`).test(` ${rest} `));
    return missing.length ? `<html ${missing.join(' ')}${rest}>` : tag;
  });
}

export function pageLayout(page: { layout?: unknown }, kit: Pick<Kit, 'layout'>): string {
  const own = typeof page.layout === 'string' ? page.layout : '';
  if (own === 'theme') return '';
  return own || kit.layout?.pageLayout || '';
}

/**
 * The kit as CSS: variables on `:root` (`--fr-c-<id>`, `--fr-t-<id>-family`
 * and so on) and the theme style, inside Fresco content only.
 */
export function kitCss(kit: Kit): string {
  const vars: string[] = [];
  for (const color of kit.colors) {
    const value = safeColor(color.value);
    if (value) vars.push(`--fr-c-${color.id}:${value}`);
  }
  // Values of the global fonts on the other devices.
  const byDevice = new Map<KitDevice, string[]>();
  const deviceVar = (device: KitDevice, decl: string) =>
    byDevice.set(device, [...(byDevice.get(device) ?? []), decl]);
  for (const font of kit.fonts) {
    const fallback = oneOf(font.fallback, FALLBACKS);
    const family = safeFont(fallback ? `${font.family}, ${fallback}` : font.family);
    if (family) vars.push(`--fr-t-${font.id}-family:${family}`);
    if (/^\d{3}$|^(normal|bold)$/.test(font.weight))
      vars.push(`--fr-t-${font.id}-weight:${font.weight}`);
    const size = length(font.size);
    if (size) vars.push(`--fr-t-${font.id}-size:${size}`);
    const line =
      font.line && typeof font.line.size === 'number' ? `${font.line.size}${font.line.unit}` : null;
    if (line) vars.push(`--fr-t-${font.id}-line:${line}`);
    if (font.transform && /^[a-z]+$/.test(font.transform))
      vars.push(`--fr-t-${font.id}-transform:${font.transform}`);
    if (font.style && /^[a-z]+$/.test(font.style))
      vars.push(`--fr-t-${font.id}-style:${font.style}`);
    // Fresco 2.3.
    const decoration = oneOf(font.decoration, DECORATIONS);
    if (decoration) vars.push(`--fr-t-${font.id}-decoration:${decoration}`);
    const letter = length(sizeOf(font.letter));
    if (letter) vars.push(`--fr-t-${font.id}-letter:${letter}`);
    const word = length(sizeOf(font.word));
    if (word) vars.push(`--fr-t-${font.id}-word:${word}`);
    for (const [device, v] of Object.entries(font.devices ?? {}) as [KitDevice, ResponsiveText][]) {
      for (const key of ['size', 'line', 'letter', 'word'] as const) {
        const value = length(key === 'line' ? lineOf(v?.[key]) : sizeOf(v?.[key]));
        if (value) deviceVar(device, `--fr-t-${font.id}-${key}:${value}`);
      }
    }
  }
  vars.push(`--fr-container-width:${length(kit.containerWidth) ?? '1140px'}`);
  vars.push(`--fr-gap:${length(kit.gap) ?? '20px'}`);
  // Fresco 2.3: the padding of top-level containers, and the layout per device.
  const layout = kit.layout;
  if (layout?.padding) vars.push(`--fr-container-padding:${boxCss(layout.padding)}`);
  for (const [device, v] of Object.entries(layout?.devices ?? {}) as [
    KitDevice,
    NonNullable<KitLayout['devices']>[KitDevice],
  ][]) {
    if (length(v?.width)) deviceVar(device, `--fr-container-width:${length(v?.width)}`);
    if (length(v?.gap)) deviceVar(device, `--fr-gap:${length(v?.gap)}`);
    if (v?.padding) deviceVar(device, `--fr-container-padding:${boxCss(v.padding)}`);
  }
  let css = `:root{${vars.join(';')}}`;
  for (const device of KIT_DEVICES) {
    const list = byDevice.get(device);
    const media = deviceMedia(device, kit.breakpoints);
    if (list && media) css += `@media ${media}{:root{${list.join(';')}}}`;
  }
  const s = kit.style;
  const scoped: string[] = [];
  if (s.text && safeColor(s.text)) scoped.push(`.fr-e{color:${safeColor(s.text)}}`);
  // Links, but not buttons: the colors of Site settings → Buttons (or the default white) stay theirs.
  const links = '.fr-e a:not(:where(.fr-button__link))';
  if (s.link && safeColor(s.link)) scoped.push(`${links}{color:${safeColor(s.link)}}`);
  if (s.linkHover && safeColor(s.linkHover))
    scoped.push(`${links}:hover{color:${safeColor(s.linkHover)}}`);
  if (s.background && safeColor(s.background))
    scoped.push(`body.fr-page{background-color:${safeColor(s.background)}}`);
  css += scoped.join('');
  css += themeCss(kit.theme ?? {}, { fonts: kit.fonts, breakpoints: kit.breakpoints });
  css += atomicKitCss(kit.classes, kit.variables, kit.breakpoints);
  css += responsiveUtilities(kit.breakpoints);
  return css.replace(/<\/?style/gi, '');
}

/**
 * Classes that depend on the breakpoints: hiding per device, and the
 * per-device variants of alignments, widths and box positions.
 */
function responsiveUtilities(bp: Breakpoints): string {
  // A device's values reach the smaller devices too, unless they have their
  // own (later rules win); widescreen's only reach wider screens.
  const device = (name: Device) => [
    `.fr-align-${name}-left{text-align:left}`,
    `.fr-align-${name}-center{text-align:center}`,
    `.fr-align-${name}-right{text-align:right}`,
    `.fr-align-${name}-justify .fr-button__link{width:100%}`,
    `.fr-box--${name}-top{flex-direction:column;align-items:center;text-align:center}`,
    `.fr-box--${name}-left{flex-direction:row;align-items:flex-start;text-align:left}`,
    `.fr-box--${name}-right{flex-direction:row-reverse;align-items:flex-start;text-align:right}`,
    `.fr-box--${name}-bottom{flex-direction:column-reverse;align-items:center;text-align:center}`,
    `.fr-w-full-${name}{width:100%}`,
    `.fr-w-auto-${name}{width:auto;max-width:fit-content}`,
  ];
  let css = '';
  // Hiding is per device only (its own range of widths).
  for (const name of ['desktop', ...MAX_WIDTH_DEVICES, 'widescreen'] as const) {
    const range = deviceRange(name, bp);
    if (!range) continue;
    const media = rangeMedia(range);
    const rule = `.fr-hide-${name}{display:none!important}`;
    css += media ? `@media ${media}{${rule}}` : rule;
  }
  // The device in use, for scripts (`--fr-device`, e.g. Fresco Pro's popups and sticky).
  css += ':root{--fr-device:desktop}';
  for (const name of SHEET_ORDER) {
    const media = deviceMedia(name, bp);
    if (media) css += `@media ${media}{:root{--fr-device:${name}}${device(name).join('')}}`;
  }
  return (
    css +
    // Nav menus fold behind a toggle up to their breakpoint (any device in use).
    MAX_WIDTH_DEVICES.map((name) => {
      const max = bp[name];
      return typeof max === 'number'
        ? `@media (max-width:${max}px){.fr-menu--toggle-${name} .fr-menu__toggle{display:flex;width:fit-content}.fr-menu--toggle-${name} .fr-menu__panel{display:none;position:absolute;left:auto;right:0;width:min(320px,90vw);top:100%;z-index:60;background:#fff;padding:6px 0;box-shadow:0 10px 30px rgba(0,0,0,.12)}.fr-menu--toggle-${name}.is-open .fr-menu__panel{display:block}.fr-menu--toggle-${name} .fr-menu__list{flex-direction:column}.fr-menu--toggle-${name} .fr-menu__item{flex-wrap:wrap}.fr-menu--toggle-${name} .fr-menu__sub{position:static;box-shadow:none;display:none;opacity:1;visibility:visible;transform:none;padding-left:14px}.fr-menu--toggle-${name} .fr-menu__item.is-open>.fr-menu__sub{display:block}.fr-menu--toggle-${name}.fr-menu--arrows .fr-menu__item>.fr-menu__expand{display:inline-flex}.fr-menu--toggle-${name} .fr-menu__arrow{display:none}.fr-menu--toggle-${name} .fr-menu__link::before,.fr-menu--toggle-${name} .fr-menu__link::after{display:none}}`
        : '';
    }).join('') +
    // Tabs that become an accordion on a chosen device (`fr-tabs--accordion-<device>`).
    MAX_WIDTH_DEVICES.map((name) => {
      const max = bp[name];
      const c = `.fr-tabs--accordion-${name}`;
      return typeof max === 'number'
        ? `@media (max-width:${max}px){${c}{flex-direction:column}${c}>.fr-tabs__nav{display:none}${c}>.fr-tabs__panels{padding:0}${c} .fr-tabs__panel[hidden]{display:block}${c} .fr-tabs__panel[hidden]>:not(.fr-tabs__mobile-title){display:none}${c} .fr-tabs__mobile-title{display:block}}`
        : '';
    }).join('') +
    // Tabs become an accordion on phones (unless told otherwise).
    `@media (max-width:${bp.mobile}px){.fr-tabs--accordion{flex-direction:column}.fr-tabs--accordion>.fr-tabs__nav{display:none}.fr-tabs--accordion>.fr-tabs__panels{padding:0}.fr-tabs--accordion .fr-tabs__panel[hidden]{display:block}.fr-tabs--accordion .fr-tabs__panel[hidden]>:not(.fr-tabs__mobile-title){display:none}.fr-tabs--accordion .fr-tabs__mobile-title{display:block}}`
  );
}

export { googleFontList, isGoogleFont, usedGoogleFonts } from './fonts.js';

const WEIGHTS = ['300', '400', '500', '600', '700', '800'];

/** One family of the Google Fonts address: the weights it has, with italics when it has them all. */
function familyQuery(family: string): string {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  const font = googleFonts().get(family);
  const weights = font ? WEIGHTS.filter((w) => font.weights.includes(w)) : WEIGHTS;
  if (weights.length === WEIGHTS.length)
    return `family=${name}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400`;
  return weights.length ? `family=${name}:wght@${weights.join(';')}` : `family=${name}`;
}

/**
 * The stylesheet address of the Google Fonts to load, or null: the kit's
 * (listed in `googleFonts`, and the global fonts that are Google fonts) and
 * `more`, e.g. those a page's CSS uses (see `usedGoogleFonts`).
 */
export function googleFontsUrl(kit: Kit, more: readonly string[] = []): string | null {
  return googleCssUrl(kitGoogleFamilies(kit, more));
}

/** The Google families to load: the kit's (its list and its global fonts) and `more`, each once. */
export function kitGoogleFamilies(kit: Kit, more: readonly string[] = []): string[] {
  return [
    ...new Set([
      ...kit.googleFonts.filter((f) => GOOGLE_FAMILY.test(f)),
      ...kit.fonts.map((f) => f.family).filter(isGoogleFont),
      ...more.filter((f) => GOOGLE_FAMILY.test(f) && isGoogleFont(f)),
    ]),
  ];
}

/** The Google Fonts stylesheet address of some families, or null when there are none. */
export function googleCssUrl(families: readonly string[]): string | null {
  const valid = families.filter((f) => GOOGLE_FAMILY.test(f));
  if (valid.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${valid.map(familyQuery).join('&')}&display=swap`;
}

/** Popular Google Fonts, first in the font pickers. */
export const GOOGLE_FONTS = new Set([
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Source Sans 3',
  'Raleway',
  'Nunito',
  'Work Sans',
  'Playfair Display',
  'Merriweather',
  'Lora',
  'DM Sans',
  'DM Serif Display',
  'Rubik',
  'Manrope',
  'Outfit',
  'Space Grotesk',
  'Libre Baskerville',
  'Oswald',
  'Barlow',
  'Mulish',
  'Karla',
  'Josefin Sans',
  'Cormorant Garamond',
  'EB Garamond',
  'Archivo',
  'Fira Sans',
  'IBM Plex Sans',
  'IBM Plex Serif',
  'Noto Sans',
  'Noto Serif',
  'PT Sans',
  'PT Serif',
  'Quicksand',
  'Titillium Web',
  'Ubuntu',
  'Bebas Neue',
  'Abril Fatface',
]);

/** System fonts, available everywhere. */
export const SYSTEM_FONTS = [
  'system-ui',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Trebuchet MS',
  'Courier New',
];
