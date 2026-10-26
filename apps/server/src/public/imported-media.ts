import { importRefs, media, mediaRenames, mediaVariants, type SiteTransaction } from '@cleitext/db';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { mediaUrlKey } from '../transfer/media-urls.js';

/** Paths of WordPress's uploads, whose files an import may have brought here. */
const UPLOADS = /\/wp-content\/uploads\/[^?#]*\.[a-z0-9]{1,5}$/i;

/**
 * The new address of a media file imported from another site, for a request
 * of its old address (`/wp-content/uploads/2015/07/photo.jpg`, core 0.85),
 * recorded at the import in `import_refs` (`path:<path>`). A resized copy of
 * WordPress (`photo-300x200.jpg`) goes to the smallest variant at least as
 * wide, or the original; `-scaled` to the original. Null when the site has
 * no such file: then the request goes on as before (and ends in a 404).
 */
export async function importedMediaAddress(
  tx: SiteTransaction,
  path: string,
): Promise<string | null> {
  if (!UPLOADS.test(path) || path.length > 1_000) return null;
  const key = mediaUrlKey(path);
  const refs = [...new Set([path, key])].map((p) => `path:${p}`);
  const rows = await tx
    .select({ ref: importRefs.ref, mediaId: media.id, storageKey: media.storageKey })
    .from(importRefs)
    .innerJoin(media, eq(media.id, importRefs.mediaId))
    .where(inArray(importRefs.ref, refs));
  const found = rows.find((r) => r.ref === refs[0]) ?? rows[0];
  if (!found) return null;
  if (found.ref === `path:${path}`) return mediaAddress(found.storageKey);
  // A resized copy: the variant closest to its width, not narrower.
  const width = Number(/-(\d{1,5})x\d{1,5}\.[a-z0-9]+$/i.exec(path)?.[1] ?? NaN);
  if (Number.isFinite(width)) {
    const [variant] = await tx
      .select({ storageKey: mediaVariants.storageKey })
      .from(mediaVariants)
      .where(
        and(
          eq(mediaVariants.mediaId, found.mediaId),
          eq(mediaVariants.format, 'webp'),
          gte(mediaVariants.width, width),
        ),
      )
      .orderBy(asc(mediaVariants.width))
      .limit(1);
    if (variant) return mediaAddress(variant.storageKey);
  }
  return mediaAddress(found.storageKey);
}

/**
 * The new address of a media file renamed by `cleitext media:rename-imported`
 * (core 0.86), for a request of its old `/media/<key>` whose file is no
 * longer there (`media_renames`); null when the key was never renamed.
 */
export async function renamedMediaAddress(
  tx: SiteTransaction,
  siteId: string,
  url: string,
): Promise<string | null> {
  let key: string;
  try {
    key = decodeURIComponent(url.replace(/[?#].*$/, '')).slice('/media/'.length);
  } catch {
    return null;
  }
  if (!key.startsWith(`${siteId}/`) || key.length > 1_000) return null;
  const [row] = await tx
    .select({ newKey: mediaRenames.newKey })
    .from(mediaRenames)
    .where(and(eq(mediaRenames.siteId, siteId), eq(mediaRenames.oldKey, key)));
  return row ? mediaAddress(row.newKey) : null;
}

/** The public address of a stored file (keys made by hand may need encoding). */
const mediaAddress = (key: string) => encodeURI(`/media/${key}`);
