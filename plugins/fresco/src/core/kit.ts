/**
 * Site settings ("kit"): global colors and fonts, breakpoints, the width of
 * boxed containers and the space between widgets. Elements refer to global
 * colors and fonts through CSS variables, so changing the kit restyles every
 * page at once.
 */
import { atomicKitCss, normalizeVariants, type GlobalClass, type Variable } from './atomic.js';
import { safeColor, safeFont } from './css.js';
import { DEFAULT_BREAKPOINTS, type Breakpoints, type SizeValue } from './model.js';

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

export interface Kit {
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
  /** Fonts to load from Google Fonts (family names). */
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
  const bp = input.breakpoints;
  const breakpoints =
    bp &&
    Number.isInteger(bp.tablet) &&
    Number.isInteger(bp.mobile) &&
    bp.mobile >= 320 &&
    bp.mobile < bp.tablet &&
    bp.tablet <= 2400
      ? { tablet: bp.tablet, mobile: bp.mobile }
      : DEFAULT_BREAKPOINTS;
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
      ? input.googleFonts
          .filter((f) => typeof f === 'string' && /^[\w ]{1,60}$/.test(f))
          .slice(0, 12)
      : [],
  };
}

const length = (v: SizeValue | undefined): string | null =>
  v && typeof v.size === 'number' ? `${v.size}${v.unit}` : null;

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
  css += atomicKitCss(kit.classes, kit.variables, kit.breakpoints);
  css += responsiveUtilities(kit.breakpoints);
  return css.replace(/<\/?style/gi, '');
}

/**
 * Classes that depend on the breakpoints: hiding per device, and the tablet
 * and mobile variants of alignments and box positions.
 */
function responsiveUtilities(bp: Breakpoints): string {
  // Tablet values reach mobile too, unless mobile has its own (later rules win).
  const device = (name: 'tablet' | 'mobile') => [
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
  // Hiding is per device only.
  return (
    `@media (min-width:${bp.tablet + 1}px){.fr-hide-desktop{display:none!important}}` +
    `@media (min-width:${bp.mobile + 1}px) and (max-width:${bp.tablet}px){.fr-hide-tablet{display:none!important}}` +
    `@media (max-width:${bp.mobile}px){.fr-hide-mobile{display:none!important}}` +
    `@media (max-width:${bp.tablet}px){${device('tablet').join('')}}` +
    `@media (max-width:${bp.mobile}px){${device('mobile').join('')}}` +
    // Nav menus fold behind a toggle up to their breakpoint.
    `@media (max-width:${bp.tablet}px){.fr-menu--toggle-tablet .fr-menu__toggle{display:inline-flex}.fr-menu--toggle-tablet .fr-menu__panel{display:none;position:absolute;left:auto;right:0;width:min(320px,90vw);top:100%;z-index:60;background:#fff;padding:6px 0;box-shadow:0 10px 30px rgba(0,0,0,.12)}.fr-menu--toggle-tablet.is-open .fr-menu__panel{display:block}.fr-menu--toggle-tablet .fr-menu__list{flex-direction:column}.fr-menu--toggle-tablet .fr-menu__item{flex-wrap:wrap}.fr-menu--toggle-tablet .fr-menu__sub{position:static;box-shadow:none;display:none;opacity:1;visibility:visible;transform:none;padding-left:14px}.fr-menu--toggle-tablet .fr-menu__item.is-open>.fr-menu__sub{display:block}}` +
    `@media (max-width:${bp.mobile}px){.fr-menu--toggle-mobile .fr-menu__toggle{display:inline-flex}.fr-menu--toggle-mobile .fr-menu__panel{display:none;position:absolute;left:auto;right:0;width:min(320px,90vw);top:100%;z-index:60;background:#fff;padding:6px 0;box-shadow:0 10px 30px rgba(0,0,0,.12)}.fr-menu--toggle-mobile.is-open .fr-menu__panel{display:block}.fr-menu--toggle-mobile .fr-menu__list{flex-direction:column}.fr-menu--toggle-mobile .fr-menu__item{flex-wrap:wrap}.fr-menu--toggle-mobile .fr-menu__sub{position:static;box-shadow:none;display:none;opacity:1;visibility:visible;transform:none;padding-left:14px}.fr-menu--toggle-mobile .fr-menu__item.is-open>.fr-menu__sub{display:block}}` +
    // Tabs become an accordion on phones (unless told otherwise).
    `@media (max-width:${bp.mobile}px){.fr-tabs--accordion{flex-direction:column}.fr-tabs--accordion>.fr-tabs__nav{display:none}.fr-tabs--accordion>.fr-tabs__panels{padding:0}.fr-tabs--accordion .fr-tabs__panel[hidden]{display:block}.fr-tabs--accordion .fr-tabs__panel[hidden]>:not(.fr-tabs__mobile-title){display:none}.fr-tabs--accordion .fr-tabs__mobile-title{display:block}}`
  );
}

/** The stylesheet address of the kit's Google Fonts, or null. */
export function googleFontsUrl(kit: Kit): string | null {
  const families = [
    ...new Set(
      [...kit.googleFonts, ...kit.fonts.map((f) => f.family)].filter((f) => GOOGLE_FONTS.has(f)),
    ),
  ];
  if (families.length === 0) return null;
  const query = families
    .map(
      (f) =>
        `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400`,
    )
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

/** Popular Google Fonts offered in the font pickers. */
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
