import type { CxdBlock } from '@cleitext/blocks';
import { entries, entryTerms, media, taxonomies, terms, type SiteTransaction } from '@cleitext/db';
import type { SitemapSource, SitemapUrl } from '@cleitext/plugin-sdk';
import { and, asc, count, desc, eq, inArray, max } from 'drizzle-orm';
import { isVisible, loadPublished, type PublishedEntry, type SiteData } from './site-data.js';

/**
 * XML sitemaps (RF-THM-07), as search engines and Yoast SEO expect them:
 * an index with the date of each sitemap, one sitemap per content type or
 * taxonomy and language, split every 1000 addresses, with the images of each
 * page and its other languages (hreflang). Plugins choose what goes in
 * through the `sitemap.sources` and `sitemap.urls` filters (SEO plugin).
 */

export const PER_SITEMAP = 1000;

/** /sitemap-<slug>-<locale>[-<n>].xml, /sitemap-tax-<slug>-<locale>[-<n>].xml */
export const SITEMAP_RE =
  /^\/sitemap-(tax-)?([a-z0-9][a-z0-9_-]*?)-([a-z]{2,3}(?:-[a-z]{2,4})?)(?:-(\d{1,5}))?\.xml$/i;

export interface SitemapContext {
  tx: SiteTransaction;
  siteId: string;
  origin: string;
  data: SiteData;
  /** Front pages (and their translations): listed at the language home. */
  front: Set<string>;
  /** The "not found" page (and its translations): never listed. */
  hidden: Set<string>;
  translations(ids: string[]): Promise<Map<string, { id: string; locale: string }[]>>;
  filterSources(sources: SitemapSource[]): Promise<SitemapSource[]>;
  filterUrls(
    urls: SitemapUrl[],
    context: { kind: SitemapSource['kind']; slug: string; locale: string },
  ): Promise<SitemapUrl[]>;
}

const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

const STYLESHEET = '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>';

const name = (source: SitemapSource, locale: string, page: number) =>
  `sitemap-${source.kind === 'taxonomy' ? 'tax-' : ''}${source.slug}-${locale}${page > 1 ? `-${page}` : ''}.xml`;

/** What can have a sitemap: content types and taxonomies, filtered by plugins. */
async function sources(ctx: SitemapContext): Promise<SitemapSource[]> {
  return ctx.filterSources([
    ...ctx.data.types.map((t) => ({ kind: 'type' as const, slug: t.slug })),
    ...ctx.data.taxonomies.map((slug) => ({ kind: 'taxonomy' as const, slug })),
  ]);
}

