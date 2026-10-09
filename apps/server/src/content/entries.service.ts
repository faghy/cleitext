import {
  createCoreRegistry,
  cxdDocumentSchema,
  documentText,
  emptyDocument,
  validateBlocks,
  type CxdDocument,
} from '@cleitext/blocks';
import {
  contentTypes,
  entries,
  newId,
  redirects,
  revisions,
  siteLocales,
  sites,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import type {
  ContentTypeView,
  EntryListResponse,
  EntryStatus,
  EntrySummary,
  EntryView,
  RevisionSummary,
  RevisionView,
} from '@cleitext/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, ilike, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { canDelete, canEdit, canPublish, canRead } from './entry-permissions.js';
import { nextFreeSlug, slugify } from './slug.js';
import { TermsService } from './terms.service.js';

type EntryRow = typeof entries.$inferSelect;
type RevisionRow = typeof revisions.$inferSelect;
type Tx = SiteTransaction;

const registry = createCoreRegistry();

/** Entries, revisions and translations (docs/ARCHITECTURE.md §9). */
@Injectable()
export class EntriesService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly audit: AuditService,
    private readonly termsService: TermsService,
  ) {}

  private run<T>(siteId: string, auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withContext(this.database.db, { siteId, userId: auth.userId }, fn);
  }

  // ---- Content types --------------------------------------------------------

  listTypes(siteId: string, auth: AuthContext): Promise<ContentTypeView[]> {
    return this.run(siteId, auth, async (tx) => {
      const rows = await tx.select().from(contentTypes).orderBy(asc(contentTypes.slug));
      return rows.map((t) => ({
        slug: t.slug,
        name: t.name as Record<string, string>,
        hierarchical: t.hierarchical,
        supports: t.supports,
        permalink: t.permalink,
      }));
    });
  }

  // ---- Queries --------------------------------------------------------------

  list(
    siteId: string,
    auth: AuthContext,
    query: {
      type?: string | undefined;
      status?: EntryStatus | undefined;
      locale?: string | undefined;
      q?: string | undefined;
      author?: string | undefined;
      parent?: string | undefined;
      limit: number;
      cursor?: string | undefined;
    },
  ): Promise<EntryListResponse> {
    return this.run(siteId, auth, async (tx) => {
      const conditions: SQL[] = [];
      if (query.type) conditions.push(eq(entries.typeSlug, query.type));
      conditions.push(
        query.status ? eq(entries.status, query.status) : ne(entries.status, 'trashed'),
      );
      if (query.locale) conditions.push(eq(entries.locale, query.locale));
      if (query.author) conditions.push(eq(entries.authorId, query.author));
      if (query.parent) conditions.push(eq(entries.parentId, query.parent));
      if (query.q) conditions.push(ilike(entries.title, `%${escapeLike(query.q)}%`));
      if (!auth.capabilities.includes('read_private_entries')) {
        conditions.push(or(ne(entries.status, 'private'), eq(entries.authorId, auth.userId))!);
      }
      const cursor = decodeCursor(query.cursor);
      if (cursor) {
        conditions.push(
          or(
            lt(entries.updatedAt, cursor.updatedAt),
            and(eq(entries.updatedAt, cursor.updatedAt), lt(entries.id, cursor.id)),
          )!,
        );
      }

      const rows = await tx
        .select({ entry: entries, authorName: users.displayName })
        .from(entries)
        .leftJoin(users, eq(users.id, entries.authorId))
        .where(and(...conditions))
        .orderBy(desc(entries.updatedAt), desc(entries.id))
        .limit(query.limit + 1);

      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map(({ entry, authorName }) => toSummary(entry, authorName)),
        nextCursor:
          rows.length > query.limit && last
            ? encodeCursor(last.entry.updatedAt, last.entry.id)
            : null,
      };
    });
  }

  get(siteId: string, auth: AuthContext, id: string): Promise<EntryView> {
    return this.run(siteId, auth, async (tx) => {
      const entry = await this.load(tx, id);
      if (!canRead(auth, entry)) throw new ForbiddenException('You cannot view this entry.');
      return this.view(tx, auth, entry);
    });
  }

  // ---- Commands ---------------------------------------------------------------

  create(
    siteId: string,
    auth: AuthContext,
    input: {
      type: string;
      locale?: string | undefined;
      title: string;
      slug?: string | undefined;
      parentId?: string | null | undefined;
      document?: unknown;
      fields?: Record<string, unknown> | undefined;
    },
    ip: string,
  ): Promise<EntryView> {
    if (!auth.capabilities.includes('edit_entries')) {
      throw new ForbiddenException('You cannot create entries.');
    }
    const document =
      input.document === undefined ? emptyDocument() : validateDocument(input.document);
    return this.run(siteId, auth, async (tx) => {
      const type = await this.contentType(tx, input.type);
      const locale = input.locale ?? (await this.defaultLocale(tx, siteId));
      await this.assertLocale(tx, locale);
      const parentId = await this.validParent(tx, type, locale, input.parentId ?? null, null);
      const slug = await this.uniqueSlug(
        tx,
        type.slug,
        locale,
        input.slug ?? slugify(input.title),
        null,
      );

      const id = newId();
      await tx.insert(entries).values({
        id,
        siteId,
        typeSlug: type.slug,
        locale,
        translationGroup: newId(),
        parentId,
        slug,
        title: input.title,
        status: 'draft',
        authorId: auth.userId,
      });
      await this.addRevision(
        tx,
        siteId,
        id,
        auth,
        'manual',
        input.title,
        input.fields ?? {},
        document,
      );
      await this.audit.record(tx, entryAudit(siteId, auth, 'entry.created', id, ip));
      return this.view(tx, auth, await this.load(tx, id));
    });
  }

  /** Saves changes as a new revision (RF-CNT-05). Published content stays as it was until republished. */
  update(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: {
      title?: string | undefined;
      slug?: string | undefined;
      parentId?: string | null | undefined;
      position?: number | undefined;
      document?: unknown;
      fields?: Record<string, unknown> | undefined;
      terms?: Record<string, (string | { name: string })[]> | undefined;
    },
    ip: string,
  ): Promise<EntryView> {
    const document = input.document === undefined ? undefined : validateDocument(input.document);
    return this.run(siteId, auth, async (tx) => {
      const entry = await this.load(tx, id);
      if (!canEdit(auth, entry)) throw new ForbiddenException('You cannot edit this entry.');
      const type = await this.contentType(tx, entry.typeSlug);

      const changes: Partial<typeof entries.$inferInsert> = { updatedAt: sql`now()` as never };
      if (input.title !== undefined) changes.title = input.title;
      if (input.position !== undefined) changes.position = input.position;
      if (input.parentId !== undefined) {
        changes.parentId = await this.validParent(tx, type, entry.locale, input.parentId, entry.id);
      }
      if (input.slug !== undefined && input.slug !== entry.slug) {
        changes.slug = await this.uniqueSlug(
          tx,
          entry.typeSlug,
          entry.locale,
          input.slug,
          entry.id,
        );
      } else if (
        input.slug === undefined &&
        input.title !== undefined &&
        input.title !== entry.title &&
        !entry.publishedRevisionId &&
        isAutomaticSlug(entry.slug, entry.title)
      ) {
        // Like WordPress: until first published, an untouched slug follows the title.
        changes.slug = await this.uniqueSlug(
          tx,
          entry.typeSlug,
          entry.locale,
          slugify(input.title),
          entry.id,
        );
      }

      const needsRevision =
        input.title !== undefined || input.document !== undefined || input.fields !== undefined;
      if (needsRevision) {
        const current = await this.revisionRow(tx, entry.currentRevisionId);
        await this.addRevision(
          tx,
          siteId,
          entry.id,
          auth,
          'manual',
          input.title ?? entry.title,
          input.fields ?? (current?.fields as Record<string, unknown>) ?? {},
          document ?? (current?.document as CxdDocument) ?? emptyDocument(),
        );
      }
      await tx.update(entries).set(changes).where(eq(entries.id, entry.id));
      if (input.terms) await this.termsService.assign(tx, siteId, auth, entry, input.terms);

      const updated = await this.load(tx, entry.id);
      if (changes.slug && entry.publishedRevisionId) {
        await this.redirectOldPath(tx, siteId, entry, updated, type.permalink);
      }
      await this.audit.record(tx, entryAudit(siteId, auth, 'entry.saved', id, ip));
      return this.view(tx, auth, updated);
    });
  }

  /** Autosave (RF-CNT-06): one per user and entry, does not change the entry. */
  autosave(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: { title: string; document: unknown; fields?: Record<string, unknown> | undefined },
  ): Promise<{ revisionId: string; savedAt: string }> {
    const document = validateDocument(input.document);
    return this.run(siteId, auth, async (tx) => {
      const entry = await this.load(tx, id);
      if (!canEdit(auth, entry)) throw new ForbiddenException('You cannot edit this entry.');
      await tx
        .delete(revisions)
        .where(
          and(
            eq(revisions.entryId, id),
            eq(revisions.kind, 'autosave'),
            eq(revisions.authorId, auth.userId),
          ),
        );
      const revision = await this.addRevision(
        tx,
        siteId,
        id,
        auth,
        'autosave',
        input.title,
        input.fields ?? {},
        document,
        { setCurrent: false },
      );
      return { revisionId: revision.id, savedAt: revision.createdAt.toISOString() };
    });
  }

  publish(siteId: string, auth: AuthContext, id: string, ip: string): Promise<EntryView> {
    return this.transition(siteId, auth, id, ip, 'entry.published', async (tx, entry) => {
      assertAllowed(canPublish(auth, entry), 'You cannot publish this entry.');
      if (!['draft', 'pending', 'scheduled', 'published', 'private'].includes(entry.status)) {
        throw new ConflictException(`A ${entry.status} entry cannot be published.`);
      }
      const revision = await this.revisionRow(tx, entry.currentRevisionId);
      const text = revision ? documentText(revision.document as CxdDocument) : '';
      await tx
        .update(entries)
        .set({
          status: 'published',
          publishedRevisionId: entry.currentRevisionId,
          publishedAt: entry.publishedAt ?? (sql`now()` as never),
          scheduledAt: null,
          updatedAt: sql`now()` as never,
          search: sql`to_tsvector('simple', unaccent(${`${entry.title}\n${text}`}))` as never,
        })
        .where(eq(entries.id, id));
    });
  }

  unpublish(siteId: string, auth: AuthContext, id: string, ip: string): Promise<EntryView> {
    return this.transition(siteId, auth, id, ip, 'entry.unpublished', async (tx, entry) => {
      assertAllowed(canPublish(auth, entry), 'You cannot unpublish this entry.');
      if (!['published', 'scheduled', 'private'].includes(entry.status)) {
        throw new ConflictException('Only published or scheduled entries can be unpublished.');
      }
      await tx
        .update(entries)
        .set({ status: 'draft', scheduledAt: null, updatedAt: sql`now()` as never })
        .where(eq(entries.id, id));
    });
  }

  schedule(
    siteId: string,
    auth: AuthContext,
    id: string,
    scheduledAt: Date,
    ip: string,
  ): Promise<EntryView> {
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('The publication date must be in the future.');
    }
    return this.transition(siteId, auth, id, ip, 'entry.scheduled', async (tx, entry) => {
      assertAllowed(canPublish(auth, entry), 'You cannot schedule this entry.');
      if (!['draft', 'pending', 'scheduled'].includes(entry.status)) {
        throw new ConflictException(`A ${entry.status} entry cannot be scheduled.`);
      }
      await tx
        .update(entries)
        .set({ status: 'scheduled', scheduledAt, updatedAt: sql`now()` as never })
        .where(eq(entries.id, id));
    });
  }

  /** Submits a draft for review (Contributors). */
  submit(siteId: string, auth: AuthContext, id: string, ip: string): Promise<EntryView> {
    return this.transition(siteId, auth, id, ip, 'entry.submitted', async (tx, entry) => {
      assertAllowed(canEdit(auth, entry), 'You cannot edit this entry.');
      if (entry.status !== 'draft') throw new ConflictException('Only drafts can be submitted.');
      await tx
        .update(entries)
        .set({ status: 'pending', updatedAt: sql`now()` as never })
        .where(eq(entries.id, id));
    });
  }

  trash(siteId: string, auth: AuthContext, id: string, ip: string): Promise<EntryView> {
    return this.transition(siteId, auth, id, ip, 'entry.trashed', async (tx, entry) => {
      assertAllowed(canDelete(auth, entry), 'You cannot delete this entry.');
      if (entry.status === 'trashed')
        throw new ConflictException('The entry is already in the trash.');
      await tx
        .update(entries)
        .set({
          status: 'trashed',
          trashedAt: sql`now()` as never,
          scheduledAt: null,
          updatedAt: sql`now()` as never,
        })
        .where(eq(entries.id, id));
    });
  }

  restore(siteId: string, auth: AuthContext, id: string, ip: string): Promise<EntryView> {
    return this.transition(siteId, auth, id, ip, 'entry.restored', async (tx, entry) => {
      assertAllowed(
        canDelete(auth, { ...entry, status: 'draft' }),
        'You cannot restore this entry.',
      );
      if (entry.status !== 'trashed') throw new ConflictException('The entry is not in the trash.');
      await tx
        .update(entries)
        .set({ status: 'draft', trashedAt: null, updatedAt: sql`now()` as never })
        .where(eq(entries.id, id));
    });
  }

  /** Permanent deletion, only from the trash. */
  remove(siteId: string, auth: AuthContext, id: string, ip: string): Promise<void> {
    return this.run(siteId, auth, async (tx) => {
      const entry = await this.load(tx, id);
      assertAllowed(
        canDelete(auth, { ...entry, status: 'draft' }),
        'You cannot delete this entry.',
      );
      if (entry.status !== 'trashed') {
        throw new ConflictException('Move the entry to the trash before deleting it.');
      }
      await tx.update(entries).set({ parentId: null }).where(eq(entries.parentId, id));
      await tx.delete(entries).where(eq(entries.id, id));
      await this.audit.record(tx, entryAudit(siteId, auth, 'entry.deleted', id, ip));
    });
  }

  // ---- Revisions ----------------------------------------------------------------

  listRevisions(siteId: string, auth: AuthContext, id: string): Promise<RevisionSummary[]> {
    return this.run(siteId, auth, async (tx) => {
      const entry = await this.load(tx, id);
      assertAllowed(canRead(auth, entry), 'You cannot view this entry.');
      const rows = await tx
        .select({ revision: revisions, authorName: users.displayName })
        .from(revisions)
        .leftJoin(users, eq(users.id, revisions.authorId))
        .where(and(eq(revisions.entryId, id), ne(revisions.kind, 'autosave')))
        .orderBy(desc(revisions.createdAt), desc(revisions.id));
      return rows.map(({ revision, authorName }) => ({
        id: revision.id,
        kind: revision.kind as RevisionSummary['kind'],
        title: revision.title,
        author: author(revision.authorId, authorName),
        createdAt: revision.createdAt.toISOString(),
        current: revision.id === entry.currentRevisionId,
        published: revision.id === entry.publishedRevisionId,
      }));
    });
  }

  getRevision(
    siteId: string,
    auth: AuthContext,
    id: string,
    revisionId: string,
  ): Promise<RevisionView> {
    return this.run(siteId, auth, async (tx) => {
      const entry = await this.load(tx, id);
      assertAllowed(canRead(auth, entry), 'You cannot view this entry.');
      const view = await this.revisionView(tx, revisionId, entry.id);
      if (!view) throw new NotFoundException('Revision not found.');
      return view;
    });
  }

  /** Restores an old revision as a new current revision (kind `restore`). */
  restoreRevision(
    siteId: string,
    auth: AuthContext,
    id: string,
    revisionId: string,
    ip: string,
  ): Promise<EntryView> {
    return this.run(siteId, auth, async (tx) => {
      const entry = await this.load(tx, id);
      assertAllowed(canEdit(auth, entry), 'You cannot edit this entry.');
      const [old] = await tx
        .select()
        .from(revisions)
        .where(and(eq(revisions.id, revisionId), eq(revisions.entryId, id)));
      if (!old) throw new NotFoundException('Revision not found.');
      await this.addRevision(
        tx,
        siteId,
        id,
        auth,
        'restore',
        old.title,
        old.fields as Record<string, unknown>,
        old.document as CxdDocument,
      );
      await tx
        .update(entries)
        .set({ title: old.title, updatedAt: sql`now()` as never })
        .where(eq(entries.id, id));
      await this.audit.record(tx, {
        ...entryAudit(siteId, auth, 'entry.revision.restored', id, ip),
        meta: { revisionId },
      });
      return this.view(tx, auth, await this.load(tx, id));
    });
  }

  // ---- Translations (RF-CNT-10) ------------------------------------------------

  createTranslation(
    siteId: string,
    auth: AuthContext,
    id: string,
    locale: string,
    ip: string,
  ): Promise<EntryView> {
    return this.run(siteId, auth, async (tx) => {
      if (!auth.capabilities.includes('edit_entries')) {
        throw new ForbiddenException('You cannot create entries.');
      }
      const source = await this.load(tx, id);
      assertAllowed(canRead(auth, source), 'You cannot view this entry.');
      await this.assertLocale(tx, locale);
      const [existing] = await tx
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(eq(entries.translationGroup, source.translationGroup), eq(entries.locale, locale)),
        );
      if (existing) throw new ConflictException(`A ${locale} translation already exists.`);

      const revision = await this.revisionRow(tx, source.currentRevisionId);
      const newEntryId = newId();
      await tx.insert(entries).values({
        id: newEntryId,
        siteId,
        typeSlug: source.typeSlug,
        locale,
        translationGroup: source.translationGroup,
        slug: await this.uniqueSlug(tx, source.typeSlug, locale, source.slug, null),
        title: source.title,
        status: 'draft',
        authorId: auth.userId,
      });
      await this.addRevision(
        tx,
        siteId,
        newEntryId,
        auth,
        'manual',
        source.title,
        (revision?.fields as Record<string, unknown>) ?? {},
        (revision?.document as CxdDocument) ?? emptyDocument(),
      );
      await this.audit.record(tx, {
        ...entryAudit(siteId, auth, 'entry.translation.created', newEntryId, ip),
        meta: { from: id, locale },
      });
      return this.view(tx, auth, await this.load(tx, newEntryId));
    });
  }

  // ---- Internals ------------------------------------------------------------------

  private async transition(
    siteId: string,
    auth: AuthContext,
    id: string,
    ip: string,
    action: string,
    apply: (tx: Tx, entry: EntryRow) => Promise<void>,
  ): Promise<EntryView> {
    return this.run(siteId, auth, async (tx) => {
      const entry = await this.load(tx, id);
      await apply(tx, entry);
      await this.audit.record(tx, entryAudit(siteId, auth, action, id, ip));
      return this.view(tx, auth, await this.load(tx, id));
    });
  }

  private async load(tx: Tx, id: string): Promise<EntryRow> {
    const [entry] = await tx.select().from(entries).where(eq(entries.id, id));
    if (!entry) throw new NotFoundException('Entry not found.');
    return entry;
  }

  private async contentType(tx: Tx, slug: string) {
    const [type] = await tx.select().from(contentTypes).where(eq(contentTypes.slug, slug));
    if (!type) throw new BadRequestException(`Unknown content type "${slug}".`);
    return type;
  }

  private async defaultLocale(tx: Tx, siteId: string): Promise<string> {
    const [site] = await tx
      .select({ locale: sites.defaultLocale })
      .from(sites)
      .where(eq(sites.id, siteId));
    return site?.locale ?? 'en';
  }

  private async assertLocale(tx: Tx, locale: string): Promise<void> {
    const [row] = await tx.select().from(siteLocales).where(eq(siteLocales.code, locale));
    if (!row)
      throw new BadRequestException(`The language "${locale}" is not enabled on this site.`);
  }

  private async validParent(
    tx: Tx,
    type: typeof contentTypes.$inferSelect,
    locale: string,
    parentId: string | null,
    selfId: string | null,
  ): Promise<string | null> {
    if (!parentId) return null;
    if (!type.hierarchical)
      throw new BadRequestException(`${type.slug} entries cannot have a parent.`);
    if (parentId === selfId) throw new BadRequestException('An entry cannot be its own parent.');
    const [parent] = await tx.select().from(entries).where(eq(entries.id, parentId));
    if (!parent || parent.typeSlug !== type.slug || parent.locale !== locale) {
      throw new BadRequestException('The parent must be an entry of the same type and language.');
    }
    // Prevent cycles: walk up from the parent.
    let cursor: string | null = parent.parentId;
    for (let depth = 0; cursor && depth < 100; depth++) {
      if (cursor === selfId) throw new BadRequestException('This would create a loop of parents.');
      const [next] = await tx
        .select({ parentId: entries.parentId })
        .from(entries)
        .where(eq(entries.id, cursor));
      cursor = next?.parentId ?? null;
    }
    return parentId;
  }

  private async uniqueSlug(
    tx: Tx,
    type: string,
    locale: string,
    wanted: string,
    excludeId: string | null,
  ): Promise<string> {
    const base = slugify(wanted) || 'untitled';
    const rows = await tx
      .select({ slug: entries.slug })
      .from(entries)
      .where(
        and(
          eq(entries.typeSlug, type),
          eq(entries.locale, locale),
          or(eq(entries.slug, base), ilike(entries.slug, `${escapeLike(base)}-%`)),
          excludeId ? ne(entries.id, excludeId) : undefined,
        ),
      );
    return nextFreeSlug(base, new Set(rows.map((r) => r.slug)));
  }

  private async addRevision(
    tx: Tx,
    siteId: string,
    entryId: string,
    auth: AuthContext,
    kind: RevisionRow['kind'],
    title: string,
    fields: Record<string, unknown>,
    document: CxdDocument,
    options: { setCurrent?: boolean } = {},
  ): Promise<RevisionRow> {
    const [revision] = await tx
      .insert(revisions)
      .values({
        id: newId(),
        siteId,
        entryId,
        kind,
        title,
        fields,
        document,
        schemaVersion: document.schema,
        authorId: auth.userId,
      })
      .returning();
    if (options.setCurrent !== false) {
      await tx
        .update(entries)
        .set({ currentRevisionId: revision!.id })
        .where(eq(entries.id, entryId));
    }
    return revision!;
  }

  private async revisionRow(tx: Tx, id: string | null): Promise<RevisionRow | null> {
    if (!id) return null;
    const [row] = await tx.select().from(revisions).where(eq(revisions.id, id));
    return row ?? null;
  }

  private async revisionView(
    tx: Tx,
    id: string | null,
    entryId: string,
  ): Promise<RevisionView | null> {
    if (!id) return null;
    const [row] = await tx
      .select({ revision: revisions, authorName: users.displayName })
      .from(revisions)
      .leftJoin(users, eq(users.id, revisions.authorId))
      .where(and(eq(revisions.id, id), eq(revisions.entryId, entryId)));
    return row ? toRevisionView(row.revision, row.authorName) : null;
  }

  private async view(tx: Tx, auth: AuthContext, entry: EntryRow): Promise<EntryView> {
    const [authorRow] = entry.authorId
      ? await tx.select({ name: users.displayName }).from(users).where(eq(users.id, entry.authorId))
      : [];
    const revision = await this.revisionView(tx, entry.currentRevisionId, entry.id);

    const [autosaveRow] = await tx
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.entryId, entry.id),
          eq(revisions.kind, 'autosave'),
          eq(revisions.authorId, auth.userId),
        ),
      )
      .orderBy(desc(revisions.createdAt))
      .limit(1);
    const autosave =
      autosaveRow && (!revision || autosaveRow.createdAt.getTime() > Date.parse(revision.createdAt))
        ? toRevisionView(autosaveRow, auth.displayName)
        : null;

    const translations = await tx
      .select({
        id: entries.id,
        locale: entries.locale,
        title: entries.title,
        status: entries.status,
      })
      .from(entries)
      .where(and(eq(entries.translationGroup, entry.translationGroup), ne(entries.id, entry.id)))
      .orderBy(asc(entries.locale));

    return {
      ...toSummary(entry, authorRow?.name ?? null),
      createdAt: entry.createdAt.toISOString(),
      trashedAt: entry.trashedAt?.toISOString() ?? null,
      position: entry.position,
      revision,
      autosave,
      translations: translations.map((t) => ({ ...t, status: t.status as EntryStatus })),
      terms: await this.termsService.termsOfEntry(tx, entry.id),
      permissions: {
        edit: canEdit(auth, entry),
        publish: canPublish(auth, entry),
        delete: canDelete(auth, entry),
      },
    };
  }

  /** A 301 from the old public path when a published entry changes slug (RF-CNT-11). */
  private async redirectOldPath(
    tx: Tx,
    siteId: string,
    before: EntryRow,
    after: EntryRow,
    permalink: string,
  ): Promise<void> {
    const from = await this.pathOf(tx, before, permalink);
    const to = await this.pathOf(tx, after, permalink);
    if (from === to) return;
    // Going back to an old slug must not leave a redirect loop.
    await tx.delete(redirects).where(eq(redirects.fromPath, to));
    await tx
      .insert(redirects)
      .values({ siteId, fromPath: from, toPath: to, status: 301 })
      .onConflictDoUpdate({ target: [redirects.siteId, redirects.fromPath], set: { toPath: to } });
    // Older redirects that pointed to the old path now point to the new one.
    await tx.update(redirects).set({ toPath: to }).where(eq(redirects.toPath, from));
  }

  /** Public path from the content type's permalink pattern. */
  private async pathOf(tx: Tx, entry: EntryRow, permalink: string): Promise<string> {
    const segments: string[] = [entry.slug];
    let parentId = entry.parentId;
    for (let depth = 0; parentId && depth < 20; depth++) {
      const [parent] = await tx
        .select({ slug: entries.slug, parentId: entries.parentId })
        .from(entries)
        .where(eq(entries.id, parentId));
      if (!parent) break;
      segments.unshift(parent.slug);
      parentId = parent.parentId;
    }
    const date = entry.publishedAt ?? entry.createdAt;
    return permalink
      .replace('{path}', segments.join('/'))
      .replace('{slug}', entry.slug)
      .replace('{year}', String(date.getUTCFullYear()))
      .replace('{month}', String(date.getUTCMonth() + 1).padStart(2, '0'));
  }
}

