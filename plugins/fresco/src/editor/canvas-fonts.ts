/**
 * The Google Fonts of the editor's canvas. The site loads those the kit and
 * the page's elements name; the canvas loads the same, and also those its
 * content shows that no Fresco CSS names (styles of templates and global
 * widgets, other plugins' blocks, the site's custom CSS). Each family has its
 * own stylesheet: one that Google refuses never keeps the others from
 * loading, so a text never falls back to the browser's serif font.
 */
import { elementGoogleFonts, isGoogleFont } from '../core/fonts.js';
import { googleFontsUrl, type Kit } from '../core/kit.js';
import type { FrescoNode } from '../core/model.js';

/** The Google families the elements' settings name (as `data-fr-fonts` on the site). */
export function elementsGoogleFonts(
  nodes: readonly FrescoNode[],
  out = new Set<string>(),
): string[] {
  for (const node of nodes) {
    for (const family of elementGoogleFonts(node.attrs ?? {})) out.add(family);
    if (node.children) elementsGoogleFonts(node.children, out);
  }
  return [...out];
}

/** The Google families of a `font-family` value (`"PT Sans", sans-serif` → PT Sans). */
export function familiesOf(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name && isGoogleFont(name));
}

/** The Google families the content under `root` is drawn with (at most `limit` nodes looked at). */
export function renderedGoogleFonts(root: Element, limit = 4000): string[] {
  const win = root.ownerDocument.defaultView;
  if (!win) return [];
  const found = new Set<string>();
  const seen = new Set<string>();
  const nodes = [root, ...root.querySelectorAll('*')].slice(0, limit);
  for (const node of nodes) {
    const value = win.getComputedStyle(node).fontFamily;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    for (const family of familiesOf(value)) found.add(family);
  }
  return [...found];
}

/**
 * The stylesheets of the canvas's Google Fonts, one per family: the kit's
 * first (its list and its global fonts), then the others, each once.
 */
export function canvasFontLinks(kit: Kit, more: readonly string[]): string[] {
  const families = [
    ...new Set([
      ...kit.googleFonts.filter(isGoogleFont),
      ...kit.fonts.map((f) => f.family).filter(isGoogleFont),
      ...more.filter(isGoogleFont),
    ]),
  ].slice(0, 40);
  return families
    .map((family) => googleFontsUrl({ ...kit, googleFonts: [family], fonts: [] }))
    .filter((url): url is string => !!url);
}
