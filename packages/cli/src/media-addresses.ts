/**
 * `media:import-addresses` (core 0.95.7): the 301s of the old WordPress
 * addresses (`/wp-content/uploads/…`) for a site imported before the import
 * recorded them (core 0.85), or whose names were already fine so that
 * `media:rename-imported` had nothing to do.
 *
 * - From the export (`--wxr`): each attachment is found by what the import
 *   recorded (`att:<id>`), else by its file name (and size) when only one
 *   media item has it; its addresses become `path:` refs.
 * - From a copy of the old files (`--folder`, often the site's own
 *   `public/wp-content` or `public/wp-content/uploads`): each file is found
 *   in the library by its checksum.
 * - Then, with `--folder`, which files of the folder would still answer
 *   only from the folder (not media: a theme's CSS, a plugin's JS; or not
 *   found): while there are some, the folder cannot go.
 *
 * Only adds `import_refs` rows; never changes media, files or content.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { importRefs, media, withSiteContext } from '@cleitext/db';
import { mediaUrlKey, sourceUrlPaths } from '@cleitext/shared';
import { and, eq, like } from 'drizzle-orm';
import { findSite, refuseRoot, wxrMedia } from './media-rename.js';
import { OperationError } from './operations.js';

export interface ImportAddressesInput {
  site: string;
  wxr?: string;
  folder?: string;
  dryRun?: boolean;
}

export interface ImportAddressesResult {
  site: { id: string; slug: string };
  dryRun: boolean;
  /** `path:` refs added (or, in a dry run, that would be). */
  added: number;
  /** Attachments of the export found in the library / not found. */
  attachments: { found: number; missing: number };
  /** Files of the folder found by their checksum. */
  byChecksum: number;
  /** With --folder: files that still answer only from the folder. */
  folder: { files: number; covered: number; uncovered: string[] } | null;
}

/** Copies WordPress or its plugins made of an original (`photo.jpg.webp`, `photo.webp`). */
export function webpOriginals(p: string): string[] {
  const m = /^(.*?)(\.(?:jpe?g|png|gif))?\.(webp|avif)$/i.exec(p);
  if (!m) return [];
  if (m[2]) return [`${m[1]}${m[2]}`];
  return ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'].map((ext) => `${m[1]}${ext}`);
}

