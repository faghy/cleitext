import type { CxdDocument } from '@cleitext/blocks';
import { collectMediaIds } from '@cleitext/renderer';
import { settings, type SiteTransaction } from '@cleitext/db';
import type { ThemeDefinition } from '@cleitext/theme-sdk';
import { and, eq, inArray } from 'drizzle-orm';

/** Settings namespace of a theme's values (RF-THM-03). */
export const themeNamespace = (slug: string) => `theme:${slug}`;
/** Settings namespace of block areas, keys `<area>:<locale>` (RF-THM-04). */
export const AREAS_NAMESPACE = 'areas';

/** Stored values of a theme's settings over their defaults. */
export async function themeSettings(
  tx: SiteTransaction,
  theme: ThemeDefinition,
): Promise<Record<string, unknown>> {
  const defaults = Object.fromEntries(
    (theme.settings ?? [])
      .filter((field) => 'default' in field && field.default !== undefined)
      .map((field) => [field.name, (field as { default: unknown }).default]),
  );
  const [row] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.namespace, themeNamespace(theme.slug)), eq(settings.key, 'values')));
  const stored =
    row?.value && typeof row.value === 'object' ? (row.value as Record<string, unknown>) : {};
  return { ...defaults, ...stored };
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
  return Object.fromEntries(rows.map((row) => [row.key.split(':')[0]!, row.value as CxdDocument]));
}

/** Media used by theme settings (media fields) and areas, to preload. */
export function themeMediaIds(
  theme: ThemeDefinition,
  values: Record<string, unknown>,
  areas: Record<string, CxdDocument>,
): string[] {
  const fromSettings = (theme.settings ?? [])
    .filter((field) => field.type === 'media')
    .map((field) => values[field.name])
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...fromSettings, ...Object.values(areas).flatMap((doc) => collectMediaIds(doc))];
}
