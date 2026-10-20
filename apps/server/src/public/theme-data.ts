import type { CxdDocument } from '@cleitext/blocks';
import { collectMediaIds } from '@cleitext/renderer';
import { settings, type SiteTransaction } from '@cleitext/db';
import type { ThemeDefinition } from '@cleitext/theme-sdk';
import { and, eq, inArray } from 'drizzle-orm';
import { hiddenSettings } from '../themes/theme-extensions.js';

/** Settings namespace of a theme's values (RF-THM-03). */
export const themeNamespace = (slug: string) => `theme:${slug}`;
/** Settings namespace of block areas, keys `<area>:<locale>` (RF-THM-04). */
export const AREAS_NAMESPACE = 'areas';

/**
 * Stored values of a theme's settings over their defaults. `theme` is the
 * site's theme with its plugins' extensions: values of settings added by
 * plugins not active on the site stay stored but are left out.
 */
export async function themeSettings(
  tx: SiteTransaction,
  theme: ThemeDefinition,
): Promise<Record<string, unknown>> {
  const stored = await storedThemeSettings(tx, theme.slug);
  const hidden = hiddenSettings(theme);
  for (const name of hidden) delete stored[name];
  const defaults = Object.fromEntries(
    (theme.settings ?? [])
      .filter((field) => 'default' in field && field.default !== undefined)
      .map((field) => [field.name, (field as { default: unknown }).default]),
  );
  return { ...defaults, ...stored };
}

/** The values saved for a theme, as stored. */
export async function storedThemeSettings(
  tx: SiteTransaction,
  slug: string,
): Promise<Record<string, unknown>> {
  const [row] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.namespace, themeNamespace(slug)), eq(settings.key, 'values')));
  return row?.value && typeof row.value === 'object'
    ? { ...(row.value as Record<string, unknown>) }
    : {};
}

/** The theme's block areas in a language. */
export async function themeAreas(
  tx: SiteTransaction,
  theme: ThemeDefinition,
  locale: string,
): Promise<Record<string, CxdDocument>> {
  const names = Object.keys(theme.areas ?? {});
  if (names.length === 0) return {};
  const rows = await tx
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(
      and(
        eq(settings.namespace, AREAS_NAMESPACE),
        inArray(
          settings.key,
          names.map((name) => `${name}:${locale}`),
        ),
      ),
    );
  const stored = Object.fromEntries(
    rows.map((row) => [row.key.split(':')[0]!, row.value as CxdDocument]),
  );
  // Areas never edited show the theme's default content, if any.
  return { ...(theme.areaDefaults ?? {}), ...stored };
}

/** Media used by theme settings (media fields, background images) and areas, to preload. */
export function themeMediaIds(
  theme: ThemeDefinition,
  values: Record<string, unknown>,
  areas: Record<string, CxdDocument>,
): string[] {
  const ids: unknown[] = [];
  const image = (bg: unknown) =>
    bg && typeof bg === 'object' ? (bg as { image?: unknown }).image : undefined;
  for (const field of theme.settings ?? []) {
    const value = values[field.name];
    if (field.type === 'media') ids.push(value);
    else if (field.type === 'background') {
      if (field.responsive && value && typeof value === 'object') {
        ids.push(
          ...['desktop', 'tablet', 'mobile'].map((d) =>
            image((value as Record<string, unknown>)[d]),
          ),
        );
      } else ids.push(image(value));
    }
  }
  const fromSettings = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...fromSettings, ...Object.values(areas).flatMap((doc) => collectMediaIds(doc))];
}
