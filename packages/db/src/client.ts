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

/**
 * Runs `fn` in a transaction bound to `siteId`: every query inside only sees
 * and writes rows of that site (PostgreSQL RLS, see docs/ARCHITECTURE.md §8).
 * The setting is transaction-local, so it is safe with connection pooling.
 */
export async function withSiteContext<T>(
  db: Database,
  siteId: string,
  fn: (tx: SiteTransaction) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(siteId)) {
    throw new TypeError(`Invalid site id: ${siteId}`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.site_id', ${siteId}, true)`);
    return fn(tx);
  });
}

/** Checks that the database answers. Throws when it does not. */
export async function ping(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}

/** Resolves a request host to its site id, or null if no active site matches. */
export async function resolveSiteByHost(db: Database, host: string): Promise<string | null> {
  const rows = await db.execute<{ site_id: string | null }>(
    sql`select cleitext_resolve_site(${host.toLowerCase()}) as site_id`,
  );
  return rows[0]?.site_id ?? null;
}
