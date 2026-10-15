import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';

export interface RunningPostgres {
  /** Superuser connection URL to the `postgres` database. */
  superuserUrl: string;
  stop(): Promise<void>;
}

export interface StartPostgresOptions {
  /** Data directory. When omitted a temporary, non-persistent one is used. */
  dataDir?: string;
  /** TCP port. When omitted a free port is picked. */
  port?: number;
  /** Forward PostgreSQL logs to the console. */
  verbose?: boolean;
}

/**
 * Starts a real PostgreSQL server from the `embedded-postgres` binaries.
 * No system installation and no containers are needed.
 */
export async function startEmbeddedPostgres(
  options: StartPostgresOptions = {},
): Promise<RunningPostgres> {
  keepExitCode();
  const persistent = options.dataDir !== undefined;
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'cleitext-pg-')));
  const port = options.port ?? (await getFreePort());
  const password = 'postgres';
  const log = options.verbose ? (m: unknown) => console.log(String(m)) : () => {};

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'postgres',
    password,
    authMethod: 'scram-sha-256',
    persistent,
    // C everywhere: messages too, so the data folder works on any system locale.
    initdbFlags: ['--encoding=UTF8', '--locale=C', '--lc-messages=C'],
    onLog: log,
    onError: log,
  });

  if (!persistent || !(await isInitialised(dataDir))) {
    await pg.initialise();
  }
  await pg.start();

  return {
    superuserUrl: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
    async stop() {
      await pg.stop();
      if (!persistent) {
        await rm(dataDir, { recursive: true, force: true });
      }
    },
  };
}

export interface ProvisionOptions {
  /** Database name; random when omitted. */
  database?: string;
  /** Owner role (runs migrations); random when omitted. */
  ownerRole?: string;
  /** Application role (used by the server, subject to RLS); random when omitted. */
  appRole?: string;
  /** Passwords; random when omitted. */
  ownerPassword?: string;
  appPassword?: string;
}

export interface ProvisionedDatabase {
  database: string;
  ownerRole: string;
  appRole: string;
  /** Connection URL for the owner (DATABASE_ADMIN_URL). */
  ownerUrl: string;
  /** Connection URL for the application role (DATABASE_URL). */
  appUrl: string;
  /** Drops the database and both roles. */
  drop(): Promise<void>;
}

/**
 * Creates a database owned by a dedicated owner role, plus a separate
 * application role, mirroring a production setup. Idempotent when names are
 * given (existing roles and databases are reused).
 */
export async function provisionDatabase(
  superuserUrl: string,
  options: ProvisionOptions = {},
): Promise<ProvisionedDatabase> {
  const suffix = randomBytes(4).toString('hex');
  const database = options.database ?? `cleitext_test_${suffix}`;
  const ownerRole = options.ownerRole ?? `cleitext_owner_${suffix}`;
  const appRole = options.appRole ?? `cleitext_app_${suffix}`;
  const ownerPassword = options.ownerPassword ?? randomBytes(12).toString('hex');
  const appPassword = options.appPassword ?? randomBytes(12).toString('hex');

  const su = postgres(superuserUrl, { max: 1, onnotice: () => {} });
  try {
    await ensureRole(su, ownerRole, ownerPassword, { createRole: true });
    await ensureRole(su, appRole, appPassword);
    const exists = await su`select 1 from pg_database where datname = ${database}`;
    if (exists.length === 0) {
      await su.unsafe(`create database ${ident(database)} owner ${ident(ownerRole)}`);
    }
  } finally {
    await su.end({ timeout: 5 });
  }

  const base = new URL(superuserUrl);
  const urlFor = (user: string, password: string) => {
    const url = new URL(base);
    url.username = user;
    url.password = password;
    url.pathname = `/${database}`;
    return url.toString();
  };

  return {
    database,
    ownerRole,
    appRole,
    ownerUrl: urlFor(ownerRole, ownerPassword),
    appUrl: urlFor(appRole, appPassword),
    async drop() {
      const conn = postgres(superuserUrl, { max: 1, onnotice: () => {} });
      try {
        await conn.unsafe(`drop database if exists ${ident(database)} with (force)`);
        await conn.unsafe(`drop role if exists ${ident(appRole)}`);
        await conn.unsafe(`drop role if exists ${ident(ownerRole)}`);
      } finally {
        await conn.end({ timeout: 5 });
      }
    },
  };
}

async function ensureRole(
  su: postgres.Sql,
  role: string,
  password: string,
  options: { createRole?: boolean } = {},
): Promise<void> {
  const exists = await su`select 1 from pg_roles where rolname = ${role}`;
  const verb = exists.length === 0 ? 'create' : 'alter';
  // Plain LOGIN roles: no superuser, no BYPASSRLS, no CREATEDB. The owner may
  // create roles (one per plugin, see docs/ARCHITECTURE.md §11.6); since
  // PostgreSQL 16 that only gives it power over the roles it creates.
  const attributes = options.createRole ? 'login createrole' : 'login nocreaterole';
  await su.unsafe(
    `${verb} role ${ident(role)} ${attributes} password '${password.replace(/'/g, "''")}'`,
  );
}

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

async function isInitialised(dataDir: string): Promise<boolean> {
  try {
    const { access } = await import('node:fs/promises');
    await access(join(dataDir, 'PG_VERSION'));
    return true;
  } catch {
    return false;
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Could not allocate a free port'));
      });
    });
  });
}

let exitCodeKept = false;

/**
 * `embedded-postgres` loads `async-exit-hook`, which calls `process.exit(0)`
 * on `beforeExit`: the code a test runner set for failed tests would be lost
 * and CI would pass. Restore it on the way out.
 */
function keepExitCode(): void {
  if (exitCodeKept) return;
  exitCodeKept = true;
  let code: typeof process.exitCode;
  process.prependListener('beforeExit', () => {
    code = process.exitCode;
  });
  process.prependListener('exit', () => {
    if (code && code !== 0 && !process.exitCode) process.exitCode = code;
  });
}
