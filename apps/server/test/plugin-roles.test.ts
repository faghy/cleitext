/**
 * Plugin roles per database (migration 0017): two installations on one
 * PostgreSQL server install the same plugin, each with its own role.
 */
import { readFileSync } from 'node:fs';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { createDatabase, migrate } from '@cleitext/db';
import { provisionDatabase, type ProvisionedDatabase } from '@cleitext/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

const superuserUrl = inject('superuserUrl');
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const installations: ProvisionedDatabase[] = [];
let source: string;

async function query<T extends Record<string, unknown>>(url: string, text: string): Promise<T[]> {
  const conn = createDatabase(url, { max: 1 });
  try {
    return [...(await conn.db.execute<T>(sql.raw(text)))] as T[];
  } finally {
    await conn.close();
  }
}

async function installation(): Promise<ProvisionedDatabase> {
  const db = await provisionDatabase(superuserUrl);
  installations.push(db);
  await migrate({ ownerUrl: db.ownerUrl, appRole: db.appRole });
  const owner = createDatabase(db.ownerUrl, { max: 1 });
  try {
    await installPlugin(owner.db, {
      source,
      pluginsPath: await mkdtemp(join(tmpdir(), 'cleitext-roles-')),
      appRole: db.appRole,
    });
  } finally {
    await owner.close();
  }
  return db;
}

const roleOf = async (db: ProvisionedDatabase) =>
  (await query<{ role: string }>(db.ownerUrl, `select cleitext_plugin_role('forms') as role`))[0]!
    .role;

beforeAll(async () => {
  source = join(await mkdtemp(join(tmpdir(), 'forms-src-')), 'forms');
  await cp(join(pluginsRoot, 'forms'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
}, 120_000);

afterAll(async () => {
  for (const db of installations) {
    const role = await roleOf(db).catch(() => null);
    await db.drop();
    if (role) await query(superuserUrl, `drop role if exists "${role}"`);
  }
  await query(superuserUrl, 'drop role if exists cleitext_plg_forms');
});

describe('plugin roles', () => {
  it('lets two installations on one server install the same plugin', async () => {
    const first = await installation();
    const second = await installation();
    const [a, b] = [await roleOf(first), await roleOf(second)];
    expect(a).toMatch(/^cleitext_plg_forms_[0-9a-f]{8}$/);
    expect(b).not.toBe(a);

    // Each application role may switch to its own plugin role only.
    const [row] = await query<{ own: boolean; other: boolean }>(
      first.appUrl,
      `select pg_has_role(current_user, '${a}', 'MEMBER') as own,
              pg_has_role(current_user, '${b}', 'MEMBER') as other`,
    );
    expect(row).toEqual({ own: true, other: false });
  }, 120_000);

  it('renames the role of a plugin installed before, when it is its own', async () => {
    const db = await installation();
    const current = await roleOf(db);
    // As before 0017.
    await query(db.ownerUrl, `alter role "${current}" rename to cleitext_plg_forms`);
    const migration = readFileSync(
      fileURLToPath(
        new URL('../../../packages/db/drizzle/0017_plugin_roles_per_database.sql', import.meta.url),
      ),
      'utf8',
    );
    await query(db.ownerUrl, migration.split('--> statement-breakpoint')[1]!);
    const [row] = await query<{ legacy: boolean; renamed: boolean }>(
      db.ownerUrl,
      `select exists (select 1 from pg_roles where rolname = 'cleitext_plg_forms') as legacy,
              exists (select 1 from pg_roles where rolname = '${current}') as renamed`,
    );
    expect(row).toEqual({ legacy: false, renamed: true });
  }, 120_000);
});
