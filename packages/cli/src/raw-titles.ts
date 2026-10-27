/**
 * `entry:raw-titles` (core 0.90): since the WordPress Importer 1.35.0 (core
 * 0.88) an import keeps the title as written in WordPress beside the SEO
 * fields (`fields.seo.rawTitle`) when WordPress's typography (wptexturize:
 * ’ “ ” – — …) changed the one the page shows; the SEO and Vetta plugins put
 * it in <title> and og:title while the entry's title is still the imported
 * one (`searchTitle`). From the original export (WXR) this gives the entries
 * of a site imported before it the same.
 *
 * - Entries are found by what the import recorded (`import_refs`
 *   `post:<WordPress id>`), else by slug and content type.
 * - Only titles that differ from WordPress's by typography alone: a title an
 *   editor changed is left as it is (and reported). Titles are never changed.
 * - `fields.seo.rawTitle` is set on the entry's current and published
 *   revisions and its autosaves, other fields kept; older revisions are
 *   history. One database transaction; the site's page cache is cleared.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  auditLog,
  entries,
  importRefs,
  revisions,
  withSiteContext,
  type Database,
} from '@cleitext/db';
import { and, eq, inArray, isNotNull, like, or, sql } from 'drizzle-orm';
import { XMLParser } from 'fast-xml-parser';
import { findSite, refuseRoot } from './media-rename.js';
import { OperationError } from './operations.js';

// ---- The WordPress export ---------------------------------------------------------------

/** A post, page or other entry of the export, as read from it. */
export interface WxrTitle {
  /** `wp:post_id`. */
  id: number;
  /** `wp:post_type`. */
  type: string;
  /** The Cleitext content type an import makes of it (`post` → `article`). */
  entryType: string | null;
  /** `wp:post_name`, decoded. */
  slug: string;
  /** The title as written in WordPress (entities decoded, no typography). */
  rawTitle: string;
}

export interface WxrTitles {
  /** `import_refs.source` of an import of this export (`wordpress:example.com`). */
  source: string | null;
  items: WxrTitle[];
}

type Node = Record<string, unknown>;

/** As the importer reads a value. */
function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    const node = value as Node;
    return '#text' in node ? String(node['#text']) : '';
  }
  return String(value).trim();
}

const list = (value: unknown): Node[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]) as Node[];

/** HTML entities, as the WordPress Importer decodes titles (wxr.ts `decode`). */
function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function decodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Statuses the importer imports (trash, auto-draft and inherit are not). */
const IMPORTED_STATUS = new Set(['publish', 'draft', 'pending', 'private', 'future']);
/** Never entries. */
const NOT_ENTRIES = new Set(['attachment', 'nav_menu_item', 'product_variation', 'revision']);
/** Slugs the importer gives custom types another name for (`wp-<name>`). */
const RESERVED = new Set([
  'admin',
  'cl-admin',
  'admin-plugins',
  'plugin-assets',
  'api',
  'media',
  'health',
  'feed',
  'search',
  'page',
  'author',
  'account',
  'article',
  'category',
  'tag',
  'robots',
  'sitemap',
]);

/** The content type the WordPress Importer makes of a WordPress post type. */
export function entryTypeOf(type: string): string | null {
  if (type === 'post') return 'article';
  if (type === 'page' || type === 'e-landing-page') return 'page';
  if (type === 'product') return 'product';
  let slug = type
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 32);
  if (!slug) return null;
  if (RESERVED.has(slug)) slug = `wp-${slug}`.slice(0, 32);
  return /^[a-z][a-z0-9_-]{0,31}$/.test(slug) ? slug : null;
}

