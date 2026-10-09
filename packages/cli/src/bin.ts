#!/usr/bin/env node
import path from 'node:path';
import { createDatabase, migrate } from '@cleitext/db';
import { sql } from 'drizzle-orm';
import { input, password as passwordPrompt } from '@inquirer/prompts';
import { Command } from 'commander';
import {
  addDomain,
  addLocale,
  createSite,
  createUser,
  hasSites,
  listSites,
  OperationError,
  setPassword,
  setSiteStatus,
} from './operations.js';
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
        (await passwordPrompt({
          message: 'Super admin password (min. 12 characters)',
          mask: true,
        }));

      await createSite(db, {
        slug: siteSlug,
        name: siteName,
        host: domain,
        locale: opts.locale,
        forceHttps: opts.https,
      });
      await createUser(db, { email: adminEmail, password: adminPassword, superAdmin: true });
      console.log(
        `Installed. Sign in at ${opts.https ? 'https' : 'http'}://${domain}/admin/ as ${adminEmail}.`,
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
  .command('site:locale:add')
  .description('Enable a language on a site.')
  .requiredOption('--site <slug>')
  .requiredOption('--code <code>', 'BCP 47 code, e.g. it or de-CH')
  .requiredOption('--name <name>', 'label, e.g. Italiano')
  .option('--default', 'make it the default language')
  .action((opts) =>
    withOwner(async (db) => {
      await addLocale(db, {
        site: opts.site,
        code: opts.code,
        name: opts.name,
        isDefault: Boolean(opts.default),
      });
      console.log(`Language ${opts.code} enabled on ${opts.site}.`);
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
  if (await requestRestart(process.cwd()))
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
  .action(async (dir: string, opts: { link?: boolean; build?: boolean }) => {
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
  .action(async (slug: string, opts: { yes?: boolean }) => {
    if (!opts.yes) {
      const { confirm } = await import('@inquirer/prompts');
      const sure = await confirm({
        message: `Delete ${slug} and all its data on every site? This cannot be undone.`,
        default: false,
      });
      if (!sure) return;
    }
    await withOwner(async (db) => {
      await uninstallPlugin(db, slug, { pluginsPath: pluginsPath() });
      console.log(`Uninstalled ${slug}.`);
      await announcePluginChange(db);
    });
  });

program.parseAsync().catch((error: unknown) => {
  if (error instanceof OperationError) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
