#!/usr/bin/env node
import path from 'node:path';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import semver from 'semver';
import type * as ServerTasks from './server-tasks.js';
import { createDatabase, migrate, sitePlugins, withSiteContext } from '@cleitext/db';
import { sql } from 'drizzle-orm';
import { input, password as passwordPrompt } from '@inquirer/prompts';
import { Command } from 'commander';
import {
  addDomain,
  createSite,
  createUser,
  hasSites,
  listSites,
  OperationError,
  setPassword,
  setSiteStatus,
  archiveSite,
  updateSite,
} from './operations.js';
import { backup, restore } from './backup.js';
import { findRelease, isNewer, runUpdate, UPDATE_STEPS, type UpdateStep } from './update.js';
import {
  announceThemeChange,
  buildTheme,
  installTheme,
  listThemes,
  uninstallTheme,
} from './themes.js';
import {
  buildPlugin,
  installPlugin,
  listPlugins,
  requestRestart,
  uninstallPlugin,
} from './plugins.js';

const program = new Command()
  .name('cleitext')
  .description('Cleitext command-line tools (uses DATABASE_ADMIN_URL, the owner connection).')
  .version('0.0.0');

/** Owner connection URL and application role (from DATABASE_URL's user name). */
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

function connectionSettings(): { ownerUrl: string; appRole: string | undefined } {
  const ownerUrl = process.env.DATABASE_ADMIN_URL;
  if (!ownerUrl) throw new OperationError('Set DATABASE_ADMIN_URL (owner connection).');
  const appUrl = process.env.DATABASE_URL;
  const appRole = process.env.CLEITEXT_APP_ROLE ?? (appUrl ? new URL(appUrl).username : undefined);
  return { ownerUrl, appRole: appRole || undefined };
}

async function withOwner<T>(fn: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>) {
  const { ownerUrl } = connectionSettings();
  const client = createDatabase(ownerUrl, { max: 1 });
  try {
    return await fn(client.db);
  } finally {
    await client.close();
  }
}

