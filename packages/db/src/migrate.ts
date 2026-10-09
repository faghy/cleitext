import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase, type Database } from './client.js';

/** Folder with the SQL migrations, shipped next to `src/` and `dist/`. */
export const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export interface MigrateOptions {
  /** Owner connection (DATABASE_ADMIN_URL). Never the application role. */
  ownerUrl: string;
  /** Application role to (re)grant privileges to after migrating. */
  appRole?: string;
}

/** Applies pending core migrations and refreshes the application role grants. */
export async function migrate({ ownerUrl, appRole }: MigrateOptions): Promise<void> {
  const { db, close } = createDatabase(ownerUrl, { max: 1 });
  try {
    await drizzleMigrate(db, { migrationsFolder });
    if (appRole) {
      await grantAppPrivileges(db, appRole);
    }
  } finally {
    await close();
  }
}

/** Grants the application role access to all core tables (owner connection). */
export async function grantAppPrivileges(ownerDb: Database, appRole: string): Promise<void> {
  await ownerDb.execute(sql`select cleitext_grant_app(${appRole})`);
}

export interface MigrationStatus {
  expected: number;
  applied: number;
  upToDate: boolean;
}

/** Compares the migrations shipped with this package with those applied. */
export async function getMigrationStatus(db: Database): Promise<MigrationStatus> {
  const journal = JSON.parse(await readFile(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as {
    entries: unknown[];
  };
  const expected = journal.entries.length;
  let applied: number;
  try {
    const rows = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from drizzle.__drizzle_migrations`,
    );
    applied = Number(rows[0]?.count ?? 0);
  } catch {
    applied = 0;
  }
  return { expected, applied, upToDate: applied === expected };
}
