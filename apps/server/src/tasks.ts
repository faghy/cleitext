/**
 * Administrative tasks that need the application services (media variants,
 * cache, plugins) but no HTTP server: exports and imports (RF-IMP-01…04).
 * Run through the `cleitext` CLI: `cleitext export` and `import`.
 */
import { writeFile } from 'node:fs/promises';
import { createDatabase, sites, withContext, type DatabaseClient } from '@cleitext/db';
import { defaultLocaleIn, LanguagesService } from './content/languages.service.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config/config.js';
import { DiskStorage } from './media/storage.js';
import { MediaService } from './media/media.service.js';
import { PluginHost } from './plugins/plugin-host.service.js';
import { PageCacheService } from './public/page-cache.service.js';
import { fileReader, openArchive, writeArchive } from './transfer/archive.js';
import { exportSite } from './transfer/exporter.js';
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
  return importDocument(document, {
    db: context.owner.db,
    siteId,
    asUserId: await importUser(context.owner.db, as),
    media: context.app.get(MediaService),
    cache: context.app.get(PageCacheService),
    readFile,
    activePlugins: await host.activeSlugs(siteId),
    locales: await context.app
      .get(LanguagesService)
      .locales(siteId, await defaultLocale(context, siteId)),
    onLanguagesPending: () => host.emit('languages.pending', {}, siteId),
    onProgress: context.log,
  });
}

async function defaultLocale(context: TaskContext, siteId: string): Promise<string> {
  return withContext(context.owner.db, { siteId }, (tx) => defaultLocaleIn(tx, siteId));
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
