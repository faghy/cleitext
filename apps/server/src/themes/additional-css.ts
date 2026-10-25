/**
 * Additional CSS (core 0.79), as WordPress's: CSS the site owner writes in
 * Customize, kept in the site's settings and not in the theme, so it
 * survives theme updates and theme switches. Two parts: for every theme
 * (`site`) and for one theme only (`theme:<slug>`). Printed last in `<head>`,
 * after the theme's and the child theme's CSS and the blocks' CSS.
 */
import { settings, type SiteTransaction } from '@cleitext/db';
import { balanceCss, styleText } from '@cleitext/shared';
import { and, eq, inArray } from 'drizzle-orm';

export const ADDITIONAL_CSS_NAMESPACE = 'additional-css';
export const SITE_CSS_KEY = 'site';
export const themeCssKey = (slug: string) => `theme:${slug}`;

export interface AdditionalCss {
  site: string;
  theme: string;
}

/** The site's Additional CSS, with the part of a theme. */
export async function readAdditionalCss(
  tx: SiteTransaction,
  themeSlug: string,
): Promise<AdditionalCss> {
  const rows = await tx
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(
      and(
        eq(settings.namespace, ADDITIONAL_CSS_NAMESPACE),
        inArray(settings.key, [SITE_CSS_KEY, themeCssKey(themeSlug)]),
      ),
    );
  const text = (key: string) => {
    const value = rows.find((r) => r.key === key)?.value;
    return typeof value === 'string' ? value : '';
  };
  return { site: text(SITE_CSS_KEY), theme: text(themeCssKey(themeSlug)) };
}

/** Every stored part (for transfers): `site` and the themes' by slug. */
export async function allAdditionalCss(
  tx: SiteTransaction,
): Promise<{ site?: string; themes?: Record<string, string> }> {
  const rows = await tx
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(eq(settings.namespace, ADDITIONAL_CSS_NAMESPACE));
  const result: { site?: string; themes?: Record<string, string> } = {};
  for (const row of rows) {
    if (typeof row.value !== 'string' || row.value === '') continue;
    if (row.key === SITE_CSS_KEY) result.site = row.value;
    else if (row.key.startsWith('theme:')) (result.themes ??= {})[row.key.slice(6)] = row.value;
  }
  return result;
}

/** Saves one part; an empty one is removed. */
export async function writeAdditionalCss(
  tx: SiteTransaction,
  siteId: string,
  key: string,
  css: string,
): Promise<void> {
  if (css.trim() === '') {
    await tx
      .delete(settings)
      .where(and(eq(settings.namespace, ADDITIONAL_CSS_NAMESPACE), eq(settings.key, key)));
    return;
  }
  await tx
    .insert(settings)
    .values({ siteId, namespace: ADDITIONAL_CSS_NAMESPACE, key, value: css })
    .onConflictDoUpdate({
      target: [settings.siteId, settings.namespace, settings.key],
      set: { value: css },
    });
}

export type MergeOutcome = 'added' | 'appended' | 'present';

/**
 * Imported Additional CSS joined to what the site has (core 0.80): the site's
 * own CSS is never replaced. Into an empty part it goes as it is; otherwise it
 * is appended under a comment naming where it comes from, unless the site
 * already has it (an import made again), in which case nothing changes.
 */
export function mergeAdditionalCss(
  existing: string,
  incoming: string,
  from: string,
): { css: string; outcome: MergeOutcome } {
  const css = incoming.trim();
  if (css === '' || existing.includes(css)) return { css: existing, outcome: 'present' };
  if (existing.trim() === '') return { css, outcome: 'added' };
  // The source's name may not close the comment.
  const label =
    from
      .replace(/\*\//g, '* /')
      .replace(/[\r\n]+/g, ' ')
      .trim() || 'an import';
  return {
    css: `${existing.trimEnd()}\n\n/* Imported from ${label} */\n${css}\n`,
    outcome: 'appended',
  };
}

/** A `<style>` put just before `</head>` (at the start when there is none). */
export function beforeHeadEnd(html: string, id: string, css: string): string {
  if (!css.trim()) return html;
  const style = `<style id="${id}">${styleText(css)}</style>`;
  const at = html.indexOf('</head>');
  return at === -1 ? style + html : html.slice(0, at) + style + html.slice(at);
}

/**
 * The page with its Additional CSS, last in `<head>`: for every theme, then
 * for this one. Each part is printed with its braces matched (core 0.82):
 * CSS saved before the check, with a block left open, cannot swallow the
 * part after it.
 */
export function withAdditionalCss(html: string, css: AdditionalCss): string {
  return beforeHeadEnd(
    html,
    'cx-additional-css',
    [css.site, css.theme]
      .filter((part) => part.trim())
      .map((part) => balanceCss(part).css)
      .join('\n'),
  );
}