/** /sitemap.xml */
export async function sitemapIndex(ctx: SitemapContext): Promise<string> {
  const allowed = await sources(ctx);
  const types = allowed.filter((s) => s.kind === 'type').map((s) => s.slug);
  const taxes = allowed.filter((s) => s.kind === 'taxonomy').map((s) => s.slug);
  const items: { loc: string; lastmod: Date | null }[] = [];

  if (types.length > 0) {
    const groups = await ctx.tx
      .select({
        type: entries.typeSlug,
        locale: entries.locale,
        n: count(),
        lastmod: max(entries.updatedAt),
      })
      .from(entries)
      .where(and(isVisible(false), inArray(entries.typeSlug, types)))
      .groupBy(entries.typeSlug, entries.locale)
      .orderBy(asc(entries.typeSlug), asc(entries.locale));
    for (const g of groups) {
      const pages = Math.ceil(g.n / PER_SITEMAP);
      const dates = pages > 1 ? await pageDates(ctx, g.type, g.locale, pages) : [g.lastmod];
      for (let page = 1; page <= pages; page++) {
        items.push({
          loc: `${ctx.origin}/${name({ kind: 'type', slug: g.type }, g.locale, page)}`,
          lastmod: dates[page - 1] ?? null,
        });
      }
    }
  }

  for (const taxonomy of taxes) {
    const groups = await ctx.tx
      .select({ locale: terms.locale, termId: terms.id, lastmod: max(entries.updatedAt) })
      .from(terms)
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .innerJoin(entryTerms, eq(entryTerms.termId, terms.id))
      .innerJoin(entries, eq(entries.id, entryTerms.entryId))
      .where(and(eq(taxonomies.slug, taxonomy), isVisible(false)))
      .groupBy(terms.locale, terms.id);
    const byLocale = new Map<string, { n: number; lastmod: Date | null }>();
    for (const g of groups) {
      const current = byLocale.get(g.locale) ?? { n: 0, lastmod: null };
      current.n += 1;
      if (g.lastmod && (!current.lastmod || g.lastmod > current.lastmod))
        current.lastmod = g.lastmod;
      byLocale.set(g.locale, current);
    }
    for (const [locale, g] of [...byLocale].sort(([a], [b]) => a.localeCompare(b))) {
      const pages = Math.ceil(g.n / PER_SITEMAP);
      for (let page = 1; page <= pages; page++) {
        items.push({
          loc: `${ctx.origin}/${name({ kind: 'taxonomy', slug: taxonomy }, locale, page)}`,
          lastmod: g.lastmod,
        });
      }
    }
  }

  const body = items
    .map(
      (i) =>
        `<sitemap><loc>${xml(i.loc)}</loc>${i.lastmod ? `<lastmod>${i.lastmod.toISOString()}</lastmod>` : ''}</sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${STYLESHEET}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** The newest change of each page of a long sitemap, in the order of the sitemap. */
async function pageDates(
  ctx: SitemapContext,
  type: string,
  locale: string,
  pages: number,
): Promise<(Date | null)[]> {
  const rows = await ctx.tx
    .select({ updatedAt: entries.updatedAt })
    .from(entries)
    .where(and(isVisible(false), eq(entries.typeSlug, type), eq(entries.locale, locale)))
    .orderBy(desc(entries.publishedAt), desc(entries.id));
  return Array.from({ length: pages }, (_, i) =>
    rows
      .slice(i * PER_SITEMAP, (i + 1) * PER_SITEMAP)
      .reduce<Date | null>(
        (latest, r) => (!latest || r.updatedAt > latest ? r.updatedAt : latest),
        null,
      ),
  );
}

/** One sitemap, or null when it does not exist. */
export async function sitemap(
  ctx: SitemapContext,
  kind: SitemapSource['kind'],
  slug: string,
  locale: string,
  page: number,
): Promise<string | null> {
  if (page < 1 || !ctx.data.locales.some((l) => l.code === locale)) return null;
  const allowed = await sources(ctx);
  if (!allowed.some((s) => s.kind === kind && s.slug === slug)) return null;
  const urls =
    kind === 'type'
      ? await entryUrls(ctx, slug, locale, page)
      : await termUrls(ctx, slug, locale, page);
  if (urls === null) return null;
  const listed = await ctx.filterUrls(urls, { kind, slug, locale });
  const body = listed
    .map((u) => {
      const images = u.images
        .map((src) => `<image:image><image:loc>${xml(src)}</image:loc></image:image>`)
        .join('');
      const alternates = u.alternates
        .map(
          (a) =>
            `<xhtml:link rel="alternate" hreflang="${xml(a.hreflang)}" href="${xml(a.href)}"/>`,
        )
        .join('');
      return `<url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${alternates}${images}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${STYLESHEET}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`;
}

const absolute = (ctx: SitemapContext, path: string) =>
  /^https?:\/\//.test(path) ? path : `${ctx.origin}${path}`;

async function entryUrls(
  ctx: SitemapContext,
  type: string,
  locale: string,
  page: number,
): Promise<SitemapUrl[] | null> {
  if (!ctx.data.types.some((t) => t.slug === type)) return null;
  const list = (
    await loadPublished(ctx.tx, and(eq(entries.typeSlug, type), eq(entries.locale, locale)), {
      limit: PER_SITEMAP,
      offset: (page - 1) * PER_SITEMAP,
    })
  ).filter((e) => !ctx.hidden.has(e.row.id));
  if (list.length === 0) return null;

  // Other languages (language plugin): alternates of each address.
  const links = await ctx.translations(list.map((e) => e.row.id));
  const otherIds = [...new Set([...links.values()].flat().map((l) => l.id))];
  const others =
    otherIds.length > 0 ? await loadPublished(ctx.tx, inArray(entries.id, otherIds)) : [];
  const byId = new Map(others.map((e) => [e.row.id, e]));
  const urlOf = (entry: PublishedEntry) =>
    absolute(
      ctx,
      ctx.front.has(entry.row.id)
        ? ctx.data.urls.home(entry.row.locale)
        : ctx.data.urls.entry(entry.row),
    );

  // Images: the featured image and those in the blocks.
  const imageRefs = new Map<string, { ids: string[]; urls: string[] }>();
  for (const entry of list) {
    const refs = { ids: [] as string[], urls: [] as string[] };
    if (entry.featuredMediaId) refs.ids.push(entry.featuredMediaId);
    collectImages(entry.document?.blocks ?? [], refs);
    imageRefs.set(entry.row.id, refs);
  }
  const mediaIds = [...new Set([...imageRefs.values()].flatMap((r) => r.ids))].filter((id) =>
    /^[0-9a-f-]{36}$/i.test(id),
  );
  const mediaUrls = new Map(
    mediaIds.length > 0
      ? (
          await ctx.tx
            .select({ id: media.id, key: media.storageKey, mime: media.mime })
            .from(media)
            .where(inArray(media.id, mediaIds))
        )
          .filter((m) => m.mime.startsWith('image/'))
          .map((m) => [m.id, `/media/${m.key}`])
      : [],
  );

  return list.map((entry) => {
    const alternates = [
      entry,
      ...(links.get(entry.row.id) ?? []).flatMap((l) => byId.get(l.id) ?? []),
    ].filter((a) => !ctx.hidden.has(a.row.id));
    const refs = imageRefs.get(entry.row.id)!;
    const images = [
      ...new Set(
        [...refs.ids.flatMap((id) => mediaUrls.get(id) ?? []), ...refs.urls]
          .filter((u) => u.startsWith('/') || /^https?:\/\//.test(u))
          .map((u) => absolute(ctx, u)),
      ),
    ];
    return {
      loc: urlOf(entry),
      lastmod: entry.row.updatedAt.toISOString(),
      images,
      alternates:
        alternates.length > 1
          ? alternates.map((a) => ({ hreflang: a.row.locale, href: urlOf(a) }))
          : [],
      entry: { id: entry.row.id, type: entry.row.typeSlug, fields: entry.fields },
    };
  });
}

/** Images of a document: image, cover, gallery and media-text blocks. */
function collectImages(blocks: CxdBlock[], refs: { ids: string[]; urls: string[] }): void {
  for (const block of blocks) {
    const a = block.attrs ?? {};
    const [id, url] =
      block.type === 'core/media-text'
        ? [a.mediaId, a.mediaUrl]
        : block.type === 'core/image' || block.type === 'core/cover'
          ? [a.id, a.url]
          : [null, null];
    if (typeof id === 'string') refs.ids.push(id);
    else if (typeof url === 'string') refs.urls.push(url);
    // Galleries, groups and columns hold their images as children.
    if (block.children) collectImages(block.children, refs);
  }
}

async function termUrls(
  ctx: SitemapContext,
  taxonomy: string,
  locale: string,
  page: number,
): Promise<SitemapUrl[] | null> {
  if (!ctx.data.taxonomies.includes(taxonomy)) return null;
  // Only terms with published content: empty archives are thin pages.
  const rows = await ctx.tx
    .select({ id: terms.id, slug: terms.slug, lastmod: max(entries.updatedAt) })
    .from(terms)
    .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
    .innerJoin(entryTerms, eq(entryTerms.termId, terms.id))
    .innerJoin(entries, eq(entries.id, entryTerms.entryId))
    .where(and(eq(taxonomies.slug, taxonomy), eq(terms.locale, locale), isVisible(false)))
    .groupBy(terms.id, terms.slug)
    .orderBy(asc(terms.slug))
    .limit(PER_SITEMAP)
    .offset((page - 1) * PER_SITEMAP);
  if (rows.length === 0) return null;
  return rows.map((r) => ({
    loc: absolute(ctx, ctx.data.urls.term(taxonomy, r.slug, locale)),
    lastmod: r.lastmod?.toISOString() ?? null,
    images: [],
    alternates: [],
    term: { id: r.id, taxonomy },
  }));
}

/** Makes the sitemaps readable in a browser; search engines ignore it. */
export const SITEMAP_XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  xmlns:xhtml="http://www.w3.org/1999/xhtml" exclude-result-prefixes="s image xhtml">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex,follow"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>XML Sitemap</title>
<style>
body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937;background:#f8fafc}
main{max-width:72rem;margin:0 auto;padding:2rem 1rem}
h1{font-size:1.6rem;margin:0 0 .5rem}
p{color:#475569;margin:.25rem 0 1.25rem}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
th,td{text-align:left;padding:.55rem .8rem;border-bottom:1px solid #f1f5f9;font-size:.9rem;vertical-align:top}
th{background:#0f4c81;color:#fff;font-weight:600}
tr:nth-child(even) td{background:#f8fafc}
a{color:#0f4c81;word-break:break-all}
.n{text-align:right;white-space:nowrap}
</style></head>
<body><main>
<h1>XML Sitemap</h1>
<p>This sitemap tells search engines such as Google and Bing which pages of the site to index. Submit <strong>/sitemap.xml</strong> in Google Search Console.</p>
<xsl:choose>
<xsl:when test="s:sitemapindex">
<p><xsl:value-of select="count(s:sitemapindex/s:sitemap)"/> sitemaps.</p>
<table><tr><th>Sitemap</th><th class="n">Last modified</th></tr>
<xsl:for-each select="s:sitemapindex/s:sitemap">
<tr><td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
<td class="n"><xsl:value-of select="concat(substring(s:lastmod,1,10),' ',substring(s:lastmod,12,5))"/></td></tr>
</xsl:for-each></table>
</xsl:when>
<xsl:otherwise>
<p><xsl:value-of select="count(s:urlset/s:url)"/> addresses. <a href="/sitemap.xml">All the sitemaps</a></p>
<table><tr><th>Address</th><th class="n">Images</th><th class="n">Languages</th><th class="n">Last modified</th></tr>
<xsl:for-each select="s:urlset/s:url">
<tr><td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
<td class="n"><xsl:value-of select="count(image:image)"/></td>
<td class="n"><xsl:value-of select="count(xhtml:link)"/></td>
<td class="n"><xsl:value-of select="concat(substring(s:lastmod,1,10),' ',substring(s:lastmod,12,5))"/></td></tr>
</xsl:for-each></table>
</xsl:otherwise>
</xsl:choose>
</main></body></html>
</xsl:template>
</xsl:stylesheet>
`;
