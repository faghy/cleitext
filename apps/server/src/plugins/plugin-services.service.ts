import {
  apiTokens,
  auditLog,
  comments,
  contentTypes,
  entries,
  entryLikes,
  entryTerms,
  inTransaction,
  media,
  menus,
  revisions,
  settings,
  sessions,
  siteMembers,
  sites,
  superAdmins,
  taxonomies,
  terms,
  transactionFor,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import {
  pluginSchemaName,
  type CopyOptions,
  type EntryQuery,
  type LanguageUsage,
  type PluginEntry,
  type PluginSite,
  type PluginTerm,
  type PendingLanguages,
  type ImportReport,
  type PersonalDataGroup,
  type PluginMedia,
  type PluginComment,
  type PluginTransaction,
  type RouteRequest,
  type TermQuery,
  type TranslationLink,
  type DocumentImportOptions,
} from '@cleitext/plugin-sdk';
import {
  fieldDefaults,
  fieldsValidator,
  type FieldDefinition,
  type FieldValues,
} from '@cleitext/shared';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { CommentsService } from '../community/comments.service.js';
import { fetchPublic, sendPublic } from '../common/public-fetch.js';
import type { AuthContext } from '../common/request-context.js';
import { seal, unseal } from '../common/secrets.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { IdentityService } from '../auth/identity.service.js';
import { EntriesService } from '../content/entries.service.js';
import { defaultLocaleIn, LanguagesService, PENDING } from '../content/languages.service.js';
import { TermsService } from '../content/terms.service.js';
import { DATABASE, PLUGIN_DATABASE } from '../database/database.module.js';
import { MailService } from '../mail/mail.service.js';
import { MediaService } from '../media/media.service.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { isPublished, isTypeAvailable, loadSiteData } from '../public/site-data.js';
import { importDocument } from '../transfer/importer.js';
import { transferDocumentSchema } from '../transfer/model.js';
import type { PluginServices } from './plugin-context.js';
import { PluginHost, type LoadedPlugin } from './plugin-host.service.js';

/** Core services exposed to plugins through their context facades. */
@Injectable()
export class PluginServicesProvider implements PluginServices {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(PLUGIN_DATABASE) private readonly pluginDatabase: DatabaseClient,
    private readonly host: PluginHost,
    private readonly cache: PageCacheService,
    private readonly mail: MailService,
    private readonly languages: LanguagesService,
    private readonly entriesService: EntriesService,
    private readonly termsService: TermsService,
    private readonly identity: IdentityService,
    private readonly media: MediaService,
    private readonly commentsService: CommentsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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

  async entryTranslations(siteId: string, id: string): Promise<TranslationLink[]> {
    const links = await this.languages.translations(siteId, 'entry', [id]);
    return (links.get(id) ?? []).map((l) => ({ id: l.id, locale: l.locale }));
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

  async updateEntry(
    siteId: string,
    id: string,
    changes: { title?: string; excerpt?: string | null; document?: unknown; fields?: FieldValues },
    options: { userId: string },
  ): Promise<void> {
    const auth = await this.actor(siteId, options.userId);
    await this.entriesService.update(
      siteId,
      auth,
      id,
      {
        ...(changes.title !== undefined ? { title: changes.title } : {}),
        ...(changes.excerpt !== undefined ? { excerpt: changes.excerpt } : {}),
        ...(changes.document !== undefined ? { document: changes.document } : {}),
        ...(changes.fields !== undefined ? { fields: changes.fields } : {}),
      },
      '',
    );
  }

  async revisionOf(
    siteId: string,
    id: string,
  ): Promise<{
    title: string;
    excerpt: string | null;
    document: unknown;
    fields: FieldValues;
  } | null> {
    const row = await withContext(this.database.db, { siteId }, async (tx) => {
      const [found] = await tx
        .select({ revision: revisions })
        .from(entries)
        .innerJoin(revisions, eq(revisions.id, entries.currentRevisionId))
        .where(and(eq(entries.id, id), ne(entries.status, 'trashed')));
      return found?.revision;
    });
    if (!row) return null;
    return {
      title: row.title,
      excerpt: row.excerpt ?? null,
      document: row.document,
      fields: (row.fields as FieldValues) ?? {},
    };
  }

  seal(value: string): unknown {
    return seal(this.config.appSecret, value);
  }

  unseal(sealed: unknown): string | null {
    return unseal(this.config.appSecret, sealed);
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
        .orderBy(asc(terms.position), asc(terms.name))
        .limit(Math.min(Math.max(query.limit ?? 100, 1), 500));
      return rows.map(({ term, taxonomy }) => ({
        id: term.id,
        taxonomy,
        locale: term.locale,
        slug: term.slug,
        name: term.name,
        parentId: term.parentId,
        url: data.urls.term(taxonomy, term.slug, term.locale),
        description: term.description,
        fields: term.fields as FieldValues,
        position: term.position,
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

  /**
   * What the core keeps about an email on a site (GDPR access request): the
   * account, if it can use the site, its sessions, tokens and recent activity.
   */
  async corePersonalData(siteId: string, email: string): Promise<PersonalDataGroup[]> {
    // Users are visible to the site only when they are its members (RLS).
    const found = await withContext(this.database.db, { siteId }, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.email, email));
      if (!user) return null;
      const [member] = await tx
        .select({ roleId: siteMembers.roleId })
        .from(siteMembers)
        .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, user.id)));
      if (!member) return null;
      const [admin] = await tx.select().from(superAdmins).where(eq(superAdmins.userId, user.id));
      return {
        user,
        admin: Boolean(admin),
        sessionRows: await tx.select().from(sessions).where(eq(sessions.userId, user.id)),
        tokens: await tx.select().from(apiTokens).where(eq(apiTokens.userId, user.id)),
        activity: await tx
          .select()
          .from(auditLog)
          .where(and(eq(auditLog.siteId, siteId), eq(auditLog.userId, user.id)))
          .orderBy(desc(auditLog.createdAt))
          .limit(1000),
      };
    });
    const community = await this.communityPersonalData(siteId, email, found?.user.id ?? null);
    if (!found) return community;
    const { user, admin, sessionRows, tokens, activity } = found;
    const date = (value: Date | null) => value?.toISOString() ?? null;
    return [
      {
        id: 'core.account',
        label: { en: 'Account', it: 'Account' },
        items: [
          {
            email: user.email,
            name: user.displayName,
            language: user.locale,
            created: date(user.createdAt),
            lastSignIn: date(user.lastLoginAt),
            twoFactor: Boolean(user.totpConfirmedAt),
            superAdmin: admin,
            bio: user.bio || null,
            website: user.website,
            authorPage: user.slug,
          },
        ],
      },
      {
        id: 'core.sessions',
        label: { en: 'Sessions', it: 'Sessioni' },
        items: sessionRows.map((row) => ({
          ip: row.ip,
          browser: row.userAgent,
          lastSeen: date(row.lastSeenAt),
          expires: date(row.expiresAt),
        })),
      },
      {
        id: 'core.tokens',
        label: {
          en: 'API tokens and connected assistants',
          it: 'Token API e assistenti collegati',
        },
        items: tokens.map((row) => ({
          name: row.name,
          created: date(row.createdAt),
          lastUsed: date(row.lastUsedAt),
        })),
      },
      {
        id: 'core.activity',
        label: { en: 'Activity on the site', it: 'Attività sul sito' },
        items: activity.map((row) => ({
          action: row.action,
          target: row.targetType ? `${row.targetType} ${row.targetId ?? ''}`.trim() : null,
          ip: row.ip,
          date: date(row.createdAt),
        })),
      },
      ...community,
    ];
  }

  /** Comments written with an email address or by its account, and its likes (RF-COM). */
  private async communityPersonalData(
    siteId: string,
    email: string,
    userId: string | null,
  ): Promise<PersonalDataGroup[]> {
    const { rows, likes } = await withContext(this.database.db, { siteId }, async (tx) => ({
      rows: await tx
        .select({ comment: comments, entryTitle: entries.title })
        .from(comments)
        .innerJoin(entries, eq(entries.id, comments.entryId))
        .where(
          userId
            ? or(eq(comments.authorEmail, email), eq(comments.userId, userId))
            : eq(comments.authorEmail, email),
        )
        .orderBy(asc(comments.createdAt)),
      likes: userId
        ? await tx
            .select({ entryTitle: entries.title, createdAt: entryLikes.createdAt })
            .from(entryLikes)
            .innerJoin(entries, eq(entries.id, entryLikes.entryId))
            .where(eq(entryLikes.liker, `user:${userId}`))
        : [],
    }));
    const groups: PersonalDataGroup[] = [];
    if (rows.length > 0) {
      groups.push({
        id: 'core.comments',
        label: { en: 'Comments', it: 'Commenti' },
        items: rows.map(({ comment, entryTitle }) => ({
          on: entryTitle,
          name: comment.authorName,
          email: comment.authorEmail,
          website: comment.authorUrl,
          content: comment.content,
          status: comment.status,
          ip: comment.ip,
          browser: comment.userAgent,
          date: comment.createdAt.toISOString(),
        })),
      });
    }
    if (likes.length > 0) {
      groups.push({
        id: 'core.likes',
        label: { en: 'Likes', it: 'Mi piace' },
        items: likes.map((l) => ({ on: l.entryTitle, date: l.createdAt.toISOString() })),
      });
    }
    return groups;
  }

  /**
   * Erasure request (art. 17): comments are anonymized as WordPress does
   * (their text stays, without name, email, website and address), likes go.
   */
  async eraseCommunityData(
    siteId: string,
    email: string,
  ): Promise<{ removed: number; retained: number; messages?: string[] }> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      const changed = await tx
        .update(comments)
        .set({
          authorName: 'Anonymous',
          authorEmail: '',
          authorUrl: null,
          ip: null,
          userAgent: null,
          userId: null,
          notifyReplies: false,
          updatedAt: new Date(),
        })
        .where(
          user
            ? or(eq(comments.authorEmail, email), eq(comments.userId, user.id))
            : eq(comments.authorEmail, email),
        )
        .returning({ entryId: comments.entryId });
      const liked = user
        ? await tx
            .delete(entryLikes)
            .where(eq(entryLikes.liker, `user:${user.id}`))
            .returning({ entryId: entryLikes.entryId })
        : [];
      // Like counts follow.
      for (const entryId of new Set(liked.map((l) => l.entryId))) {
        await tx
          .update(entries)
          .set({
            likeCount: sql`(SELECT count(*) FROM entry_likes WHERE entry_id = ${entryId})::int`,
          })
          .where(eq(entries.id, entryId));
      }
      const touched = [...new Set([...changed, ...liked].map((r) => r.entryId))];
      if (touched.length > 0) {
        await this.cache.invalidate(siteId, [...touched.map((id) => `entry:${id}`), 'comments']);
      }
      return {
        removed: changed.length + liked.length,
        retained: 0,
        ...(changed.length > 0
          ? { messages: [`${changed.length} comment(s) anonymized; their text stays on the site.`] }
          : {}),
      };
    });
  }

  /**
   * A transfer document built by an import plugin (plugin API 1.8), e.g. from
   * a WordPress export uploaded in the admin. Unlike the CLI, media files are
   * only downloaded from public addresses: the file comes from a browser, so
   * it must not reach the server's own network or its disk.
   */
  async importDocument(
    siteId: string,
    input: unknown,
    options: DocumentImportOptions,
  ): Promise<ImportReport> {
    if (!(await this.identity.load(siteId, options.userId, ''))) {
      throw new ForbiddenException('This user cannot import into the site.');
    }
    const parsed = transferDocumentSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        `Not a valid transfer document: ${parsed.error.issues[0]?.path.join('.') || 'root'} ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      );
    }
    const defaultLocale = await withContext(this.database.db, { siteId }, (tx) =>
      defaultLocaleIn(tx, siteId),
    );
    const locales = await this.languages.locales(siteId, defaultLocale);
    const codes = new Set(locales.map((l) => l.code));
    const unknown = [
      ...new Set([...parsed.data.entries, ...parsed.data.terms].map((r) => r.locale)),
    ].filter((code) => !codes.has(code));
    if (unknown.length > 0) {
      throw new BadRequestException(`The site has no language "${unknown.join('", "')}".`);
    }
    return importDocument(parsed.data, {
      db: this.database.db,
      siteId,
      asUserId: options.userId,
      media: this.media,
      cache: this.cache,
      readFile: async (file) => {
        if (!/^https?:\/\//i.test(file)) throw new Error('not a web address');
        const { data } = await fetchPublic(file, {
          maxBytes: this.config.media.maxBytes,
          timeoutMs: 60_000,
          allowHttp: true,
          userAgent: 'Cleitext-Importer/1.0',
        });
        return data;
      },
      activePlugins: await this.host.activeSlugs(siteId),
      locales,
      onLanguagesPending: () => this.host.emit('languages.pending', {}, siteId),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    });
  }

  async findComments(
    siteId: string,
    query: {
      entryId?: string;
      type?: string;
      status?: PluginComment['status'] | 'any';
      userId?: string;
      authorEmail?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<PluginComment[]> {
    const uuid = /^[0-9a-f-]{36}$/i;
    if ((query.entryId && !uuid.test(query.entryId)) || (query.userId && !uuid.test(query.userId)))
      return [];
    const status = query.status ?? 'approved';
    const rows = await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .select()
        .from(comments)
        .where(
          and(
            query.entryId ? eq(comments.entryId, query.entryId) : undefined,
            query.type ? eq(comments.type, query.type) : undefined,
            status === 'any' ? undefined : eq(comments.status, status),
            query.userId ? eq(comments.userId, query.userId) : undefined,
            query.authorEmail
              ? eq(comments.authorEmail, query.authorEmail.trim().toLowerCase())
              : undefined,
          ),
        )
        .orderBy(desc(comments.createdAt))
        .limit(Math.min(Math.max(query.limit ?? 100, 1), 1000))
        .offset(Math.max(query.offset ?? 0, 0)),
    );
    return rows.map((r) => ({
      id: r.id,
      entryId: r.entryId,
      parentId: r.parentId,
      type: r.type,
      status: r.status,
      userId: r.userId,
      authorName: r.authorName,
      content: r.content,
      meta: r.meta,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async postComment(
    request: RouteRequest,
    input: {
      entryId: string;
      type: string;
      content: string;
      meta?: Record<string, unknown>;
      authorName?: string;
      authorEmail?: string;
    },
  ): Promise<{ id: string; status: PluginComment['status'] }> {
    const who = request.user
      ? await withContext(this.database.db, { siteId: request.siteId }, async (tx) => {
          const [user] = await tx
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, request.user!.id));
          return user
            ? {
                userId: request.user!.id,
                displayName: request.user!.displayName,
                email: user.email,
                capabilities: request.user!.capabilities,
              }
            : null;
        })
      : null;
    try {
      return await this.commentsService.post(
        request.siteId,
        {
          entryId: input.entryId,
          content: input.content,
          ...(input.authorName !== undefined ? { authorName: input.authorName } : {}),
          ...(input.authorEmail !== undefined ? { authorEmail: input.authorEmail } : {}),
        },
        who,
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          locale: request.locale,
          origin: request.origin,
        },
        { type: input.type, meta: input.meta ?? {}, anyEntry: true },
      );
    } catch (error) {
      // The visitor's message, as the core says it, with its status.
      if (error instanceof HttpException)
        throw Object.assign(new Error(error.message), { status: error.getStatus() });
      throw error;
    }
  }

  async httpSend(
    plugin: LoadedPlugin,
    request: {
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs: number;
    },
  ): Promise<{ status: number; type: string; text: string }> {
    const res = await sendPublic(request.url, {
      method: request.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      ...(request.headers ? { headers: request.headers } : {}),
      ...(request.body !== undefined ? { body: request.body } : {}),
      maxBytes: 1024 * 1024,
      timeoutMs: request.timeoutMs,
      userAgent: `Cleitext-Plugin/${plugin.slug}`,
    });
    return { status: res.status, type: res.type, text: res.data.toString('utf8') };
  }

  async mediaItem(siteId: string, id: string): Promise<PluginMedia | null> {
    const [row] = await withContext(this.database.db, { siteId }, (tx) =>
      tx.select().from(media).where(eq(media.id, id)),
    );
    return row
      ? {
          id: row.id,
          url: `/media/${row.storageKey}`,
          mime: row.mime,
          width: row.width,
          height: row.height,
          alt: (row.alt as Record<string, string>) ?? {},
        }
      : null;
  }

  async findEntries(siteId: string, query: EntryQuery): Promise<PluginEntry[]> {
    const active = await this.host.activeSlugs(siteId);
    return withContext(this.database.db, { siteId }, async (tx) => {
      const data = await loadSiteData(
        tx,
        active,
        await this.languages.locales(siteId, await defaultLocaleIn(tx, siteId)),
      );
      // Types of the site and of active plugins, private ones included (no address).
      const typeRows = await tx
        .select({
          slug: contentTypes.slug,
          source: contentTypes.source,
          supports: contentTypes.supports,
        })
        .from(contentTypes);
      const visible = new Set(
        typeRows.filter((t) => isTypeAvailable(t.source, active)).map((t) => t.slug),
      );
      const privateTypes = new Set(
        typeRows.filter((t) => t.supports.includes('private')).map((t) => t.slug),
      );
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
        .select({
          row: entries,
          title: revisions.title,
          fields: revisions.fields,
          document: revisions.document,
          featuredMediaId: revisions.featuredMediaId,
        })
        .from(entries)
        .innerJoin(
          revisions,
          eq(revisions.id, published ? entries.publishedRevisionId : entries.currentRevisionId),
        )
        .where(and(...conditions))
        .orderBy(desc(entries.publishedAt), desc(entries.createdAt))
        .limit(Math.min(Math.max(query.limit ?? 50, 1), 200));
      const termRows =
        rows.length > 0
          ? await tx
              .select({
                entryId: entryTerms.entryId,
                termId: entryTerms.termId,
                taxonomy: taxonomies.slug,
              })
              .from(entryTerms)
              .innerJoin(terms, eq(terms.id, entryTerms.termId))
              .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
              .where(
                inArray(
                  entryTerms.entryId,
                  rows.map((r) => r.row.id),
                ),
              )
              .orderBy(asc(entryTerms.position))
          : [];
      const termsOf = new Map<string, Record<string, string[]>>();
      for (const t of termRows) {
        const own = termsOf.get(t.entryId) ?? {};
        (own[t.taxonomy] ??= []).push(t.termId);
        termsOf.set(t.entryId, own);
      }
      return rows.map(({ row, title, fields, document, featuredMediaId }) => ({
        id: row.id,
        type: row.typeSlug,
        locale: row.locale,
        slug: row.slug,
        title,
        status: row.status,
        url: privateTypes.has(row.typeSlug) ? '' : data.urls.entry(row),
        parentId: row.parentId ?? null,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        fields: (fields as FieldValues) ?? {},
        terms: termsOf.get(row.id) ?? {},
        featuredMediaId: featuredMediaId ?? null,
        ...(query.withDocument ? { document: document as PluginEntry['document'] } : {}),
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
   * It has a connection of the plugin pool, taken only while holding one of
   * the main pool (the request's, or one opened here): always in that order,
   * so the two pools never wait on each other. Inside a transaction of the
   * same plugin and site it runs in a savepoint of that one.
   */
  transaction<T>(
    plugin: LoadedPlugin,
    siteId: string,
    fn: (tx: PluginTransaction) => Promise<T>,
  ): Promise<T> {
    const schema = pluginSchemaName(plugin.slug);
    const run = async (): Promise<T> => {
      const role = await this.roleOf(plugin.slug, siteId);
      return transactionFor(
        this.pluginDatabase.db,
        { siteId, role },
        async (tx) => {
          await tx.execute(
            sql`select set_config('app.site_id', ${siteId}, true), set_config('search_path', ${`${schema}, public`}, true)`,
          );
          await tx.execute(sql.raw(`SET LOCAL ROLE "${role.replaceAll('"', '""')}"`));
        },
        (tx) => revocable(tx, fn),
      );
    };
    return inTransaction(this.database.db, { siteId })
      ? run()
      : withContext(this.database.db, { siteId }, run);
  }

  private async roleOf(slug: string, siteId: string): Promise<string> {
    let role = this.roles.get(slug);
    if (!role) {
      const [row] = await withContext(this.database.db, { siteId }, (tx) =>
        tx.execute<{ role: string }>(sql`select cleitext_plugin_role(${slug}) as role`),
      );
      role = row!.role;
      this.roles.set(slug, role);
    }
    return role;
  }

  /** Plugin role names, from the database (migration 0017); they never change at runtime. */
  private readonly roles = new Map<string, string>();

  invalidate(siteId: string, tags: string[]): Promise<void> {
    return this.cache.invalidate(siteId, tags);
  }

  sendMail(message: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    siteId?: string;
  }): Promise<void> {
    const { siteId, ...mail } = message;
    return this.mail.send(mail, siteId);
  }
}

/**
 * The plugin's handle on its transaction stops working when the transaction
 * ends: its connection then serves other requests, as other roles.
 */
async function revocable<T>(
  tx: SiteTransaction,
  fn: (tx: PluginTransaction) => Promise<T>,
): Promise<T> {
  const { proxy, revoke } = Proxy.revocable(tx, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
  try {
    return await fn(proxy as unknown as PluginTransaction);
  } finally {
    revoke();
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
