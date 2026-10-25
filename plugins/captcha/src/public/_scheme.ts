/**
 * The light or dark look of a widget set to "automatic": the page's own
 * colour scheme first, the visitor's system only when the page follows it.
 *
 * 1. `<html data-color-scheme="light|dark">`, the theme setting shared by
 *    Cleitext themes (THEMES §9);
 * 2. the computed `color-scheme` of the root, when it names one scheme only;
 * 3. `prefers-color-scheme`.
 *
 * A site forced to light so never shows a dark widget on a dark system.
 * (In a `_` file: imported by captcha.ts, not a script of its own.)
 */
export type WidgetTheme = 'light' | 'dark';

/** The browser pieces it reads, so it can be tested without a DOM. */
export interface SchemeView {
  getComputedStyle?(element: Element): { colorScheme?: string };
  matchMedia?(query: string): { matches: boolean };
}

export function pageScheme(
  root: Pick<Element, 'getAttribute'> | null,
  view: SchemeView,
): WidgetTheme {
  const attribute = root?.getAttribute('data-color-scheme');
  if (attribute === 'light' || attribute === 'dark') return attribute;
  let computed = '';
  try {
    if (root) computed = view.getComputedStyle?.(root as Element).colorScheme ?? '';
  } catch {
    // Not an element of this window: the system decides.
  }
  const words = computed.trim().toLowerCase().split(/\s+/);
  const light = words.includes('light');
  const dark = words.includes('dark');
  if (light !== dark) return dark ? 'dark' : 'light';
  // `normal`, `light dark` or nothing: the page follows the system.
  return view.matchMedia?.('(prefers-color-scheme: dark)').matches === true ? 'dark' : 'light';
}

/** The theme to give the provider: a fixed choice as it is, "automatic" from the page. */
export function widgetTheme(
  choice: string | undefined,
  root: Pick<Element, 'getAttribute'> | null,
  view: SchemeView,
): WidgetTheme {
  return choice === 'light' || choice === 'dark' ? choice : pageScheme(root, view);
}
