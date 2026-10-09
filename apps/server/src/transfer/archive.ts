import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';

export const DOCUMENT_FILE = 'site.json';
/** Media files downloaded during an import are refused above this size. */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

/** Writes `site.json` and the media files into a .tar.gz archive. */
export async function writeArchive(
  target: string,
  document: unknown,
  files: Map<string, string>,
  resolveStorage: (key: string) => string,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cleitext-export-'));
  try {
    await writeFile(path.join(dir, DOCUMENT_FILE), JSON.stringify(document));
    for (const [archivePath, key] of files) {
      const destination = safeJoin(dir, archivePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(resolveStorage(key), destination);
    }
    await tar.create({ gzip: true, file: target, cwd: dir, portable: true }, [
      DOCUMENT_FILE,
      ...(files.size ? ['media'] : []),
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Extracts an archive to a temporary folder (only plain files, no links). */
export async function openArchive(
  file: string,
): Promise<{ dir: string; document: unknown; close(): Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cleitext-import-'));
  await pipeline(
    createReadStream(file),
    tar.extract({
      cwd: dir,
      strict: true,
      filter: (entryPath, entry) =>
        'type' in entry &&
        (entry.type === 'File' || entry.type === 'Directory') &&
        !entryPath.includes('..'),
    }),
  );
  const document = JSON.parse(await readFile(path.join(dir, DOCUMENT_FILE), 'utf8')) as unknown;
  return { dir, document, close: () => rm(dir, { recursive: true, force: true }) };
}

/** `base/relative`, refusing paths that leave `base`. */
export function safeJoin(base: string, relative: string): string {
  const target = path.resolve(base, relative);
  if (!target.startsWith(path.resolve(base) + path.sep))
    throw new Error(`Unsafe path: ${relative}`);
  return target;
}

/**
 * Reads media files of an import: archive or local paths below `base`,
 * or http(s) URLs (downloaded, with a size limit).
 */
export function fileReader(base: string | null) {
  return async (file: string): Promise<Buffer> => {
    if (/^https?:\/\//i.test(file)) {
      const response = await fetch(file, {
        signal: AbortSignal.timeout(60_000),
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > MAX_DOWNLOAD_BYTES) throw new Error('file too large');
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > MAX_DOWNLOAD_BYTES) throw new Error('file too large');
      return data;
    }
    if (!base) throw new Error(`no folder to read ${file} from`);
    return readFile(safeJoin(base, file));
  };
}

/** Writes a stream to a file (used for downloads). */
export async function saveStream(stream: NodeJS.ReadableStream, target: string): Promise<void> {
  await pipeline(stream, createWriteStream(target));
}
