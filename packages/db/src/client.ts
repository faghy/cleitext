import { AsyncLocalStorage } from 'node:async_hooks';
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
  /** PostgreSQL LISTEN on a channel; returns a function that stops listening. */
  listen(channel: string, onMessage: (payload: string) => void): Promise<() => Promise<void>>;
  /** PostgreSQL NOTIFY (delivered to every listener, this process included). */
  notify(channel: string, payload: string): Promise<void>;
}

export interface CreateDatabaseOptions {
  /** Maximum pool size (default 10). */
  max?: number;
}

/**
 * The site settings a transaction runs with. Plugin transactions also have
 * the plugin's role (and the `search_path` that goes with it).
 */
export interface TransactionContext {
  siteId: string;
  userId?: string | null;
  role?: string;
}

/** A transaction (or a savepoint in one) open in the current async chain. */
interface Scope {
  db: Database;
  tx: SiteTransaction;
  /** Null for a plain `db.transaction`: never shared. */
  context: TransactionContext | null;
  open: boolean;
  /** Savepoints other code is running in this scope: it ends after them. */
  pending: Set<Promise<unknown>>;
  /** Savepoints on one connection must not interleave: one at a time. */
  queue: Promise<unknown>;
}

const scopes = new AsyncLocalStorage<Scope[]>();
const warnedNesting = new Set<string>();

/**
 * A transaction holds a pool connection until it ends. Opening another one on
 * the same pool from inside it needs a second connection: when every request
 * does so at once the pool runs dry, each waits for the others and the app
 * hangs. `withContext` therefore shares the open transaction; this catches
 * the rest. `CLEITEXT_DB_NESTING=error` (tests) throws; otherwise a warning
 * per call site.
 */
function guardNesting(db: Database): void {
  if (!scopes.getStore()?.some((s) => s.db === db && s.open)) return;
  const error = new Error(
    'Connection taken inside a transaction on the same pool: this can exhaust the pool.',
  );
  if (process.env.CLEITEXT_DB_NESTING === 'error') throw error;
  const site = error.stack?.split('\n').slice(2, 6).join('\n') ?? '';
  if (warnedNesting.has(site)) return;
  warnedNesting.add(site);
  process.emitWarning(error.message, { code: 'CLEITEXT_DB_NESTING', detail: site });
}

async function runScope<T>(
  db: Database,
  tx: SiteTransaction,
  context: TransactionContext | null,
  fn: (tx: SiteTransaction) => Promise<T>,
): Promise<T> {
  const scope: Scope = {
    db,
    tx,
    context,
    open: true,
    pending: new Set(),
    queue: Promise.resolve(),
  };
  try {
    return await scopes.run([...(scopes.getStore() ?? []), scope], () => fn(tx));
  } finally {
    // Nothing new starts on this connection (it may soon serve another
    // request); what already started, such as a timed-out hook, ends first.
    scope.open = false;
    while (scope.pending.size > 0) await Promise.allSettled([...scope.pending]);
  }
}

/** The innermost open transaction on `db` whose settings `context` can use. */
function findScope(db: Database, context: TransactionContext): Scope | undefined {
  const stack = scopes.getStore() ?? [];
  for (let i = stack.length - 1; i >= 0; i--) {
    const scope = stack[i]!;
    const outer = scope.context;
    if (
      scope.db === db &&
      scope.open &&
      outer &&
      outer.siteId === context.siteId &&
      outer.role === context.role &&
      // Without a user it may run where one is set (it only sees more of that user).
      (!context.userId || outer.userId === context.userId)
    ) {
      return scope;
    }
  }
  return undefined;
}

/**
 * Runs `fn` as if no transaction were open: what it starts later (e.g. after
 * a timer) takes connections of its own and never joins the caller's
 * transaction, which may be gone by then.
 */
export function detached<T>(fn: () => T): T {
  return scopes.exit(fn);
}

/** Whether `fn` would share an open transaction rather than take a connection. */
export function inTransaction(db: Database, context: TransactionContext): boolean {
  return findScope(db, context) !== undefined;
}

