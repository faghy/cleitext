/**
 * `cleitext doctor`: checks of an installation, each `ok`, `warn` or `fail`
 * with what to do. A check that cannot run says so (`warn`) instead of
 * stopping the others.
 */
import { execFile } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs';
import { lstat, readdir, statfs } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createDatabase, getMigrationStatus, type Database } from '@cleitext/db';
import { sql } from 'drizzle-orm';
import { availableUpdates, readCatalog } from './catalog.js';
import {
  connectionSettings,
  envFileOf,
  mediaPath,
  pluginsPath,
  themesPath,
  versionIn,
  withTimeout,
} from './context.js';
import { listPlugins } from './plugins.js';
import { siteSummaries } from './operations.js';
import { listThemes } from './themes.js';
import { findRelease, isNewer, layoutOf } from './update.js';

const run = promisify(execFile);

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  id: string;
  status: CheckStatus;
  message: string;
  /** What to do, often a command. */
  fix?: string;
}

export interface DoctorOptions {
  root: string;
  /** Skip the checks that need the internet (core, plugin and theme updates). */
  offline?: boolean;
  repo?: string;
  fetchImpl?: typeof fetch;
}

export interface DoctorReport {
  checks: Check[];
  /** The worst status of all checks. */
  status: CheckStatus;
}

const ok = (id: string, message: string): Check => ({ id, status: 'ok', message });
const warn = (id: string, message: string, fix?: string): Check => ({
  id,
  status: 'warn',
  message,
  ...(fix ? { fix } : {}),
});
const fail = (id: string, message: string, fix?: string): Check => ({
  id,
  status: 'fail',
  message,
  ...(fix ? { fix } : {}),
});

/** pg_dump in PG_BIN, the PATH, or where Debian, Ubuntu and RHEL install it. */
export function findPgDump(): string | null {
  const dirs = [process.env.PG_BIN, ...(process.env.PATH ?? '').split(path.delimiter)].filter(
    (d): d is string => Boolean(d),
  );
  for (const base of ['/usr/lib/postgresql', '/usr/pgsql']) {
    for (const v of ['18', '17', '16'])
      dirs.push(base === '/usr/pgsql' ? `${base}-${v}/bin` : `${base}/${v}/bin`);
  }
  for (const dir of dirs) {
    const file = path.join(dir, 'pg_dump');
    if (existsSync(file)) return file;
  }
  return null;
}

