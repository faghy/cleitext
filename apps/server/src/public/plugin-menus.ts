import { safeUrl } from '@cleitext/renderer';
import type { MenuItemView } from '@cleitext/theme-sdk';

/**
 * Menus given back by plugins (`render.menus`, plugin API 1.54): only well
 * formed items reach the theme. An item needs an id, a label and a safe
 * address; ids stay unique; a menu has at most 10 levels and 1000 items.
 */
export function cleanMenus(given: unknown): Record<string, MenuItemView[]> {
  const result: Record<string, MenuItemView[]> = {};
  if (!given || typeof given !== 'object' || Array.isArray(given)) return result;
  const seen = new Set<string>();
  let budget = 0;
  const clean = (items: unknown, depth: number): MenuItemView[] => {
    if (!Array.isArray(items) || depth > 10) return [];
    const out: MenuItemView[] = [];
    for (const raw of items) {
      if (budget <= 0 || !raw || typeof raw !== 'object') continue;
      const item = raw as Partial<MenuItemView> & Record<string, unknown>;
      const url = safeUrl(item.url);
      const label = typeof item.label === 'string' ? item.label.trim().slice(0, 200) : '';
      const id = typeof item.id === 'string' ? item.id.slice(0, 100) : '';
      if (!url || !label || !id || seen.has(id)) continue;
      seen.add(id);
      budget--;
      out.push({
        id,
        label,
        url,
        ...(item.target === '_blank' ? { target: '_blank' as const } : {}),
        current: item.current === true,
        ...(item.data && typeof item.data === 'object' && !Array.isArray(item.data)
          ? { data: item.data }
          : {}),
        children: clean(item.children, depth + 1),
      });
    }
    return out;
  };
  for (const [location, items] of Object.entries(given as Record<string, unknown>)) {
    if (!/^[\w-]{1,64}$/.test(location)) continue;
    budget = 1000;
    result[location] = clean(items, 0);
  }
  return result;
}

/** The id of the language plugin's switcher block that themes place (plugin API 1.54). */
export const SWITCHER_BLOCK_ID = 'cx-language-switcher';