program
  .command('migrate')
  .description('Apply pending migrations and refresh the application role privileges.')
  .action(async () => {
    const { ownerUrl, appRole } = connectionSettings();
    await migrate({ ownerUrl, ...(appRole ? { appRole } : {}) });
    console.log(
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
  .option(
    '--official-plugins',
    'also install the official plugins: SEO, Forms and Hi John (active)',
  )
  .action(async (opts) => {
    const { ownerUrl, appRole } = connectionSettings();
    if (!appRole)
      throw new OperationError('Set DATABASE_URL (application role) or CLEITEXT_APP_ROLE.');
    await migrate({ ownerUrl, appRole });
    console.log(`Migrations applied; privileges granted to ${appRole}.`);

    await withOwner(async (db) => {
      if (await hasSites(db))
        throw new OperationError('Cleitext is already installed (a site exists).');
      const siteName = opts.siteName ?? (await input({ message: 'Site name', default: 'My site' }));
      const siteSlug = opts.siteSlug ?? (await input({ message: 'Site slug', default: 'main' }));
      const domain = opts.domain ?? (await input({ message: 'Primary domain (e.g. example.com)' }));
      const adminEmail = opts.adminEmail ?? (await input({ message: 'Super admin email' }));
      const adminPassword =
        opts.adminPassword ??
        // Set by the web installer, so the password never shows in a process list.
        process.env.CLEITEXT_ADMIN_PASSWORD ??
        (await passwordPrompt({
          message: 'Super admin password (min. 12 characters)',
          mask: true,
        }));

      const siteId = await createSite(db, {
        slug: siteSlug,
        name: siteName,
        host: domain,
        locale: opts.locale,
        forceHttps: opts.https,
      });
      await createUser(db, { email: adminEmail, password: adminPassword, superAdmin: true });
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
          console.log(
            `Installed ${manifest.slug} ${manifest.version}${active ? ', active' : ' (not active)'}.`,
          );
        }
        await announcePluginChange(db);
      }
      console.log(
        `Installed. Sign in at ${opts.https ? 'https' : 'http'}://${domain}/cl-admin/ as ${adminEmail}.`,
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
      console.log(`Site ${opts.slug} created (${id}).`);
    }),
  );

program
  .command('site:list')
  .description('List sites and domains.')
  .action(() =>
    withOwner(async (db) => {
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
      console.log(`Site ${opts.slug ?? opts.site} updated.`);
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
      console.log(`Site ${opts.site} ${opts.restore ? 'restored' : 'archived'}.`);
    }),
  );

program
  .command('site:maintenance')
  .description('Turn maintenance mode on or off: visitors get a 503, signed-in users see the site.')
  .requiredOption('--site <slug>')
  .option('--off', 'turn maintenance mode off (default: on)')
  .action((opts) =>
    withOwner(async (db) => {
      await setSiteStatus(db, opts.site, opts.off ? 'active' : 'maintenance');
      console.log(`Maintenance mode ${opts.off ? 'off' : 'on'} for ${opts.site}.`);
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
      console.log(`Domain ${opts.domain} added to ${opts.site}.`);
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
  .action((opts) =>
    withOwner(async (db) => {
      const password = await passwordPrompt({
        message: 'Password (min. 12 characters)',
        mask: true,
      });
      await createUser(db, {
        email: opts.email,
        password,
        displayName: opts.name,
        superAdmin: Boolean(opts.superAdmin),
        site: opts.site,
        role: opts.role,
      });
      console.log(`User ${opts.email} created.`);
    }),
  );

program
  .command('user:reset-password')
  .description('Set a new password for a user.')
  .requiredOption('--email <email>')
  .action((opts) =>
    withOwner(async (db) => {
      const password = await passwordPrompt({
        message: 'New password (min. 12 characters)',
        mask: true,
      });
      await setPassword(db, opts.email, password);
      console.log(`Password updated for ${opts.email}.`);
    }),
  );

// ---- Plugins (docs/ARCHITECTURE.md §11) ---------------------------------------------

/** Installed plugins live here; the server reads the same variable. */
function pluginsPath(): string {
  return path.resolve(process.env.PLUGINS_PATH ?? 'cleitext-data/plugins');
}

/** Running servers reload their plugins (no restart needed). */
async function announcePluginChange(db: ReturnType<typeof createDatabase>['db']): Promise<void> {
  await db.execute(sql`select pg_notify('cleitext_cache', ${JSON.stringify({ plugins: true })})`);
  if (await requestRestart(process.env.CLEITEXT_APP_ROOT ?? process.cwd()))
    console.log('Passenger restart requested (tmp/restart.txt).');
}

program
  .command('plugin:build')
  .description('Bundle a plugin (TypeScript/JSX) into the entries named in its manifest.')
  .argument('[dir]', 'plugin folder', '.')
  .action(async (dir: string) => {
    const { manifest, outputs } = await buildPlugin(path.resolve(dir));
    console.log(`Built ${manifest.slug} ${manifest.version}:`);
    for (const file of outputs) console.log(`  ${path.relative(process.cwd(), file)}`);
  });

program
  .command('plugin:install')
  .description('Install or update a plugin from a folder: files, migrations, registration.')
  .argument('<dir>', 'plugin folder (already built)')
  .option('--link', 'link the folder instead of copying it (development)')
  .option('--build', 'build the plugin first')
  .option('--required', 'must-use: always active on every site, cannot be deactivated')
  .action(async (dir: string, opts: { link?: boolean; build?: boolean; required?: boolean }) => {
    const { appRole } = connectionSettings();
    if (!appRole)
      throw new OperationError('Set DATABASE_URL (application role) or CLEITEXT_APP_ROLE.');
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
      console.log(
        result.previousVersion
          ? `Updated ${slug} ${result.previousVersion} → ${version}.`
          : `Installed ${slug} ${version}. Activate it on a site from the admin (Plugins).`,
      );
      if (result.migrations.length) console.log(`Migrations: ${result.migrations.join(', ')}`);
      await announcePluginChange(db);
    });
  });

program
  .command('plugin:list')
  .description('List installed plugins.')
  .action(() =>
    withOwner(async (db) => {
      for (const plugin of await listPlugins(db)) {
        console.log(`${plugin.slug}\t${plugin.version}\tAPI ${plugin.apiVersion}`);
      }
    }),
  );

program
  .command('plugin:uninstall')
  .description('Remove a plugin and ALL its data (schema, settings) from every site.')
  .argument('<slug>')
  .option('--yes', 'do not ask for confirmation')
  .option('--only-inactive', 'refuse a plugin still active on some site')
  .action(async (slug: string, opts: { yes?: boolean; onlyInactive?: boolean }) => {
    if (!opts.yes) {
      const { confirm } = await import('@inquirer/prompts');
      const sure = await confirm({
        message: `Delete ${slug} and all its data on every site? This cannot be undone.`,
        default: false,
      });
      if (!sure) return;
    }
    await withOwner(async (db) => {
      await uninstallPlugin(db, slug, {
        pluginsPath: pluginsPath(),
        onlyInactive: Boolean(opts.onlyInactive),
      });
      console.log(`Uninstalled ${slug}.`);
      await announcePluginChange(db);
    });
  });

// ---- Themes (RF-THM-01) -----------------------------------------------------------------

function themesPath(): string {
  return path.resolve(process.env.THEMES_PATH ?? 'cleitext-data/themes');
}

program
  .command('theme:build')
  .description('Bundle a theme (TypeScript/JSX) into the entry named in its theme.json.')
  .argument('[dir]', 'theme folder', '.')
  .action(async (dir: string) => {
    const { manifest, output } = await buildTheme(path.resolve(dir));
    console.log(
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
    console.log(
      previousVersion
        ? `Updated ${manifest.slug} ${previousVersion} → ${manifest.version}.`
        : `Installed ${manifest.slug} ${manifest.version}. Activate it in Appearance → Themes.`,
    );
    // The plugins that come with the theme, from the package's plugins/<slug>/ folders.
    const bundled = (manifest.plugins ?? [])
      .map((slug) => path.join(path.resolve(dir), 'plugins', slug))
      .filter((folder) => existsSync(path.join(folder, 'cleitext.plugin.json')));
    if (bundled.length) {
      const { appRole } = connectionSettings();
      if (!appRole)
        throw new OperationError('Set DATABASE_URL (application role) or CLEITEXT_APP_ROLE.');
      await withOwner(async (db) => {
        for (const folder of bundled) {
          const result = await installPlugin(db, {
            source: folder,
            pluginsPath: pluginsPath(),
            appRole,
            link: Boolean(opts.link),
            keepNewer: true,
          });
          console.log(
            result.skipped
              ? `  with the plugin ${result.manifest.slug} (${result.previousVersion} already installed)`
              : `  with the plugin ${result.manifest.slug} ${result.manifest.version}`,
          );
        }
        await announcePluginChange(db);
      });
    }
    await withOwner((db) => announceThemeChange(db));
  });

program
  .command('theme:list')
  .description('List the installed themes (Aurora is always available).')
  .action(async () => {
    console.log('aurora\t(bundled)');
    for (const theme of await listThemes(themesPath())) {
      console.log(`${theme.slug}\t${theme.version}\t${theme.name}`);
    }
  });

program
  .command('theme:uninstall')
  .description('Remove an installed theme that no site uses.')
  .argument('<slug>')
  .action((slug: string) =>
    withOwner(async (db) => {
      await uninstallTheme(db, slug, themesPath());
      await announceThemeChange(db);
      console.log(`Uninstalled ${slug}.`);
    }),
  );

// ---- Backup and restore (RNF-15) ------------------------------------------------------

function dataPaths() {
  const { ownerUrl } = connectionSettings();
  return {
    ownerUrl,
    mediaPath: path.resolve(process.env.MEDIA_PATH ?? 'cleitext-data/media'),
    pluginsPath: pluginsPath(),
  };
}

program
  .command('backup')
  .description('Back up the database (pg_dump), media and plugins into one .tar.gz file.')
  .requiredOption('--out <file>', 'e.g. backups/cleitext-2026-10-10.tar.gz')
  .action(async (opts: { out: string }) => {
    await withOwner(async (db) => {
      const { bytes } = await backup(db, dataPaths(), path.resolve(opts.out));
      console.log(`Backup written: ${opts.out} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
    });
  });

// ---- Core updates ------------------------------------------------------------------------

/** The application folder: this CLI is in <root>/packages/cli/dist. */
function appRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

function installedVersion(root: string): string {
  return (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string })
    .version;
}

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
    }) => {
      const root = opts.root ? path.resolve(opts.root) : appRoot();
      const from = installedVersion(root);
      const release = await findRelease(opts.repo, opts.to);
      if (opts.check) {
        console.log(
          isNewer(release.version, from)
            ? `Cleitext ${release.version} is available (installed: ${from}).`
            : `Cleitext ${from} is up to date.`,
        );
        return;
      }
      if (!opts.to && !isNewer(release.version, from)) {
        console.log(`Cleitext ${from} is up to date.`);
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
      try {
        const result = await runUpdate({
          root,
          release,
          onStep: (step) => {
            status.step = step;
            console.log(`… ${step}`);
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
          },
        });
        Object.assign(status, { state: 'done', finishedAt: new Date().toISOString() });
        await writeStatus(opts.status, status);
        console.log(
          `Updated ${from} → ${release.version}. Previous version kept in ${result.previous}.`,
        );
      } catch (error) {
        Object.assign(status, {
          state: 'failed',
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
        await writeStatus(opts.status, status);
        throw error;
      }
    },
  );

program
  .command('restore')
  .description('Restore a backup: REPLACES the database, media and plugins (asks first).')
  .argument('<file>')
  .option('--yes', 'do not ask for confirmation')
  .action(async (file: string, opts: { yes?: boolean }) => {
    const { appRole } = connectionSettings();
    if (!appRole)
      throw new OperationError('Set DATABASE_URL (application role) or CLEITEXT_APP_ROLE.');
    if (!opts.yes) {
      const { confirm } = await import('@inquirer/prompts');
      const sure = await confirm({
        message: 'Replace the current database, media and plugins with this backup?',
        default: false,
      });
      if (!sure) return;
    }
    await withOwner(async (db) => {
      const manifest = await restore(db, { ...dataPaths(), appRole }, path.resolve(file));
      console.log(`Restored the backup of ${manifest.createdAt}. Restart the server.`);
      await announcePluginChange(db);
    });
  });

// ---- Export and import (RF-IMP-01…04) -------------------------------------------------

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
  } finally {
    await context.close();
  }
}

async function printReport(
  module: Awaited<ReturnType<typeof tasks>>,
  report: Parameters<Awaited<ReturnType<typeof tasks>>['formatReport']>[0],
  file?: string,
) {
  console.log(module.formatReport(report));
  if (file) {
    await module.saveReport(file, report);
    console.log(`Full report: ${file}`);
  }
  if (report.errors.length) process.exitCode = 2;
}

program
  .command('export')
  .description(
    'Export a site (content, media, menus, users without passwords) to a .tar.gz archive.',
  )
  .requiredOption('--site <slug>')
  .requiredOption('--out <file>', 'archive to write, e.g. site.tar.gz')
  .action((opts) =>
    withTasks((module, context) => module.exportTask(context, { site: opts.site, out: opts.out })),
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

program.parseAsync().catch((error: unknown) => {
  if (error instanceof OperationError) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