/**
 * Runs `fn` in a transaction with these settings: inside a savepoint of an
 * open one that has them (no second connection), or in a new transaction
 * that `setup` prepares.
 */
export function transactionFor<T>(
  db: Database,
  context: TransactionContext,
  setup: (tx: SiteTransaction) => Promise<unknown>,
  fn: (tx: SiteTransaction) => Promise<T>,
): Promise<T> {
  const outer = findScope(db, context);
  if (!outer) {
    return db.transaction(async (tx) => {
      await setup(tx);
      scopes.getStore()!.at(-1)!.context = context;
      return fn(tx);
    });
  }
  // A savepoint keeps a failure here from aborting the outer transaction.
  const run = outer.queue.then(() =>
    outer.tx.transaction((savepoint) => runScope(db, savepoint, outer.context, fn)),
  );
  outer.queue = run.catch(() => {});
  outer.pending.add(run);
  void run.finally(() => outer.pending.delete(run)).catch(() => {});
  return run;
}

export function createDatabase(url: string, options: CreateDatabaseOptions = {}): DatabaseClient {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  // Queries outside a transaction take a connection too (transactions have their own client).
  const unsafe = client.unsafe.bind(client);
  client.unsafe = ((...args: Parameters<typeof unsafe>) => {
    guardNesting(db);
    return unsafe(...args);
  }) as typeof unsafe;
  const transaction = db.transaction.bind(db);
  db.transaction = (fn, config) => {
    guardNesting(db);
    return transaction((tx) => runScope(db, tx, null, fn), config);
  };
  return {
    db,
    close: () => client.end({ timeout: 5 }),
    async listen(channel, onMessage) {
      const subscription = await client.listen(channel, onMessage);
      return () => subscription.unlisten();
    },
    async notify(channel, payload) {
      // Inside a transaction it goes with it, on its connection: delivered on
      // commit, when the change it announces is visible to other processes.
      const scope = scopes.getStore()?.findLast((s) => s.db === db && s.open);
      if (scope) await scope.tx.execute(sql`select pg_notify(${channel}, ${payload})`);
      else await client.notify(channel, payload);
    },
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
 * with connection pooling. Inside a transaction of the same site it runs in a
 * savepoint of that one, on its connection.
 */
export async function withContext<T>(
  db: Database,
  context: RequestContext,
  fn: (tx: SiteTransaction) => Promise<T>,
): Promise<T> {
  assertUuid(context.siteId, 'site id');
  if (context.userId) assertUuid(context.userId, 'user id');
  return transactionFor(
    db,
    { siteId: context.siteId, userId: context.userId ?? null },
    (tx) =>
      tx.execute(
        sql`select set_config('app.site_id', ${context.siteId}, true),
                   set_config('app.user_id', ${context.userId ?? ''}, true)`,
      ),
    fn,
  );
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

/** Deletes entries left in the trash longer than each site allows (RF-CNT-14). */
export async function purgeTrash(db: Database): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`select cleitext_purge_trash() as n`);
  return Number(rows[0]?.n ?? 0);
}

/** Sites and the plugins active on them (network and must-use ones included). */
export async function pluginSites(db: Database): Promise<{ siteId: string; slug: string }[]> {
  const rows = await db.execute<{ site_id: string; plugin_slug: string }>(
    sql`select * from cleitext_plugin_sites()`,
  );
  return rows.map((r) => ({ siteId: r.site_id, slug: r.plugin_slug }));
}

/** Checks that the database answers. Throws when it does not. */
export async function ping(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}

/**
 * Whether Cleitext is installed: the schema exists and a site was created
 * (RF-SIT-02). Works with the application role.
 */
export async function isInstalled(db: Database): Promise<boolean> {
  const [schema] = await db.execute<{ ready: boolean }>(
    sql`select to_regprocedure('cleitext_is_installed()') is not null as ready`,
  );
  if (!schema?.ready) return false;
  const [row] = await db.execute<{ installed: boolean }>(
    sql`select cleitext_is_installed() as installed`,
  );
  return row?.installed === true;
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
  status: 'active' | 'invited' | 'suspended' | 'pending';
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
