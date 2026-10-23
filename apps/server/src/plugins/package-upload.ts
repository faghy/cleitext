import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { BadRequestException } from '@nestjs/common';
import { unzipSync } from 'fflate';
import * as tar from 'tar';

const run = promisify(execFile);

/** Unpacked size limit of an uploaded package. */
const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 5_000;

/**
 * Unpacks an uploaded .zip or .tgz into a new temporary folder (RF-PLG-10).
 * Only regular files and folders inside the package are written: absolute
 * paths, `..`, links and devices are refused.
 */
export async function unpackPackage(data: Buffer, filename: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cleitext-upload-'));
  try {
    if (/\.zip$/i.test(filename) || data.subarray(0, 2).toString() === 'PK') {
      await unzipInto(data, dir);
    } else if (/\.(tgz|tar\.gz)$/i.test(filename) || (data[0] === 0x1f && data[1] === 0x8b)) {
      await untarInto(data, dir);
    } else {
      throw new BadRequestException('Upload a .zip or .tgz package.');
    }
    return dir;
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      `The package could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function safePath(root: string, name: string): string {
  const clean = name.replace(/\\/g, '/');
  if (clean.startsWith('/') || clean.split('/').includes('..') || /^[a-z]:/i.test(clean)) {
    throw new BadRequestException(`Unsafe path in the package: ${name}`);
  }
  const target = path.resolve(root, clean);
  if (!target.startsWith(root + path.sep)) {
    throw new BadRequestException(`Unsafe path in the package: ${name}`);
  }
  return target;
}

async function unzipInto(data: Buffer, root: string): Promise<void> {
  let total = 0;
  let count = 0;
  const files = unzipSync(new Uint8Array(data), {
    filter: (file) => {
      count++;
      total += file.originalSize;
      if (count > MAX_FILES || total > MAX_UNPACKED_BYTES) {
        throw new BadRequestException('The package is too large.');
      }
      return true;
    },
  });
  for (const [name, content] of Object.entries(files)) {
    const target = safePath(root, name);
    if (name.endsWith('/')) {
      await mkdir(target, { recursive: true });
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

async function untarInto(data: Buffer, root: string): Promise<void> {
  let total = 0;
  let count = 0;
  let refused: string | null = null;
  await pipeline(
    Readable.from(data),
    tar.x({
      cwd: root,
      strict: true,
      filter: (name, entry) => {
        const kind = 'type' in entry ? entry.type : 'File';
        count++;
        total += 'size' in entry ? Number(entry.size) : 0;
        if (kind !== 'File' && kind !== 'Directory') {
          refused ??= `Links and special files are not allowed (${name}).`;
          return false;
        }
        try {
          safePath(root, name);
        } catch {
          refused ??= `Unsafe path in the package: ${name}`;
          return false;
        }
        if (count > MAX_FILES || total > MAX_UNPACKED_BYTES) {
          refused ??= 'The package is too large.';
          return false;
        }
        return true;
      },
    }),
  );
  if (refused) throw new BadRequestException(refused);
}

/** The folder holding `manifestName`: the package root or its only subfolder. */
export async function packageRoot(dir: string, manifestName: string): Promise<string> {
  if (existsSync(path.join(dir, manifestName))) return dir;
  const entries = (await readdir(dir, { withFileTypes: true })).filter(
    (entry) => !entry.name.startsWith('.') && entry.name !== '__MACOSX',
  );
  if (entries.length === 1 && entries[0]!.isDirectory()) {
    const inner = path.join(dir, entries[0]!.name);
    if (existsSync(path.join(inner, manifestName))) return inner;
  }
  throw new BadRequestException(`No ${manifestName} in the package.`);
}

/**
 * Runs the Cleitext CLI shipped with the server (release: packages/cli),
 * so that installations use the database owner only in a short-lived child.
 */
export async function runCli(
  args: string[],
  config: {
    database: { url: string; adminUrl: string | null };
    plugins: { path: string };
    themes: { path: string };
  },
  extraEnv: Record<string, string> = {},
): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const base = path.resolve(here, '../../../..');
  const cli = path.join(base, 'packages/cli/dist/bin.js');
  const envFile = path.join(base, '.env');
  try {
    const { stdout } = await run(
      process.execPath,
      [...(existsSync(envFile) ? [`--env-file=${envFile}`] : []), cli, ...args],
      {
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
        // The server's own paths and databases, also when they come from its config.
        env: {
          ...process.env,
          DATABASE_URL: config.database.url,
          ...(config.database.adminUrl ? { DATABASE_ADMIN_URL: config.database.adminUrl } : {}),
          PLUGINS_PATH: config.plugins.path,
          THEMES_PATH: config.themes.path,
          ...extraEnv,
        },
      },
    );
    return stdout.trim();
  } catch (error) {
    const failure = error as { stderr?: string; message?: string };
    const detail = (failure.stderr || failure.message || String(error))
      .trim()
      .split('\n')
      .slice(-3)
      .map((line) => line.replace(/^Error:\s*/, ''));
    throw new BadRequestException(`Installation failed: ${detail.join(' ')}`);
  }
}

/**
 * Uploads install code on the server: only super admins (`manage_plugins`),
 * when the configuration allows it (RF-PLG-10/12).
 */
export function assertCanUpload(
  config: { installFromUi: boolean; allowUnsigned: boolean },
  auth: { capabilities: readonly string[] },
): void {
  if (!config.installFromUi) {
    throw new BadRequestException('Installing from the admin is turned off on this server.');
  }
  if (!config.allowUnsigned) {
    throw new BadRequestException(
      'This server accepts only packages signed by the registry: install with the CLI.',
    );
  }
  if (!auth.capabilities.includes('manage_plugins')) {
    throw new BadRequestException(
      'Only super admins (and, on an installation with one site, its administrators) can install code.',
    );
  }
}
