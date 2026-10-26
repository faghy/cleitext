/**
 * `media:rename-imported` and `media:purge-renamed` (core 0.86): the media
 * of a site imported from WordPress before core 0.85 are stored under a
 * generated name (`<site>/2026/10/<uuid>.jpg`, in the month of the import).
 * From the original export (WXR) this gives them WordPress's name and
 * year/month folder, as core 0.85 does for new imports
 * (`<site>/2015/07/photo.jpg`), with the same names, made safe the same way
 * and with the same `-1`, `-2`… when taken (`@cleitext/shared`
 * storage-names.ts, `takenMediaNames`).
 *
 * - Files are copied, never moved, with exclusive create; the old file
 *   stays for the grace period (`media_renames.delete_after`) and
 *   `media:purge-renamed` removes it afterwards. A request for the old
 *   address whose file is gone answers 301 to the new one (the server's
 *   `/media` not-found handler reads `media_renames`).
 * - One database transaction per site: storage keys of media and variants,
 *   the old WordPress addresses (`import_refs` `path:` rows, so
 *   `/wp-content/uploads/…` redirects), `media_renames` and the addresses in
 *   stored content. If it fails, the copies made are removed and nothing
 *   changed.
 * - Content: `/media/<old key>` (absolute or relative) becomes
 *   `/media/<new key>` in the entries' current and published revisions and
 *   their autosaves, in every setting of the site (Additional CSS, theme
 *   values, block areas, plugin settings), menus, terms, patterns and
 *   options pages. Older revisions keep their history: restoring one brings
 *   back old addresses, which keep working through the 301.
 */
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  auditLog,
  importRefs,
  media,
  mediaRenames,
  mediaVariants,
  sites,
  takenMediaNames,
  withSiteContext,
  type Database,
  type SiteTransaction,
} from '@cleitext/db';
import {
  claimStorageKey,
  claimVariantKey,
  isGeneratedStorageKey,
  mediaFolder,
  mediaUrlKey,
  sourceUrlPaths,
  storageBaseName,
  uploadsFolderDate,
} from '@cleitext/shared';
import { and, eq, inArray, isNull, like, lte, sql } from 'drizzle-orm';
import { XMLParser } from 'fast-xml-parser';
import { OperationError } from './operations.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Days the old files stay by default. */
export const DEFAULT_GRACE_DAYS = 30;

// ---- Safety -------------------------------------------------------------------------------

/**
 * Files made by root in the domain's folders break Plesk backups and the
 * application's own writes: the media commands run as the domain's user.
 */
export function refuseRoot(): void {
  if (process.getuid?.() === 0) {
    throw new OperationError(
      'Do not run this as root: the files it makes would belong to root, which breaks Plesk backups and later uploads. Run it as the domain user (for example: sudo -u <domain user> bin/cleitext …).',
      'run_as_root',
    );
  }
}

// ---- The WordPress export ---------------------------------------------------------------

/** An attachment of the export, as read from it (every value checked). */
export interface WxrAttachment {
  /** `wp:post_id`. */
  id: number;
  /** Its addresses on the old site: `wp:attachment_url`, and `guid` when it is the file's. */
  urls: string[];
  /** The file's name on the old site, decoded (`Città.jpg`). */
  filename: string;
  /** Year and month of its uploads folder (or upload date), when known. */
  date: Date | undefined;
  /** Size in bytes from WordPress's metadata, when it has one. */
  size: number | undefined;
}

export interface WxrMedia {
  /** `import_refs.source` of an import of this export (`wordpress:example.com`). */
  source: string | null;
  attachments: WxrAttachment[];
}

type Node = Record<string, unknown>;

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    const node = value as Node;
    return '#text' in node ? String(node['#text']).trim() : '';
  }
  return String(value).trim();
}

