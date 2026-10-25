/**
 * The language switcher in menus (Multilingual 1.6.0), as WPML and Polylang
 * put it: menu items every theme shows like the others. Either in the menu
 * location chosen in the settings, or where a menu has a custom link to
 * `#language-switcher` (Polylang's `#pll_switcher` too), which may carry its
 * own choices: `#language-switcher?style=inline&names=code&current=hide&untranslated=hide`.
 */
import type { Filters } from '@cleitext/plugin-sdk';
import {
  isNames,
  labelOf,
  visibleLocales,
  type SwitcherLocale,
  type SwitcherLook,
  type SwitcherSettings,
} from './options';

/** A menu item as themes get it. */
export type MenuItemView = Filters['render.menus'][0][string][number];

export const SWITCHER_LINK = '#language-switcher';
const LINK_RE = /^#(?:language-switcher|pll_switcher)(?:\?(.*))?$/;

/** The menu's look of the switcher: the settings, then a link's own choices. */
export interface MenuLook extends SwitcherLook {
  menuStyle: 'dropdown' | 'inline';
}

/** The choices of a switcher link, or null when the address is not one. */
export function switcherLink(url: string, settings: SwitcherSettings): MenuLook | null {
  const match = LINK_RE.exec(url.trim());
  if (!match) return null;
  const look: MenuLook = {
    style: settings.style,
    names: settings.names,
    flags: false,
    showCurrent: settings.showCurrent,
    untranslated: settings.untranslated,
    menuStyle: settings.menuStyle,
  };
  const params = new URLSearchParams(match[1] ?? '');
  const style = params.get('style');
  if (style === 'dropdown' || style === 'inline') look.menuStyle = style;
  const names = params.get('names');
  if (isNames(names)) look.names = names;
  if (params.get('current') === 'hide') look.showCurrent = false;
  if (params.get('current') === 'show') look.showCurrent = true;
  const untranslated = params.get('untranslated');
  if (untranslated === 'hide' || untranslated === 'home') look.untranslated = untranslated;
  return look;
}

/** The languages as menu items: one item with the others under it, or one per language. */
export function switcherItems(
  locales: SwitcherLocale[],
  look: MenuLook,
  pageLocale: string,
  idBase: string,
): MenuItemView[] {
  const shown = visibleLocales(locales, look);
  if (locales.length < 2 || shown.length < 2) return [];
  const item = (locale: SwitcherLocale): MenuItemView => ({
    id: `${idBase}-${locale.code}`,
    label: labelOf(locale, look.names, pageLocale).text,
    url: locale.url,
    current: locale.current,
    children: [],
  });
  if (look.menuStyle === 'dropdown') {
    const current = shown.find((l) => l.current) ?? shown[0]!;
    return [
      {
        ...item(current),
        id: idBase,
        // A toggle more than a link: the theme's "current page" look stays on the page's own item.
        current: false,
        children: shown.filter((l) => l !== current).map(item),
      },
    ];
  }
  return shown.filter((l) => look.showCurrent || !l.current).map(item);
}

/**
 * The page's menus with the switcher: in place of each switcher link, and
 * in the chosen location (where no link put it already).
 */
export function withSwitcher(
  menus: Record<string, MenuItemView[]>,
  locales: SwitcherLocale[],
  settings: SwitcherSettings,
  pageLocale: string,
): Record<string, MenuItemView[]> {
  if (locales.length < 2) {
    // One language: links to the switcher have nothing to show.
    const strip = (items: MenuItemView[]): MenuItemView[] =>
      items.filter((i) => !LINK_RE.test(i.url)).map((i) => ({ ...i, children: strip(i.children) }));
    return Object.fromEntries(Object.entries(menus).map(([k, v]) => [k, strip(v)]));
  }
  let n = 0;
  const placed = new Set<string>();
  const replace = (items: MenuItemView[], location: string): MenuItemView[] =>
    items.flatMap((item) => {
      const look = switcherLink(item.url, settings);
      if (!look) return [{ ...item, children: replace(item.children, location) }];
      placed.add(location);
      return switcherItems(locales, look, pageLocale, `ml-lang-${location}-${++n}`);
    });
  const result: Record<string, MenuItemView[]> = {};
  for (const [location, items] of Object.entries(menus))
    result[location] = replace(items, location);
  const target = settings.menuLocation;
  if (target && !placed.has(target)) {
    const items = switcherItems(
      locales,
      { ...settings, flags: false },
      pageLocale,
      `ml-lang-${target}`,
    );
    const existing = result[target] ?? [];
    result[target] =
      settings.menuPosition === 'start' ? [...items, ...existing] : [...existing, ...items];
  }
  return result;
}
