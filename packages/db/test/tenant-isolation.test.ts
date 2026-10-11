/**
 * Tenant isolation suite (RNF-07, docs/ARCHITECTURE.md §8).
 *
 * Seeds two sites with data in every tenant table, then checks — through the
 * application role — that a site context only ever exposes its own rows.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  createDatabase,
  resolveSiteByHost,
  withSiteContext,
  type Database,
  type DatabaseClient,
} from '../src/index.js';
import * as s from '../src/schema/index.js';

/** Tables without RLS. Anything else in `public` must have RLS enabled. */
const GLOBAL_TABLES = [
  'sessions',
  'plugins',
  'plugin_migrations',
  'super_admins',
  'user_tokens',
  'login_throttle',
  // Identity is global, like users: 2FA recovery codes and passkeys.
  'user_recovery_codes',
  'user_passkeys',
  'webauthn_challenges',
];
/** Tables with RLS that is intentionally not FORCEd (managed by the owner). */
const NOT_FORCED = ['sites', 'site_domains', 'users', 'roles'];
/** Tenant tables whose rows with `site_id IS NULL` are shared by every site. */
const SHARED_NULL_ROWS = ['roles'];

interface SeededSite {
  siteId: string;
  host: string;
  userId: string;
  entryId: string;
  termId: string;
}

let owner: DatabaseClient;
let app: DatabaseClient;
let a: SeededSite;
let b: SeededSite;
let tenantTables: string[];

