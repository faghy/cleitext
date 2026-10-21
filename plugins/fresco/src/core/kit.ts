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

export interface KitFont {
  id: string;
  title: string;
  family: string;
  weight: string;
  size?: SizeValue;
  line?: SizeValue;
  transform?: string;
  style?: string;
}

/** A text style of the theme style: a global font, or its own family, size, weight and color. */
export interface TextStyle {
  /** Id of a global font. */
  font?: string;
  family?: string;
  size?: SizeValue;
  weight?: string;
  color?: string;
}

export const THEME_TEXTS = ['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
export type ThemeText = (typeof THEME_TEXTS)[number];

/** Theme style: how texts, buttons, images, form fields and the lightbox look by default. */
export interface ThemeStyle {
  texts?: Partial<Record<ThemeText, TextStyle>>;
  button?: {
    font?: string;
    color?: string;
    background?: string;
    hoverColor?: string;
    hoverBackground?: string;
    borderColor?: string;
    borderWidth?: SizeValue;
    radius?: SizeValue;
    paddingY?: SizeValue;
    paddingX?: SizeValue;
  };
  image?: {
    radius?: SizeValue;
    borderColor?: string;
    borderWidth?: SizeValue;
    opacity?: number;
    hoverOpacity?: number;
  };
  field?: {
    color?: string;
    background?: string;
    borderColor?: string;
    focusBorderColor?: string;
    borderWidth?: SizeValue;
    radius?: SizeValue;
  };
  lightbox?: { background?: string; uiColor?: string };
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
  /** The theme's page title, hidden by the page setting "Hide the page title". */
  titleSelector?: string;
  /** Atomic styling: classes shared by elements. */
  classes: GlobalClass[];
  /** Atomic styling: named colors, fonts and sizes. */
  variables: Variable[];
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
    ? input.fonts.filter(
        (f): f is KitFont =>
          Boolean(f) &&
          ID.test(String(f.id)) &&
          typeof f.title === 'string' &&
          typeof f.family === 'string',
      )
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
          }))
      : [],
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
const colorOf = (v: unknown): string | undefined => (safeColor(v) ? String(v) : undefined);
const prune = <T extends object>(o: T): T | undefined => {
  const kept = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length ? (kept as T) : undefined;
};

/** The theme style read from storage: only known, safe values. */
export function normalizeTheme(value: unknown): ThemeStyle {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  const texts: Partial<Record<ThemeText, TextStyle>> = {};
  for (const key of THEME_TEXTS) {
    const t = obj(obj(input.texts)[key]);
    const style = prune<TextStyle>({
      font: typeof t.font === 'string' && ID.test(t.font) ? t.font : undefined,
      family: typeof t.family === 'string' && safeFont(t.family) ? t.family : undefined,
      size: sizeOf(t.size),
      weight: typeof t.weight === 'string' && /^\d{3}$/.test(t.weight) ? t.weight : undefined,
      color: colorOf(t.color),
    });
    if (style) texts[key] = style;
  }
  const b = obj(input.button);
  const i = obj(input.image);
  const f = obj(input.field);
  const l = obj(input.lightbox);
  const opacity = (v: unknown) =>
    typeof v === 'number' && v >= 0 && v <= 1 ? Math.round(v * 100) / 100 : undefined;
  return (
    prune<ThemeStyle>({
      texts: Object.keys(texts).length ? texts : undefined,
      button: prune({
        font: typeof b.font === 'string' && ID.test(b.font) ? b.font : undefined,
        color: colorOf(b.color),
        background: colorOf(b.background),
        hoverColor: colorOf(b.hoverColor),
        hoverBackground: colorOf(b.hoverBackground),
        borderColor: colorOf(b.borderColor),
        borderWidth: sizeOf(b.borderWidth),
        radius: sizeOf(b.radius),
        paddingY: sizeOf(b.paddingY),
        paddingX: sizeOf(b.paddingX),
      }),
      image: prune({
        radius: sizeOf(i.radius),
        borderColor: colorOf(i.borderColor),
        borderWidth: sizeOf(i.borderWidth),
        opacity: opacity(i.opacity),
        hoverOpacity: opacity(i.hoverOpacity),
      }),
      field: prune({
        color: colorOf(f.color),
        background: colorOf(f.background),
        borderColor: colorOf(f.borderColor),
        focusBorderColor: colorOf(f.focusBorderColor),
        borderWidth: sizeOf(f.borderWidth),
        radius: sizeOf(f.radius),
      }),
      lightbox: prune({ background: colorOf(l.background), uiColor: colorOf(l.uiColor) }),
    }) ?? {}
  );
}

