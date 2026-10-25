import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';

/** Limits of a child theme downloaded as a zip (Appearance → Themes). */
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const MAX_DOWNLOAD_FILES = 2_000;
/** Folders never packed: dependencies and version control. */
const SKIPPED = new Set(['node_modules', '.git']);

/**
 * A theme folder as a zip whose files sit in `<slug>/`, as Upload Theme
 * takes it back: regular files only, inside the folder (links are left
 * out), without dependencies, within the limits.
 */
export async function zipThemeFolder(dir: string, slug: string): Promise<Uint8Array> {
  const root = await realpath(dir);
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  let count = 0;
  const walk = async (folder: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue;
      const full = path.join(folder, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        await walk(full, `${prefix}${entry.name}/`);
        continue;
      }
      if (!info.isFile()) continue;
      count++;
      total += info.size;
      if (count > MAX_DOWNLOAD_FILES || total > MAX_DOWNLOAD_BYTES) {
        throw new Error('The theme is too large to download.');
      }
      files[`${prefix}${entry.name}`] = new Uint8Array(await readFile(full));
    }
  };
  await walk(root, `${slug}/`);
  return zipSync(files, { level: 6 });
}
