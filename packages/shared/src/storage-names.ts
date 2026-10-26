/**
 * Names of stored media files (core 0.85): the original file name made safe
 * (`Città d'arte.JPG` → `citta-d-arte.jpg`), in the folder of the upload's
 * year and month, as WordPress does. Only the name comes from the upload:
 * the site's folder and the extension (from the file's real type) never do.
 */

/** Longest name kept, without the extension. */
export const STORAGE_NAME_MAX = 100;

/** Letters that do not decompose into a base letter and an accent. */
const LETTERS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  ı: 'i',
};

/**
 * The name a file is stored under, without extension: lowercase, accents
 * transliterated, only `a-z 0-9 - _ .`, no leading or trailing separators,
 * at most {@link STORAGE_NAME_MAX} characters; `file` when nothing is left.
 * It can never contain a slash or `..`.
 */
export function storageBaseName(filename: string): string {
  const last = filename.split(/[\\/]/).pop() ?? '';
  // The extension is the file's real type's, set by the caller.
  const withoutExt = last.replace(/\.[a-z0-9]{1,5}$/i, '');
  const name = withoutExt
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ßæœøđðłþı]/g, (c) => LETTERS[c] ?? '')
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, STORAGE_NAME_MAX)
    .replace(/[-_.]+$/, '');
  return name || 'file';
}

/** `<siteId>/<yyyy>/<mm>`: the folder of the files uploaded in that month. */
export function mediaFolder(siteId: string, date: Date): string {
  const time = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${siteId}/${time.getUTCFullYear()}/${String(time.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The year and month of WordPress's uploads folder in an address
 * (`/wp-content/uploads/2015/07/photo.jpg` → July 2015), if it has one.
 */
export function uploadsFolderDate(url: string): Date | undefined {
  const match = /\/uploads\/(\d{4})\/(\d{2})\/[^/]+$/.exec(url.replace(/[?#].*$/, ''));
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1970 || year > 2200 || month < 1 || month > 12) return undefined;
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * Whether a storage key has the generated name of the files stored before
 * core 0.85: `<siteId>/<yyyy>/<mm>/<uuid>.<ext>`.
 */
export function isGeneratedStorageKey(key: string): boolean {
  return /^[0-9a-f-]{36}\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$/i.test(
    key,
  );
}

/**
 * The address of a media file without what WordPress adds to its copies:
 * the size of a resized copy (`photo-1024x768.webp`), `-scaled`, the query.
 */
export function mediaUrlKey(url: string): string {
  return url
    .replace(/[?#].*$/, '')
    .replace(/^(?:https?:)?\/\/[^/]+/i, '')
    .replace(/-(?:\d+x\d+|scaled)(\.[a-z0-9]+)$/i, '$1');
}

/**
 * The paths of a media file's addresses on the old site (decoded, without
 * host and query), as a visitor's request for them arrives:
 * `/wp-content/uploads/2015/07/photo.jpg`. Addresses that cannot be decoded
 * or are not a file path are left out.
 */
export function sourceUrlPaths(urls: readonly string[]): string[] {
  const paths = new Set<string>();
  for (const url of urls) {
    const raw =
      /^(?:https?:)?\/\/[^/?#]+(\/[^?#]*)/i.exec(url)?.[1] ?? (url.startsWith('/') ? url : '');
    let path: string;
    try {
      path = decodeURIComponent(raw.replace(/[?#].*$/, ''));
    } catch {
      continue;
    }
    if (/^\/[^\0]{1,1000}$/.test(path) && !path.endsWith('/')) paths.add(path);
  }
  return [...paths];
}

/** The SQL `LIKE` pattern of the keys starting with a prefix. */
export const storageKeyPattern = (prefix: string) => `${prefix.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * The names taken in a folder, from the storage keys of its media and
 * variants: each key without the folder and the extension (`photo`,
 * `photo-thumb`), so that `photo.jpg` also takes `photo.png`.
 */
export function takenStorageNames(folder: string, keys: Iterable<string>): Set<string> {
  const taken = new Set<string>();
  for (const key of keys) {
    if (key.startsWith(`${folder}/`)) {
      taken.add(key.slice(folder.length + 1).replace(/\.[^.]*$/, ''));
    }
  }
  return taken;
}

/**
 * Picks the key of a new file `<folder>/<name>.<ext>`, or `<name>-1`,
 * `<name>-2`… when the name is in `taken` (as WordPress does). `create`
 * writes the file only when none exists (exclusive create) and answers
 * false when one does, so two writers never get the same name and an
 * existing file is never replaced. Null after a thousand names taken.
 */
export async function claimStorageKey(
  folder: string,
  name: string,
  ext: string,
  taken: ReadonlySet<string>,
  create: (key: string) => Promise<boolean>,
): Promise<string | null> {
  for (let n = 0; n < 1_000; n++) {
    const candidate = n === 0 ? name : `${name}-${n}`;
    if (taken.has(candidate)) continue;
    const key = `${folder}/${candidate}.${ext}`;
    if (await create(key)) return key;
  }
  return null;
}

/**
 * The key of a variant's new file: `<base>.<format>` (`base` ends with the
 * variant, `photo-thumb`), or `<base>-1.<format>`… when that file exists.
 * Null after a hundred names taken.
 */
export async function claimVariantKey(
  base: string,
  format: string,
  create: (key: string) => Promise<boolean>,
): Promise<string | null> {
  for (let n = 0; n < 100; n++) {
    const key = n === 0 ? `${base}.${format}` : `${base}-${n}.${format}`;
    if (await create(key)) return key;
  }
  return null;
}