const list = (value: unknown): Node[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]) as Node[];

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** An http(s) address of at most 2000 characters, else ''. */
function httpUrl(value: string): string {
  return /^https?:\/\/[^\s<>"']{1,2000}$/i.test(value) ? value : '';
}

/** The attachments of a WordPress export (WXR 1.x). */
export function wxrMedia(xml: string): WxrMedia {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
    isArray: (name) => name === 'item' || name === 'wp:postmeta',
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
  // As the importer names the source (importSource): host and path, lowercase.
  const base = (httpUrl(text(channel['wp:base_blog_url'])) || httpUrl(text(channel.link)))
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
  const attachments: WxrAttachment[] = [];
  for (const item of list(channel.item)) {
    if (text(item['wp:post_type']) !== 'attachment') continue;
    const idText = text(item['wp:post_id']);
    if (!/^\d{1,18}$/.test(idText)) continue;
    const url = httpUrl(text(item['wp:attachment_url']));
    if (!url) continue;
    const meta = new Map(
      list(item['wp:postmeta']).map((m) => [text(m['wp:meta_key']), text(m['wp:meta_value'])]),
    );
    const guid = httpUrl(text(item.guid));
    const urls = [url];
    if (guid && guid !== url && /\/wp-content\/uploads\/[^?#]+\.[a-z0-9]{1,5}$/i.test(guid)) {
      urls.push(guid);
    }
    const attached = meta.get('_wp_attached_file') ?? '';
    // The name of its address, as the importer takes it (and older imports stored it).
    const filename = (
      decode(
        url
          .replace(/[?#].*$/, '')
          .split('/')
          .pop() ?? '',
      ) || decode(attached.split('/').pop() ?? '')
    ).slice(0, 500);
    const gmt = text(item['wp:post_date_gmt']);
    const date =
      uploadsFolderDate(url) ??
      (/^\d{4}\/\d{2}\/[^/]+$/.test(attached)
        ? uploadsFolderDate(`/uploads/${attached}`)
        : undefined) ??
      (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(gmt) && !gmt.startsWith('0000')
        ? new Date(`${gmt.replace(' ', 'T')}Z`)
        : undefined);
    const size = /s:8:"filesize";i:(\d{1,15});/.exec(meta.get('_wp_attachment_metadata') ?? '');
    attachments.push({
      id: Number(idText),
      urls,
      filename: filename || `file-${idText}`,
      date: date && !Number.isNaN(date.getTime()) ? date : undefined,
      size: size ? Number(size[1]) : undefined,
    });
  }
  return { source: base ? `wordpress:${base}`.slice(0, 500) : null, attachments };
}

// ---- Renaming ------------------------------------------------------------------------------

export interface RenameImportedInput {
  /** Site slug or id. */
  site: string;
  /** The WordPress export the site was imported from. */
  wxr: string;
  /** The media folder (MEDIA_PATH). */
  mediaPath: string;
  dryRun?: boolean | undefined;
  /** Days the old files stay before `media:purge-renamed` removes them. */
  graceDays?: number | undefined;
  /** Where the JSON report goes; default next to the export. */
  report?: string | undefined;
  /** For tests. */
  now?: Date | undefined;
}

export interface RenamedMedia {
  mediaId: string;
  wpId: number;
  matchedBy: 'ref' | 'filename' | 'filename+size';
  from: string;
  to: string;
  variants: { from: string; to: string }[];
}

export interface RenameImportedResult {
  site: { id: string; slug: string };
  wxr: string;
  dryRun: boolean;
  /** No media of the site has a generated name: nothing to do. */
  alreadyFixed: boolean;
  graceDays: number;
  /** When `media:purge-renamed` may remove the old files. */
  deleteAfter: string;
  renamed: RenamedMedia[];
  counts: { media: number; variants: number; oldAddresses: number };
  skipped: { mediaId: string; wpId: number; key: string; reason: string }[];
  unmatched: { wpId: number; url: string; reason: string }[];
  /** Rows whose text changed, and addresses replaced, by table. */
  references: Record<string, { rows: number; addresses: number }>;
  /** The JSON report written (null in a dry run). */
  report: string | null;
  /** Why the report could not be written (the renaming is done all the same). */
  reportError?: string;
}

interface SiteMedia {
  id: string;
  key: string;
  filename: string;
  size: number;
  variants: { variant: string; format: string; key: string }[];
}

/** Thrown to roll a dry run's transaction back. */
class DryRun extends Error {}

/** Finds a site by slug or id. */
async function findSite(db: Database, ref: string): Promise<{ id: string; slug: string }> {
  const value = ref.trim();
  const [site] = await db
    .select({ id: sites.id, slug: sites.slug })
    .from(sites)
    .where(UUID_RE.test(value) ? eq(sites.id, value.toLowerCase()) : eq(sites.slug, value));
  if (!site) throw new OperationError(`No site "${value}".`, 'not_found');
  return site;
}

/** The absolute path of a storage key, always inside the media folder. */
function fileOf(root: string, key: string): string {
  const base = path.resolve(root);
  const file = path.resolve(base, key);
  if (!file.startsWith(base + path.sep)) throw new Error(`Invalid storage key: ${key}`);
  return file;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gives the media of a site imported from WordPress before core 0.85
 * WordPress's names and folders (see the top of this file).
 */
export async function renameImportedMedia(
  db: Database,
  input: RenameImportedInput,
): Promise<RenameImportedResult> {
  refuseRoot();
  const dryRun = Boolean(input.dryRun);
  const graceDays = input.graceDays ?? DEFAULT_GRACE_DAYS;
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 3650) {
    throw new OperationError('--grace-days: a whole number of days, 0 to 3650.', 'invalid_option');
  }
  const now = input.now ?? new Date();
  const deleteAfter = new Date(now.getTime() + graceDays * 86_400_000);
  const site = await findSite(db, input.site);
  const wxrFile = path.resolve(input.wxr);
  let xml: string;
  try {
    xml = await readFile(wxrFile, 'utf8');
  } catch {
    throw new OperationError(`Cannot read the export ${wxrFile}.`, 'not_found');
  }
  const wxr = wxrMedia(xml);

  const result: RenameImportedResult = {
    site,
    wxr: wxrFile,
    dryRun,
    alreadyFixed: false,
    graceDays,
    deleteAfter: deleteAfter.toISOString(),
    renamed: [],
    counts: { media: 0, variants: 0, oldAddresses: 0 },
    skipped: [],
    unmatched: [],
    references: {},
    report: null,
  };

  // The site's media, their variants and what the import recorded.
  const { library, refs } = await withSiteContext(db, site.id, async (tx) => {
    const rows = await tx
      .select({
        id: media.id,
        key: media.storageKey,
        filename: media.filename,
        size: media.sizeBytes,
      })
      .from(media)
      .where(eq(media.siteId, site.id));
    const variants = await tx
      .select({
        mediaId: mediaVariants.mediaId,
        variant: mediaVariants.variant,
        format: mediaVariants.format,
        key: mediaVariants.storageKey,
      })
      .from(mediaVariants)
      .where(eq(mediaVariants.siteId, site.id));
    const library = new Map<string, SiteMedia>(rows.map((r) => [r.id, { ...r, variants: [] }]));
    for (const v of variants) library.get(v.mediaId)?.variants.push(v);
    const refs = await tx
      .select({ source: importRefs.source, ref: importRefs.ref, mediaId: importRefs.mediaId })
      .from(importRefs)
      .where(and(eq(importRefs.siteId, site.id), like(importRefs.ref, 'att:%')));
    return { library, refs };
  });

  if (![...library.values()].some((m) => isGeneratedStorageKey(m.key))) {
    result.alreadyFixed = true;
    return result;
  }

  // ---- 1. Which media item each attachment became -----------------------------------------
  const byRef = new Map<number, { source: string; mediaId: string }[]>();
  for (const r of refs) {
    if (!r.mediaId) continue;
    const id = Number(r.ref.slice(4));
    if (!Number.isSafeInteger(id)) continue;
    byRef.set(id, [...(byRef.get(id) ?? []), { source: r.source, mediaId: r.mediaId }]);
  }
  const matched = new Map<
    number,
    { item: SiteMedia; by: RenamedMedia['matchedBy']; source: string | null }
  >();
  const taken = new Set<string>();
  const unmatched: WxrAttachment[] = [];
  for (const att of wxr.attachments) {
    const rows = (byRef.get(att.id) ?? []).filter((r) => library.has(r.mediaId));
    const own = rows.filter((r) => r.source === wxr.source);
    const pick = own.length ? own : rows;
    const ids = new Set(pick.map((r) => r.mediaId));
    if (ids.size > 1) {
      result.unmatched.push({
        wpId: att.id,
        url: att.urls[0]!,
        reason: 'imported from more than one site with this id: cannot tell which media item',
      });
      continue;
    }
    const [id] = ids;
    if (!id) {
      unmatched.push(att);
      continue;
    }
    if (taken.has(id)) {
      result.unmatched.push({
        wpId: att.id,
        url: att.urls[0]!,
        reason: 'its media item belongs to another attachment of the export',
      });
      continue;
    }
    taken.add(id);
    matched.set(att.id, { item: library.get(id)!, by: 'ref', source: pick[0]!.source });
  }
  // Older imports without refs: by file name, then by size.
  for (const att of unmatched) {
    let found = [...library.values()].filter(
      (m) => !taken.has(m.id) && isGeneratedStorageKey(m.key) && m.filename === att.filename,
    );
    let by: RenamedMedia['matchedBy'] = 'filename';
    if (found.length > 1 && att.size !== undefined) {
      found = found.filter((m) => m.size === att.size);
      by = 'filename+size';
    }
    if (found.length !== 1) {
      result.unmatched.push({
        wpId: att.id,
        url: att.urls[0]!,
        reason: found.length
          ? `${found.length} media files have the name ${att.filename}: cannot tell which`
          : 'no media item of the site was imported from it',
      });
      continue;
    }
    taken.add(found[0]!.id);
    matched.set(att.id, { item: found[0]!, by, source: null });
  }

  // ---- 2–3. New names, and copies of the files ----------------------------------------------
  const attachments = new Map(wxr.attachments.map((a) => [a.id, a]));
  /** Keys claimed by this run, not yet in the database. */
  const claimed = new Set<string>();
  /** Files copied by this run (removed again if it fails). */
  const copies: string[] = [];
  const plans: (RenamedMedia & { variantRows: { variant: string; format: string }[] })[] = [];

  for (const [wpId, { item, by }] of matched) {
    if (!isGeneratedStorageKey(item.key)) {
      result.skipped.push({
        mediaId: item.id,
        wpId,
        key: item.key,
        reason: 'not a generated name: already renamed, or named by hand',
      });
      continue;
    }
    const att = attachments.get(wpId)!;
    const [, year, month] = /^[^/]+\/(\d{4})\/(\d{2})\//.exec(item.key)!;
    const folder = mediaFolder(
      site.id,
      att.date ?? new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
    );
    const name = storageBaseName(att.filename);
    const ext = /\.([a-z0-9]+)$/i.exec(item.key)![1]!.toLowerCase();
    const made: string[] = [];
    /** Copies a file (or, in a dry run, checks the name is free) without replacing any. */
    const place =
      (source: string) =>
      async (key: string): Promise<boolean> => {
        if (claimed.has(key)) return false;
        const target = fileOf(input.mediaPath, key);
        if (dryRun) {
          if (await exists(target)) return false;
        } else {
          await mkdir(path.dirname(target), { recursive: true });
          try {
            await copyFile(fileOf(input.mediaPath, source), target, constants.COPYFILE_EXCL);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
            throw error;
          }
          made.push(target);
        }
        claimed.add(key);
        return true;
      };
    try {
      if (!dryRun && !(await exists(fileOf(input.mediaPath, item.key)))) {
        throw new Error('its file is missing from the media folder');
      }
      const busy = await withSiteContext(db, site.id, (tx) => takenMediaNames(tx, folder, name));
      for (const key of claimed) {
        if (key.startsWith(`${folder}/`))
          busy.add(key.slice(folder.length + 1).replace(/\.[^.]*$/, ''));
      }
      const newKey = await claimStorageKey(folder, name, ext, busy, place(item.key));
      if (!newKey) throw new Error(`a thousand files are already named ${name} in ${folder}`);
      const oldBase = item.key.replace(/\.[^.]*$/, '');
      const newBase = newKey.replace(/\.[^.]*$/, '');
      const variants: { from: string; to: string }[] = [];
      for (const v of item.variants) {
        const suffix = v.key.startsWith(`${oldBase}-`)
          ? v.key.slice(oldBase.length).replace(/\.[^.]*$/, '')
          : `-${storageBaseName(v.variant)}`;
        const source = v.key;
        if (!dryRun && !(await exists(fileOf(input.mediaPath, source)))) {
          throw new Error(`the file of its variant ${v.variant} (${v.format}) is missing`);
        }
        const key = await claimVariantKey(`${newBase}${suffix}`, v.format, place(source));
        if (!key) throw new Error(`no free name for its variant ${v.variant}`);
        variants.push({ from: v.key, to: key });
      }
      plans.push({
        mediaId: item.id,
        wpId,
        matchedBy: by,
        from: item.key,
        to: newKey,
        variants,
        variantRows: item.variants.map((v) => ({ variant: v.variant, format: v.format })),
      });
      copies.push(...made);
    } catch (error) {
      // This media item's copies go; the others go on.
      await Promise.all(made.map((file) => rm(file, { force: true })));
      for (const file of made) claimed.delete(path.relative(path.resolve(input.mediaPath), file));
      result.skipped.push({
        mediaId: item.id,
        wpId,
        key: item.key,
        reason: `not copied: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // ---- 4–6. One transaction: keys, old addresses, redirects, content --------------------------
  const keyMap = new Map<string, string>();
  for (const p of plans) {
    keyMap.set(p.from, p.to);
    for (const v of p.variants) keyMap.set(v.from, v.to);
  }
  try {
    await withSiteContext(db, site.id, async (tx) => {
      for (const p of plans) {
        const moved = await tx
          .update(media)
          .set({ storageKey: p.to })
          .where(
            and(eq(media.siteId, site.id), eq(media.id, p.mediaId), eq(media.storageKey, p.from)),
          )
          .returning({ id: media.id });
        if (moved.length !== 1) {
          throw new OperationError(
            `The media item ${p.mediaId} changed while renaming: run the command again.`,
            'conflict',
          );
        }
        for (const [i, v] of p.variants.entries()) {
          const row = p.variantRows[i]!;
          await tx
            .update(mediaVariants)
            .set({ storageKey: v.to })
            .where(
              and(
                eq(mediaVariants.siteId, site.id),
                eq(mediaVariants.mediaId, p.mediaId),
                eq(mediaVariants.variant, row.variant),
                eq(mediaVariants.format, row.format),
              ),
            );
        }
        await tx
          .insert(mediaRenames)
          .values(
            [{ from: p.from, to: p.to }, ...p.variants].map((r) => ({
              siteId: site.id,
              oldKey: r.from,
              newKey: r.to,
              mediaId: p.mediaId,
              deleteAfter,
            })),
          )
          .onConflictDoUpdate({
            target: [mediaRenames.siteId, mediaRenames.oldKey],
            set: { newKey: sql`excluded.new_key`, deleteAfter, purgedAt: null },
          });
      }
      // The old WordPress addresses of every media item found, for the 301s.
      for (const [wpId, { item, source }] of matched) {
        result.counts.oldAddresses += await recordOldAddresses(
          tx,
          site.id,
          source ?? wxr.source ?? 'wordpress:',
          attachments.get(wpId)!.urls,
          item.id,
        );
      }
      result.references = await rewriteContent(tx, site.id, keyMap);
      if (plans.length) {
        await tx.insert(auditLog).values({
          siteId: site.id,
          userId: null,
          action: 'media.renamed',
          targetType: 'site',
          targetId: site.id,
          meta: {
            media: plans.length,
            variants: plans.reduce((n, p) => n + p.variants.length, 0),
            deleteAfter: deleteAfter.toISOString(),
            via: 'cli',
          },
          ip: null,
        });
      }
      if (dryRun) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) {
      await Promise.all(copies.map((file) => rm(file, { force: true })));
      throw error;
    }
  }

  result.renamed = plans.map(({ variantRows: _, ...p }) => ({
    ...p,
    from: `/media/${p.from}`,
    to: `/media/${p.to}`,
    variants: p.variants.map((v) => ({ from: `/media/${v.from}`, to: `/media/${v.to}` })),
  }));
  result.counts.media = plans.length;
  result.counts.variants = plans.reduce((n, p) => n + p.variants.length, 0);

  if (!dryRun) {
    // Pages showing the media, and their cached copies.
    if (plans.length) {
      const payload = JSON.stringify({ siteId: site.id, tags: ['site'] });
      await db.execute(sql`select pg_notify('cleitext_cache', ${payload})`);
    }
    const file = input.report
      ? path.resolve(input.report)
      : path.join(
          path.dirname(wxrFile),
          `${path.basename(wxrFile).replace(/\.xml$/i, '')}.media-rename-${now.toISOString().replace(/[:.]/g, '-')}.json`,
        );
    try {
      result.report = file;
      await writeFile(file, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o640 });
    } catch (error) {
      // The renaming is done: a report that cannot be written does not undo it.
      result.report = null;
      result.reportError = `The report could not be written to ${file}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return result;
}

/**
 * Records the old addresses of a media item (`path:/wp-content/uploads/…`,
 * and the same without the size of WordPress's copies) when missing, as an
 * import of core 0.85 does; how many were added.
 */
async function recordOldAddresses(
  tx: SiteTransaction,
  siteId: string,
  source: string,
  urls: string[],
  mediaId: string,
): Promise<number> {
  const refs = new Set<string>();
  for (const p of sourceUrlPaths(urls)) {
    refs.add(`path:${p}`);
    refs.add(`path:${mediaUrlKey(p)}`);
  }
  if (refs.size === 0) return 0;
  const added = await tx
    .insert(importRefs)
    .values([...refs].map((ref) => ({ siteId, source, ref, mediaId })))
    .onConflictDoNothing()
    .returning({ ref: importRefs.ref });
  return added.length;
}

/** Stored text holding media addresses, by table: its key and its columns. */
const CONTENT: {
  table: string;
  key: string[];
  columns: { name: string; json: boolean }[];
  /** Only these rows (SQL on the table, the site id as $siteId). */
  only?: (siteId: string) => ReturnType<typeof sql>;
}[] = [
  {
    table: 'revisions',
    key: ['id'],
    columns: [
      { name: 'document', json: true },
      { name: 'fields', json: true },
      { name: 'excerpt', json: false },
    ],
    // What the entries show and what the editor opens; older revisions are history.
    only: (siteId) => sql`(kind = 'autosave' or id in (
      select current_revision_id from entries where site_id = ${siteId} and current_revision_id is not null
      union select published_revision_id from entries where site_id = ${siteId} and published_revision_id is not null))`,
  },
  { table: 'settings', key: ['namespace', 'key'], columns: [{ name: 'value', json: true }] },
  {
    table: 'menu_items',
    key: ['id'],
    columns: [
      { name: 'url', json: false },
      { name: 'attrs', json: true },
      { name: 'data', json: true },
    ],
  },
  {
    table: 'terms',
    key: ['id'],
    columns: [
      { name: 'description', json: false },
      { name: 'fields', json: true },
    ],
  },
  { table: 'patterns', key: ['id'], columns: [{ name: 'document', json: true }] },
  { table: 'option_values', key: ['page', 'locale'], columns: [{ name: 'fields', json: true }] },
];

/**
 * Replaces `/media/<old key>` with `/media/<new key>` in the site's stored
 * content (exact keys only, absolute and relative addresses alike, as the
 * path is part of both): rows and addresses changed, by table.
 */
async function rewriteContent(
  tx: SiteTransaction,
  siteId: string,
  keys: Map<string, string>,
): Promise<Record<string, { rows: number; addresses: number }>> {
  const counts: Record<string, { rows: number; addresses: number }> = {};
  if (keys.size === 0) return counts;
  const address = new RegExp(
    `/media/(${siteId}/\\d{4}/\\d{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-[a-z0-9_-]+)?\\.[a-z0-9]+)`,
    'g',
  );
  const needle = `%/media/${siteId}/%`;
  for (const target of CONTENT) {
    const columns = target.columns.map((c) =>
      c.json ? sql`${sql.identifier(c.name)}::text` : sql.identifier(c.name),
    );
    const anyColumn = sql.join(
      target.columns.map((c) =>
        c.json
          ? sql`${sql.identifier(c.name)}::text like ${needle}`
          : sql`${sql.identifier(c.name)} like ${needle}`,
      ),
      sql` or `,
    );
    const rows = (await tx.execute(sql`
      select ${sql.join(
        [...target.key.map((k) => sql.identifier(k)), ...columns].map(
          (c, i) => sql`${c} as ${sql.identifier(`c${i}`)}`,
        ),
        sql`, `,
      )}
      from ${sql.identifier(target.table)}
      where ${sql.join(
        [
          sql`site_id = ${siteId}`,
          sql`(${anyColumn})`,
          ...(target.only ? [target.only(siteId)] : []),
        ],
        sql` and `,
      )}
    `)) as unknown as Record<string, string | null>[];
    let changedRows = 0;
    let replaced = 0;
    for (const row of rows) {
      const sets = [];
      for (const [i, column] of target.columns.entries()) {
        const before = row[`c${target.key.length + i}`];
        if (typeof before !== 'string') continue;
        let n = 0;
        const after = before.replace(address, (match, key: string) => {
          const to = keys.get(key);
          if (!to) return match;
          n++;
          return `/media/${to}`;
        });
        if (n === 0) continue;
        replaced += n;
        sets.push(
          column.json
            ? sql`${sql.identifier(column.name)} = ${after}::jsonb`
            : sql`${sql.identifier(column.name)} = ${after}`,
        );
      }
      if (sets.length === 0) continue;
      changedRows++;
      const where = sql.join(
        target.key.map((k, i) => sql`${sql.identifier(k)} = ${row[`c${i}`]}`),
        sql` and `,
      );
      await tx.execute(sql`
        update ${sql.identifier(target.table)} set ${sql.join(sets, sql`, `)}
        where site_id = ${siteId} and ${where}
      `);
    }
    if (changedRows) counts[target.table] = { rows: changedRows, addresses: replaced };
  }
  return counts;
}

// ---- Purging the old files -------------------------------------------------------------

export interface PurgeRenamedInput {
  /** Site slug or id; every site when absent. */
  site?: string | undefined;
  mediaPath: string;
  dryRun?: boolean | undefined;
  /** For tests. */
  now?: Date | undefined;
}

export interface PurgeRenamedResult {
  dryRun: boolean;
  /** Old files removed (or that would be), past their grace period. */
  deleted: { site: string; key: string }[];
  /** Old files still in their grace period. */
  waiting: number;
  /** Left alone: a media item or variant uses the key again. */
  kept: { site: string; key: string; reason: string }[];
}

/**
 * Removes the old files of `media:rename-imported` whose grace period is
 * over; their addresses then redirect (301) to the new ones.
 */
export async function purgeRenamedMedia(
  db: Database,
  input: PurgeRenamedInput,
): Promise<PurgeRenamedResult> {
  refuseRoot();
  const dryRun = Boolean(input.dryRun);
  const now = input.now ?? new Date();
  const targets = input.site
    ? [await findSite(db, input.site)]
    : await db.select({ id: sites.id, slug: sites.slug }).from(sites);
  const result: PurgeRenamedResult = { dryRun, deleted: [], waiting: 0, kept: [] };
  for (const site of targets) {
    await withSiteContext(db, site.id, async (tx) => {
      const pending = await tx
        .select({ oldKey: mediaRenames.oldKey, deleteAfter: mediaRenames.deleteAfter })
        .from(mediaRenames)
        .where(and(eq(mediaRenames.siteId, site.id), isNull(mediaRenames.purgedAt)));
      const due = pending.filter((r) => r.deleteAfter <= now).map((r) => r.oldKey);
      result.waiting += pending.length - due.length;
      if (due.length === 0) return;
      const inUse = new Set(
        [
          ...(await tx
            .select({ key: media.storageKey })
            .from(media)
            .where(and(eq(media.siteId, site.id), inArray(media.storageKey, due)))),
          ...(await tx
            .select({ key: mediaVariants.storageKey })
            .from(mediaVariants)
            .where(and(eq(mediaVariants.siteId, site.id), inArray(mediaVariants.storageKey, due)))),
        ].map((r) => r.key),
      );
      for (const key of due) {
        if (inUse.has(key) || !key.startsWith(`${site.id}/`)) {
          result.kept.push({ site: site.slug, key, reason: 'a media item uses this file' });
          continue;
        }
        result.deleted.push({ site: site.slug, key });
        if (dryRun) continue;
        await rm(fileOf(input.mediaPath, key), { force: true });
        await tx
          .update(mediaRenames)
          .set({ purgedAt: now })
          .where(
            and(
              eq(mediaRenames.siteId, site.id),
              eq(mediaRenames.oldKey, key),
              lte(mediaRenames.deleteAfter, now),
            ),
          );
      }
    });
  }
  return result;
}

/** The report of a renaming, for people. */
export function renameText(r: RenameImportedResult): string[] {
  if (r.alreadyFixed) {
    return [
      `No media file of ${r.site.slug} has a generated (uuid) name: the site already has WordPress's names. Nothing to do.`,
    ];
  }
  const lines: string[] = [];
  const verb = r.dryRun ? 'would move' : 'moved';
  for (const m of r.renamed) {
    lines.push(
      `${m.from} → ${m.to}${m.variants.length ? ` (+${m.variants.length} variants)` : ''}`,
    );
  }
  for (const s of r.skipped) lines.push(`Skipped ${s.key} (WordPress id ${s.wpId}): ${s.reason}`);
  for (const u of r.unmatched)
    lines.push(`Not found: ${u.url} (WordPress id ${u.wpId}): ${u.reason}`);
  for (const [table, c] of Object.entries(r.references)) {
    lines.push(`${table}: ${c.addresses} address(es) in ${c.rows} row(s)`);
  }
  lines.push(
    `${r.counts.media} media file(s) and ${r.counts.variants} variant(s) ${verb} to WordPress's names; ${r.skipped.length} skipped, ${r.unmatched.length} not found; ${r.counts.oldAddresses} old WordPress address(es) added for redirects.`,
  );
  if (r.dryRun) {
    lines.push('Dry run: nothing was changed. Run again without --dry-run to apply.');
  } else if (r.counts.media) {
    lines.push(
      `The old files stay until ${r.deleteAfter.slice(0, 10)}; then run media:purge-renamed (their addresses redirect to the new ones).`,
    );
  }
  if (r.report) lines.push(`Report: ${r.report}`);
  if (r.reportError) lines.push(r.reportError);
  return lines;
}