beforeAll(async () => {
  owner = createDatabase(inject('ownerUrl'), { max: 2 });
  app = createDatabase(inject('appUrl'), { max: 2 });

  await owner.db
    .insert(s.plugins)
    .values({ slug: 'demo', version: '1.0.0', apiVersion: '^1.0', manifest: {} });

  a = await seedSite(owner.db, 'alpha');
  b = await seedSite(owner.db, 'beta');

  const rows = await owner.db.execute<{ table_name: string }>(sql`
    select c.table_name from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'site_id' and t.table_type = 'BASE TABLE'
    order by 1`);
  tenantTables = rows.map((r) => r.table_name);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('database catalog', () => {
  it('enables RLS on every table except the explicit global ones', async () => {
    const rows = await owner.db.execute<{ relname: string; rls: boolean; forced: boolean }>(sql`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) {
      if (GLOBAL_TABLES.includes(row.relname)) continue;
      expect(row.rls, `RLS disabled on ${row.relname}`).toBe(true);
      if (!NOT_FORCED.includes(row.relname)) {
        expect(row.forced, `RLS not forced on ${row.relname}`).toBe(true);
      }
    }
  });

  it('has an isolation policy on every tenant table', async () => {
    const rows = await owner.db.execute<{ tablename: string }>(sql`
      select distinct tablename from pg_policies where schemaname = 'public'`);
    const withPolicy = new Set(rows.map((r) => r.tablename));
    expect(tenantTables.length).toBeGreaterThanOrEqual(18);
    for (const table of tenantTables) {
      expect(withPolicy.has(table), `no policy on ${table}`).toBe(true);
    }
  });

  it('runs the application as a plain role (no superuser, no BYPASSRLS)', async () => {
    const rows = await app.db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(sql`
      select rolsuper, rolbypassrls from pg_roles where rolname = current_user`);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe('reads', () => {
  it('exposes only the current site in every tenant table', async () => {
    await withSiteContext(app.db, a.siteId, async (tx) => {
      for (const table of tenantTables) {
        const rows = await tx.execute<{ own: string; foreign: string; shared: string }>(sql`
          select count(*) filter (where site_id = ${a.siteId})::text as own,
                 count(*) filter (where site_id <> ${a.siteId})::text as foreign,
                 count(*) filter (where site_id is null)::text as shared
          from ${sql.identifier(table)}`);
        expect(Number(rows[0]?.foreign), `foreign rows visible in ${table}`).toBe(0);
        expect(Number(rows[0]?.own), `own rows missing in ${table}`).toBeGreaterThan(0);
        if (!SHARED_NULL_ROWS.includes(table)) {
          expect(Number(rows[0]?.shared), `site-less rows visible in ${table}`).toBe(0);
        }
      }
    });
  });

  it('shows only the current site and its members', async () => {
    await withSiteContext(app.db, a.siteId, async (tx) => {
      expect((await tx.select().from(s.sites)).map((r) => r.id)).toEqual([a.siteId]);
      expect((await tx.select().from(s.users)).map((r) => r.id)).toEqual([a.userId]);
      const roleSites = new Set((await tx.select().from(s.roles)).map((r) => r.siteId));
      expect(roleSites).toEqual(new Set([a.siteId, null]));
    });
  });

  it('shows nothing tenant-scoped without a site context', async () => {
    for (const table of tenantTables) {
      const rows = await app.db.execute<{ n: string }>(
        sql`select count(*)::text as n from ${sql.identifier(table)} where site_id is not null`,
      );
      expect(Number(rows[0]?.n), `rows visible without context in ${table}`).toBe(0);
    }
    expect(await app.db.select().from(s.sites)).toEqual([]);
    expect(await app.db.select().from(s.users)).toEqual([]);
  });

  it('does not leak the context outside the transaction', async () => {
    await withSiteContext(app.db, a.siteId, async () => {});
    // Same pooled connection, setting reverted to '': must not error, must see nothing.
    expect(await app.db.select().from(s.entries)).toEqual([]);
  });
});

describe('writes', () => {
  it('rejects inserting rows for another site', async () => {
    await expect(
      withSiteContext(app.db, a.siteId, (tx) =>
        tx.insert(s.settings).values({ siteId: b.siteId, namespace: 'core', key: 'x', value: 1 }),
      ),
    ).rejects.toSatisfy(hasPgCode('42501'));
  });

  it('cannot update or delete rows of another site', async () => {
    await withSiteContext(app.db, a.siteId, async (tx) => {
      const updated = await tx
        .update(s.entries)
        .set({ title: 'hijacked' })
        .where(sql`${s.entries.id} = ${b.entryId}`)
        .returning();
      expect(updated).toEqual([]);
      const deleted = await tx
        .delete(s.entries)
        .where(sql`${s.entries.id} = ${b.entryId}`)
        .returning();
      expect(deleted).toEqual([]);
    });
    await withSiteContext(owner.db, b.siteId, async (tx) => {
      const [entry] = await tx
        .select()
        .from(s.entries)
        .where(sql`${s.entries.id} = ${b.entryId}`);
      expect(entry?.title).toBe('Hello beta');
    });
  });

  it('rejects references to another site through composite foreign keys', async () => {
    await expect(
      withSiteContext(app.db, a.siteId, (tx) =>
        tx.insert(s.entryTerms).values({ siteId: a.siteId, entryId: a.entryId, termId: b.termId }),
      ),
    ).rejects.toSatisfy(hasPgCode('23503'));
  });

  it('cannot modify sites, domains or installed plugins', async () => {
    await expect(
      withSiteContext(app.db, a.siteId, (tx) =>
        tx
          .update(s.sites)
          .set({ name: 'x' })
          .where(sql`${s.sites.id} = ${a.siteId}`),
      ),
    ).rejects.toSatisfy(hasPgCode('42501'));
    await expect(
      app.db
        .insert(s.plugins)
        .values({ slug: 'evil', version: '1', apiVersion: '1', manifest: {} }),
    ).rejects.toSatisfy(hasPgCode('42501'));
  });

  it('cannot create or change system roles', async () => {
    await expect(
      withSiteContext(app.db, a.siteId, (tx) =>
        tx.insert(s.roles).values({ slug: 'root', name: 'Root' }),
      ),
    ).rejects.toSatisfy(hasPgCode('42501'));
    await withSiteContext(app.db, a.siteId, async (tx) => {
      const changed = await tx
        .update(s.roles)
        .set({ capabilities: ['everything'] })
        .where(sql`${s.roles.siteId} is null`)
        .returning();
      expect(changed).toEqual([]);
    });
  });
});

describe('site resolution', () => {
  it('resolves hosts without a site context', async () => {
    expect(await resolveSiteByHost(app.db, a.host)).toBe(a.siteId);
    expect(await resolveSiteByHost(app.db, b.host.toUpperCase())).toBe(b.siteId);
    expect(await resolveSiteByHost(app.db, 'unknown.test')).toBeNull();
  });

  it('rejects malformed site ids', async () => {
    await expect(withSiteContext(app.db, "x' or 1=1 --", async () => {})).rejects.toThrow(
      TypeError,
    );
  });
});

function hasPgCode(code: string) {
  return (error: unknown): boolean => {
    let current: unknown = error;
    while (current && typeof current === 'object') {
      if ((current as { code?: unknown }).code === code) return true;
      current = (current as { cause?: unknown }).cause;
    }
    return false;
  };
}

async function seedSite(db: Database, name: string): Promise<SeededSite> {
  const [site] = await db
    .insert(s.sites)
    .values({ slug: name, name: `Site ${name}` })
    .returning();
  const siteId = site!.id;
  const host = `${name}.test`;
  await db.insert(s.siteDomains).values({ siteId, host, isPrimary: true });
  const [user] = await db
    .insert(s.users)
    .values({ email: `${name}@example.com`, displayName: name })
    .returning();
  const userId = user!.id;

  // Tenant tables are FORCEd: even the owner needs the site context.
  return withSiteContext(db, siteId, async (tx) => {
    const [role] = await tx
      .insert(s.roles)
      .values({ siteId, slug: 'editor', name: 'Editor', capabilities: ['edit_entries'] })
      .returning();
    await tx.insert(s.siteMembers).values({ siteId, userId, roleId: role!.id });
    const [token] = await tx
      .insert(s.apiTokens)
      .values({ siteId, userId, name: 'ci', tokenHash: `hash-${name}`, scopes: ['delivery:read'] })
      .returning();
    const clientId = `client-${name}`;
    await tx
      .insert(s.oauthClients)
      .values({ siteId, clientId, name: 'Assistant', redirectUris: ['https://a.example/cb'] });
    const expiresAt = new Date(Date.now() + 60_000);
    await tx.insert(s.oauthCodes).values({
      siteId,
      codeHash: `code-${name}`,
      clientId,
      userId,
      redirectUri: 'https://a.example/cb',
      codeChallenge: 'x',
      scopes: ['read'],
      expiresAt,
    });
    await tx.insert(s.oauthRefreshTokens).values({
      siteId,
      tokenHash: `refresh-${name}`,
      clientId,
      userId,
      apiTokenId: token!.id,
      scopes: ['read'],
      expiresAt,
    });
    await tx.insert(s.contentTypes).values({ siteId, slug: 'page', name: { en: 'Pages' } });
    const [entry] = await tx
      .insert(s.entries)
      .values({
        siteId,
        typeSlug: 'page',
        locale: 'en',
        slug: 'hello',
        title: `Hello ${name}`,
        authorId: userId,
      })
      .returning();
    const entryId = entry!.id;
    await tx.insert(s.revisions).values({
      siteId,
      entryId,
      title: `Hello ${name}`,
      document: { schema: 1, blocks: [] },
      schemaVersion: 1,
    });
    const [taxonomy] = await tx
      .insert(s.taxonomies)
      .values({ siteId, slug: 'category', name: { en: 'Categories' } })
      .returning();
    const [term] = await tx
      .insert(s.terms)
      .values({
        siteId,
        taxonomyId: taxonomy!.id,
        locale: 'en',
        slug: 'news',
        name: 'News',
      })
      .returning();
    const termId = term!.id;
    await tx.insert(s.entryTerms).values({ siteId, entryId, termId });
    const [file] = await tx
      .insert(s.media)
      .values({
        siteId,
        storageKey: `${name}/a.jpg`,
        filename: 'a.jpg',
        mime: 'image/jpeg',
        sizeBytes: 10,
        checksum: `sum-${name}`,
      })
      .returning();
    await tx.insert(s.mediaVariants).values({
      siteId,
      mediaId: file!.id,
      variant: 'thumb',
      format: 'webp',
      storageKey: `${name}/a.thumb.webp`,
      width: 10,
      height: 10,
      sizeBytes: 5,
    });
    const [menu] = await tx
      .insert(s.menus)
      .values({ siteId, slug: 'main', name: 'Main', locale: 'en', location: 'primary' })
      .returning();
    await tx
      .insert(s.menuItems)
      .values({ siteId, menuId: menu!.id, kind: 'entry', entryId, position: 0 });
    await tx.insert(s.settings).values({ siteId, namespace: 'core', key: 'title', value: name });
    await tx.insert(s.redirects).values({ siteId, fromPath: '/old', toPath: '/hello' });
    await tx.insert(s.sitePlugins).values({ siteId, pluginSlug: 'demo', active: true });
    await tx.insert(s.auditLog).values({ siteId, userId, action: 'test.seed' });
    await tx
      .insert(s.entryLocks)
      .values({ siteId, entryId, userId, expiresAt: new Date(Date.now() + 60_000) });
    await tx
      .insert(s.patterns)
      .values({ siteId, title: 'Pattern', document: { schema: 1, blocks: [] }, createdBy: userId });
    return { siteId, host, userId, entryId, termId };
  });
}
