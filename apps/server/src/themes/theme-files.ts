import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

/**
 * Files of the site's theme that plugins may read (plugin API 1.49), e.g.
 * JSON definitions a theme ships for a plugin (`campus-json/*.json`): only
 * inside the theme's folder (no `..`, no links leading out), regular files,
 * at most 1 MB, as UTF-8 text.
 */
export const MAX_THEME_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 200;
const SEGMENT_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

/** A relative path made only of plain segments (no `..`, no hidden files), or null. */
export function safeThemePath(relative: string): string[] | null {
  if (typeof relative !== 'string' || relative.length > 400) return null;
  const segments = relative.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 8) return null;
  return segments.every((s) => SEGMENT_RE.test(s) && !s.includes('..')) ? segments : null;
}

/** The real path of something inside the theme's folder, or null when it leads out of it. */
async function inside(root: string, segments: string[]): Promise<string | null> {
  try {
    const base = await realpath(root);
    const target = await realpath(path.join(base, ...segments));
    return target === base || target.startsWith(base + path.sep) ? target : null;
  } catch {
    return null;
  }
}

/** Names of the regular files of a folder of the theme (sorted, at most 200). */
export async function themeFiles(root: string | null, dir: string): Promise<string[]> {
  if (!root) return [];
  const segments = dir === '' || dir === '.' ? [] : safeThemePath(dir);
  if (!segments) return [];
  const folder = await inside(root, segments);
  if (!folder) return [];
  try {
    const names: string[] = [];
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (!SEGMENT_RE.test(entry.name)) continue;
      if (entry.isFile()) names.push(entry.name);
      else if (entry.isSymbolicLink()) {
        const real = await inside(root, [...segments, entry.name]);
        if (real && (await lstat(real)).isFile()) names.push(entry.name);
      }
    }
    return names.sort().slice(0, MAX_FILES);
  } catch {
    return [];
  }
}

/** A text file of the theme; null when missing, outside the folder or too large. */
export async function readThemeFile(root: string | null, relative: string): Promise<string | null> {
  if (!root) return null;
  const segments = safeThemePath(relative);
  if (!segments) return null;
  const file = await inside(root, segments);
  if (!file) return null;
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > MAX_THEME_FILE_BYTES) return null;
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}