/** Bytes used by a folder (links not followed). */
async function folderSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await folderSize(file);
    else if (entry.isFile()) total += (await lstat(file).catch(() => null))?.size ?? 0;
  }
  return total;
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const checks: Check[] = [];
  const add = async (fn: () => Promise<Check | Check[]> | Check | Check[], id: string) => {
    try {
      const result = await fn();
      checks.push(...(Array.isArray(result) ? result : [result]));
    } catch (error) {
      checks.push(warn(id, `Could not check: ${error instanceof Error ? error.message : error}`));
    }
  };
  const layout = layoutOf(options.root);
  const current = layout.kind === 'folder' ? layout.dir : layout.current;
  const version = versionIn(current) ?? '0.0.0';
  const configured = Boolean(process.env.DATABASE_ADMIN_URL);

  // ---- Files ----------------------------------------------------------------------------
  await add(() => {
    const file = envFileOf(current);
    if (!file) {
      return fail(
        'env_file',
        `No .env in ${current}: Cleitext is not configured.`,
        'bin/cleitext configure --json … (or open the site to run the setup wizard)',
      );
    }
    const mode = statSync(file).mode & 0o777;
    return mode & 0o077
      ? fail(
          'env_file',
          `${file} can be read by other users (mode ${mode.toString(8)}).`,
          `chmod 600 ${file}`,
        )
      : ok('env_file', `${file} has mode ${mode.toString(8).padStart(3, '0')}.`);
  }, 'env_file');

  await add(() => {
    const site = layout.kind === 'releases' ? layout.link : current;
    const docroot = path.join(site, 'public');
    if (!existsSync(docroot)) {
      return warn('document_root', `${docroot} does not exist.`, `mkdir -p ${docroot}`);
    }
    const name = path.relative(path.dirname(site), docroot);
    // The default page Plesk puts in httpdocs: often the document root was not changed.
    const httpdocs = path.join(path.dirname(site), 'httpdocs');
    const plesk =
      existsSync(httpdocs) &&
      readdirSync(httpdocs).some((f) => f === 'index.html' || f === 'index.php');
    return plesk
      ? warn(
          'document_root',
          `httpdocs still has a default page: check that the domain's document root is ${name}.`,
          `Set the document root to ${name} (Plesk: Hosting settings, and Node.js).`,
        )
      : ok('document_root', `The document root should be ${name} (${docroot}).`);
  }, 'document_root');

  await add(() => {
    const token = path.join(current, 'tmp', 'setup-token');
    return existsSync(token)
      ? warn('setup_token', `A setup token was left in ${token}.`, `rm ${token}`)
      : ok('setup_token', 'No setup token left on disk.');
  }, 'setup_token');

  // ---- Settings -------------------------------------------------------------------------
  await add(() => {
    const value = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
    if (value === '' || value === 'false' || value === '0') {
      return warn(
        'trust_proxy',
        'TRUST_PROXY is off: behind a proxy (Plesk, nginx) every visitor gets the address of the proxy, so rate limits and the activity log go wrong.',
        'Set TRUST_PROXY=true in .env when the site runs behind nginx or Plesk.',
      );
    }
    if (/^\d+$/.test(value) && value !== '1') {
      return warn(
        'trust_proxy',
        `TRUST_PROXY=${value} trusts ${value} hops whatever their address: only safe when nobody reaches Cleitext directly.`,
        'Prefer TRUST_PROXY=true or a list of the proxies.',
      );
    }
    return ok('trust_proxy', `TRUST_PROXY=${process.env.TRUST_PROXY}.`);
  }, 'trust_proxy');

  // ---- Database -------------------------------------------------------------------------
  let db: Database | null = null;
  const client = configured
    ? createDatabase(connectionSettings().ownerUrl, { max: 1, connectTimeout: 10 })
    : null;
  try {
    if (client) {
      await add(async () => {
        await withTimeout(client.db.execute(sql`select 1`), 15_000, 'The database');
        db = client.db;
        return ok('database', 'The database answers.');
      }, 'database');
      if (!db) checks.at(-1)!.status = 'fail';
    } else {
      checks.push(
        fail('database', 'DATABASE_ADMIN_URL is not set.', 'bin/cleitext configure --json …'),
      );
    }
    const owner = db as Database | null;

    await add(async () => {
      const urls = [
        ...(process.env.APP_URL ? [process.env.APP_URL] : []),
        ...(owner ? (await siteSummaries(owner)).map((s) => s.url).filter(Boolean) : []),
      ] as string[];
      if (urls.length === 0) return warn('https', 'No address to check (no APP_URL, no site).');
      const plain = urls.filter((u) => u.startsWith('http://'));
      return plain.length
        ? warn(
            'https',
            `Not on HTTPS: ${plain.join(', ')}.`,
            'Enable a certificate (Plesk: SSL/TLS, Let’s Encrypt), then force HTTPS on the domain.',
          )
        : ok('https', `HTTPS: ${urls.join(', ')}.`);
    }, 'https');

    if (owner) {
      await add(async () => {
        const status = await getMigrationStatus(owner);
        const pending = status.expected - status.applied;
        return pending > 0
          ? fail(
              'migrations',
              `${pending} database migrations are pending.`,
              'bin/cleitext migrate',
            )
          : ok('migrations', 'The database is up to date.');
      }, 'migrations');

      await add(async () => {
        const [sites] = await owner.execute<{ n: number }>(
          sql`select count(*)::int as n from sites`,
        );
        return (sites?.n ?? 0) === 0
          ? warn(
              'installed',
              'No site yet: the server shows the installer to whoever opens it first.',
              'bin/cleitext install --json … (or finish the installation in the browser)',
            )
          : ok('installed', `${sites!.n} site(s).`);
      }, 'installed');

      await add(async () => {
        const [role] = await owner.execute<{ name: string; can: boolean }>(
          sql`select rolname as name, (rolsuper or rolcreaterole) as can from pg_roles where rolname = current_user`,
        );
        return role?.can
          ? ok('owner_createrole', `${role.name} can create roles (plugins get their own).`)
          : fail(
              'owner_createrole',
              `${role?.name ?? 'The owner'} cannot create roles: installing a plugin with tables fails.`,
              `sudo -u postgres psql -c 'ALTER ROLE "${role?.name ?? '<owner>'}" CREATEROLE;'`,
            );
      }, 'owner_createrole');
    }

    await add(() => mailCheck(owner), 'mail');

    await add(async () => {
      const pgDump = findPgDump();
      if (!pgDump) {
        return fail(
          'pg_dump',
          'pg_dump was not found: backups (and the backup before each update) do not work.',
          'Install the PostgreSQL client tools of the server version, or set PG_BIN.',
        );
      }
      const { stdout } = await run(pgDump, ['--version']);
      const dumpMajor = Number(/(\d+)(?:\.\d+)?/.exec(stdout)?.[1] ?? 0);
      if (!owner) return ok('pg_dump', `${stdout.trim()} (${pgDump}).`);
      const [server] = await owner.execute<{ v: number }>(
        sql`select current_setting('server_version_num')::int as v`,
      );
      const serverMajor = Math.floor((server?.v ?? 0) / 10000);
      return dumpMajor < serverMajor
        ? fail(
            'pg_dump',
            `pg_dump ${dumpMajor} is older than the PostgreSQL server ${serverMajor}: it refuses to back it up.`,
            `Install pg_dump ${serverMajor} and set PG_BIN to its folder (e.g. /usr/lib/postgresql/${serverMajor}/bin).`,
          )
        : ok('pg_dump', `${stdout.trim()}, server ${serverMajor}.`);
    }, 'pg_dump');

    await add(async () => {
      const backups = path.join(path.dirname(mediaPath()), 'backups');
      let probe = backups;
      while (!existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
      const fs = await statfs(probe);
      const free = fs.bavail * fs.bsize;
      let need = await folderSize(mediaPath());
      need += await folderSize(pluginsPath());
      if (owner) {
        const [size] = await owner.execute<{ bytes: string }>(
          sql`select pg_database_size(current_database())::text as bytes`,
        );
        need += Number(size?.bytes ?? 0);
      }
      const message = `${mb(free)} free for backups in ${backups}; a backup takes up to ${mb(need)}.`;
      if (free < need)
        return fail(
          'disk_space',
          message,
          'Free some space, or prune old backups: bin/cleitext backup:prune --keep 3',
        );
      if (free < need * 3) return warn('disk_space', message, 'bin/cleitext backup:prune --keep 3');
      return ok('disk_space', message);
    }, 'disk_space');

    // ---- Updates (internet) ---------------------------------------------------------------
    if (!options.offline) {
      await add(async () => {
        const repo = options.repo ?? process.env.UPDATES_REPO ?? 'faghy/cleitext';
        if (!repo) return ok('core_update', 'The update check is off (UPDATES_REPO is empty).');
        const release = await findRelease(repo, undefined, options.fetchImpl);
        return isNewer(release.version, version)
          ? warn(
              'core_update',
              `Cleitext ${release.version} is available (installed: ${version}).`,
              'bin/cleitext update',
            )
          : ok('core_update', `Cleitext ${version} is up to date.`);
      }, 'core_update');

      await add(async () => {
        const installed: { type: 'plugin' | 'theme'; slug: string; version: string }[] = [];
        if (owner) {
          for (const p of await listPlugins(owner))
            installed.push({ type: 'plugin', slug: p.slug, version: p.version });
        }
        for (const t of await listThemes(themesPath()))
          installed.push({ type: 'theme', slug: t.slug, version: t.version });
        const items = await readCatalog(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {});
        const updates = availableUpdates(items, installed, version);
        return [
          ...(['plugin', 'theme'] as const).map((type) => {
            const list = updates.filter((u) => u.type === type);
            const id = `${type}_updates`;
            return list.length
              ? warn(
                  id,
                  `Updates available: ${list.map((u) => `${u.slug} ${u.installed} → ${u.available}`).join(', ')}.`,
                  `Update them in the admin (${type === 'plugin' ? 'Plugins' : 'Appearance → Themes'}), or turn on automatic updates.`,
                )
              : ok(id, `The installed ${type}s are up to date.`);
          }),
        ];
      }, 'plugin_updates');
    }
  } finally {
    await client?.close().catch(() => {});
  }

  const rank = { ok: 0, warn: 1, fail: 2 } as const;
  const status = checks.reduce<CheckStatus>(
    (worst, c) => (rank[c.status] > rank[worst] ? c.status : worst),
    'ok',
  );
  return { checks, status };
}