/** Whether the server answers a request of this old address with a 301 (as `importedMediaAddress`). */
export function isCovered(p: string, refs: ReadonlySet<string>): boolean {
  if (!/\/wp-content\/uploads\/[^?#]*\.[a-z0-9]{1,5}$/i.test(p)) return false;
  const key = mediaUrlKey(p);
  return [p, key, ...webpOriginals(key)].some((c) => refs.has(`path:${c}`));
}

/** WordPress's resized copies and modern-format copies: covered through their original. */
const DERIVED = /(?:-(?:\d+x\d+|scaled)\.[a-z0-9]+|\.(?:webp|avif))$/i;

async function filesOf(root: string, dir = root, out: string[] = []): Promise<string[]> {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) await filesOf(root, full, out);
    else if (d.isFile()) out.push(path.relative(root, full).split(path.sep).join('/'));
    if (out.length > 500_000) throw new OperationError('More than 500000 files in the folder.');
  }
  return out;
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function importAddresses(
  db: Parameters<typeof withSiteContext>[0],
  input: ImportAddressesInput,
): Promise<ImportAddressesResult> {
  refuseRoot();
  if (!input.wxr && !input.folder) {
    throw new OperationError(
      'Give the export (--wxr), the old files (--folder), or both.',
      'invalid_option',
    );
  }
  const site = await findSite(db, input.site);
  const dryRun = Boolean(input.dryRun);

  // The folder: where its files are asked from on the site.
  let folder: { root: string; prefix: string; files: string[] } | null = null;
  if (input.folder) {
    let root: string;
    try {
      root = await realpath(input.folder);
      if (!(await stat(root)).isDirectory()) throw new Error();
    } catch {
      throw new OperationError(`Cannot read the folder ${input.folder}.`, 'not_found');
    }
    const base = path.basename(root);
    const prefix =
      base === 'wp-content' ? '/wp-content/' : base === 'uploads' ? '/wp-content/uploads/' : null;
    if (!prefix) {
      throw new OperationError(
        '--folder: a wp-content or wp-content/uploads folder (as public/wp-content).',
        'invalid_option',
      );
    }
    folder = { root, prefix, files: await filesOf(root) };
  }

  const { library, refs, attRefs } = await withSiteContext(db, site.id, async (tx) => {
    const library = await tx
      .select({
        id: media.id,
        key: media.storageKey,
        filename: media.filename,
        size: media.sizeBytes,
        checksum: media.checksum,
      })
      .from(media)
      .where(eq(media.siteId, site.id));
    const rows = await tx
      .select({ ref: importRefs.ref, mediaId: importRefs.mediaId })
      .from(importRefs)
      .where(eq(importRefs.siteId, site.id));
    return {
      library,
      refs: new Set(rows.filter((r) => r.ref.startsWith('path:')).map((r) => r.ref)),
      attRefs: new Map(
        rows.filter((r) => r.ref.startsWith('att:') && r.mediaId).map((r) => [r.ref, r.mediaId!]),
      ),
    };
  });
  const ids = new Set(library.map((m) => m.id));

  /** New rows: ref → media id. */
  const adding = new Map<string, string>();
  const add = (p: string, mediaId: string) => {
    for (const ref of [`path:${p}`, `path:${mediaUrlKey(p)}`]) {
      if (!refs.has(ref) && !adding.has(ref)) adding.set(ref, mediaId);
    }
  };
  const result: ImportAddressesResult = {
    site,
    dryRun,
    added: 0,
    attachments: { found: 0, missing: 0 },
    byChecksum: 0,
    folder: null,
  };

  let source = 'wordpress:';
  if (input.wxr) {
    let xml: string;
    try {
      xml = await readFile(path.resolve(input.wxr), 'utf8');
    } catch {
      throw new OperationError(`Cannot read the export ${input.wxr}.`, 'not_found');
    }
    const wxr = wxrMedia(xml);
    source = wxr.source ?? source;
    const baseName = (key: string) => key.slice(key.lastIndexOf('/') + 1);
    for (const att of wxr.attachments) {
      let id = attRefs.get(`att:${att.id}`);
      if (!id || !ids.has(id)) {
        let named = library.filter(
          (m) => att.names.includes(m.filename) || baseName(m.key) === att.filename,
        );
        if (named.length > 1 && att.size !== undefined)
          named = named.filter((m) => m.size === att.size);
        id = named.length === 1 ? named[0]!.id : undefined;
      }
      if (!id) {
        result.attachments.missing++;
        continue;
      }
      result.attachments.found++;
      for (const p of sourceUrlPaths(att.urls)) add(p, id);
    }
  }

  if (folder) {
    const byChecksum = new Map<string, string[]>();
    for (const m of library)
      byChecksum.set(m.checksum, [...(byChecksum.get(m.checksum) ?? []), m.id]);
    const covered = new Set([...refs, ...adding.keys()]);
    for (const file of folder.files) {
      const p = `${folder.prefix}${file}`;
      if (DERIVED.test(file) || isCovered(p, covered)) continue;
      if (!/^\/wp-content\/uploads\//.test(p)) continue;
      const same = byChecksum.get(await sha256(path.join(folder.root, file))) ?? [];
      if (same.length !== 1) continue;
      add(p, same[0]!);
      covered.add(`path:${p}`);
      covered.add(`path:${mediaUrlKey(p)}`);
      result.byChecksum++;
    }
    const uncovered = folder.files
      .map((f) => `${folder.prefix}${f}`)
      .filter((p) => !isCovered(p, covered));
    result.folder = {
      files: folder.files.length,
      covered: folder.files.length - uncovered.length,
      uncovered,
    };
  }

  result.added = adding.size;
  if (!dryRun && adding.size) {
    await withSiteContext(db, site.id, async (tx) => {
      const rows = [...adding].map(([ref, mediaId]) => ({ siteId: site.id, source, ref, mediaId }));
      for (let i = 0; i < rows.length; i += 1000) {
        await tx
          .insert(importRefs)
          .values(rows.slice(i, i + 1000))
          .onConflictDoNothing();
      }
    });
  }
  return result;
}

/** The result for people. */
export function importAddressesText(r: ImportAddressesResult): string[] {
  const lines = [
    `${r.dryRun ? 'Would add' : 'Added'} ${r.added} old address(es) of ${r.site.slug} that now answer 301 to the media library.`,
  ];
  if (r.attachments.found || r.attachments.missing) {
    lines.push(
      `Export: ${r.attachments.found} attachment(s) found in the library, ${r.attachments.missing} not found.`,
    );
  }
  if (r.folder) {
    lines.push(
      `Folder: ${r.byChecksum} file(s) found by their content; ${r.folder.covered} of ${r.folder.files} file(s) answer 301.`,
    );
    if (r.folder.uncovered.length) {
      lines.push(
        `${r.folder.uncovered.length} file(s) would answer 404 without the folder (not media, or not found):`,
        ...r.folder.uncovered.slice(0, 50).map((p) => `  ${p}`),
        ...(r.folder.uncovered.length > 50
          ? [`  … and ${r.folder.uncovered.length - 50} more`]
          : []),
        'Keep the folder until they are moved or no longer used.',
      );
    } else {
      lines.push('Every file of the folder answers 301: the folder can be removed.');
    }
  }
  return lines;
}