// ---- Helpers ------------------------------------------------------------------------

/** Validates a CXD document (schema and known blocks). */
export function validateDocument(value: unknown): CxdDocument {
  const parsed = cxdDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      message: 'The document is not valid.',
      errors: parsed.error.issues.map((issue) => ({
        path: ['document', ...issue.path].join('.'),
        message: issue.message,
      })),
    });
  }
  const issues = validateBlocks(parsed.data, registry);
  if (issues.length > 0) {
    throw new BadRequestException({
      message: 'Some blocks are not valid.',
      errors: issues.map((issue) => ({
        path: `document.block.${issue.blockId}`,
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/** Whether a slug is the one generated from the title (possibly de-duplicated). */
function isAutomaticSlug(slug: string, title: string): boolean {
  const base = slugify(title) || 'untitled';
  return (
    slug === base || (slug.startsWith(`${base}-`) && /^\d+$/.test(slug.slice(base.length + 1)))
  );
}

function toSummary(entry: EntryRow, authorName: string | null): EntrySummary {
  return {
    id: entry.id,
    type: entry.typeSlug,
    locale: entry.locale,
    translationGroup: entry.translationGroup,
    parentId: entry.parentId,
    slug: entry.slug,
    title: entry.title,
    status: entry.status as EntryStatus,
    author: author(entry.authorId, authorName),
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    scheduledAt: entry.scheduledAt?.toISOString() ?? null,
    updatedAt: entry.updatedAt.toISOString(),
    hasUnpublishedChanges:
      entry.publishedRevisionId !== null &&
      entry.status === 'published' &&
      entry.currentRevisionId !== entry.publishedRevisionId,
  };
}

function toRevisionView(revision: RevisionRow, authorName: string | null): RevisionView {
  return {
    id: revision.id,
    kind: revision.kind as RevisionView['kind'],
    title: revision.title,
    fields: revision.fields as Record<string, unknown>,
    document: revision.document,
    author: author(revision.authorId, authorName),
    createdAt: revision.createdAt.toISOString(),
  };
}

function author(id: string | null, name: string | null) {
  return id ? { id, displayName: name ?? 'Former member' } : null;
}

function assertAllowed(allowed: boolean, message: string): void {
  if (!allowed) throw new ForbiddenException(message);
}

function entryAudit(siteId: string, auth: AuthContext, action: string, id: string, ip: string) {
  return { siteId, userId: auth.userId, action, targetType: 'entry', targetId: id, ip };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([updatedAt.toISOString(), id])).toString('base64url');
}

function decodeCursor(cursor: string | undefined): { updatedAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [updatedAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as [
      string,
      string,
    ];
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime()) || typeof id !== 'string') return null;
    return { updatedAt: date, id };
  } catch {
    return null;
  }
}
