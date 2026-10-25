/**
 * WordPress's Additional CSS (Appearance → Customize → Additional CSS): a
 * `custom_css` post per theme, named after the theme's stylesheet slug. The
 * theme mod that links the active theme's post (`custom_css_post_id`) is not
 * in the export, so the post is chosen here: the only one, the one of the
 * export's theme, or else the most recently changed. It becomes the site's
 * Additional CSS for every theme (core 0.79); the core appends it to the CSS
 * the site already has.
 */

import { balanceCss } from './css-braces.js';

type Node = Record<string, unknown>;

/** The core's limits for Additional CSS (`additionalCssProblem` of @cleitext/shared). */
export const ADDITIONAL_CSS_MAX = 100_000;

export interface WxrAdditionalCss {
  /** The CSS for the site (every theme), when one could be imported. */
  css?: string;
  /** For the import report. */
  warnings: string[];
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

/** The theme the export was made with, when its items say so (block themes). */
export function wxrTheme(items: readonly Node[]): string | undefined {
  const themeOf = (item: Node) =>
    ((item.category as Node[] | undefined) ?? []).find((c) => c['@_domain'] === 'wp_theme')?.[
      '@_nicename'
    ];
  // Global styles first: they belong to the active theme.
  const styles = items.find((item) => text(item['wp:post_type']) === 'wp_global_styles');
  const fromStyles = styles ? themeOf(styles) : undefined;
  if (fromStyles) return text(fromStyles);
  for (const item of items) {
    const theme = themeOf(item);
    if (theme) return text(theme);
  }
  return undefined;
}

/** Why the CSS cannot be printed inside the site's `<style>`, or null. */
function problem(css: string): string | null {
  if (css.length > ADDITIONAL_CSS_MAX) {
    return `it is longer than ${ADDITIONAL_CSS_MAX.toLocaleString('en')} characters`;
  }
  if (/<\/?\s*(?:style|script)/i.test(css)) return 'it contains <style> or <script> markup';
  return null;
}

/** The Additional CSS of a WordPress export, for `site.additionalCss.site`. */
export function wxrAdditionalCss(items: readonly Node[]): WxrAdditionalCss {
  const warnings: string[] = [];
  const posts = items
    .filter(
      (item) =>
        text(item['wp:post_type']) === 'custom_css' && text(item['wp:status']) === 'publish',
    )
    .map((item) => ({
      theme: text(item['wp:post_name']) || text(item.title),
      css: text(item['content:encoded']).replaceAll('\u0000', '').trim(),
      modified: text(item['wp:post_modified_gmt']) || text(item['wp:post_date_gmt']),
      id: Number(text(item['wp:post_id'])) || 0,
    }))
    .filter((post) => post.css !== '');
  if (posts.length === 0) return { warnings };
  const theme = wxrTheme(items);
  const chosen =
    posts.length === 1
      ? posts[0]!
      : (posts.find((post) => theme !== undefined && post.theme === theme) ??
        [...posts].sort((a, b) => b.modified.localeCompare(a.modified) || b.id - a.id)[0]!);
  const others = posts.filter((post) => post !== chosen).map((post) => `“${post.theme}”`);
  if (others.length > 0) {
    warnings.push(
      `The export has the Additional CSS of ${posts.length} WordPress themes: the one of “${chosen.theme}” (${
        theme === chosen.theme ? 'the theme of the export' : 'the most recently changed'
      }) was imported; the one of ${others.join(', ')} was not.`,
    );
  }
  // Braces matched (1.26.0): WordPress printed the CSS alone, where the browser
  // closes what is left open; here more CSS comes after it, which a block left
  // open (`@media … {` at the end) would swallow.
  const balanced = balanceCss(chosen.css);
  const fixes = [
    balanced.dropped &&
      `removed the empty block${balanced.dropped > 1 ? 's' : ''} left open at the end`,
    balanced.closed &&
      `closed ${balanced.closed > 1 ? `${balanced.closed} blocks` : 'the block'} left open at the end`,
    balanced.stray && `removed ${balanced.stray} “}” with no “{”`,
    balanced.ended && 'ended the comment or string left open',
  ].filter(Boolean);
  if (fixes.length) {
    warnings.push(
      `The braces of the Additional CSS of the WordPress theme “${chosen.theme}” did not match (already so in WordPress): ${fixes.join(', ')}, so it cannot swallow the CSS printed after it. Check it in Appearance → Customize → Additional CSS.`,
    );
  }
  const css = balanced.css.trim();
  const refused = problem(css);
  if (refused) {
    warnings.push(
      `The Additional CSS of the WordPress theme “${chosen.theme}” was not imported: ${refused}.`,
    );
    return { warnings };
  }
  warnings.push(
    `The Additional CSS of the WordPress theme “${chosen.theme}” goes to Appearance → Customize → Additional CSS, for every theme (after the CSS the site already has).`,
  );
  return { css, warnings };
}
