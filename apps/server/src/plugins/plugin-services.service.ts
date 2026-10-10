import {
  contentTypes,
  entries,
  menus,
  revisions,
  settings,
  sites,
  taxonomies,
  terms,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import {
  pluginRoleName,
  pluginSchemaName,
  type CopyOptions,
  type EntryQuery,
  type LanguageUsage,
  type PluginEntry,
  type PluginSite,
  type PluginTerm,
  type PendingLanguages,
  type PluginTransaction,
  type TermQuery,
} from '@cleitext/plugin-sdk';
import {
  fieldDefaults,
  fieldsValidator,
  type FieldDefinition,
  type FieldValues,
} from '@cleitext/shared';
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { IdentityService } from '../auth/identity.service.js';
import { EntriesService } from '../content/entries.service.js';
import { defaultLocaleIn, LanguagesService, PENDING } from '../content/languages.service.js';
import { TermsService } from '../content/terms.service.js';
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
    private readonly languages: LanguagesService,
    private readonly entriesService: EntriesService,
    private readonly termsService: TermsService,
    private readonly identity: IdentityService,
  ) {
    host.bind(this);
  }

  async site(siteId: string): Promise<PluginSite> {
    const site = await withContext(this.database.db, { siteId }, async (tx) => {
      const [row] = await tx.select().from(sites).where(eq(sites.id, siteId));
      return row;
    });
    const defaultLocale = site?.defaultLocale ?? 'en';
    return {
      id: siteId,
      name: site?.name ?? '',
      defaultLocale,
      locales: (await this.languages.locales(siteId, defaultLocale)).map((l) => l.code),
    };
  }

  /** The user a plugin acts for: their permissions apply to what it does. */
  private async actor(siteId: string, userId: string): Promise<AuthContext> {
    const auth = await this.identity.load(siteId, userId, '');
    if (!auth) throw new ForbiddenException('That user cannot act on this site.');
    return auth;
  }

  private async siteData(tx: SiteTransaction, siteId: string) {
    const locales = await this.languages.locales(siteId, await defaultLocaleIn(tx, siteId));
    return loadSiteData(tx, await this.host.activeSlugs(siteId), locales);
  }

  async copyEntry(siteId: string, id: string, options: CopyOptions): Promise<PluginEntry> {
    const auth = await this.actor(siteId, options.userId);
    const source = await this.entriesService.get(siteId, auth, id);
    const copy = await this.entriesService.copyToLocale(
      siteId,
      auth,
      id,
      options.locale ?? source.locale,
      '',
    );
    const [entry] = await this.findEntries(siteId, { ids: [copy.id], status: 'any', limit: 1 });
    return entry!;
  }

  async updateFields(
    siteId: string,
    id: string,
    values: FieldValues,
    options: { userId: string },
  ): Promise<void> {
    const auth = await this.actor(siteId, options.userId);
    const entry = await this.entriesService.get(siteId, auth, id);
    const current = (entry.revision?.fields ?? {}) as FieldValues;
    const merged: FieldValues = { ...current };
    for (const [key, value] of Object.entries(values)) {
      // Field groups are objects: only the given fields of a group change.
      merged[key] =
        isPlainObject(value) && isPlainObject(current[key])
          ? { ...(current[key] as FieldValues), ...value }
          : value;
    }
    await this.entriesService.update(siteId, auth, id, { fields: merged }, '');
  }

  fieldsOf(
    siteId: string,
    type: string,
  ): Promise<{ fields: FieldDefinition[]; groups: { id: string; fields: FieldDefinition[] }[] }> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const [row] = await tx.select().from(contentTypes).where(eq(contentTypes.slug, type));
      if (!row) return { fields: [], groups: [] };
      const { fields, groups } = await this.host.fieldsFor(siteId, row);
      return { fields, groups: groups.map((g) => ({ id: g.id, fields: g.fields })) };
    });
  }

  findTerms(siteId: string, query: TermQuery): Promise<PluginTerm[]> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const data = await this.siteData(tx, siteId);
      const rows = await tx
        .select({ term: terms, taxonomy: taxonomies.slug })
        .from(terms)
        .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
        .where(
          and(
            ...(query.taxonomy ? [eq(taxonomies.slug, query.taxonomy)] : []),
            ...(query.locale ? [eq(terms.locale, query.locale)] : []),
            ...(query.ids?.length ? [inArray(terms.id, query.ids)] : []),
          ),
        )
        .orderBy(asc(terms.name))
        .limit(Math.min(Math.max(query.limit ?? 100, 1), 500));
      return rows.map(({ term, taxonomy }) => ({
        id: term.id,
        taxonomy,
        locale: term.locale,
        slug: term.slug,
        name: term.name,
        parentId: term.parentId,
        url: data.urls.term(taxonomy, term.slug, term.locale),
      }));
    });
  }

  async copyTerm(
    siteId: string,
    id: string,
    options: CopyOptions & { name?: string; parentId?: string | null },
  ): Promise<PluginTerm> {
    const auth = await this.actor(siteId, options.userId);
    const [source] = await this.findTerms(siteId, { ids: [id], limit: 1 });
    if (!source) throw new BadRequestException('Term not found.');
    const copy = await this.termsService.copyToLocale(siteId, auth, id, {
      locale: options.locale ?? source.locale,
      name: options.name,
      parentId: options.parentId ?? null,
    });
    const [term] = await this.findTerms(siteId, { ids: [copy.id], limit: 1 });
    return term!;
  }

  languageUsage(siteId: string): Promise<Record<string, LanguageUsage>> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const usage: Record<string, LanguageUsage> = {};
      const add = (rows: { locale: string; n: number }[], key: keyof LanguageUsage) => {
        for (const { locale, n } of rows)
          (usage[locale] ??= { entries: 0, terms: 0, menus: 0 })[key] = n;
      };
      const count = sql<number>`count(*)::int`;
      add(
        await tx
          .select({ locale: entries.locale, n: count })
          .from(entries)
          .where(ne(entries.status, 'trashed'))
          .groupBy(entries.locale),
        'entries',
      );
      add(
        await tx.select({ locale: terms.locale, n: count }).from(terms).groupBy(terms.locale),
        'terms',
      );
      add(
        await tx.select({ locale: menus.locale, n: count }).from(menus).groupBy(menus.locale),
        'menus',
      );
      return usage;
    });
  }

  async setDefaultLocale(siteId: string, code: string): Promise<void> {
    await withContext(this.database.db, { siteId }, async (tx) => {
      const current = await defaultLocaleIn(tx, siteId);
      if (!(await this.languages.allowed(siteId, current, code))) {
        throw new BadRequestException(`The language "${code}" is not one of the site's languages.`);
      }
      await tx.execute(sql`select cleitext_app_set_default_locale(${code})`);
    });
    await this.languagesChanged(siteId);
  }

  /** Every process drops its cached languages and pages of the site. */
  languagesChanged(siteId: string): Promise<void> {
    return this.cache.invalidate(siteId, ['site'], { sites: true });
  }

  async pendingLanguages(siteId: string): Promise<PendingLanguages | null> {
    const [row] = await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .select({ value: settings.value })
        .from(settings)
        .where(and(eq(settings.namespace, PENDING.namespace), eq(settings.key, PENDING.key))),
    );
    return (row?.value as PendingLanguages | undefined) ?? null;
  }

  async clearPendingLanguages(siteId: string): Promise<void> {
    await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .delete(settings)
        .where(and(eq(settings.namespace, PENDING.namespace), eq(settings.key, PENDING.key))),
    );
  }

  async storageGet(plugin: LoadedPlugin, siteId: string, key: string): Promise<unknown> {
    const [row] = await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .select({ value: settings.value })
        .from(settings)
        .where(
          and(eq(settings.namespace, `plugin:${plugin.slug}`), eq(settings.key, storageKey(key))),
        ),
    );
    return row?.value ?? null;
  }

  async storageSet(
    plugin: LoadedPlugin,
    siteId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .insert(settings)
        .values({ siteId, namespace: `plugin:${plugin.slug}`, key: storageKey(key), value })
        .onConflictDoUpdate({
          target: [settings.siteId, settings.namespace, settings.key],
          set: { value },
        }),
    );
  }

  async storageDelete(plugin: LoadedPlugin, siteId: string, key: string): Promise<void> {
    await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .delete(settings)
        .where(
          and(eq(settings.namespace, `plugin:${plugin.slug}`), eq(settings.key, storageKey(key))),
        ),
    );
  }

  async findEntries(siteId: string, query: EntryQuery): Promise<PluginEntry[]> {
    const active = await this.host.activeSlugs(siteId);
    return withContext(this.database.db, { siteId }, async (tx) => {
      const data = await loadSiteData(
        tx,
        active,
        await this.languages.locales(siteId, await defaultLocaleIn(tx, siteId)),
      );
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
      const known = new Set(definition.map((f) => f.name));
      for (const row of rows) {
        // Storage values share the namespace.
        if (!known.has(row.key)) continue;
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

/**
 * Storage keys live next to the plugin settings (one row per setting key):
 * a prefix keeps them apart.
 */
function storageKey(key: string): string {
  if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(key)) throw new TypeError(`Invalid storage key: ${key}`);
  return `storage:${key}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
