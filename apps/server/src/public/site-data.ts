import type { CxdDocument } from '@cleitext/blocks';
import {
  contentTypes,
  entries,
  entryTerms,
  media,
  mediaVariants,
  menuItems,
  menus,
  revisions,
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
import type { MenuItemField, MenuItemView, PublicEntrySummary } from '@cleitext/theme-sdk';
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { ContentLocale } from '@cleitext/plugin-sdk';
import { termKey, UrlBuilder, type TypeInfo } from './urls.js';
import { menuItemFieldsAt, publicMenuItemData } from '../menus/menu-item-data.js';

/** Published entry with its published revision. */
export interface PublishedEntry {
  row: typeof entries.$inferSelect;
  document: CxdDocument;
  fields: Record<string, unknown>;
  /** Excerpt and featured image of the revision (RF-CNT-12). */
  excerpt: string | null;
  featuredMediaId: string | null;
  authorName: string | null;
  /** The author's archive slug (`/author/<slug>`). */
  authorSlug?: string | null;
}

/** The author of a published entry, with the address of their archive. */
export function entryAuthor(
  entry: PublishedEntry,
  urls: UrlBuilder,
  locale: string,
): PublicEntrySummary['author'] {
  if (!entry.authorName) return null;
  return {
    displayName: entry.authorName,
    ...(entry.authorSlug ? { url: urls.author(locale, entry.authorSlug) } : {}),
  };
}

/** Data loaded once per request, shared by every route. */
export interface SiteData {
  /** Content languages, the default first (LanguagesService). */
  locales: ContentLocale[];
  types: TypeInfo[];
  taxonomies: string[];
  /** Taxonomy by the first part of its archives' addresses; '' for those without one. */
  taxonomyByBase: Map<string, string[]>;
  urls: UrlBuilder;
}

/**
 * Content types of plugins are only visible while their plugin is active on
 * the site: their entries are kept but not routed (deactivation is safe).
 */
export function isTypeAvailable(source: string, activePlugins: ReadonlySet<string>): boolean {
  return !source.startsWith('plugin:') || activePlugins.has(source.slice('plugin:'.length));
}

export async function loadSiteData(
  tx: SiteTransaction,
  activePlugins: ReadonlySet<string>,
  locales: ContentLocale[],
): Promise<SiteData> {
  const types = (await tx.select().from(contentTypes))
    // Private types (a plugin's own templates) have no public address.
    .filter((t) => isTypeAvailable(t.source, activePlugins) && !t.supports.includes('private'))
    .map((t) => ({
      slug: t.slug,
      permalink: t.permalink,
      hierarchical: t.hierarchical,
      supports: t.supports,
    }));
  const taxonomyRows = (
    await tx
      .select({
        id: taxonomies.id,
        slug: taxonomies.slug,
        source: taxonomies.source,
        base: taxonomies.base,
        hierarchical: taxonomies.hierarchical,
      })
      .from(taxonomies)
  ).filter((t) => isTypeAvailable(t.source, activePlugins));

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

  // Paths of the terms with parents (categories), as WordPress builds them.
  const nested = taxonomyRows.filter((t) => t.hierarchical);
  const termRows =
    nested.length > 0
      ? await tx
          .select({
            id: terms.id,
            slug: terms.slug,
            locale: terms.locale,
            parentId: terms.parentId,
            taxonomyId: terms.taxonomyId,
          })
          .from(terms)
          .where(
            inArray(
              terms.taxonomyId,
              nested.map((t) => t.id),
            ),
          )
      : [];
  const termsById = new Map(termRows.map((r) => [r.id, r]));
  const taxonomySlugs = new Map(nested.map((t) => [t.id, t.slug]));
  const termPaths = new Map<string, string[]>();
  for (const row of termRows) {
    if (!row.parentId) continue;
    const segments = [row.slug];
    let parent = termsById.get(row.parentId);
    for (let depth = 0; parent && depth < 10; depth++) {
      segments.unshift(parent.slug);
      parent = parent.parentId ? termsById.get(parent.parentId) : undefined;
    }
    termPaths.set(termKey(taxonomySlugs.get(row.taxonomyId)!, row.locale, row.slug), segments);
  }

  return {
    locales,
    types,
    taxonomies: taxonomyRows.map((t) => t.slug),
    taxonomyByBase: taxonomyRows.reduce((map, t) => {
      const base = t.base ?? t.slug;
      return map.set(base, [...(map.get(base) ?? []), t.slug]);
    }, new Map<string, string[]>()),
    urls: new UrlBuilder(
      locales,
      new Map(types.map((t) => [t.slug, t])),
      paths,
      new Map(taxonomyRows.flatMap((t) => (t.base !== null ? [[t.slug, t.base] as const] : []))),
      termPaths,
    ),
  };
}

/** Condition: publicly visible entry. */
export const isPublished = and(
  eq(entries.status, 'published'),
  isNotNull(entries.publishedRevisionId),
);

/** Published entries, plus private ones for users allowed to read them (RF-CNT-16). */
export function isVisible(includePrivate: boolean) {
  return includePrivate
    ? and(inArray(entries.status, ['published', 'private']), isNotNull(entries.publishedRevisionId))
    : isPublished;
}

export async function loadPublished(
  tx: SiteTransaction,
  where: ReturnType<typeof and>,
  options: {
    limit?: number;
    offset?: number;
    includePrivate?: boolean;
    /** Newest first by default. */
    orderBy?: 'date' | 'title' | 'modified' | 'random' | 'order';
    order?: 'asc' | 'desc';
  } = {},
): Promise<PublishedEntry[]> {
  const direction = options.order === 'asc' ? asc : desc;
  const ordering =
    options.orderBy === 'random'
      ? [sql`random()`]
      : options.orderBy === 'title'
        ? [direction(revisions.title), desc(entries.id)]
        : options.orderBy === 'modified'
          ? [direction(entries.updatedAt), desc(entries.id)]
          : options.orderBy === 'order'
            ? // The manual order (WordPress's menu_order), then the newest.
              [direction(entries.position), desc(entries.publishedAt), desc(entries.id)]
            : [direction(entries.publishedAt), direction(entries.id)];
  let query = tx
    .select({
      row: entries,
      title: revisions.title,
      document: revisions.document,
      fields: revisions.fields,
      excerpt: revisions.excerpt,
      featuredMediaId: revisions.featuredMediaId,
      authorName: users.displayName,
      authorSlug: users.slug,
    })
    .from(entries)
    .innerJoin(revisions, eq(revisions.id, entries.publishedRevisionId))
    .leftJoin(users, eq(users.id, entries.authorId))
    .where(and(isVisible(options.includePrivate ?? false), where))
    .orderBy(...ordering)
    .$dynamic();
  if (options.limit !== undefined) query = query.limit(options.limit);
  if (options.offset) query = query.offset(options.offset);
  const rows = await query;
  // The public sees the published revision, title included (edits wait for republishing).
  return rows.map((r) => ({
    row: { ...r.row, title: r.title },
    document: r.document as CxdDocument,
    fields: r.fields as Record<string, unknown>,
    excerpt: r.excerpt,
    featuredMediaId: r.featuredMediaId,
    authorName: r.authorName,
    authorSlug: r.authorSlug,
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
      focalPoint: (row.focalPoint as { x: number; y: number } | null) ?? null,
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

/** The categories, tags… of listed entries, for themes that show them in lists. */
export async function addSummaryTerms(
  tx: SiteTransaction,
  summaries: PublicEntrySummary[],
  urls: UrlBuilder,
): Promise<void> {
  if (summaries.length === 0) return;
  const rows = await tx
    .select({ entryId: entryTerms.entryId, term: terms, taxonomy: taxonomies.slug })
    .from(entryTerms)
    .innerJoin(terms, eq(terms.id, entryTerms.termId))
    .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
    .where(
      inArray(
        entryTerms.entryId,
        summaries.map((s) => s.id),
      ),
    );
  const byId = new Map(summaries.map((s) => [s.id, s]));
  for (const { entryId, term, taxonomy } of rows) {
    const summary = byId.get(entryId);
    if (!summary) continue;
    summary.terms ??= {};
    (summary.terms[taxonomy] ??= []).push({
      name: term.name,
      slug: term.slug,
      url: urls.term(taxonomy, term.slug, term.locale),
    });
  }
}

/** Summaries for listings, with the first image of each entry. */
export async function summarize(
  tx: SiteTransaction,
  list: PublishedEntry[],
  urls: UrlBuilder,
  locale: string,
): Promise<{ summaries: PublicEntrySummary[]; media: Map<string, RenderMedia> }> {
  // The featured image, or else the first image of the content.
  const firstImages = list.map((e) =>
    e.featuredMediaId ? { id: e.featuredMediaId } : firstImage(e.document),
  );
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
      excerpt: entry.excerpt || documentExcerpt(entry.document),
      author: entryAuthor(entry, urls, locale),
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
  /** Content types visible on the site (links to other entries are dropped). */
  typeSlugs: ReadonlySet<string>,
  /** Options of menu items of the site's theme (plugin API 1.34), given in `data`. */
  itemFields?: readonly MenuItemField[],
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
        return entry && typeSlugs.has(entry.typeSlug)
          ? { label: item.label || entry.title, url: urls.entry(entry) }
          : null;
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
    const build = (parentId: string | null, depth: number): MenuItemView[] =>
      ownItems
        .filter((i) => i.parentId === parentId)
        .flatMap((item) => {
          const resolved = resolve(item);
          if (!resolved) return [];
          const children = build(item.id, depth + 1);
          const fields = menuItemFieldsAt(itemFields, depth);
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
              ...(fields.length > 0 ? { data: publicMenuItemData(fields, item.data) } : {}),
              children,
            },
          ];
        });
    result[menu.location!] = build(null, 0);
  }
  return result;
}
