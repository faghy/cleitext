import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;
/** A transaction scoped to a single site (RLS context set). */
export type SiteTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DatabaseClient {
  db: Database;
  /** Closes the connection pool. */
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  /** Maximum pool size (default 10). */
  max?: number;
}

export function createDatabase(url: string, options: CreateDatabaseOptions = {}): DatabaseClient {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return {
    db,
    close: () => client.end({ timeout: 5 }),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new TypeError(`Invalid ${label}: ${value}`);
  }
}

export interface RequestContext {
  /** Tenant: queries only see this site's rows (RLS). */
  siteId: string;
  /** Authenticated user, if any. Lets the user read their own record. */
  userId?: string | null;
}

/**
 * Runs `fn` in a transaction bound to a site (and optionally a user): every
 * query inside only sees and writes rows of that site (PostgreSQL RLS, see
 * docs/ARCHITECTURE.md §8). Settings are transaction-local, so this is safe
 * with connection pooling.
 */
export async function withContext<T>(
  db: Database,
  context: RequestContext,
  fn: (tx: SiteTransaction) => Promise<T>,
): Promise<T> {
  assertUuid(context.siteId, 'site id');
  if (context.userId) assertUuid(context.userId, 'user id');
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.site_id', ${context.siteId}, true),
                 set_config('app.user_id', ${context.userId ?? ''}, true)`,
    );
    return fn(tx);
  });
}

/** Shorthand for `withContext` without a user. */
export function withSiteContext<T>(
  db: Database,
  siteId: string,
  fn: (tx: SiteTransaction) => Promise<T>,
): Promise<T> {
  return withContext(db, { siteId }, fn);
}

/** Creates the default content types and taxonomies of a site (idempotent). */
export async function seedSiteDefaults(db: Database, siteId: string): Promise<void> {
  assertUuid(siteId, 'site id');
  await db.execute(sql`select cleitext_seed_site_defaults(${siteId}::uuid)`);
}

/** Publishes scheduled entries that are due, on every site. Returns how many. */
export async function publishDueEntries(db: Database): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`select cleitext_publish_due_entries() as n`);
  return Number(rows[0]?.n ?? 0);
}

/** Checks that the database answers. Throws when it does not. */
export async function ping(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}

/** Resolves a request host to its site id, or null if no active site matches. */
export async function resolveSiteByHost(db: Database, host: string): Promise<string | null> {
  return (await resolveHost(db, host))?.siteId ?? null;
}

export interface HostResolution {
  siteId: string;
  siteStatus: 'active' | 'maintenance';
  isPrimary: boolean;
  forceHttps: boolean;
  primaryHost: string | null;
}

/** Resolves a request host (no port) to its site and domain policy. */
export async function resolveHost(db: Database, host: string): Promise<HostResolution | null> {
  const rows = await db.execute<{
    site_id: string;
    site_status: 'active' | 'maintenance';
    is_primary: boolean;
    force_https: boolean;
    primary_host: string | null;
  }>(sql`select * from cleitext_resolve_host(${host.toLowerCase()})`);
  const row = rows[0];
  if (!row) return null;
  return {
    siteId: row.site_id,
    siteStatus: row.site_status,
    isPrimary: row.is_primary,
    forceHttps: row.force_https,
    primaryHost: row.primary_host,
  };
}

export interface LoginRecord {
  userId: string;
  passwordHash: string | null;
  status: 'active' | 'invited' | 'suspended';
  isSuperAdmin: boolean;
}

/** Looks up login data by email, across sites (no context needed). */
export async function findLogin(db: Database, email: string): Promise<LoginRecord | null> {
  const rows = await db.execute<{
    user_id: string;
    password_hash: string | null;
    status: LoginRecord['status'];
    is_super_admin: boolean;
  }>(sql`select * from cleitext_find_login(${email.trim().toLowerCase()})`);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    passwordHash: row.password_hash,
    status: row.status,
    isSuperAdmin: row.is_super_admin,
  };
}

/** Sites the context user can access. Must run inside `withContext` with a user. */
export async function listMySites(
  tx: SiteTransaction,
): Promise<{ id: string; name: string; host: string | null }[]> {
  const rows = await tx.execute<{ site_id: string; name: string; primary_host: string | null }>(
    sql`select * from cleitext_my_sites()`,
  );
  return rows.map((r) => ({ id: r.site_id, name: r.name, host: r.primary_host }));
}
