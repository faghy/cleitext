/**
 * `cleitext configure`: the database step of the setup wizard from the
 * command line, for hosting panels that create the database themselves.
 * It prepares the application role and writes `cleitext-shared/.env`
 * (mode 600), linked from the release folder as `cleitext update` expects.
 * Running it again keeps APP_SECRET, the application role's password and
 * the other settings of the file.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import {
  databaseUrl,
  defaultDataDir,
  MANAGED_SETTINGS,
  parseEnvFile,
  prepareDatabase,
  ROLE_RE,
  SetupProblem,
  writeConfiguration,
  type DatabaseInput,
} from '@cleitext/db';
import { OperationError } from './operations.js';
import { layoutOf } from './update.js';

export interface ConfigureOptions {
  root: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  owner: string;
  ownerPassword: string;
  appRole?: string;
  dataDir?: string;
  appUrl?: string;
  trustProxy?: string;
  trustCloudflare?: boolean;
  /**
   * Another installation's .env to take APP_SECRET from: a copy of a site
   * (clone) needs it to read 2FA secrets, the SMTP password and licenses.
   */
  appSecretFrom?: string;
}

export interface ConfigureResult {
  envFile: string;
  /** Where the release reads it from (a link to envFile). */
  envLink: string;
  dataDir: string;
  appRole: string;
  /** False when the file already had these settings. */
  changed: boolean;
  /** APP_SECRET: kept from the previous file, copied (--app-secret-from) or new. */
  secret: 'kept' | 'copied' | 'new';
}

/** TRUST_PROXY as the server accepts it (apps/server/src/config/trust-proxy.ts). */
export function validTrustProxy(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (['true', 'false', '0', '1'].includes(text)) return true;
  if (/^\d+$/.test(text)) return Number(text) >= 1 && Number(text) <= 100;
  return text.split(',').every((entry) => {
    const item = entry.trim();
    if (['loopback', 'linklocal', 'uniquelocal'].includes(item)) return true;
    const [address = '', bits, extra] = item.split('/');
    if (extra !== undefined || !isIP(address)) return false;
    if (bits === undefined) return true;
    const max = isIP(address) === 4 ? 32 : 128;
    return /^\d+$/.test(bits) && Number(bits) <= max;
  });
}

/** The release folder and the default data folder, for both layouts. */
export function configurationPlaces(root: string): { release: string; dataDir: string } {
  const layout = layoutOf(root);
  if (layout.kind === 'releases') {
    // releases/cleitext-<v> → <domain>/cleitext-shared, next to releases/.
    return { release: layout.current, dataDir: defaultDataDir(layout.releases) };
  }
  return { release: layout.dir, dataDir: defaultDataDir(layout.dir) };
}

const problemMessages: Record<string, (p: SetupProblem['problem'], o: ConfigureOptions) => string> =
  {
    connect: (p) => `Could not connect to the database: ${'error' in p ? p.error : ''}`,
    version: (p) =>
      `PostgreSQL ${'version' in p ? p.version : ''} is too old: Cleitext needs version 16 or later.`,
    createrole: (p, o) =>
      `The user ${o.owner} cannot create other users (CREATEROLE); run as root on the database server: ${'command' in p ? p.command : ''}`,
    owner: (p, o) =>
      `The user ${o.owner} does not own the database ${o.dbName}; run as root on the database server: ${'command' in p ? p.command : ''}`,
    'role-taken': (_p, o) =>
      `A database user named ${o.appRole ?? ''} already exists and cannot be changed by the owner: choose another --app-role.`,
    'app-connect': (p) =>
      `The application user was created, but cannot connect: ${'error' in p ? p.error : ''}`,
  };

