import { entries, type SiteTransaction } from '@cleitext/db';
import type { ContentLocale } from '@cleitext/plugin-sdk';
import { eq } from 'drizzle-orm';

type EntryRow = typeof entries.$inferSelect;

/** Public path of an entry from a permalink pattern, without the language prefix. */
export async function entryPath(
  tx: SiteTransaction,
  entry: EntryRow,
  permalink: string,
): Promise<string> {
  const segments: string[] = [entry.slug];
  let parentId = entry.parentId;
  for (let depth = 0; parentId && depth < 20; depth++) {
    const [parent] = await tx
      .select({ slug: entries.slug, parentId: entries.parentId })
      .from(entries)
      .where(eq(entries.id, parentId));
    if (!parent) break;
    segments.unshift(parent.slug);
    parentId = parent.parentId;
  }
  const date = entry.publishedAt ?? entry.createdAt;
  return permalink
    .replace('{path}', segments.join('/'))
    .replace('{slug}', entry.slug)
    .replace('{year}', String(date.getUTCFullYear()))
    .replace('{month}', String(date.getUTCMonth() + 1).padStart(2, '0'));
}

/** Address prefix of each language: none for the default one (LanguagesService). */
export function localePrefixes(locales: ContentLocale[]): Map<string, string> {
  return new Map(locales.map((l) => [l.code, l.isDefault ? '' : l.prefix]));
}
