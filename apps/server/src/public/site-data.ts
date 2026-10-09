import type { CxdDocument } from '@cleitext/blocks';
import {
  contentTypes,
  entries,
  media,
  mediaVariants,
  menuItems,
  menus,
  revisions,
  siteLocales,
  taxonomies,
  terms,
  users,
  type SiteTransaction,
} from '@cleitext/db';
import {
  collectMediaIds,
  documentExcerpt,
  firstImage,
  safeUrl,
  type RenderMedia,
} from '@cleitext/renderer';
import type { MenuItemView, PublicEntrySummary } from '@cleitext/theme-sdk';
import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { UrlBuilder, type LocaleInfo, type TypeInfo } from './urls.js';

/** Published entry with its published revision. */
export interface PublishedEntry {
  row: typeof entries.$inferSelect;
  document: CxdDocument;
  authorName: string | null;
}

/** Data loaded once per request, shared by every route. */
export interface SiteData {
  locales: LocaleInfo[];
  types: TypeInfo[];
  taxonomies: string[];
  urls: UrlBuilder;
}

export async function loadSiteData(tx: SiteTransaction): Promise<SiteData> {
  const locales = (
    await tx.select().from(siteLocales).orderBy(asc(siteLocales.position), asc(siteLocales.code))
  ).map((l) => ({ code: l.code, name: l.name, isDefault: l.isDefault, urlPrefix: l.urlPrefix }));
  const types = (await tx.select().from(contentTypes)).map((t) => ({
    slug: t.slug,
    permalink: t.permalink,
    hierarchical: t.hierarchical,
  }));
  const taxonomyRows = await tx.select({ slug: taxonomies.slug }).from(taxonomies);

  // Paths of hierarchical entries (pages), computed from their parents.
  const hierarchical = types.filter((t) => t.hierarchical).map((t) => t.slug);
  const rows =
    hierarchical.length > 0
      ? await tx
          .select({ id: entries.id, slug: entries.slug, parentId: entries.parentId })
          .from(entries)
          .where(and(inArray(entries.typeSlug, hierarchical), ne(entries.status, 'trashed')))
      : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const paths = new Map<string, string[]>();
  for (const row of rows) {
    const segments = [row.slug];
    let parent = row.parentId ? byId.get(row.parentId) : undefined;
    for (let depth = 0; parent && depth < 20; depth++) {
      segments.unshift(parent.slug);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    paths.set(row.id, segments);
  }

  return {
    locales,
    types,
    taxonomies: taxonomyRows.map((t) => t.slug),
    urls: new UrlBuilder(locales, new Map(types.map((t) => [t.slug, t])), paths),
  };
}

/** Condition: publicly visible entry. */
export const isPublished = and(
  eq(entries.status, 'published'),
  isNotNull(entries.publishedRevisionId),
);

export async function loadPublished(
  tx: SiteTransaction,
  where: ReturnType<typeof and>,
  options: { limit?: number; offset?: number } = {},
): Promise<PublishedEntry[]> {
  let query = tx
    .select({ row: entries, document: revisions.document, authorName: users.displayName })
    .from(entries)
    .innerJoin(revisions, eq(revisions.id, entries.publishedRevisionId))
    .leftJoin(users, eq(users.id, entries.authorId))
    .where(and(isPublished, where))
    .orderBy(desc(entries.publishedAt), desc(entries.id))
    .$dynamic();
  if (options.limit !== undefined) query = query.limit(options.limit);
  if (options.offset) query = query.offset(options.offset);
  const rows = await query;
  return rows.map((r) => ({
    row: r.row,
    document: r.document as CxdDocument,
    authorName: r.authorName,
  }));
}

/** Media (with variants) by id, with the alternative text of the language. */
export async function loadMedia(
  tx: SiteTransaction,
  ids: string[],
  locale: string,
): Promise<Map<string, RenderMedia>> {
  const result = new Map<string, RenderMedia>();
  const unique = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (unique.length === 0) return result;
  const rows = await tx.select().from(media).where(inArray(media.id, unique));
  const variants = await tx
    .select()
    .from(mediaVariants)
    .where(inArray(mediaVariants.mediaId, unique));
  for (const row of rows) {
    const alt = (row.alt as Record<string, string>)[locale] ?? '';
    result.set(row.id, {
      id: row.id,
      url: `/media/${row.storageKey}`,
      mime: row.mime,
      width: row.width,
      height: row.height,
      alt,
      variants: variants
        .filter((v) => v.mediaId === row.id)
        .map((v) => ({
          variant: v.variant,
          format: v.format,
          url: `/media/${v.storageKey}`,
          width: v.width,
          height: v.height,
        })),
    });
  }
  return result;
}

/** Summaries for listings, with the first image of each entry. */
export async function summarize(
  tx: SiteTransaction,
  list: PublishedEntry[],
  urls: UrlBuilder,
  locale: string,
): Promise<{ summaries: PublicEntrySummary[]; media: Map<string, RenderMedia> }> {
  const firstImages = list.map((e) => firstImage(e.document));
  const mediaMap = await loadMedia(
    tx,
    firstImages.map((i) => i?.id).filter((id): id is string => Boolean(id)),
    locale,
  );
  const summaries = list.map((entry, index) => {
    const image = firstImages[index];
    return {
      id: entry.row.id,
      type: entry.row.typeSlug,
      locale: entry.row.locale,
      title: entry.row.title,
      url: urls.entry(entry.row),
      publishedAt: entry.row.publishedAt?.toISOString() ?? null,
      excerpt: documentExcerpt(entry.document),
      author: entry.authorName ? { displayName: entry.authorName } : null,
      image: image?.id ? (mediaMap.get(image.id) ?? null) : null,
    };
  });
  return { summaries, media: mediaMap };
}

/** Media of a single document. */
export function documentMedia(tx: SiteTransaction, doc: CxdDocument, locale: string) {
  return loadMedia(tx, collectMediaIds(doc), locale);
}

/**
 * Menus assigned to theme locations, as trees (RF-NAV-02/03): items linked to
 * entries follow their current title and URL, and disappear when the entry
 * is not published.
 */
export async function loadMenus(
  tx: SiteTransaction,
  locale: string,
  urls: UrlBuilder,
  currentPath: string,
): Promise<Record<string, MenuItemView[]>> {
  const menuRows = await tx
    .select()
    .from(menus)
    .where(and(eq(menus.locale, locale), isNotNull(menus.location)));
  if (menuRows.length === 0) return {};
  const items = await tx
    .select()
    .from(menuItems)
    .where(
      inArray(
        menuItems.menuId,
        menuRows.map((m) => m.id),
      ),
    )
    .orderBy(asc(menuItems.position));

  const entryIds = items.map((i) => i.entryId).filter((id): id is string => Boolean(id));
  const linkedEntries = entryIds.length
    ? await tx
        .select()
        .from(entries)
        .where(and(inArray(entries.id, entryIds), isPublished))
    : [];
  const entryById = new Map(linkedEntries.map((e) => [e.id, e]));
  const termIds = items.map((i) => i.termId).filter((id): id is string => Boolean(id));
  const linkedTerms = termIds.length
    ? await tx
        .select({ term: terms, taxonomy: taxonomies.slug })
        .from(terms)
        .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
        .where(inArray(terms.id, termIds))
    : [];
  const termById = new Map(linkedTerms.map((t) => [t.term.id, t]));

  const resolve = (item: typeof menuItems.$inferSelect): { label: string; url: string } | null => {
    switch (item.kind) {
      case 'entry': {
        const entry = item.entryId ? entryById.get(item.entryId) : undefined;
        return entry ? { label: item.label || entry.title, url: urls.entry(entry) } : null;
      }
      case 'term': {
        const term = item.termId ? termById.get(item.termId) : undefined;
        return term
          ? {
              label: item.label || term.term.name,
              url: urls.term(term.taxonomy, term.term.slug, term.term.locale),
            }
          : null;
      }
      case 'url': {
        const url = safeUrl(item.url);
        return url && item.label ? { label: item.label, url } : null;
      }
      default:
        return item.label ? { label: item.label, url: '#' } : null;
    }
  };

  const result: Record<string, MenuItemView[]> = {};
  for (const menu of menuRows) {
    const ownItems = items.filter((i) => i.menuId === menu.id);
    const build = (parentId: string | null): MenuItemView[] =>
      ownItems
        .filter((i) => i.parentId === parentId)
        .flatMap((item) => {
          const resolved = resolve(item);
          if (!resolved) return [];
          const children = build(item.id);
          const current =
            resolved.url === currentPath ||
            (resolved.url !== '/' && currentPath.startsWith(`${resolved.url}/`)) ||
            children.some((c) => c.current);
          return [
            {
              id: item.id,
              label: resolved.label,
              url: resolved.url,
              ...(item.target === '_blank' ? { target: '_blank' as const } : {}),
              current,
              children,
            },
          ];
        });
    result[menu.location!] = build(null);
  }
  return result;
}
