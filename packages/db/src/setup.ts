import { randomBytes } from 'node:crypto';
import { constants, existsSync, lstatSync, realpathSync } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { sql } from 'drizzle-orm';
import { createDatabase } from './client.js';

/**
 * The database step of the setup wizard (RF-SIT-02) and of `cleitext
 * configure`: checks the owner the user entered, creates the application role
 * (the one the running server uses, subject to Row Level Security) and writes
 * the configuration.
 */

export const ROLE_RE = /^[a-z_][a-z0-9_]{0,62}$/i;

export interface DatabaseInput {
  host: string;
  port: number;
  database: string;
  owner: string;
  ownerPassword: string;
  appRole: string;
  /**
   * The application role's password to set; default: a new random one. `cleitext
   * configure` passes the current one again, so a second run changes nothing.
   */
  appPassword?: string;
}

/** Problems the user can fix, with the exact command when one is needed. */
export type CheckProblem =
  | { kind: 'connect'; error: string }
  | { kind: 'version'; version: string }
  | { kind: 'createrole'; command: string }
  | { kind: 'owner'; command: string }
  | { kind: 'role-taken' }
  | { kind: 'app-connect'; error: string }
  | { kind: 'admin-connect'; error: string }
  | { kind: 'admin-rights' }
  | { kind: 'owner-exists' }
  | { kind: 'database-taken'; owner: string }
  | { kind: 'create'; error: string };

export class SetupProblem extends Error {
  constructor(readonly problem: CheckProblem) {
    super(problem.kind);
  }
}

export function databaseUrl(input: DatabaseInput, user: string, password: string): string {
  const url = new URL('postgres://localhost');
  url.hostname = input.host;
  url.port = String(input.port);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(password);
  url.pathname = `/${encodeURIComponent(input.database)}`;
  return url.toString();
}

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Commands to run as root, quoted for the shell and for SQL. */
const asRoot = (statement: string) =>
  `sudo -u postgres psql -c '${statement.replaceAll("'", "'\\''")}'`;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('no answer within 15 seconds')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Connects as the owner and prepares the application role. Returns the
 * application role's password (`input.appPassword`, or random and new each time).
 */