export async function configure(options: ConfigureOptions): Promise<ConfigureResult> {
  for (const [label, value] of [
    ['--db-name', options.dbName],
    ['--owner', options.owner],
  ] as const) {
    if (!ROLE_RE.test(value))
      throw new OperationError(
        `${label}: use letters, digits and underscores, starting with a letter.`,
        'invalid_option',
      );
  }
  const appRole = options.appRole || `${options.dbName}_app`.slice(0, 63);
  if (!ROLE_RE.test(appRole) || appRole.toLowerCase() === options.owner.toLowerCase()) {
    throw new OperationError(
      '--app-role: use letters, digits and underscores, and a name other than the owner.',
      'invalid_option',
    );
  }
  if (!Number.isInteger(options.dbPort) || options.dbPort < 1 || options.dbPort > 65_535)
    throw new OperationError('--db-port must be a port number.', 'invalid_option');
  if (!options.ownerPassword) {
    throw new OperationError(
      "Give the owner's password on stdin or in CLEITEXT_DB_OWNER_PASSWORD.",
      'password_required',
    );
  }
  if (options.appUrl) {
    let url: URL | null = null;
    try {
      url = new URL(options.appUrl);
    } catch {
      // Reported below.
    }
    if (!url || !['http:', 'https:'].includes(url.protocol)) {
      throw new OperationError('--app-url must be an http(s) address.', 'invalid_option');
    }
  }

  const places = configurationPlaces(options.root);
  const dataDir = path.resolve(options.dataDir ?? places.dataDir);
  const envFile = path.join(dataDir, '.env');
  const previous = existsSync(envFile) ? parseEnvFile(await readFile(envFile, 'utf8')) : {};
  // Not given: as in the previous file, or the wizard's default (behind Plesk's nginx).
  const trustProxy = options.trustProxy ?? previous.TRUST_PROXY ?? 'true';
  const trustCloudflare = options.trustCloudflare ?? previous.TRUST_CLOUDFLARE === 'true';
  if (!validTrustProxy(trustProxy)) {
    throw new OperationError(
      '--trust-proxy: use true, false, a number of hops or a comma-separated list of addresses and networks.',
      'invalid_option',
    );
  }
  if (
    trustCloudflare &&
    /^\d+$/.test(trustProxy.trim()) &&
    !['0', '1'].includes(trustProxy.trim())
  ) {
    throw new OperationError(
      '--trust-cloudflare cannot be combined with a number of hops.',
      'invalid_option',
    );
  }
  // The same role again: its password stays, so the running site keeps working.
  let appPassword: string | undefined;
  if (previous.DATABASE_URL) {
    try {
      const url = new URL(previous.DATABASE_URL);
      if (decodeURIComponent(url.username) === appRole)
        appPassword = decodeURIComponent(url.password);
    } catch {
      // A broken URL: a new password.
    }
  }

  const input: DatabaseInput = {
    host: options.dbHost,
    port: options.dbPort,
    database: options.dbName,
    owner: options.owner,
    ownerPassword: options.ownerPassword,
    appRole,
    ...(appPassword ? { appPassword } : {}),
  };
  let password: string;
  try {
    password = await prepareDatabase(input);
  } catch (error) {
    if (error instanceof SetupProblem) {
      const message = problemMessages[error.problem.kind]?.(error.problem, {
        ...options,
        appRole,
      });
      throw new OperationError(
        message ?? error.message,
        `db_${error.problem.kind.replace('-', '_')}`,
      );
    }
    throw error;
  }

  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(previous)) {
    if (!MANAGED_SETTINGS.includes(key)) extra[key] = value;
  }
  if (options.appUrl) extra.APP_URL = options.appUrl.replace(/\/+$/, '');
  const before = existsSync(envFile) ? await readFile(envFile, 'utf8') : null;
  let secret: ConfigureResult['secret'] = 'new';
  let appSecret: string | undefined;
  if (options.appSecretFrom) {
    const source = existsSync(options.appSecretFrom)
      ? parseEnvFile(await readFile(options.appSecretFrom, 'utf8')).APP_SECRET
      : undefined;
    if (!source || source.length < 32) {
      throw new OperationError(
        `--app-secret-from: no APP_SECRET in ${options.appSecretFrom}.`,
        'invalid_option',
      );
    }
    [secret, appSecret] = [source === previous.APP_SECRET ? 'kept' : 'copied', source];
  } else if (previous.APP_SECRET && previous.APP_SECRET.length >= 32) {
    [secret, appSecret] = ['kept', previous.APP_SECRET];
  }
  await writeConfiguration({
    root: places.release,
    dataDir,
    databaseUrl: databaseUrl(input, appRole, password),
    adminUrl: databaseUrl(input, options.owner, options.ownerPassword),
    trustProxy,
    trustCloudflare,
    ...(appSecret ? { appSecret } : {}),
    extra,
  });
  const after = await readFile(envFile, 'utf8');
  return {
    envFile,
    envLink: path.join(places.release, '.env'),
    dataDir,
    appRole,
    changed: before !== after,
    secret,
  };
}
