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
