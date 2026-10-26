import { storageKeyPattern, takenStorageNames } from '@cleitext/shared';
import { like } from 'drizzle-orm';
import type { SiteTransaction } from './client.js';
import { media, mediaVariants } from './schema/media.js';

/**
 * The names starting with `name` that media or variants of the site already
 * have in a folder (core 0.85, see `takenStorageNames`): a new file named
 * so gets `-1`, `-2`… Used by uploads and by `media:rename-imported`.
 */
export async function takenMediaNames(
  tx: SiteTransaction,
  folder: string,
  name: string,
): Promise<Set<string>> {
  const pattern = storageKeyPattern(`${folder}/${name}`);
  const rows = [
    ...(await tx
      .select({ key: media.storageKey })
      .from(media)
      .where(like(media.storageKey, pattern))),
    ...(await tx
      .select({ key: mediaVariants.storageKey })
      .from(mediaVariants)
      .where(like(mediaVariants.storageKey, pattern))),
  ];
  return takenStorageNames(
    folder,
    rows.map((r) => r.key),
  );
}
