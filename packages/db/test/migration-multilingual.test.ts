/**
 * Migration 0016 (M7): multilingual leaves the core. Languages and
 * translation links are handed over as pending data for a language plugin,
 * and the front, posts and error page settings become entry ids.
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

/** Raw rows in a site's context (tenant tables force Row Level Security). */
async function inSite<T>(siteId: string, query: ReturnType<typeof sql>): Promise<T[]> {
  return owner.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.site_id', ${siteId}, true)`);
    return (await tx.execute(query)) as unknown as T[];
  });
}

beforeAll(async () => {
  database = await setupTestDatabase();
  owner = createDatabase(database.ownerUrl, { max: 1 });
  // The schema as it was before 0016.
  const before = await mkdtemp(join(tmpdir(), 'cleitext-migrations-'));
  await cp(migrationsFolder, before, { recursive: true });
  const journalFile = join(before, 'meta/_journal.json');
  const journal = JSON.parse(await readFile(journalFile, 'utf8')) as { entries: { tag: string }[] };
  // 0016 and everything after it: migrations run in order of their date.
  journal.entries = journal.entries.filter((e) => e.tag < '0016');
  await writeFile(journalFile, JSON.stringify(journal));
  await drizzleMigrate(owner.db, { migrationsFolder: before });
}, 120_000);

afterAll(async () => {
  await owner?.close();
  await database?.teardown();
});

describe('migration 0016', () => {
  it('hands languages and translations over, and stores page ids', async () => {
    const multi = crypto.randomUUID();
    const single = crypto.randomUUID();
    const group = crypto.randomUUID();
    const enPage = crypto.randomUUID();
    const itPage = crypto.randomUUID();
    const lonely = crypto.randomUUID();
    const singlePage = crypto.randomUUID();
    const singleGroup = crypto.randomUUID();
    await owner.db.execute(sql`
      insert into sites (id, slug, name, default_locale) values
        (${multi}, 'multi', 'Multi', 'en'), (${single}, 'single', 'Single', 'it')`);
    await seedSiteDefaults(owner.db, multi);
    await seedSiteDefaults(owner.db, single);
    await owner.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.site_id', ${multi}, true)`);
      await tx.execute(sql`
        insert into site_locales (site_id, code, name, is_default, position, url_prefix) values
          (${multi}, 'en', 'English', true, 0, null), (${multi}, 'it', 'Italiano', false, 1, '/ita')`);
      await tx.execute(sql`
        insert into entries (id, site_id, type_slug, locale, translation_group, slug) values
          (${enPage}, ${multi}, 'page', 'en', ${group}, 'home'),
          (${itPage}, ${multi}, 'page', 'it', ${group}, 'casa'),
          (${lonely}, ${multi}, 'page', 'en', ${crypto.randomUUID()}, 'alone')`);
      await tx.execute(sql`
        insert into settings (site_id, namespace, key, value) values
          (${multi}, 'core', 'frontPage', ${JSON.stringify(group)}::jsonb),
          (${multi}, 'core', 'errorPage', ${JSON.stringify(crypto.randomUUID())}::jsonb)`);
    });
    await owner.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.site_id', ${single}, true)`);
      await tx.execute(sql`
        insert into site_locales (site_id, code, name, is_default) values (${single}, 'it', 'IT', true)`);
      await tx.execute(sql`
        insert into entries (id, site_id, type_slug, locale, translation_group, slug) values
          (${singlePage}, ${single}, 'page', 'it', ${singleGroup}, 'home')`);
      await tx.execute(sql`
        insert into settings (site_id, namespace, key, value) values
          (${single}, 'core', 'frontPage', ${JSON.stringify(singleGroup)}::jsonb)`);
    });

    await migrate({ ownerUrl: database.ownerUrl });

    // Pages: the default-language entry of the group; a missing one is cleared.
    const multiSettings = await inSite<{ key: string; value: unknown }>(
      multi,
      sql`select key, value from settings where namespace = 'core' order by key`,
    );
    expect(multiSettings).toEqual([
      { key: 'errorPage', value: null },
      { key: 'frontPage', value: enPage },
    ]);
    const singleSettings = await inSite<{ value: unknown }>(
      single,
      sql`select value from settings where namespace = 'core' and key = 'frontPage'`,
    );
    expect(singleSettings).toEqual([{ value: singlePage }]);

    // Pending data only where there was something multilingual.
    const [pending] = await inSite<{ value: Record<string, unknown> }>(
      multi,
      sql`select value from settings where namespace = 'languages' and key = 'pending'`,
    );
    expect(pending!.value).toEqual({
      locales: [
        { code: 'en', name: 'English', isDefault: true, position: 0, urlPrefix: null },
        { code: 'it', name: 'Italiano', isDefault: false, position: 1, urlPrefix: '/ita' },
      ],
      entries: expect.arrayContaining([
        { id: enPage, group },
        { id: itPage, group },
      ]),
      terms: [],
    });
    expect((pending!.value.entries as unknown[]).length).toBe(2);
    expect(await inSite(single, sql`select 1 from settings where namespace = 'languages'`)).toEqual(
      [],
    );

    // The core tables no longer have them.
    const [table] = (await owner.db.execute(
      sql`select to_regclass('public.site_locales') as name`,
    )) as unknown as { name: string | null }[];
    expect(table!.name).toBeNull();
  });
});