/** Where servers keep sendmail; the server looks in the same places (config.ts). */
const SENDMAIL_PATHS = ['/usr/sbin/sendmail', '/usr/lib/sendmail'];

const runnable = (file: string) => {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * How emails leave, as the server decides it: MAIL_URL, or else the server's
 * sendmail in production, or else only the log, where password resets and
 * invitations are lost unless a site has its own SMTP server.
 */
async function mailCheck(owner: Database | null): Promise<Check> {
  const url = process.env.MAIL_URL?.trim() || '';
  const production = (process.env.NODE_ENV ?? 'production') === 'production';
  if (/^smtps?:\/\//.test(url)) {
    return ok('mail', `Emails leave through the SMTP server ${new URL(url).host}.`);
  }
  if (url.startsWith('sendmail://') || (!url && production)) {
    const given = url.slice('sendmail://'.length);
    const file = url
      ? /^\/[\w./-]+$/.test(given)
        ? given
        : SENDMAIL_PATHS[0]!
      : SENDMAIL_PATHS.find((f) => existsSync(f));
    if (file && runnable(file)) {
      return ok(
        'mail',
        `Emails are handed to the server's sendmail (${file})${url ? '' : ', as MAIL_URL is not set'}.`,
      );
    }
    if (url) {
      return fail(
        'mail',
        `MAIL_URL=${url}, but ${file} cannot be run: no email leaves.`,
        'Install a mail server (Postfix), or set MAIL_URL=smtp://user:password@host:587 in .env, then restart.',
      );
    }
  }
  let without: number | null = null;
  if (owner) {
    const [row] = await owner.execute<{ n: number }>(
      sql`select count(*)::int as n from sites s where not exists (select 1 from settings m where m.site_id = s.id and m.namespace = 'mail' and m.key = 'host')`,
    );
    without = row?.n ?? 0;
  }
  if (without === 0) {
    return ok('mail', 'The server only logs emails, but every site has its own SMTP server.');
  }
  return warn(
    'mail',
    `Emails are only written to the log${without ? `: ${without} site(s) without their own SMTP server cannot send password resets, invitations or forms` : ''}.`,
    'Set MAIL_URL=sendmail:// (or smtp://user:password@host:587) in .env and restart, or enter an SMTP server in Settings → Email.',
  );
}

export function formatDoctor(report: DoctorReport): string[] {
  const mark = { ok: '✓', warn: '!', fail: '✗' };
  return report.checks.flatMap((c) => [
    `${mark[c.status]} ${c.id}: ${c.message}`,
    ...(c.fix && c.status !== 'ok' ? [`    → ${c.fix}`] : []),
  ]);
}
