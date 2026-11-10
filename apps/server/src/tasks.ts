/**
 * Administrative tasks that need the application services (media variants,
 * cache, plugins) but no HTTP server: exports and imports (RF-IMP-01…04).
 * Run through the `cleitext` CLI: `cleitext export` and `import`.
 */
import { writeFile } from 'node:fs/promises';
import {
  createDatabase,
  settings,
  siteDomains,
  sites,
  superAdmins,
  withContext,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import { licenseStorageKey } from '@cleitext/shared';
import { AuditService } from './audit/audit.service.js';
import { IdentityService } from './auth/identity.service.js';
import { CatalogService } from './catalog/catalog.service.js';
import { LICENSES_NAMESPACE } from './catalog/licenses.service.js';
import { defaultLocaleIn, LanguagesService } from './content/languages.service.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, asc, eq } from 'drizzle-orm';
import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config/config.js';
import { DiskStorage } from './media/storage.js';
import { MediaService } from './media/media.service.js';
import { PluginHost } from './plugins/plugin-host.service.js';
import { PageCacheService } from './public/page-cache.service.js';
import { fileReader, openArchive, writeArchive } from './transfer/archive.js';
import { exportSite } from './transfer/exporter.js';
import { exportFieldDefinitions } from './transfer/field-definitions.js';
import { FieldGroupsService } from './fields/field-groups.service.js';
import { OptionsPagesService } from './fields/options-pages.service.js';
import { importDocument, importUser } from './transfer/importer.js';
import type { ImportReport, TransferDocument } from './transfer/model.js';

export interface TaskContext {
  app: NestFastifyApplication;
  config: AppConfig;
  owner: DatabaseClient;
  log(message: string): void;
}

/** Starts the application without listening, plus an owner connection. */
export async function openTasks(
  log: (message: string) => void = console.log,
): Promise<TaskContext & { close(): Promise<void> }> {
  const ownerUrl = process.env.DATABASE_ADMIN_URL;
  if (!ownerUrl) throw new Error('Set DATABASE_ADMIN_URL (owner connection).');
  const config = loadConfig({
    ...process.env,
    // Tasks print their own progress; only problems from the services.
    LOG_LEVEL: process.env.CLEITEXT_TASK_LOG_LEVEL ?? 'warn',
    SCHEDULER_INTERVAL_SECONDS: '0',
  });
  const app = await createApp(config);
  const owner = createDatabase(ownerUrl, { max: 2 });
  return {
    app,
    config,
    owner,
    log,
    async close() {
      await app.close();
      await owner.close();
    },
  };
}

export async function siteBySlug(
  context: TaskContext,
  slug: string,
): Promise<{ id: string; name: string; defaultLocale: string }> {
  const [site] = await context.owner.db.select().from(sites).where(eq(sites.slug, slug));
  if (!site) throw new Error(`No site with slug "${slug}".`);
  return { id: site.id, name: site.name, defaultLocale: site.defaultLocale };
}

/** `cleitext export --site <slug> --out file.tar.gz` (RF-IMP-03). */
export async function exportTask(
  context: TaskContext,
  options: { site: string; out: string },
): Promise<void> {
  const site = await siteBySlug(context, options.site);
  const languages = context.app.get(LanguagesService);
  const { document, files } = await exportSite(
    context.owner.db,
    site.id,
    { name: site.name },
    {
      locales: await languages.locales(site.id, site.defaultLocale),
      translations: (kind, ids) => languages.translations(site.id, kind, ids),
    },
    // The active plugins' own data (plugin API 1.46), back through `import.pluginData`.
    await context.app
      .get(PluginHost)
      .applyFilter('export.pluginData', {}, { siteId: site.id }, site.id),
    await exportFieldDefinitions(
      context.owner.db,
      context.app.get(PluginHost),
      context.app.get(FieldGroupsService),
      site.id,
    ),
    // Options pages' values with their references as refs (plugin API 1.48).
    await context.app.get(OptionsPagesService).exportValues(site.id),
  );
  const storage = new DiskStorage(context.config.media.path);
  await writeArchive(options.out, document, files, (key) => storage.pathOf(key));
  context.log(
    `Exported ${site.name}: ${document.entries?.length ?? 0} entries, ${document.media?.length ?? 0} media files → ${options.out}`,
  );
}

/** `cleitext import <file.tar.gz> --site <slug>` (RF-IMP-04). */
export async function importTask(
  context: TaskContext,
  options: { file: string; site: string; as?: string | undefined },
): Promise<ImportReport> {
  const site = await siteBySlug(context, options.site);
  const archive = await openArchive(options.file);
  try {
    return await runImport(context, site.id, archive.document, fileReader(archive.dir), options.as);
  } finally {
    await archive.close();
  }
}

async function runImport(
  context: TaskContext,
  siteId: string,
  document: unknown,
  readFile: (file: string) => Promise<Buffer>,
  as: string | undefined,
): Promise<ImportReport> {
  const host = context.app.get(PluginHost);
  const asUserId = await importUser(context.owner.db, as);
  return importDocument(document, {
    db: context.owner.db,
    siteId,
    asUserId,
    importPluginData: (input) =>
      host.applyFilter(
        'import.pluginData',
        null,
        { siteId, userId: asUserId, ...input },
        siteId,
        // The command is a background job: its hooks have the longer time limit.
        { timeout: 'job' },
      ),
    media: context.app.get(MediaService),
    cache: context.app.get(PageCacheService),
    readFile,
    activePlugins: await host.activeSlugs(siteId),
    locales: await context.app
      .get(LanguagesService)
      .locales(siteId, await defaultLocale(context, siteId)),
    onLanguagesPending: () =>
      host.emit('languages.pending', {}, siteId, undefined, { timeout: 'job' }),
    onProgress: context.log,
  });
}

async function defaultLocale(context: TaskContext, siteId: string): Promise<string> {
  return withContext(context.owner.db, { siteId }, (tx) => defaultLocaleIn(tx, siteId));
}

/**
 * `cleitext plugin:activate <slug> --site <s>`: as the admin's Activate button
 * (dependencies, conflicts, content types, `onActivate`), in the name of no
 * user. A paid plugin needs the site's license, entered in the admin.
 */
export async function activatePluginTask(
  context: TaskContext,
  options: { slug: string; site: string },
): Promise<{ slug: string; site: string; version: string; alreadyActive: boolean }> {
  const site = await siteBySlug(context, options.site);
  const host = context.app.get(PluginHost);
  const plugin = host.get(options.slug);
  if (!plugin) throw new Error(`The plugin ${options.slug} is not installed.`);
  const result = { slug: options.slug, site: options.site, version: plugin.version };
  if ((await host.activeSlugs(site.id)).has(options.slug))
    return { ...result, alreadyActive: true };
  if (plugin.manifest.paid) {
    const [license] = await withSiteContext(context.owner.db, site.id, (tx) =>
      tx
        .select({ key: settings.key })
        .from(settings)
        .where(
          and(
            eq(settings.siteId, site.id),
            eq(settings.namespace, LICENSES_NAMESPACE),
            eq(settings.key, licenseStorageKey('plugin', options.slug)),
          ),
        ),
    );
    if (!license) {
      throw new Error(
        `${options.slug} is paid: enter a license key for ${options.site} in the admin (Plugins) first.`,
      );
    }
  }
  await host.activate(site.id, '', options.slug);
  await withContext(context.owner.db, { siteId: site.id }, (tx) =>
    context.app.get(AuditService).record(tx, {
      siteId: site.id,
      action: 'plugin.activated',
      targetType: 'plugin',
      targetId: options.slug,
      meta: { via: 'cli' },
    }),
  );
  return { ...result, alreadyActive: false };
}

export interface CatalogUpdate {
  type: 'plugin' | 'theme';
  slug: string;
  name: string;
  from: string;
  to: string;
  /** Works with this Cleitext; otherwise the core must be updated first. */
  compatible: boolean;
  /** A paid item whose license no longer covers this version. */
  renew: boolean;
  /** After `--apply`: whether it was installed, and why not. */
  ok?: boolean;
  error?: string;
}

/**
 * `cleitext catalog:update [--check]` (core 0.97): the plugins and themes of
 * the catalog with a newer version, and with `apply` their update, as the
 * admin's Updates page does (compatible ones only, paid ones while the
 * license covers them; one that does not start goes back to its version).
 * Runs as the first super admin on the oldest active site, whose licenses
 * are used for paid items.
 */
export async function catalogUpdateTask(
  context: TaskContext,
  options: {
    apply: boolean;
    only?: { type: 'plugin' | 'theme'; slug: string }[];
    /** The site whose licenses are used; the oldest active one otherwise. */
    site?: string;
  },
): Promise<{ updates: CatalogUpdate[] }> {
  const [admin] = await context.owner.db
    .select({ id: superAdmins.userId })
    .from(superAdmins)
    .orderBy(asc(superAdmins.createdAt))
    .limit(1);
  const [site] = await context.owner.db
    .select({ id: sites.id })
    .from(sites)
    .where(
      options.site
        ? and(eq(sites.status, 'active'), eq(sites.slug, options.site))
        : eq(sites.status, 'active'),
    )
    .orderBy(asc(sites.createdAt))
    .limit(1);
  if (!admin || !site) throw new Error('No super admin or no active site.');
  const auth = await context.app.get(IdentityService).load(site.id, admin.id, '');
  if (!auth) throw new Error('The super admin cannot be loaded.');
  const catalog = context.app.get(CatalogService);
  const view = await catalog.view(site.id, auth, true);
  if (view.error && view.items.length === 0) throw new Error(`Catalog: ${view.error}`);
  const wanted = (type: string, slug: string) =>
    !options.only?.length || options.only.some((o) => o.type === type && o.slug === slug);
  const updates: CatalogUpdate[] = view.items
    .filter((i) => i.installed && i.update && wanted(i.type, i.slug))
    .map((i) => ({
      type: i.type,
      slug: i.slug,
      name: i.name,
      from: i.installed!,
      to: i.version,
      compatible: i.compatible,
      renew: i.renew,
    }));
  if (!options.apply) return { updates };
  const origin = `https://${(await primaryHost(context, site.id)) ?? 'localhost'}`;
  for (const update of updates) {
    if (!update.compatible || update.renew) {
      update.ok = false;
      update.error = update.renew
        ? 'The license does not cover this version: renew it.'
        : 'It needs a newer Cleitext: update Cleitext first.';
      continue;
    }
    try {
      await catalog.install(update.type, update.slug, { id: site.id, auth, origin });
      update.ok = true;
      context.log(`Updated ${update.name} ${update.from} → ${update.to}.`);
    } catch (error) {
      update.ok = false;
      update.error = error instanceof Error ? error.message : String(error);
      context.log(`${update.name}: ${update.error}`);
    }
  }
  return { updates };
}

async function primaryHost(context: TaskContext, siteId: string): Promise<string | undefined> {
  const [row] = await context.owner.db
    .select({ host: siteDomains.host })
    .from(siteDomains)
    .where(and(eq(siteDomains.siteId, siteId), eq(siteDomains.isPrimary, true)))
    .limit(1);
  return row?.host;
}

/** Human-readable report; the full one can be saved as JSON. */
export function formatReport(report: ImportReport): string {
  const list = (record: Record<string, number>) =>
    Object.entries(record)
      .map(([kind, n]) => `${n} ${kind}`)
      .join(', ') || 'nothing';
  const lines = [`Created: ${list(report.created)}`, `Already present: ${list(report.skipped)}`];
  if (report.warnings.length) {
    lines.push(
      `Warnings (${report.warnings.length}):`,
      ...report.warnings.slice(0, 50).map((w) => `  - ${w}`),
    );
    if (report.warnings.length > 50)
      lines.push(`  … ${report.warnings.length - 50} more (see the JSON report)`);
  }
  lines.push(report.errors.length ? `Errors (${report.errors.length}):` : 'No blocking errors.');
  lines.push(...report.errors.map((e) => `  - ${e}`));
  return lines.join('\n');
}

export async function saveReport(file: string, report: ImportReport): Promise<void> {
  await writeFile(file, JSON.stringify(report, null, 2));
}

export type { TransferDocument };
