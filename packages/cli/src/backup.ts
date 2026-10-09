/**
 * Backup and restore (RNF-15): the whole database with pg_dump (custom
 * format), plus uploaded media and installed plugins, in one .tar.gz.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { grantAppPrivileges, plugins, type Database } from '@cleitext/db';
import { sql } from 'drizzle-orm';
import * as tar from 'tar';
import { OperationError } from './operations.js';
import { migratePlugin } from './plugins.js';

const run = promisify(execFile);

export interface BackupPaths {
  ownerUrl: string;
  mediaPath: string;
  pluginsPath: string;
}

interface BackupManifest {
  format: 'cleitext-backup';
  version: 1;
  createdAt: string;
  postgres: string;
  /** Tables with FORCE ROW LEVEL SECURITY, set again after a restore. */
  forcedTables?: string[];
}

/**
 * Tables whose Row Level Security also applies to their owner (FORCE).
 * pg_dump and pg_restore cannot read or load them as the owner, so FORCE
 * is lifted for the time of the operation and set again afterwards.
 */
async function forcedTables(db: Database): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(sql`
    select format('%I.%I', n.nspname, c.relname) as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and c.relforcerowsecurity and pg_has_role(c.relowner, 'USAGE')
    order by 1`);
  return rows.map((r) => r.name);
}

async function setForce(db: Database, tables: string[], force: boolean): Promise<void> {
  for (const table of tables) {
    if (!/^[\w"$.]+$/.test(table)) throw new OperationError(`Unexpected table name ${table}`);
    await db.execute(sql.raw(`ALTER TABLE ${table} ${force ? '' : 'NO '}FORCE ROW LEVEL SECURITY`));
  }
}

/** pg_dump / pg_restore from PG_BIN (a folder) or the PATH. */
function tool(name: 'pg_dump' | 'pg_restore'): string {
  return process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name;
}

async function exec(name: 'pg_dump' | 'pg_restore', args: string[]): Promise<string> {
  try {
    const { stdout } = await run(tool(name), args, { maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT') {
      throw new OperationError(
        `${name} not found: install the PostgreSQL client tools or set PG_BIN.`,
      );
    }
    throw new OperationError(
      `${name} failed: ${(e.stderr ?? e.message).trim().split('\n').slice(-3).join(' ')}`,
    );
  }
}

export async function backup(
  db: Database,
  paths: BackupPaths,
  out: string,
): Promise<{ bytes: number }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cleitext-backup-'));
  try {
    const version = (await exec('pg_dump', ['--version'])).trim();
    const forced = await forcedTables(db);
    await setForce(db, forced, false);
    try {
      await exec('pg_dump', [
        '--format=custom',
        '--no-owner',
        '--file',
        path.join(dir, 'database.dump'),
        '--dbname',
        paths.ownerUrl,
      ]);
    } finally {
      await setForce(db, forced, true);
    }
    for (const [name, source] of [
      ['media', paths.mediaPath],
      ['plugins', paths.pluginsPath],
    ] as const) {
      if (existsSync(source))
        await cp(source, path.join(dir, name), { recursive: true, verbatimSymlinks: false });
      else await mkdir(path.join(dir, name));
    }
    const manifest: BackupManifest = {
      format: 'cleitext-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      postgres: version,
      forcedTables: forced,
    };
    await writeFile(path.join(dir, 'backup.json'), JSON.stringify(manifest, null, 2));
    // The archive holds the whole database: readable by its owner only.
    await tar.create({ gzip: true, file: out, cwd: dir, portable: true }, [
      'backup.json',
      'database.dump',
      'media',
      'plugins',
    ]);
    await chmod(out, 0o600);
    const { size } = await import('node:fs/promises').then((fs) => fs.stat(out));
    return { bytes: size };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Restores a backup over the current installation. The current media and
 * plugins folders are kept next to the new ones (`.before-restore`).
 */
export async function restore(
  db: Database,
  paths: BackupPaths & { appRole: string },
  file: string,
): Promise<BackupManifest> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cleitext-restore-'));
  try {
    await tar.extract({
      file,
      cwd: dir,
      strict: true,
      filter: (entryPath, entry) =>
        'type' in entry &&
        (entry.type === 'File' || entry.type === 'Directory') &&
        !entryPath.includes('..'),
    });
    const manifestFile = path.join(dir, 'backup.json');
    if (!existsSync(manifestFile)) throw new OperationError('This is not a Cleitext backup.');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as BackupManifest;
    if (manifest.format !== 'cleitext-backup')
      throw new OperationError('This is not a Cleitext backup.');

    const dump = path.join(dir, 'database.dump');
    // Privileges are restored as they were (e.g. functions revoked from
    // PUBLIC): roles they mention must exist first. Missing ones are created
    // without login; the application role gets its grants again below.
    const schema = await exec('pg_restore', ['--schema-only', '--file=-', dump]);
    const grantees = new Set(
      [...schema.matchAll(/^GRANT .+ TO "?([a-z_][a-z0-9_]*)"?;$/gm)]
        .map((m) => m[1]!)
        .filter((r) => r !== 'public'),
    );
    for (const role of grantees) {
      await db.execute(
        sql.raw(
          `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`,
        ),
      );
    }
    // The current tables must be droppable and the dumped ones loadable.
    await setForce(db, await forcedTables(db), false);
    try {
      // Extensions belong to the database administrator: they are not dropped
      // or recreated by the restore, only created when missing.
      const list = await exec('pg_restore', ['--list', dump]);
      const extensions = [...list.matchAll(/^\d+; \d+ \d+ EXTENSION - ([a-z0-9_]+)\b/gm)].map(
        (m) => m[1]!,
      );
      for (const extension of extensions) {
        await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS ${extension}`));
      }
      const listFile = path.join(dir, 'restore.list');
      await writeFile(
        listFile,
        list
          .split('\n')
          .filter((line) => !/ (EXTENSION|COMMENT - EXTENSION) /.test(line))
          .join('\n'),
      );
      await exec('pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--single-transaction',
        `--use-list=${listFile}`,
        '--dbname',
        paths.ownerUrl,
        dump,
      ]);
    } finally {
      const again = new Set([...(manifest.forcedTables ?? []), ...(await forcedTables(db))]);
      await setForce(db, [...again], true);
    }
    // Roles are not part of a database dump: plugin roles and grants again.
    await grantAppPrivileges(db, paths.appRole);
    for (const plugin of await db.select().from(plugins)) {
      await migratePlugin(db, plugin.slug, path.join(dir, 'plugins', plugin.slug), paths.appRole);
    }
    for (const [name, target] of [
      ['media', paths.mediaPath],
      ['plugins', paths.pluginsPath],
    ] as const) {
      const previous = `${target}.before-restore`;
      await rm(previous, { recursive: true, force: true });
      if (existsSync(target)) await rename(target, previous);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(dir, name), target, { recursive: true });
    }
    return manifest;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
