/** Settings, folders and connections the commands share. */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, type Database } from '@cleitext/db';
import { OperationError } from './operations.js';

/** Owner connection URL and application role (from DATABASE_URL's user name). */
export function connectionSettings(): { ownerUrl: string; appRole: string | undefined } {
  const ownerUrl = process.env.DATABASE_ADMIN_URL;
  if (!ownerUrl)
    throw new OperationError('Set DATABASE_ADMIN_URL (owner connection).', 'not_configured');
  const appUrl = process.env.DATABASE_URL;
  const appRole = process.env.CLEITEXT_APP_ROLE ?? (appUrl ? new URL(appUrl).username : undefined);
  return { ownerUrl, appRole: appRole || undefined };
}

export function requireAppRole(): string {
  const { appRole } = connectionSettings();
  if (!appRole) {
    throw new OperationError(
      'Set DATABASE_URL (application role) or CLEITEXT_APP_ROLE.',
      'not_configured',
    );
  }
  return appRole;
}

export async function withOwner<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const { ownerUrl } = connectionSettings();
  const client = createDatabase(ownerUrl, { max: 1, connectTimeout: 15 });
  try {
    return await fn(client.db);
  } finally {
    await client.close();
  }
}

/** Installed plugins live here; the server reads the same variable. */
export function pluginsPath(): string {
  return path.resolve(process.env.PLUGINS_PATH ?? 'cleitext-data/plugins');
}

export function themesPath(): string {
  return path.resolve(process.env.THEMES_PATH ?? 'cleitext-data/themes');
}

export function mediaPath(): string {
  return path.resolve(process.env.MEDIA_PATH ?? 'cleitext-data/media');
}

/** Backups, update status and automatic update choices: next to the media folder. */
export function backupsDir(): string {
  return path.join(path.dirname(mediaPath()), 'backups');
}

export function dataPaths() {
  const { ownerUrl } = connectionSettings();
  return { ownerUrl, mediaPath: mediaPath(), pluginsPath: pluginsPath() };
}

/** The application folder: this CLI is in <root>/packages/cli/dist. */
export function appRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

export function installedVersion(root: string): string {
  return (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string })
    .version;
}

/** The version in a folder's package.json, or null. */
export function versionIn(dir: string): string | null {
  try {
    return installedVersion(dir);
  } catch {
    return null;
  }
}

/** The `.env` the application reads (resolved when it is a link), or null. */
export function envFileOf(root: string): string | null {
  const file = path.join(root, '.env');
  if (!existsSync(file)) return null;
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

/** Promise with a deadline. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new OperationError(`${what}: no answer within ${ms / 1000} s.`, 'timeout')),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
