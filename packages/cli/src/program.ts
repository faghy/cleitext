/**
 * The `cleitext` commands. Each one can print a single JSON object with
 * `--json` (see json.ts and docs/DEPLOYMENT.md, "Automation (JSON)").
 */
import path from 'node:path';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import semver from 'semver';
import type * as ServerTasks from './server-tasks.js';
import {
  getMigrationStatus,
  migrate,
  pluginSites,
  plugins as pluginsTable,
  sitePlugins,
  sites,
  withSiteContext,
  type Database,
} from '@cleitext/db';
import { eq, sql } from 'drizzle-orm';
import { input, password as passwordPrompt } from '@inquirer/prompts';
import { Command } from 'commander';
import {
  addDomain,
  archiveSite,
  createLoginLink,
  createSite,
  createUser,
  hasSites,
  listSites,
  OperationError,
  removeDomain,
  replaceDomain,
  setPassword,
  setSiteStatus,
  siteSummaries,
  updateSite,
} from './operations.js';
import { backup, listBackups, pruneBackups, restore } from './backup.js';
import { configure } from './configure.js';
import {
  appRoot,
  backupsDir,
  connectionSettings,
  dataPaths,
  installedVersion,
  pluginsPath,
  requireAppRole,
  themesPath,
  withOwner,
} from './context.js';
import { formatDoctor, runDoctor } from './doctor.js';
import { jsonMode, report, runCommand, say, type RunIo } from './json.js';
import { collectStatus, formatStatus } from './status.js';
import {
  findRelease,
  isNewer,
  rollbackUpdate,
  runUpdate,
  trialRun,
  UPDATE_STEPS,
  type UpdateStep,
} from './update.js';
import {
  announceThemeChange,
  buildTheme,
  installTheme,
  listThemes,
  rollbackTheme,
  uninstallTheme,
} from './themes.js';
import {
  buildPlugin,
  deactivatePlugin,
  installPlugin,
  listPlugins,
  requestRestart,
  rollbackPlugin,
  uninstallPlugin,
} from './plugins.js';

/** Official plugins installed by `install --official-plugins`; Multilingual is left out for now. */
const INSTALL_ON_INSTALL = ['seo', 'forms', 'hi-john'];
/** …and those turned on for the first site. */
const ACTIVE_ON_INSTALL = ['hi-john'];

/** Folders of those plugins shipped with this release (or this checkout). */
async function officialPlugins(): Promise<string[]> {
  const dir = path.join(process.env.CLEITEXT_APP_ROOT ?? process.cwd(), 'plugins');
  if (!existsSync(dir)) return [];
  const present = new Set(
    (await readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && existsSync(path.join(dir, e.name, 'cleitext.plugin.json')))
      .map((e) => e.name),
  );
  return INSTALL_ON_INSTALL.filter((slug) => present.has(slug)).map((slug) => path.join(dir, slug));
}

// ---- Input without prompts in --json mode ----------------------------------------------

/** A value from an option, or asked for; with --json there is no prompt. */
async function ask(
  value: string | undefined,
  option: string,
  prompt: () => Promise<string>,
): Promise<string> {
  if (value !== undefined) return value;
  if (jsonMode())
    throw new OperationError(`Give ${option}: --json never prompts.`, 'missing_option');
  return prompt();
}

async function confirmed(yes: boolean | undefined, message: string): Promise<boolean> {
  if (yes) return true;
  if (jsonMode()) {
    throw new OperationError(
      'Add --yes: --json never asks for confirmation.',
      'confirmation_required',
    );
  }
  const { confirm } = await import('@inquirer/prompts');
  return confirm({ message, default: false });
}

/** Where `--password-stdin` and `configure` read from (tests pass their own). */
let stdin: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin;

/** All of stdin, without the final newline. */
export async function readStdin(stream: NodeJS.ReadableStream = stdin): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

async function newPassword(fromStdin: boolean | undefined, message: string): Promise<string> {
  if (fromStdin) return readStdin();
  if (jsonMode()) {
    throw new OperationError('Add --password-stdin: --json never prompts.', 'password_required');
  }
  return passwordPrompt({ message, mask: true });
}

/** Running servers reload their plugins (no restart needed). */
async function announcePluginChange(db: Database): Promise<void> {
  await db.execute(sql`select pg_notify('cleitext_cache', ${JSON.stringify({ plugins: true })})`);
  if (await requestRestart(process.env.CLEITEXT_APP_ROOT ?? process.cwd()))
    say('Passenger restart requested (tmp/restart.txt).');
}

// ---- Core updates ------------------------------------------------------------------------