/** The theme style as CSS, on pages using Fresco (the kit's CSS goes only there). */
export function themeCss(theme: ThemeStyle): string {
  const out: string[] = [];
  const rule = (selector: string, decls: (string | null | undefined | false)[]) => {
    const list = decls.filter(Boolean);
    if (list.length) out.push(`${selector}{${list.join(';')}}`);
  };
  const font = (id: string | undefined) =>
    id
      ? [
          `font-family:var(--fr-t-${id}-family)`,
          `font-weight:var(--fr-t-${id}-weight)`,
          `text-transform:var(--fr-t-${id}-transform,none)`,
        ]
      : [];
  const text = (t: TextStyle | undefined) => [
    ...font(t?.font),
    t?.family && !t.font ? `font-family:${safeFont(t.family)}` : null,
    length(t?.size) && `font-size:${length(t?.size)}`,
    t?.weight && `font-weight:${t.weight}`,
    t?.color && safeColor(t.color) && `color:${safeColor(t.color)}`,
  ];
  for (const key of THEME_TEXTS) {
    rule(key === 'body' ? 'body' : `body ${key}`, text(theme.texts?.[key]));
  }
  const b = theme.button;
  if (b) {
    rule('.fr-button__link', [
      ...font(b.font),
      b.color && `color:${safeColor(b.color)}`,
      b.background && `background-color:${safeColor(b.background)}`,
      b.borderColor && `border-color:${safeColor(b.borderColor)}`,
      length(b.borderWidth) && `border-style:solid;border-width:${length(b.borderWidth)}`,
      length(b.radius) && `border-radius:${length(b.radius)}`,
      (length(b.paddingY) || length(b.paddingX)) &&
        `padding:${length(b.paddingY) ?? '12px'} ${length(b.paddingX) ?? '24px'}`,
    ]);
    rule('.fr-button__link:hover,.fr-button__link:focus-visible', [
      b.hoverColor && `color:${safeColor(b.hoverColor)}`,
      b.hoverBackground && `background-color:${safeColor(b.hoverBackground)}`,
    ]);
  }
  const i = theme.image;
  if (i) {
    rule('.fr-image img', [
      length(i.radius) && `border-radius:${length(i.radius)}`,
      i.borderColor && `border-color:${safeColor(i.borderColor)}`,
      length(i.borderWidth) && `border-style:solid;border-width:${length(i.borderWidth)}`,
      i.opacity !== undefined && `opacity:${i.opacity}`,
      i.hoverOpacity !== undefined && 'transition:opacity .3s',
    ]);
    rule('.fr-image img:hover', [i.hoverOpacity !== undefined && `opacity:${i.hoverOpacity}`]);
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
    ]);
    rule(
      fields
        .split(',')
        .map((s) => `${s}:focus`)
        .join(','),
      [
        f.focusBorderColor &&
          `border-color:${safeColor(f.focusBorderColor)};outline-color:${safeColor(f.focusBorderColor)}`,
      ],
    );
  }
  const lb = theme.lightbox;
  if (lb) {
    rule('.fr-lb', [lb.background && `background:${safeColor(lb.background)}`]);
    rule('.fr-lb__close,.fr-lb__nav', [lb.uiColor && `color:${safeColor(lb.uiColor)}`]);
  }
  return out.join('');
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
  for (const font of kit.fonts) {
    const family = safeFont(font.family);
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
  }
  vars.push(`--fr-container-width:${length(kit.containerWidth) ?? '1140px'}`);
  vars.push(`--fr-gap:${length(kit.gap) ?? '20px'}`);
  let css = `:root{${vars.join(';')}}`;
  const s = kit.style;
  const scoped: string[] = [];
  if (s.text && safeColor(s.text)) scoped.push(`.fr-e{color:${safeColor(s.text)}}`);
  if (s.link && safeColor(s.link)) scoped.push(`.fr-e a{color:${safeColor(s.link)}}`);
  if (s.linkHover && safeColor(s.linkHover))
    scoped.push(`.fr-e a:hover{color:${safeColor(s.linkHover)}}`);
  if (s.background && safeColor(s.background))
    scoped.push(`body.fr-page{background-color:${safeColor(s.background)}}`);
  css += scoped.join('');
  css += themeCss(kit.theme ?? {});
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
  const families = [
    ...new Set([
      ...kit.googleFonts.filter((f) => GOOGLE_FAMILY.test(f)),
      ...kit.fonts.map((f) => f.family).filter(isGoogleFont),
      ...more.filter((f) => GOOGLE_FAMILY.test(f) && isGoogleFont(f)),
    ]),
  ];
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map(familyQuery).join('&')}&display=swap`;
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
