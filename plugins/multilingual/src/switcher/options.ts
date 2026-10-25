/**
 * The language switcher's settings (Multilingual 1.6.0): one set for every
 * place it shows, the block, the menus, the bottom of the page and the
 * themes' header and footer. Pure functions, shared by the server and the admin.
 */

export type SwitcherStyle = 'dropdown' | 'inline' | 'list';
export type SwitcherNames = 'native' | 'translated' | 'code';
export type Untranslated = 'home' | 'hide';

/** How the switcher looks: the settings' defaults, a block's choices, a theme's hint. */
export interface SwitcherLook {
  style: SwitcherStyle;
  names: SwitcherNames;
  flags: boolean;
  /** The language of the page is listed too (a dropdown always shows it on its button). */
  showCurrent: boolean;
  /** Languages the page is not translated into: linked to their home page, or left out. */
  untranslated: Untranslated;
}

export interface SwitcherSettings extends SwitcherLook {
  /** In themes' header and footer: the look the theme suggests (`theme`) or these settings (`site`). */
  themeLook: 'theme' | 'site';
  /** A theme menu location that gets the languages as menu items ('' for none). */
  menuLocation: string;
  menuPosition: 'start' | 'end';
  /** In menus: one item with the others under it, or one item per language. */
  menuStyle: 'dropdown' | 'inline';
  /** An automatic switcher at the bottom of every page, or floating in a corner. */
  footer: 'off' | 'footer' | 'floating';
  floatingSide: 'left' | 'right';
}

export const DEFAULT_SETTINGS: SwitcherSettings = {
  style: 'dropdown',
  names: 'native',
  flags: true,
  showCurrent: true,
  untranslated: 'home',
  themeLook: 'theme',
  menuLocation: '',
  menuPosition: 'end',
  menuStyle: 'dropdown',
  footer: 'off',
  floatingSide: 'right',
};

const STYLES: SwitcherStyle[] = ['dropdown', 'inline', 'list'];
const NAMES: SwitcherNames[] = ['native', 'translated', 'code'];

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export const isStyle = (value: unknown): value is SwitcherStyle =>
  STYLES.includes(value as SwitcherStyle);
export const isNames = (value: unknown): value is SwitcherNames =>
  NAMES.includes(value as SwitcherNames);

/** Stored or sent settings, with every value checked (unknown ones get the default). */
export function normalizeSettings(value: unknown): SwitcherSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    style: pick(v.style, STYLES, d.style),
    names: pick(v.names, NAMES, d.names),
    flags: typeof v.flags === 'boolean' ? v.flags : d.flags,
    showCurrent: typeof v.showCurrent === 'boolean' ? v.showCurrent : d.showCurrent,
    untranslated: pick(v.untranslated, ['home', 'hide'] as const, d.untranslated),
    themeLook: pick(v.themeLook, ['theme', 'site'] as const, d.themeLook),
    menuLocation:
      typeof v.menuLocation === 'string' && /^[\w-]{0,64}$/.test(v.menuLocation)
        ? v.menuLocation
        : d.menuLocation,
    menuPosition: pick(v.menuPosition, ['start', 'end'] as const, d.menuPosition),
    menuStyle: pick(v.menuStyle, ['dropdown', 'inline'] as const, d.menuStyle),
    footer: pick(v.footer, ['off', 'footer', 'floating'] as const, d.footer),
    floatingSide: pick(v.floatingSide, ['left', 'right'] as const, d.floatingSide),
  };
}

/** A block's attributes: `site` (or missing) keeps the site's setting. */
export interface SwitcherAttrs {
  style?: string;
  names?: string;
  flags?: string;
  showCurrent?: string;
  untranslated?: string;
  /** Set by themes (`<LanguageSwitcher placement>`) and by the plugin's own placements. */
  placement?: string;
  hint?: { style?: unknown; names?: unknown; flags?: unknown };
  className?: string;
  align?: string;
}

const yesNo = (value: unknown): boolean | undefined =>
  value === 'yes' ? true : value === 'no' ? false : undefined;

/** The look of one switcher: the settings, then the block's choices or the theme's hint. */
export function resolveLook(settings: SwitcherSettings, attrs: SwitcherAttrs): SwitcherLook {
  const look: SwitcherLook = {
    style: settings.style,
    names: settings.names,
    flags: settings.flags,
    showCurrent: settings.showCurrent,
    untranslated: settings.untranslated,
  };
  const placement = attrs.placement ?? '';
  if (placement === '' || placement === 'block') {
    if (isStyle(attrs.style)) look.style = attrs.style;
    if (isNames(attrs.names)) look.names = attrs.names;
    look.flags = yesNo(attrs.flags) ?? look.flags;
    look.showCurrent = yesNo(attrs.showCurrent) ?? look.showCurrent;
    if (attrs.untranslated === 'home' || attrs.untranslated === 'hide')
      look.untranslated = attrs.untranslated;
    return look;
  }
  // A theme's place: what it suggests, unless the site owner chose these settings everywhere.
  if (placement !== 'footer-auto' && placement !== 'floating' && settings.themeLook === 'theme') {
    const hint = attrs.hint ?? {};
    if (isStyle(hint.style)) look.style = hint.style;
    if (isNames(hint.names)) look.names = hint.names;
    if (typeof hint.flags === 'boolean') look.flags = hint.flags;
  }
  return look;
}

/** A language as the switcher lists it. */
export interface SwitcherLocale {
  code: string;
  name: string;
  url: string;
  current: boolean;
  translated: boolean;
}

/** The languages to list: without the untranslated ones when so chosen (never the current one). */
export function visibleLocales(locales: SwitcherLocale[], look: SwitcherLook): SwitcherLocale[] {
  return locales.filter((l) => l.current || l.translated || look.untranslated === 'home');
}

const capitalize = (text: string, locale: string) =>
  text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;

/** A language's name in `inLocale` (its own name when `inLocale` is its code), or null. */
export function displayName(code: string, inLocale: string): string | null {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language', fallback: 'none' }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) return capitalize(name, inLocale);
  } catch {
    // A code this runtime does not know.
  }
  return null;
}

/** What the switcher writes for a language, and its full name (for screen readers with codes). */
export function labelOf(
  locale: Pick<SwitcherLocale, 'code' | 'name'>,
  names: SwitcherNames,
  pageLocale: string,
): { text: string; full: string } {
  // The name the site gives the language is its own name (`Deutsch`), unless left empty.
  const native = locale.name.trim() || displayName(locale.code, locale.code) || locale.code;
  if (names === 'code') return { text: locale.code.toUpperCase(), full: native };
  if (names === 'translated') {
    const translated = displayName(locale.code, pageLocale) ?? native;
    return { text: translated, full: translated };
  }
  return { text: native, full: native };
}