interface UpdateStatus {
  state: 'running' | 'done' | 'failed';
  from: string;
  to: string;
  step: UpdateStep | null;
  steps: UpdateStep[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

/** Written atomically: the admin of any server process reads it while it changes. */
async function writeStatus(file: string | undefined, status: UpdateStatus): Promise<void> {
  if (!file) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(status));
  await rename(`${file}.tmp`, file);
}

const run = promisify(execFile);

/** A command of the new release's CLI, with the running version's configuration. */
async function newCli(root: string, staging: string, args: string[]): Promise<void> {
  const env = path.join(root, '.env');
  await run(
    process.execPath,
    [
      ...(existsSync(env) ? [`--env-file=${env}`] : []),
      path.join(staging, 'packages/cli/dist/bin.js'),
      ...args,
    ],
    { cwd: staging, timeout: 600_000, maxBuffer: 4 * 1024 * 1024 },
  ).catch((error: { stderr?: string; message: string }) => {
    throw new OperationError(`${args[0]} failed: ${(error.stderr || error.message).trim()}`);
  });
}

/** The primary host of the oldest active site: the trial asks for its home page. */
async function firstSiteHost(): Promise<string | undefined> {
  try {
    const rows = await withOwner((db) =>
      db.execute<{ host: string }>(sql`
        select d.host from site_domains d join sites s on s.id = d.site_id
        where d.is_primary and s.status = 'active' order by s.created_at limit 1`),
    );
    return rows[0]?.host;
  } catch {
    return undefined;
  }
}

// ---- Server tasks (export, import, plugin activation) ---------------------------------

/** Tasks that run inside the application (media variants, cache, plugins). */
async function tasks() {
  const serverDir =
    process.env.CLEITEXT_SERVER_DIR ??
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../apps/server');
  return (await import(path.join(serverDir, 'dist/tasks.js'))) as typeof ServerTasks;
}

async function withTasks<T>(
  fn: (
    t: Awaited<ReturnType<typeof tasks>>,
    context: Awaited<ReturnType<Awaited<ReturnType<typeof tasks>>['openTasks']>>,
  ) => Promise<T>,
) {
  const module = await tasks();
  const context = await module.openTasks((message) => console.log(message));
  try {
    return await fn(module, context);
  } catch (error) {
    // Errors of the application (a plugin that refuses, a missing site) are the user's to fix.
    if (error instanceof Error && !(error instanceof OperationError) && !('code' in error))
      throw new OperationError(error.message);
    throw error;
  } finally {
    await context.close();
  }
}

async function printReport(
  module: Awaited<ReturnType<typeof tasks>>,
  result: Parameters<Awaited<ReturnType<typeof tasks>>['formatReport']>[0],
  file?: string,
) {
  if (file) await module.saveReport(file, result);
  report({ ...result, ...(file ? { reportFile: file } : {}) }, [
    module.formatReport(result),
    ...(file ? [`Full report: ${file}`] : []),
  ]);
  if (result.errors.length) process.exitCode = 2;
}

// ---- The program -------------------------------------------------------------------------

export function buildProgram(json = false): Command {
  const program = new Command()
    .name('cleitext')
    .description('Cleitext command-line tools (uses DATABASE_ADMIN_URL, the owner connection).')
    .version('0.0.0')
    .option('--json', 'print one JSON object on stdout (logs go to stderr)');
  if (json) {
    // Errors become {"error":…} on stdout; help and usage text go to stderr.
    program.exitOverride().configureOutput({
      writeOut: (text) => process.stderr.write(text),
      writeErr: (text) => process.stderr.write(text),
    });
  }

  program
    .command('status')
    .description('What runs: version, folders, database, sites, automatic updates (works offline).')
    .option('--root <dir>', 'the application (default: the one of this CLI)')
    .action(async (opts: { root?: string }) => {
      const status = await collectStatus(opts.root ? path.resolve(opts.root) : appRoot());
      report({ ...status }, formatStatus(status));
    });

  program
    .command('doctor')
    .description('Check the installation: configuration, database, backups, updates.')
    .option('--root <dir>', 'the application (default: the one of this CLI)')
    .option('--offline', 'skip the checks that need the internet (updates)')
    .action(async (opts: { root?: string; offline?: boolean }) => {
      const result = await runDoctor({
        root: opts.root ? path.resolve(opts.root) : appRoot(),
        offline: Boolean(opts.offline),
      });
      report({ ...result }, formatDoctor(result));
      if (result.status === 'fail' && !jsonMode()) process.exitCode = 1;
    });

  program
    .command('configure')
    .description(
      'Prepare the database (application role) and write cleitext-shared/.env, as the setup wizard does. The owner password comes from stdin or CLEITEXT_DB_OWNER_PASSWORD.',
    )
    .requiredOption('--db-name <name>')
    .requiredOption('--owner <role>', 'owner of the database, with CREATEROLE')
    .option('--db-host <host>', 'PostgreSQL host', 'localhost')
    .option('--db-port <port>', 'PostgreSQL port', '5432')
    .option('--app-role <name>', 'application role to create (default: <db-name>_app)')
    .option('--data-dir <dir>', 'data folder (default: cleitext-shared next to the application)')
    .option('--app-url <url>', 'public address of the main site, kept as APP_URL')
    .option('--trust-proxy <value>', 'TRUST_PROXY: true, false, hops or a list (default: true)')
    .option('--trust-cloudflare', 'the domain is behind Cloudflare (TRUST_CLOUDFLARE=true)')
    .option(
      '--app-secret-from <env-file>',
      "take APP_SECRET from another installation's .env (a copy of a site)",
    )
    .option('--root <dir>', 'the application (default: the one of this CLI)')
    .action(
      async (opts: {
        dbName: string;
        owner: string;
        dbHost: string;
        dbPort: string;
        appRole?: string;
        dataDir?: string;
        appUrl?: string;
        trustProxy?: string;
        trustCloudflare?: boolean;
        appSecretFrom?: string;
        root?: string;
      }) => {
        const ownerPassword =
          process.env.CLEITEXT_DB_OWNER_PASSWORD ?? (stdin.isTTY ? '' : await readStdin());
        const result = await configure({
          root: opts.root ? path.resolve(opts.root) : appRoot(),
          dbHost: opts.dbHost,
          dbPort: Number(opts.dbPort),
          dbName: opts.dbName,
          owner: opts.owner,
          ownerPassword,
          ...(opts.appRole ? { appRole: opts.appRole } : {}),
          ...(opts.dataDir ? { dataDir: opts.dataDir } : {}),
          ...(opts.appUrl ? { appUrl: opts.appUrl } : {}),
          ...(opts.trustProxy ? { trustProxy: opts.trustProxy } : {}),
          ...(opts.trustCloudflare ? { trustCloudflare: true } : {}),
          ...(opts.appSecretFrom ? { appSecretFrom: path.resolve(opts.appSecretFrom) } : {}),
        });
        report({ ...result }, [
          result.changed
            ? `Configuration written to ${result.envFile} (linked from ${result.envLink}).`
            : `Configuration unchanged: ${result.envFile}.`,
          `Application role: ${result.appRole}. Next: bin/cleitext install.`,
        ]);
      },
    );

  program
    .command('login-link')
    .description('A one-time sign-in link to the admin (for hosting panels); it skips 2FA.')
    .option('--email <email>', 'the user')
    .option('--first-super-admin', 'the oldest super admin')
    .option('--site <slug>', 'the site (default: the first active one)')
    .option('--ttl <seconds>', 'validity, at most 300', '60')
    .action((opts: { email?: string; firstSuperAdmin?: boolean; site?: string; ttl: string }) =>
      withOwner(async (db) => {
        const link = await createLoginLink(db, {
          ...(opts.email ? { email: opts.email } : {}),
          firstSuperAdmin: Boolean(opts.firstSuperAdmin),
          ...(opts.site ? { site: opts.site } : {}),
          ttlSeconds: Number(opts.ttl),
        });
        report(link, link.url);
      }),
    );

  program
    .command('migrate')
    .description('Apply pending migrations and refresh the application role privileges.')
    .action(async () => {
      const { ownerUrl, appRole } = connectionSettings();
      const before = await withOwner((db) => getMigrationStatus(db));
      await migrate({ ownerUrl, ...(appRole ? { appRole } : {}) });
      const after = await withOwner((db) => getMigrationStatus(db));
      report(
        {
          applied: after.applied - before.applied,
          total: after.applied,
          expected: after.expected,
          appRole: appRole ?? null,
        },
        appRole ? `Migrations applied; privileges granted to ${appRole}.` : 'Migrations applied.',
      );
    });

  program
    .command('install')
    .description('Guided installation: migrations, first site and super admin (RF-SIT-01).')
    .option('--site-slug <slug>')
    .option('--site-name <name>')
    .option('--domain <host>', 'primary domain, e.g. example.com')
    .option('--locale <code>', 'default language', 'en')
    .option('--no-https', 'do not force HTTPS on the domain (local testing only)')
    .option('--admin-email <email>')
    .option('--admin-password <password>', 'prefer the interactive prompt')
    .option('--password-stdin', "read the super admin's password from stdin")
    .option(
      '--official-plugins',
      'also install the official plugins: SEO, Forms and Hi John (active)',
    )
    .action(async (opts) => {
      const appRole = requireAppRole();
      const { ownerUrl } = connectionSettings();
      await migrate({ ownerUrl, appRole });
      say(`Migrations applied; privileges granted to ${appRole}.`);

      await withOwner(async (db) => {
        if (await hasSites(db))
          throw new OperationError('Cleitext is already installed (a site exists).', 'installed');
        const siteName = await ask(opts.siteName, '--site-name', () =>
          input({ message: 'Site name', default: 'My site' }),
        );
        const siteSlug = await ask(opts.siteSlug, '--site-slug', () =>
          input({ message: 'Site slug', default: 'main' }),
        );
        const domain = await ask(opts.domain, '--domain', () =>
          input({ message: 'Primary domain (e.g. example.com)' }),
        );
        const adminEmail = await ask(opts.adminEmail, '--admin-email', () =>
          input({ message: 'Super admin email' }),
        );
        const adminPassword =
          opts.adminPassword ??
          (opts.passwordStdin ? await readStdin() : undefined) ??
          // Set by the web installer, so the password never shows in a process list.
          process.env.CLEITEXT_ADMIN_PASSWORD ??
          (await newPassword(false, 'Super admin password (min. 12 characters)'));

        const siteId = await createSite(db, {
          slug: siteSlug,
          name: siteName,
          host: domain,
          locale: opts.locale,
          forceHttps: opts.https,
        });
        await createUser(db, { email: adminEmail, password: adminPassword, superAdmin: true });
        const installed: { slug: string; version: string; active: boolean }[] = [];
        if (opts.officialPlugins) {
          for (const source of await officialPlugins()) {
            const { manifest } = await installPlugin(db, {
              source,
              pluginsPath: pluginsPath(),
              appRole,
              link: false,
              required: false,
            });
            // Only admin plugins: no content types or onActivate to run here.
            const active = ACTIVE_ON_INSTALL.includes(manifest.slug) && !manifest.server;
            if (active) {
              await withSiteContext(db, siteId, (tx) =>
                tx.insert(sitePlugins).values({
                  siteId,
                  pluginSlug: manifest.slug,
                  active: true,
                  activatedAt: new Date(),
                }),
              );
            }
            installed.push({ slug: manifest.slug, version: manifest.version, active });
            say(
              `Installed ${manifest.slug} ${manifest.version}${active ? ', active' : ' (not active)'}.`,
            );
          }
          await announcePluginChange(db);
        }
        const adminUrl = `${opts.https ? 'https' : 'http'}://${domain}/cl-admin/`;
        report(
          {
            site: { id: siteId, slug: siteSlug, name: siteName, domain },
            admin: adminEmail,
            adminUrl,
            plugins: installed,
          },
          `Installed. Sign in at ${adminUrl} as ${adminEmail}.`,
        );
      });
    });

  program
    .command('site:create')
    .description('Create a site with its primary domain.')
    .requiredOption('--slug <slug>')
    .requiredOption('--name <name>')
    .requiredOption('--domain <host>')
    .option('--locale <code>', 'default language', 'en')
    .option('--timezone <tz>', 'IANA time zone', 'UTC')
    .option('--no-https', 'do not force HTTPS on the domain')
    .action((opts) =>
      withOwner(async (db) => {
        const id = await createSite(db, {
          slug: opts.slug,
          name: opts.name,
          host: opts.domain,
          locale: opts.locale,
          timezone: opts.timezone,
          forceHttps: opts.https,
        });
        const site = (await siteSummaries(db)).find((s) => s.id === id);
        report({ ...site }, `Site ${opts.slug} created (${id}).`);
      }),
    );

  program
    .command('site:list')
    .description('List sites and domains.')
    .action(() =>
      withOwner(async (db) => {
        if (jsonMode()) {
          report({ sites: await siteSummaries(db) });
          return;
        }
        for (const site of await listSites(db)) {
          console.log(`${site.slug}\t${site.status}\t${site.name}\t${site.domains.join(', ')}`);
        }
      }),
    );

  program
    .command('site:update')
    .description("Change a site's name, slug, default language or time zone.")
    .requiredOption('--site <slug>')
    .option('--name <name>')
    .option('--slug <slug>', 'new slug')
    .option('--locale <code>', 'default language (already enabled on the site)')
    .option('--timezone <tz>', 'IANA time zone')
    .action((opts) =>
      withOwner(async (db) => {
        await updateSite(db, opts.site, {
          name: opts.name,
          slug: opts.slug,
          locale: opts.locale,
          timezone: opts.timezone,
        });
        report({ site: opts.slug ?? opts.site }, `Site ${opts.slug ?? opts.site} updated.`);
      }),
    );

  program
    .command('site:archive')
    .description('Archive a site (kept, but offline), or bring it back with --restore.')
    .requiredOption('--site <slug>')
    .option('--restore', 'bring an archived site back online')
    .action((opts) =>
      withOwner(async (db) => {
        await archiveSite(db, opts.site, Boolean(opts.restore));
        report(
          { site: opts.site, status: opts.restore ? 'active' : 'archived' },
          `Site ${opts.site} ${opts.restore ? 'restored' : 'archived'}.`,
        );
      }),
    );

  program
    .command('site:maintenance')
    .description(
      'Turn maintenance mode on or off: visitors get a 503, signed-in users see the site.',
    )
    .requiredOption('--site <slug>')
    .option('--off', 'turn maintenance mode off (default: on)')
    .action((opts) =>
      withOwner(async (db) => {
        await setSiteStatus(db, opts.site, opts.off ? 'active' : 'maintenance');
        report(
          { site: opts.site, maintenance: !opts.off },
          `Maintenance mode ${opts.off ? 'off' : 'on'} for ${opts.site}.`,
        );
      }),
    );

  program
    .command('site:domain:add')
    .description('Add a domain (alias or new primary) to a site.')
    .requiredOption('--site <slug>')
    .requiredOption('--domain <host>')
    .option('--primary', 'make it the primary domain')
    .option('--no-https', 'do not force HTTPS on the domain')
    .action((opts) =>
      withOwner(async (db) => {
        await addDomain(db, {
          site: opts.site,
          host: opts.domain,
          primary: Boolean(opts.primary),
          forceHttps: opts.https,
        });
        report(
          { site: opts.site, domain: opts.domain, primary: Boolean(opts.primary) },
          `Domain ${opts.domain} added to ${opts.site}.`,
        );
      }),
    );

  program
    .command('site:domain:remove')
    .description('Remove a domain (an alias) from a site; the primary domain stays.')
    .requiredOption('--site <slug>')
    .requiredOption('--domain <host>')
    .action((opts: { site: string; domain: string }) =>
      withOwner(async (db) => {
        await removeDomain(db, { site: opts.site, host: opts.domain });
        report(
          { site: opts.site, domain: opts.domain, removed: true },
          `Domain ${opts.domain} removed from ${opts.site}.`,
        );
      }),
    );

  program
    .command('site:domain:replace')
    .description('Rename a domain (a copy of the installation on another address, a move).')
    .requiredOption('--from <host>')
    .requiredOption('--to <host>')
    .option('--site <slug>', 'only if the domain belongs to this site')
    .action((opts: { from: string; to: string; site?: string }) =>
      withOwner(async (db) => {
        const result = await replaceDomain(db, opts);
        report(
          { site: result.site, from: opts.from, to: opts.to, primary: result.primary },
          `Domain ${opts.from} is now ${opts.to} (${result.site}).`,
        );
      }),
    );

  program
    .command('user:create')
    .description('Create a user, optionally super admin or member of a site.')
    .requiredOption('--email <email>')
    .option('--name <displayName>')
    .option('--super-admin', 'grant every capability on every site')
    .option('--site <slug>')
    .option('--role <slug>', 'administrator | editor | author | contributor | subscriber')
    .option('--password-stdin', 'read the password from stdin')
    .action((opts) =>
      withOwner(async (db) => {
        const password = await newPassword(opts.passwordStdin, 'Password (min. 12 characters)');
        const id = await createUser(db, {
          email: opts.email,
          password,
          displayName: opts.name,
          superAdmin: Boolean(opts.superAdmin),
          site: opts.site,
          role: opts.role,
        });
        report(
          {
            id,
            email: opts.email,
            superAdmin: Boolean(opts.superAdmin),
            site: opts.site ?? null,
            role: opts.role ?? null,
          },
          `User ${opts.email} created.`,
        );
      }),
    );

  program
    .command('user:reset-password')
    .description('Set a new password for a user.')
    .requiredOption('--email <email>')
    .option('--password-stdin', 'read the password from stdin')
    .action((opts) =>
      withOwner(async (db) => {
        const password = await newPassword(opts.passwordStdin, 'New password (min. 12 characters)');
        await setPassword(db, opts.email, password);
        report({ email: opts.email }, `Password updated for ${opts.email}.`);
      }),
    );

  // ---- Plugins (docs/ARCHITECTURE.md §11) -------------------------------------------------

  program
    .command('plugin:build')
    .description('Bundle a plugin (TypeScript/JSX) into the entries named in its manifest.')
    .argument('[dir]', 'plugin folder', '.')
    .action(async (dir: string) => {
      const { manifest, outputs } = await buildPlugin(path.resolve(dir));
      report({ slug: manifest.slug, version: manifest.version, outputs }, [
        `Built ${manifest.slug} ${manifest.version}:`,
        ...outputs.map((file) => `  ${path.relative(process.cwd(), file)}`),
      ]);
    });

  program
    .command('plugin:install')
    .description('Install or update a plugin from a folder: files, migrations, registration.')
    .argument('<dir>', 'plugin folder (already built)')
    .option('--link', 'link the folder instead of copying it (development)')
    .option('--build', 'build the plugin first')
    .option('--required', 'must-use: always active on every site, cannot be deactivated')
    .action(async (dir: string, opts: { link?: boolean; build?: boolean; required?: boolean }) => {
      const appRole = requireAppRole();
      if (opts.build) await buildPlugin(path.resolve(dir));
      await withOwner(async (db) => {
        const result = await installPlugin(db, {
          source: dir,
          pluginsPath: pluginsPath(),
          appRole,
          link: Boolean(opts.link),
          required: Boolean(opts.required),
        });
        const { slug, version } = result.manifest;
        report(
          {
            slug,
            version,
            previousVersion: result.previousVersion ?? null,
            migrations: result.migrations,
          },
          [
            result.previousVersion
              ? `Updated ${slug} ${result.previousVersion} → ${version}.`
              : `Installed ${slug} ${version}. Activate it on a site from the admin (Plugins).`,
            ...(result.migrations.length ? [`Migrations: ${result.migrations.join(', ')}`] : []),
          ],
        );
        await announcePluginChange(db);
      });
    });

  program
    .command('plugin:rollback')
    .description('Go back to the version of a plugin that ran before its last update.')
    .argument('<slug>')
    .action((slug: string) =>
      withOwner(async (db) => {
        const { from, to } = await rollbackPlugin(db, { pluginsPath: pluginsPath(), slug });
        report({ slug, from, to }, `Back to ${slug} ${to} (from ${from}).`);
        await announcePluginChange(db);
      }),
    );

  program
    .command('plugin:activate')
    .description(
      'Activate a plugin on a site (as the admin does: dependencies, content types, onActivate), or on the whole network.',
    )
    .argument('<slug>')
    .option('--site <slug>', 'the site')
    .option('--network', 'activate it on every site')
    .action(async (slug: string, opts: { site?: string; network?: boolean }) => {
      if (Boolean(opts.site) === Boolean(opts.network)) {
        throw new OperationError('Give --site <slug> or --network.', 'invalid_option');
      }
      if (opts.network) {
        await withOwner(async (db) => {
          const [plugin] = await db.select().from(pluginsTable).where(eq(pluginsTable.slug, slug));
          if (!plugin)
            throw new OperationError(`The plugin ${slug} is not installed.`, 'not_found');
          if (plugin.mustUse) {
            report(
              { slug, network: true, alreadyActive: true },
              `${slug} is must-use: always active.`,
            );
            return;
          }
          if (!plugin.network) {
            await db.update(pluginsTable).set({ network: true }).where(eq(pluginsTable.slug, slug));
            for (const site of await db.select({ id: sites.id }).from(sites)) {
              await db.execute(
                sql`select pg_notify('cleitext_cache', ${JSON.stringify({ siteId: site.id, tags: ['site'], sites: true })})`,
              );
            }
            await announcePluginChange(db);
          }
          report(
            { slug, network: true, alreadyActive: plugin.network },
            plugin.network
              ? `${slug} was already active on the whole network.`
              : `${slug} is active on the whole network.`,
          );
        });
        return;
      }
      await withTasks(async (module, context) => {
        const result = await module.activatePluginTask(context, { slug, site: opts.site! });
        report(
          { ...result, network: false },
          result.alreadyActive
            ? `${slug} was already active on ${opts.site}.`
            : `${slug} ${result.version} activated on ${opts.site}.`,
        );
      });
    });

  program
    .command('plugin:deactivate')
    .description(
      'Deactivate a plugin on a site (its data is kept), e.g. one that locks you out of the admin.',
    )
    .argument('<slug>')
    .option('--site <slug>', 'the site')
    .option('--network', 'turn off a plugin active on the whole network')
    .action((slug: string, opts: { site?: string; network?: boolean }) =>
      withOwner(async (db) => {
        const message = await deactivatePlugin(db, slug, opts);
        report({ slug, site: opts.site ?? null, network: Boolean(opts.network), message }, message);
      }),
    );

  program
    .command('plugin:list')
    .description('List installed plugins.')
    .action(() =>
      withOwner(async (db) => {
        const installed = await listPlugins(db);
        if (!jsonMode()) {
          for (const plugin of installed) {
            console.log(`${plugin.slug}\t${plugin.version}\tAPI ${plugin.apiVersion}`);
          }
          return;
        }
        const slugs = new Map((await siteSummaries(db)).map((s) => [s.id, s.slug]));
        const active = await pluginSites(db);
        report({
          plugins: installed.map((plugin) => {
            const manifest = plugin.manifest as { name?: string; paid?: unknown };
            return {
              slug: plugin.slug,
              name: manifest.name ?? plugin.slug,
              version: plugin.version,
              apiVersion: plugin.apiVersion,
              network: plugin.network,
              mustUse: plugin.mustUse,
              paid: Boolean(manifest.paid),
              activeOn: active
                .filter((a) => a.slug === plugin.slug)
                .map((a) => slugs.get(a.siteId) ?? a.siteId),
            };
          }),
        });
      }),
    );

  program
    .command('plugin:uninstall')
    .description('Remove a plugin and ALL its data (schema, settings) from every site.')
    .argument('<slug>')
    .option('--yes', 'do not ask for confirmation')
    .option('--only-inactive', 'refuse a plugin still active on some site')
    .action(async (slug: string, opts: { yes?: boolean; onlyInactive?: boolean }) => {
      if (
        !(await confirmed(
          opts.yes,
          `Delete ${slug} and all its data on every site? This cannot be undone.`,
        ))
      )
        return;
      await withOwner(async (db) => {
        await uninstallPlugin(db, slug, {
          pluginsPath: pluginsPath(),
          onlyInactive: Boolean(opts.onlyInactive),
        });
        report({ slug, uninstalled: true }, `Uninstalled ${slug}.`);
        await announcePluginChange(db);
      });
    });

  // ---- Themes (RF-THM-01) -----------------------------------------------------------------

  program
    .command('theme:build')
    .description('Bundle a theme (TypeScript/JSX) into the entry named in its theme.json.')
    .argument('[dir]', 'theme folder', '.')
    .action(async (dir: string) => {
      const { manifest, output } = await buildTheme(path.resolve(dir));
      report(
        { slug: manifest.slug, version: manifest.version, output },
        `Built ${manifest.slug} ${manifest.version}: ${path.relative(process.cwd(), output)}`,
      );
    });

  program
    .command('theme:install')
    .description('Install or update a theme from a folder; activate it per site in the admin.')
    .argument('<dir>', 'theme folder')
    .option('--link', 'link the folder instead of copying it (development)')
    .option('--build', 'build the theme first')
    .action(async (dir: string, opts: { link?: boolean; build?: boolean }) => {
      if (opts.build) await buildTheme(path.resolve(dir));
      const { manifest, previousVersion } = await installTheme({
        source: dir,
        themesPath: themesPath(),
        link: Boolean(opts.link),
      });
      const lines = [
        previousVersion
          ? `Updated ${manifest.slug} ${previousVersion} → ${manifest.version}.`
          : `Installed ${manifest.slug} ${manifest.version}. Activate it in Appearance → Themes.`,
      ];
      // The plugins that come with the theme, from the package's plugins/<slug>/ folders.
      const bundled = (manifest.plugins ?? [])
        .map((slug) => path.join(path.resolve(dir), 'plugins', slug))
        .filter((folder) => existsSync(path.join(folder, 'cleitext.plugin.json')));
      const withPlugins: { slug: string; version: string; skipped: boolean }[] = [];
      if (bundled.length) {
        const appRole = requireAppRole();
        await withOwner(async (db) => {
          for (const folder of bundled) {
            const result = await installPlugin(db, {
              source: folder,
              pluginsPath: pluginsPath(),
              appRole,
              link: Boolean(opts.link),
              keepNewer: true,
            });
            withPlugins.push({
              slug: result.manifest.slug,
              version: result.skipped
                ? (result.previousVersion ?? result.manifest.version)
                : result.manifest.version,
              skipped: Boolean(result.skipped),
            });
            lines.push(
              result.skipped
                ? `  with the plugin ${result.manifest.slug} (${result.previousVersion} already installed)`
                : `  with the plugin ${result.manifest.slug} ${result.manifest.version}`,
            );
          }
          await announcePluginChange(db);
        });
      }
      await withOwner((db) => announceThemeChange(db));
      report(
        {
          slug: manifest.slug,
          version: manifest.version,
          previousVersion: previousVersion ?? null,
          plugins: withPlugins,
        },
        lines,
      );
    });

  program
    .command('theme:list')
    .description('List the installed themes (Aurora is always available).')
    .action(async () => {
      const themes = await listThemes(themesPath());
      report(
        {
          themes: [
            { slug: 'aurora', name: 'Aurora', version: null, bundled: true },
            ...themes.map((t) => ({
              slug: t.slug,
              name: t.name,
              version: t.version,
              bundled: false,
            })),
          ],
        },
        ['aurora\t(bundled)', ...themes.map((t) => `${t.slug}\t${t.version}\t${t.name}`)],
      );
    });

  program
    .command('theme:uninstall')
    .description('Remove an installed theme that no site uses.')
    .argument('<slug>')
    .action((slug: string) =>
      withOwner(async (db) => {
        await uninstallTheme(db, slug, themesPath());
        await announceThemeChange(db);
        report({ slug, uninstalled: true }, `Uninstalled ${slug}.`);
      }),
    );

  program
    .command('theme:rollback')
    .description('Go back to the version of a theme that ran before its last update.')
    .argument('<slug>')
    .action((slug: string) =>
      withOwner(async (db) => {
        const { from, to } = await rollbackTheme({ themesPath: themesPath(), slug });
        report({ slug, from, to }, `Back to ${slug} ${to} (from ${from}).`);
        await announceThemeChange(db);
      }),
    );

  // ---- Backup and restore (RNF-15) --------------------------------------------------------

  program
    .command('backup')
    .description('Back up the database (pg_dump), media and plugins into one .tar.gz file.')
    .option('--out <file>', 'default: cleitext-shared/backups/cleitext-<date>.tar.gz')
    .action(async (opts: { out?: string }) => {
      const out = path.resolve(
        opts.out ??
          path.join(
            backupsDir(),
            `cleitext-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.tar.gz`,
          ),
      );
      await mkdir(path.dirname(out), { recursive: true });
      await withOwner(async (db) => {
        const { bytes } = await backup(db, dataPaths(), out);
        report(
          { file: out, bytes },
          `Backup written: ${opts.out ?? out} (${(bytes / 1024 / 1024).toFixed(1)} MB)`,
        );
      });
    });

  program
    .command('backup:list')
    .description('List the backups in cleitext-shared/backups, newest first.')
    .option('--dir <dir>', 'another folder')
    .action(async (opts: { dir?: string }) => {
      const dir = path.resolve(opts.dir ?? backupsDir());
      const backups = await listBackups(dir);
      report(
        { dir, backups },
        backups.length
          ? backups.map(
              (b) => `${b.name}\t${(b.bytes / 1024 / 1024).toFixed(1)} MB\t${b.createdAt}`,
            )
          : `No backups in ${dir}.`,
      );
    });

  program
    .command('backup:prune')
    .description('Delete all but the N newest backups (those taken before updates included).')
    .requiredOption('--keep <n>', 'how many to keep')
    .option('--dir <dir>', 'another folder')
    .action(async (opts: { keep: string; dir?: string }) => {
      const dir = path.resolve(opts.dir ?? backupsDir());
      const keep = /^\d+$/.test(opts.keep) ? Number(opts.keep) : Number.NaN;
      const removed = await pruneBackups(dir, keep);
      report(
        { dir, keep, removed },
        removed.length
          ? removed.map((b) => `Deleted ${b.name}`)
          : `Nothing to delete (${keep} kept).`,
      );
    });

  program
    .command('restore')
    .description('Restore a backup: REPLACES the database, media and plugins (asks first).')
    .argument('<file>')
    .option('--yes', 'do not ask for confirmation')
    .action(async (file: string, opts: { yes?: boolean }) => {
      const appRole = requireAppRole();
      if (
        !(await confirmed(
          opts.yes,
          'Replace the current database, media and plugins with this backup?',
        ))
      )
        return;
      await withOwner(async (db) => {
        const manifest = await restore(db, { ...dataPaths(), appRole }, path.resolve(file));
        report(
          {
            file: path.resolve(file),
            createdAt: manifest.createdAt,
            postgres: manifest.postgres,
            revokedRoles: manifest.revokedRoles,
          },
          `Restored the backup of ${manifest.createdAt}. Restart the server.`,
        );
        await announcePluginChange(db);
      });
    });

  // ---- Core updates ------------------------------------------------------------------------

  program
    .command('update')
    .description(
      'Update Cleitext to the latest release (or --to): download, verify, back up, migrate, switch.',
    )
    .option('--to <version>', 'a given version instead of the latest')
    .option('--check', 'only tell whether an update is available')
    .option(
      '--repo <owner/name>',
      'where the releases are',
      process.env.UPDATES_REPO ?? 'faghy/cleitext',
    )
    .option('--status <file>', 'write the progress there (used by the admin)')
    .option('--no-backup', 'skip the backup before migrating (not recommended)')
    .option(
      '--no-trial',
      'skip starting the new version on the side before switching to it (not recommended)',
    )
    .option(
      '--root <dir>',
      'the application to update (default: the one of this CLI); lets a newer CLI update an older site',
    )
    .action(
      async (opts: {
        root?: string;
        to?: string;
        check?: boolean;
        repo: string;
        status?: string;
        backup: boolean;
        trial: boolean;
      }) => {
        const root = opts.root ? path.resolve(opts.root) : appRoot();
        const from = installedVersion(root);
        const release = await findRelease(opts.repo, opts.to);
        const available = isNewer(release.version, from);
        if (opts.check) {
          report(
            {
              current: from,
              latest: release.version,
              available,
              publishedAt: release.publishedAt,
              url: release.url,
              notes: release.notes,
            },
            available
              ? `Cleitext ${release.version} is available (installed: ${from}).`
              : `Cleitext ${from} is up to date.`,
          );
          return;
        }
        if (!opts.to && !available) {
          report(
            { updated: false, from, to: from, current: from },
            `Cleitext ${from} is up to date.`,
          );
          return;
        }
        const status: UpdateStatus = {
          state: 'running',
          from,
          to: release.version,
          step: null,
          steps: UPDATE_STEPS,
          startedAt: new Date().toISOString(),
        };
        await writeStatus(opts.status, status);
        let backupFile: string | null = null;
        try {
          const result = await runUpdate({
            root,
            release,
            onStep: (step) => {
              status.step = step;
              say(`… ${step}`);
              void writeStatus(opts.status, status);
            },
            actions: {
              backup: async () => {
                if (!opts.backup) return;
                const paths = dataPaths();
                const out = path.join(
                  path.dirname(paths.mediaPath),
                  'backups',
                  `before-${release.version}.tar.gz`,
                );
                await mkdir(path.dirname(out), { recursive: true });
                await withOwner((db) => backup(db, paths, out));
                backupFile = out;
              },
              migrate: (staging) => newCli(root, staging, ['migrate']),
              plugins: async (staging) => {
                const installed = new Map(
                  (await withOwner((db) => listPlugins(db))).map((p) => [p.slug, p.version]),
                );
                const shipped = path.join(staging, 'plugins');
                if (!existsSync(shipped)) return;
                for (const slug of await readdir(shipped)) {
                  const manifest = path.join(shipped, slug, 'cleitext.plugin.json');
                  if (!existsSync(manifest)) continue;
                  const { version } = JSON.parse(await readFile(manifest, 'utf8')) as {
                    version: string;
                  };
                  const current = installed.get(slug);
                  if (current && semver.valid(version) && semver.gt(version, current)) {
                    await newCli(root, staging, ['plugin:install', path.join(shipped, slug)]);
                  }
                }
              },
              check: async (staging) => {
                if (!opts.trial) return;
                await trialRun({ staging, env: process.env, host: await firstSiteHost() });
              },
            },
          });
          Object.assign(status, { state: 'done', finishedAt: new Date().toISOString() });
          await writeStatus(opts.status, status);
          report(
            {
              updated: true,
              from,
              to: release.version,
              root: result.root,
              previous: result.previous,
              backup: backupFile,
            },
            `Updated ${from} → ${release.version}. Previous version kept in ${result.previous}.`,
          );
        } catch (error) {
          Object.assign(status, {
            state: 'failed',
            finishedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          });
          await writeStatus(opts.status, status);
          if (error instanceof OperationError && error.code === 'failed') {
            throw new OperationError(error.message, 'update_failed');
          }
          throw error;
        }
      },
    );

  program
    .command('rollback')
    .description(
      'Go back to the version that ran before the last update (kept on disk); the database stays.',
    )
    .option('--root <dir>', 'the application (default: the one of this CLI)')
    .action(async (opts: { root?: string }) => {
      const root = opts.root ? path.resolve(opts.root) : appRoot();
      const from = installedVersion(root);
      let result: Awaited<ReturnType<typeof rollbackUpdate>>;
      try {
        result = await rollbackUpdate(root);
      } catch (error) {
        if (error instanceof OperationError && /No previous version/.test(error.message))
          throw new OperationError(error.message, 'no_previous_version');
        throw error;
      }
      report(
        {
          from,
          to: result.version,
          root: result.root,
          databaseBackup: path.join(backupsDir(), `before-${from}.tar.gz`),
        },
        `Back to Cleitext ${result.version} (from ${from}) in ${result.root}. ` +
          'If the database must go back too: cleitext restore <backups/before-' +
          `${from}.tar.gz>.`,
      );
    });

  // ---- Export and import (RF-IMP-01…04) -------------------------------------------------

  program
    .command('export')
    .description(
      'Export a site (content, media, menus, users without passwords) to a .tar.gz archive.',
    )
    .requiredOption('--site <slug>')
    .requiredOption('--out <file>', 'archive to write, e.g. site.tar.gz')
    .action((opts) =>
      withTasks(async (module, context) => {
        await module.exportTask(context, { site: opts.site, out: opts.out });
        report({ site: opts.site, file: path.resolve(opts.out) });
      }),
    );

  program
    .command('import')
    .description('Import a Cleitext export archive into a site (merged with its content).')
    .argument('<file>', 'archive written by cleitext export')
    .requiredOption('--site <slug>')
    .option('--as <email>', 'super admin recorded as author of the import')
    .option('--report <file>', 'save the full report as JSON')
    .action((file: string, opts) =>
      withTasks(async (module, context) =>
        printReport(
          module,
          await module.importTask(context, { file, site: opts.site, as: opts.as }),
          opts.report,
        ),
      ),
    );

  return program;
}

/** Runs the CLI; returns the exit code. */
export async function main(
  argv: string[] = process.argv,
  io: RunIo & { stdin?: NodeJS.ReadableStream } = {},
): Promise<number> {
  stdin = io.stdin ?? process.stdin;
  // Known before parsing, so that a usage error is printed as JSON too.
  const json = argv.slice(2).includes('--json');
  return runCommand(
    json,
    async () => {
      await buildProgram(json).parseAsync(argv);
    },
    io,
  );
}
