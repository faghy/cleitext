/**
 * Migration 0032 (core 0.79): Zenit's own "Additional CSS" option moves into
 * the core's Additional CSS, once: for every theme where Zenit is the
 * site's theme, for Zenit only elsewhere.
 */
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupTestDatabase, type TestDatabase } from '@cleitext/testing';
import { sql } from 'drizzle-orm';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, seedSiteDefaults, type DatabaseClient } from '../src/index.js';
import { migrate, migrationsFolder } from '../src/migrate.js';

let database: TestDatabase;
let owner: DatabaseClient;

async function inSite<T>(siteId: string, query: ReturnType<typeof sql>): Promise<T[]> {
  return owner.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.site_id', ${siteId}, true)`);
    return (await tx.execute(query)) as unknown as T[];
  });
}

beforeAll(async () => {
  database = await setupTestDatabase();
  owner = createDatabase(database.ownerUrl, { max: 1 });
  const before = await mkdtemp(join(tmpdir(), 'cleitext-migrations-'));
  await cp(migrationsFolder, before, { recursive: true });
  const journalFile = join(before, 'meta/_journal.json');
  const journal = JSON.parse(await readFile(journalFile, 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < '0032');
  await writeFile(journalFile, JSON.stringify(journal));
  await drizzleMigrate(owner.db, { migrationsFolder: before });
}, 120_000);

afterAll(async () => {
  await owner?.close();
  await database?.teardown();
});

describe('migration 0032', () => {
  it('moves Zenit’s custom CSS into the site’s Additional CSS', async () => {
    const active = crypto.randomUUID();
    const left = crypto.randomUUID();
    const blank = crypto.randomUUID();
    await owner.db.execute(sql`
      insert into sites (id, slug, name, default_locale, theme_slug) values
        (${active}, 'zenit-site', 'Zenit site', 'en', 'zenit'),
        (${left}, 'left-zenit', 'Left Zenit', 'en', 'canvas'),
        (${blank}, 'blank', 'Blank', 'en', 'zenit')`);
    for (const [site, css] of [
      [active, '.a{color:red}'],
      [left, '.b{}'],
      [blank, '  '],
    ] as const) {
      await seedSiteDefaults(owner.db, site);
      await owner.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.site_id', ${site}, true)`);
        await tx.execute(sql`
          insert into settings (site_id, namespace, key, value) values
            (${site}, 'theme:zenit', 'values', ${JSON.stringify({ customCss: css, x: 1 })}::jsonb)`);
      });
    }

    await migrate({ ownerUrl: database.ownerUrl });

    const css = (site: string) =>
      inSite<{ key: string; value: unknown }>(
        site,
        sql`select key, value from settings where namespace = 'additional-css' order by key`,
      );
    const zenit = (site: string) =>
      inSite<{ value: unknown }>(
        site,
        sql`select value from settings where namespace = 'theme:zenit' and key = 'values'`,
      );
    expect(await css(active)).toEqual([{ key: 'site', value: '.a{color:red}' }]);
    expect(await css(left)).toEqual([{ key: 'theme:zenit', value: '.b{}' }]);
    expect(await css(blank)).toEqual([]);
    for (const site of [active, left, blank]) {
      expect(await zenit(site)).toEqual([{ value: { x: 1 } }]);
    }
  });
});