/** The titles of the posts, pages and other entries of a WordPress export (WXR 1.x). */
export function wxrTitles(xml: string): WxrTitles {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
    isArray: (name) => name === 'item',
  });
  let root: Node;
  try {
    root = parser.parse(xml) as Node;
  } catch {
    throw new OperationError('This is not a WordPress export (WXR) file.', 'invalid_wxr');
  }
  const channel = ((root.rss as Node | undefined)?.channel ?? null) as Node | null;
  if (!channel || !text(channel['wp:wxr_version']).startsWith('1.')) {
    throw new OperationError('This is not a WordPress export (WXR) file.', 'invalid_wxr');
  }
  const httpUrl = (value: string) => (/^https?:\/\/[^\s<>"']{1,2000}$/i.test(value) ? value : '');
  // As the importer names the source (importSource): host and path, lowercase.
  const base = (httpUrl(text(channel['wp:base_blog_url'])) || httpUrl(text(channel.link)))
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
  const items: WxrTitle[] = [];
  for (const item of list(channel.item)) {
    const type = text(item['wp:post_type']);
    if (!type || NOT_ENTRIES.has(type)) continue;
    if (!IMPORTED_STATUS.has(text(item['wp:status']))) continue;
    const idText = text(item['wp:post_id']);
    if (!/^\d{1,18}$/.test(idText)) continue;
    // As the importer keeps it (`rawTitle`): entities decoded, typography as written.
    const rawTitle = decodeEntities(text(item.title)).trim().slice(0, 500);
    if (!rawTitle) continue;
    items.push({
      id: Number(idText),
      type,
      entryType: entryTypeOf(type),
      slug: decodeUri(text(item['wp:post_name'])),
      rawTitle,
    });
  }
  return { source: base ? `wordpress:${base}`.slice(0, 500) : null, items };
}

/** A WordPress slug as Cleitext stores it (the server's `slugify`): `città` → `citta`. */
function slugOf(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Typographic characters as typed: ’ and ‘ as ', “ and ” as ", dashes as -,
 * … as ... (as the SEO plugins' `searchTitle` compares titles).
 */
export function typedTitle(value: string): string {
  return value
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Backfilling -------------------------------------------------------------------------

export interface RawTitlesInput {
  /** Site slug or id. */
  site: string;
  /** The WordPress export the site was imported from. */
  wxr: string;
  dryRun?: boolean | undefined;
  /** Where the JSON report goes; default next to the export. */
  report?: string | undefined;
  /** For tests. */
  now?: Date | undefined;
}

export type RawTitleAction =
  'set' | 'already' | 'same' | 'skipped:edited' | 'skipped:ambiguous' | 'not-found';

export interface RawTitleRow {
  wpId: number;
  wpType: string;
  slug: string;
  entryId: string | null;
  /** The entry's title now. */
  title: string | null;
  rawTitle: string;
  action: RawTitleAction;
  matchedBy: 'ref' | 'slug' | null;
  /** Revisions given the title (or that would be): current, published, autosaves. */
  revisions: number;
  reason?: string;
}

export interface RawTitlesResult {
  site: { id: string; slug: string };
  wxr: string;
  dryRun: boolean;
  entries: RawTitleRow[];
  counts: Record<RawTitleAction, number> & { revisions: number };
  /** The JSON report written (null in a dry run). */
  report: string | null;
  reportError?: string;
}

/** Thrown to roll a dry run's transaction back. */
class DryRun extends Error {}

interface SiteEntry {
  id: string;
  type: string;
  slug: string;
  title: string;
  current: string | null;
  published: string | null;
}

const REASONS: Partial<Record<RawTitleAction, string>> = {
  same: "the title is WordPress's as written: nothing to keep",
  already: 'the title as written is kept already',
  'skipped:edited': "the title was changed since the import: the entry's own title is used",
  'skipped:ambiguous': 'more than one entry has this slug and type',
  'not-found': 'no entry of the site was imported from it',
};

/**
 * Gives the entries of a site imported from WordPress before core 0.88 their
 * title as written in WordPress for search results (see the top of this file).
 */
export async function backfillRawTitles(
  db: Database,
  input: RawTitlesInput,
): Promise<RawTitlesResult> {
  refuseRoot();
  const dryRun = Boolean(input.dryRun);
  const now = input.now ?? new Date();
  const site = await findSite(db, input.site);
  const wxrFile = path.resolve(input.wxr);
  let xml: string;
  try {
    xml = await readFile(wxrFile, 'utf8');
  } catch {
    throw new OperationError(`Cannot read the export ${wxrFile}.`, 'not_found');
  }
  const wxr = wxrTitles(xml);
  const result: RawTitlesResult = {
    site,
    wxr: wxrFile,
    dryRun,
    entries: [],
    counts: {
      set: 0,
      already: 0,
      same: 0,
      'skipped:edited': 0,
      'skipped:ambiguous': 0,
      'not-found': 0,
      revisions: 0,
    },
    report: null,
  };

  try {
    await withSiteContext(db, site.id, async (tx) => {
      const rows: SiteEntry[] = await tx
        .select({
          id: entries.id,
          type: entries.typeSlug,
          slug: entries.slug,
          title: entries.title,
          current: entries.currentRevisionId,
          published: entries.publishedRevisionId,
        })
        .from(entries)
        .where(eq(entries.siteId, site.id));
      const byId = new Map(rows.map((e) => [e.id, e]));
      const types = new Set(rows.map((e) => e.type));
      const refs = await tx
        .select({ source: importRefs.source, ref: importRefs.ref, entryId: importRefs.entryId })
        .from(importRefs)
        .where(
          and(
            eq(importRefs.siteId, site.id),
            like(importRefs.ref, 'post:%'),
            isNotNull(importRefs.entryId),
          ),
        );
      const byRef = new Map<number, { source: string; entryId: string }[]>();
      for (const r of refs) {
        const id = Number(r.ref.slice(5));
        if (!Number.isSafeInteger(id) || !byId.has(r.entryId!)) continue;
        byRef.set(id, [...(byRef.get(id) ?? []), { source: r.source, entryId: r.entryId! }]);
      }

      const plans: { row: RawTitleRow; entry: SiteEntry }[] = [];
      for (const item of wxr.items) {
        const row: RawTitleRow = {
          wpId: item.id,
          wpType: item.type,
          slug: item.slug,
          entryId: null,
          title: null,
          rawTitle: item.rawTitle,
          action: 'not-found',
          matchedBy: null,
          revisions: 0,
        };
        // 1. What the import recorded: this export's own rows first.
        const recorded = byRef.get(item.id) ?? [];
        const own = recorded.filter((r) => r.source === wxr.source);
        const ids = new Set((own.length ? own : recorded).map((r) => r.entryId));
        let entry: SiteEntry | undefined;
        if (ids.size === 1) {
          entry = byId.get([...ids][0]!);
          row.matchedBy = 'ref';
        } else if (ids.size > 1) {
          row.action = 'skipped:ambiguous';
          row.reason = 'imported from more than one site with this id: cannot tell which entry';
        } else {
          // 2. Older imports without refs: slug and type, then the title when that is not enough.
          if (!item.entryType || !types.has(item.entryType)) continue; // not content of this site
          const slugs = new Set([item.slug.toLowerCase(), slugOf(item.slug)]);
          let found = rows.filter((e) => e.type === item.entryType && slugs.has(e.slug));
          if (found.length > 1) {
            found = found.filter((e) => typedTitle(e.title) === typedTitle(item.rawTitle));
          }
          if (found.length === 1) {
            entry = found[0];
            row.matchedBy = 'slug';
          } else if (found.length > 1) {
            row.action = 'skipped:ambiguous';
          }
        }
        if (entry) {
          row.entryId = entry.id;
          row.title = entry.title;
          if (entry.title === item.rawTitle) row.action = 'same';
          else if (typedTitle(entry.title) !== typedTitle(item.rawTitle)) {
            row.action = 'skipped:edited';
          } else {
            row.action = 'already';
            plans.push({ row, entry });
          }
        }
        if (row.action !== 'already' && !row.reason && REASONS[row.action]) {
          row.reason = REASONS[row.action];
        }
        result.entries.push(row);
      }

      // The revisions the entries show and the editor opens.
      const entryIds = plans.map((p) => p.entry.id);
      const revisionIds = plans.flatMap((p) =>
        [p.entry.current, p.entry.published].filter((id): id is string => Boolean(id)),
      );
      const revs = entryIds.length
        ? await tx
            .select({
              id: revisions.id,
              entryId: revisions.entryId,
              title: revisions.title,
              fields: revisions.fields,
            })
            .from(revisions)
            .where(
              and(
                eq(revisions.siteId, site.id),
                or(
                  revisionIds.length ? inArray(revisions.id, revisionIds) : sql`false`,
                  and(inArray(revisions.entryId, entryIds), eq(revisions.kind, 'autosave')),
                ),
              ),
            )
        : [];
      const revsOf = new Map<string, typeof revs>();
      for (const r of revs) revsOf.set(r.entryId, [...(revsOf.get(r.entryId) ?? []), r]);
      let changedEntries = 0;
      for (const { row, entry } of plans) {
        for (const rev of revsOf.get(entry.id) ?? []) {
          // Each revision by its own title: one an editor retitled keeps its own.
          if (typedTitle(rev.title) !== typedTitle(row.rawTitle) || rev.title === row.rawTitle) {
            continue;
          }
          const fields = (
            rev.fields && typeof rev.fields === 'object' && !Array.isArray(rev.fields)
              ? rev.fields
              : {}
          ) as Record<string, unknown>;
          const seo = fields.seo;
          const seoObject = (
            seo && typeof seo === 'object' && !Array.isArray(seo) ? seo : {}
          ) as Record<string, unknown>;
          const kept = seoObject.rawTitle;
          if (typeof kept === 'string' && typedTitle(kept) === typedTitle(rev.title)) continue;
          await tx
            .update(revisions)
            .set({ fields: { ...fields, seo: { ...seoObject, rawTitle: row.rawTitle } } })
            .where(and(eq(revisions.siteId, site.id), eq(revisions.id, rev.id)));
          row.revisions++;
        }
        if (row.revisions) {
          row.action = 'set';
          changedEntries++;
          result.counts.revisions += row.revisions;
        } else {
          row.reason = REASONS.already;
        }
      }
      if (changedEntries) {
        await tx.insert(auditLog).values({
          siteId: site.id,
          userId: null,
          action: 'entries.raw_titles',
          targetType: 'site',
          targetId: site.id,
          meta: { entries: changedEntries, revisions: result.counts.revisions, via: 'cli' },
          ip: null,
        });
      }
      if (dryRun) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  for (const row of result.entries) result.counts[row.action]++;

  if (!dryRun) {
    // Titles in <title> and social tags of cached pages.
    if (result.counts.set) {
      const payload = JSON.stringify({ siteId: site.id, tags: ['site'] });
      await db.execute(sql`select pg_notify('cleitext_cache', ${payload})`);
    }
    const file = input.report
      ? path.resolve(input.report)
      : path.join(
          path.dirname(wxrFile),
          `${path.basename(wxrFile).replace(/\.xml$/i, '')}.raw-titles-${now.toISOString().replace(/[:.]/g, '-')}.json`,
        );
    try {
      result.report = file;
      await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o640 });
    } catch (error) {
      // The titles are kept: a report that cannot be written does not undo it.
      result.report = null;
      result.reportError = `The report could not be written to ${file}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return result;
}

/** The report of a backfill, for people. */
export function rawTitlesText(r: RawTitlesResult): string[] {
  const lines: string[] = [];
  for (const e of r.entries) {
    if (e.action === 'same') continue;
    const action =
      e.action === 'set' && r.dryRun
        ? `would set (${e.revisions} revision(s))`
        : e.action === 'set'
          ? `set (${e.revisions} revision(s))`
          : e.action;
    lines.push(
      `${e.slug || `#${e.wpId}`} (${e.wpType} ${e.wpId}): "${e.title ?? '-'}" / "${e.rawTitle}" → ${action}${e.reason && e.action !== 'set' ? `: ${e.reason}` : ''}`,
    );
  }
  const c = r.counts;
  lines.push(
    `${c.set} entr${c.set === 1 ? 'y' : 'ies'} ${r.dryRun ? 'would get' : 'got'} WordPress's title for search results (${c.revisions} revision(s)); ${c.already} already had it, ${c.same} need none, ${c['skipped:edited']} retitled since the import, ${c['skipped:ambiguous']} ambiguous, ${c['not-found']} not found.`,
  );
  if (r.dryRun) lines.push('Dry run: nothing was changed. Run again without --dry-run to apply.');
  if (r.report) lines.push(`Report: ${r.report}`);
  if (r.reportError) lines.push(r.reportError);
  return lines;
}