export async function prepareDatabase(input: DatabaseInput): Promise<string> {
  const owner = createDatabase(databaseUrl(input, input.owner, input.ownerPassword), { max: 1 });
  try {
    let facts: {
      version: number;
      version_text: string;
      can_create_roles: boolean;
      owns_database: boolean;
      role_exists: boolean;
    };
    try {
      const rows = await withTimeout(
        owner.db.execute<typeof facts>(sql`
          select current_setting('server_version_num')::int as version,
                 current_setting('server_version') as version_text,
                 (r.rolsuper or r.rolcreaterole) as can_create_roles,
                 (r.rolsuper or d.datdba = r.oid) as owns_database,
                 exists (select 1 from pg_roles where rolname = ${input.appRole}) as role_exists
          from pg_roles r, pg_database d
          where r.rolname = current_user and d.datname = current_database()`),
        15_000,
      );
      facts = rows[0]!;
    } catch (error) {
      throw new SetupProblem({ kind: 'connect', error: (error as Error).message });
    }
    if (facts.version < 160000) {
      throw new SetupProblem({ kind: 'version', version: facts.version_text });
    }
    if (!facts.can_create_roles) {
      throw new SetupProblem({
        kind: 'createrole',
        command: asRoot(`ALTER ROLE ${ident(input.owner)} CREATEROLE;`),
      });
    }
    if (!facts.owns_database) {
      throw new SetupProblem({
        kind: 'owner',
        command: asRoot(`ALTER DATABASE ${ident(input.database)} OWNER TO ${ident(input.owner)};`),
      });
    }

    // Hex only: safe inside a SQL literal and a URL.
    const password =
      input.appPassword && /^[0-9a-f]{32,128}$/i.test(input.appPassword)
        ? input.appPassword
        : randomBytes(24).toString('hex');
    try {
      // An existing role keeps its attributes: since PostgreSQL 16 the owner may
      // only change those it has itself (it lacks CREATEDB), so naming them fails.
      await owner.db.execute(
        sql.raw(
          facts.role_exists
            ? `ALTER ROLE ${ident(input.appRole)} WITH LOGIN PASSWORD '${password}'`
            : `CREATE ROLE ${ident(input.appRole)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
        ),
      );
    } catch {
      // An existing role created by someone else: the owner has no rights on it.
      throw new SetupProblem({ kind: 'role-taken' });
    }
    // Usually granted to PUBLIC already; the check below tells if it is missing.
    await owner.db
      .execute(
        sql.raw(`GRANT CONNECT ON DATABASE ${ident(input.database)} TO ${ident(input.appRole)}`),
      )
      .catch(() => {});

    const app = createDatabase(databaseUrl(input, input.appRole, password), { max: 1 });
    try {
      await withTimeout(app.db.execute(sql`select 1`), 15_000);
    } catch (error) {
      throw new SetupProblem({ kind: 'app-connect', error: (error as Error).message });
    } finally {
      await app.close();
    }
    return password;
  } finally {
    await owner.close();
  }
}

export interface AdminInput {
  host: string;
  port: number;
  /** PostgreSQL administrator (Plesk: Tools & Settings → Database Servers). Never stored. */
  user: string;
  password: string;
  database: string;
  owner: string;
}

/**
 * Creates the owner role (with CREATEROLE) and the database it owns, as the
 * PostgreSQL administrator, as hosting panels do. Returns the owner's password
 * (random). An existing empty database of that owner is reused.
 */
export async function createDatabaseAs(admin: AdminInput): Promise<string> {
  const target = { host: admin.host, port: admin.port, database: 'postgres' } as DatabaseInput;
  const su = createDatabase(databaseUrl(target, admin.user, admin.password), { max: 1 });
  try {
    let facts: { allowed: boolean; owner_exists: boolean; database_owner: string | null };
    try {
      const rows = await withTimeout(
        su.db.execute<typeof facts>(sql`
          select (r.rolsuper or (r.rolcreaterole and r.rolcreatedb)) as allowed,
                 exists (select 1 from pg_roles where rolname = ${admin.owner}) as owner_exists,
                 (select pg_get_userbyid(datdba) from pg_database where datname = ${admin.database}) as database_owner
          from pg_roles r where r.rolname = current_user`),
        15_000,
      );
      facts = rows[0]!;
    } catch (error) {
      throw new SetupProblem({ kind: 'admin-connect', error: (error as Error).message });
    }
    if (!facts.allowed) throw new SetupProblem({ kind: 'admin-rights' });
    if (facts.database_owner && facts.database_owner !== admin.owner) {
      throw new SetupProblem({ kind: 'database-taken', owner: facts.database_owner });
    }
    // Someone else's user is never taken over (its password would change).
    if (facts.owner_exists && !facts.database_owner)
      throw new SetupProblem({ kind: 'owner-exists' });

    const password = randomBytes(24).toString('hex');
    try {
      await su.db.execute(
        sql.raw(
          `${facts.owner_exists ? 'ALTER' : 'CREATE'} ROLE ${ident(admin.owner)} WITH LOGIN CREATEROLE NOSUPERUSER PASSWORD '${password}'`,
        ),
      );
      if (!facts.database_owner) {
        await su.db.execute(
          sql.raw(`CREATE DATABASE ${ident(admin.database)} OWNER ${ident(admin.owner)}`),
        );
      }
    } catch (error) {
      throw new SetupProblem({ kind: 'create', error: (error as Error).message });
    }
    return password;
  } finally {
    await su.close();
  }
}

/** The default data folder: next to the application folder, outside the web root. */
export function defaultDataDir(root: string): string {
  return join(dirname(root), 'cleitext-shared');
}

/** Whether a folder exists and is writable, or could be created. */
export async function canWrite(path: string): Promise<boolean> {
  let target = path;
  while (!existsSync(target)) {
    const parent = dirname(target);
    if (parent === target) return false;
    target = parent;
  }
  try {
    await access(target, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export interface ConfigurationInput {
  root: string;
  dataDir: string;
  databaseUrl: string;
  adminUrl: string;
  /**
   * TRUST_PROXY: true (loopback and private networks, config/trust-proxy.ts),
   * false, a number of hops or a list of addresses and networks.
   */
  trustProxy: boolean | string;
  /** TRUST_CLOUDFLARE=true; omitted from the file when false. */
  trustCloudflare?: boolean;
  /** The APP_SECRET to keep (`cleitext configure` run again); default: a new one. */
  appSecret?: string;
  /** Other settings written after these (e.g. MAIL_URL kept from the previous file). */
  extra?: Record<string, string>;
}

/** The settings `writeConfiguration` writes itself. */
export const MANAGED_SETTINGS = [
  'NODE_ENV',
  'DATABASE_URL',
  'DATABASE_ADMIN_URL',
  'APP_SECRET',
  'TRUST_PROXY',
  'TRUST_CLOUDFLARE',
  'MEDIA_PATH',
  'PLUGINS_PATH',
  'THEMES_PATH',
];

/** The KEY=value lines of a .env file (comments and blank lines left out). */
export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2]!;
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    result[match[1]!] = value;
  }
  return result;
}

/**
 * Writes `.env` in the data folder (mode 600) and links it from the
 * application folder, where `app.js` reads it; creates the data folders.
 * Returns the path of the written file. A file with the same settings is
 * left as it is; a different one is kept as `.env.bak-<date>`.
 */
export async function writeConfiguration(input: ConfigurationInput): Promise<string> {
  for (const folder of ['media', 'plugins', 'themes', 'backups']) {
    await mkdir(join(input.dataDir, folder), { recursive: true });
  }
  await chmod(input.dataDir, 0o750);
  const file = join(input.dataDir, '.env');
  const lines = [
    '# Cleitext configuration, written by the setup wizard. Keep it private (mode 600).',
    '# The other settings are listed in .env.example.',
    'NODE_ENV=production',
    `DATABASE_URL=${input.databaseUrl}`,
    `DATABASE_ADMIN_URL=${input.adminUrl}`,
    `APP_SECRET=${input.appSecret && input.appSecret.length >= 32 ? input.appSecret : randomBytes(32).toString('hex')}`,
    `TRUST_PROXY=${input.trustProxy}`,
    ...(input.trustCloudflare ? ['TRUST_CLOUDFLARE=true'] : []),
    `MEDIA_PATH=${join(input.dataDir, 'media')}`,
    `PLUGINS_PATH=${join(input.dataDir, 'plugins')}`,
    `THEMES_PATH=${join(input.dataDir, 'themes')}`,
    ...Object.entries(input.extra ?? {})
      .filter(([key, value]) => !MANAGED_SETTINGS.includes(key) && !/[\r\n]/.test(value))
      .map(([key, value]) => `${key}=${value}`),
    '',
  ];
  const text = lines.join('\n');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const before = existsSync(file) ? await readFile(file, 'utf8').catch(() => null) : null;
  if (before !== text) {
    if (before !== null) await rename(file, `${file}.bak-${stamp}`);
    await writeFile(file, text, { mode: 0o600 });
  }
  await chmod(file, 0o600);

  const link = join(input.root, '.env');
  if (link !== file && !linksTo(link, file)) {
    if (isPresent(link)) await rename(link, `${link}.bak-${stamp}`);
    try {
      await symlink(relative(input.root, file), link);
    } catch {
      await copyFile(file, link);
      await chmod(link, 0o600);
    }
  }
  return file;
}

/** Whether `link` is a symbolic link to `file`. */
function linksTo(link: string, file: string): boolean {
  try {
    return lstatSync(link).isSymbolicLink() && realpathSync(link) === realpathSync(file);
  } catch {
    return false;
  }
}

function isPresent(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
