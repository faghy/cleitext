import {
  entries,
  revisions,
  settings,
  siteLocales,
  sites,
  withContext,
  type DatabaseClient,
} from '@cleitext/db';
import {
  pluginRoleName,
  pluginSchemaName,
  type EntryQuery,
  type PluginEntry,
  type PluginSite,
  type PluginTransaction,
} from '@cleitext/plugin-sdk';
import { fieldDefaults, fieldsValidator, type FieldValues } from '@cleitext/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import { MailService } from '../mail/mail.service.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { isPublished, loadSiteData } from '../public/site-data.js';
import type { PluginServices } from './plugin-context.js';
import { PluginHost, type LoadedPlugin } from './plugin-host.service.js';

/** Core services exposed to plugins through their context facades. */
@Injectable()
export class PluginServicesProvider implements PluginServices {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly host: PluginHost,
    private readonly cache: PageCacheService,
    private readonly mail: MailService,
  ) {
    host.bind(this);
  }

  site(siteId: string): Promise<PluginSite> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const [site] = await tx.select().from(sites).where(eq(sites.id, siteId));
      const locales = await tx
        .select({ code: siteLocales.code })
        .from(siteLocales)
        .orderBy(asc(siteLocales.position), asc(siteLocales.code));
      return {
        id: siteId,
        name: site?.name ?? '',
        defaultLocale: site?.defaultLocale ?? 'en',
        locales: locales.map((l) => l.code),
      };
    });
  }

  async findEntries(siteId: string, query: EntryQuery): Promise<PluginEntry[]> {
    const active = await this.host.activeSlugs(siteId);
    return withContext(this.database.db, { siteId }, async (tx) => {
      const data = await loadSiteData(tx, active);
      const visible = new Set(data.types.map((t) => t.slug));
      if (query.type && !visible.has(query.type)) return [];
      const published = (query.status ?? 'published') === 'published';
      const conditions = [
        published ? isPublished : ne(entries.status, 'trashed'),
        inArray(entries.typeSlug, [...visible]),
        ...(query.type ? [eq(entries.typeSlug, query.type)] : []),
        ...(query.locale ? [eq(entries.locale, query.locale)] : []),
        ...(query.ids?.length ? [inArray(entries.id, query.ids)] : []),
      ];
      const rows = await tx
        .select({ row: entries, title: revisions.title, fields: revisions.fields })
        .from(entries)
        .innerJoin(
          revisions,
          eq(revisions.id, published ? entries.publishedRevisionId : entries.currentRevisionId),
        )
        .where(and(...conditions))
        .orderBy(desc(entries.publishedAt), desc(entries.createdAt))
        .limit(Math.min(Math.max(query.limit ?? 50, 1), 200));
      return rows.map(({ row, title, fields }) => ({
        id: row.id,
        type: row.typeSlug,
        locale: row.locale,
        slug: row.slug,
        title,
        status: row.status,
        url: data.urls.entry(row),
        publishedAt: row.publishedAt?.toISOString() ?? null,
        fields: (fields as FieldValues) ?? {},
      }));
    });
  }

  settings(plugin: LoadedPlugin, siteId: string): Promise<FieldValues> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const definition = plugin.settings?.fields ?? [];
      const values: FieldValues = fieldDefaults(definition);
      const rows = await tx
        .select()
        .from(settings)
        .where(eq(settings.namespace, `plugin:${plugin.slug}`));
      const validator = fieldsValidator(definition);
      for (const row of rows) {
        const candidate = { ...values, [row.key]: row.value };
        if (validator.safeParse(candidate).success) values[row.key] = row.value;
      }
      return values;
    });
  }

  /**
   * A transaction as the plugin's own PostgreSQL role: it only sees its
   * `plg_<slug>` schema, and Row Level Security limits rows to the site.
   */
  transaction<T>(
    plugin: LoadedPlugin,
    siteId: string,
    fn: (tx: PluginTransaction) => Promise<T>,
  ): Promise<T> {
    const schema = pluginSchemaName(plugin.slug);
    const role = pluginRoleName(plugin.slug);
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.site_id', ${siteId}, true), set_config('search_path', ${`${schema}, public`}, true)`,
      );
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      return fn(tx as unknown as PluginTransaction);
    });
  }

  invalidate(siteId: string, tags: string[]): Promise<void> {
    return this.cache.invalidate(siteId, tags);
  }

  sendMail(message: {
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
    siteId?: string;
  }): Promise<void> {
    const { siteId, ...mail } = message;
    return this.mail.send(mail, siteId);
  }
}
