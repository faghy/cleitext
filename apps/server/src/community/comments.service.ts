import {
  comments,
  contentTypes,
  entries,
  roles,
  siteMembers,
  sites,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import type { CoreSettings } from '@cleitext/shared';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { MailService } from '../mail/mail.service.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { allow, say } from './limits.js';

export type CommentStatus = 'pending' | 'approved' | 'spam' | 'trash';
type CommentRow = typeof comments.$inferSelect;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_RE = /https?:\/\/|www\./gi;

/** A comment as the admin sees it. */
export interface CommentView {
  id: string;
  entryId: string;
  entryTitle: string;
  parentId: string | null;
  type: string;
  status: CommentStatus;
  userId: string | null;
  authorName: string;
  authorEmail: string;
  authorUrl: string | null;
  content: string;
  ip: string | null;
  createdAt: string;
}

/** A comment as visitors see it (no email, no address). */
export interface PublicComment {
  id: string;
  parentId: string | null;
  authorName: string;
  authorUrl: string | null;
  /** Gravatar-style hash or null, for avatars. */
  avatar: { initials: string; url: string | null };
  content: string;
  createdAt: string;
  pending: boolean;
  byPostAuthor: boolean;
  replies: PublicComment[];
}

export interface NewComment {
  entryId: string;
  parentId?: string | null;
  content: string;
  authorName?: string;
  authorEmail?: string;
  authorUrl?: string;
  notifyReplies?: boolean;
}

export interface Commenter {
  userId: string;
  displayName: string;
  email: string;
  capabilities: readonly string[];
}

/** What decides a new comment's status, apart from the database. */
export function moderate(
  settings: Pick<
    CoreSettings,
    'commentModeration' | 'commentMaxLinks' | 'commentHoldWords' | 'commentBlockWords'
  >,
  input: { content: string; authorName: string; authorEmail: string; authorUrl: string | null },
  context: { trusted: boolean; approvedBefore: boolean },
): CommentStatus {
  const haystack =
    `${input.content}\n${input.authorName}\n${input.authorEmail}\n${input.authorUrl ?? ''}`.toLowerCase();
  const words = (list: string) =>
    list
      .split('\n')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
  if (words(settings.commentBlockWords).some((w) => haystack.includes(w))) return 'spam';
  if (context.trusted) return 'approved';
  if (settings.commentModeration === 'always') return 'pending';
  if (words(settings.commentHoldWords).some((w) => haystack.includes(w))) return 'pending';
  if ((input.content.match(LINK_RE) ?? []).length > settings.commentMaxLinks) return 'pending';
  if (settings.commentModeration === 'first' && !context.approvedBefore) return 'pending';
  return 'approved';
}

/** Initials for avatars, e.g. "Anna Rossi" → "AR". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '')
  ).toUpperCase();
}

/**
 * Comments (RF-COM): posting with WordPress's moderation rules, the
 * moderation queue, counts on entries and email notifications.
 */
@Injectable()
export class CommentsService {
  private readonly logger = new Logger('Comments');

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly settings: SettingsService,
    private readonly cache: PageCacheService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly plugins: PluginHost,
  ) {}

  /** Whether an entry takes comments now, and why not. */
  async openFor(tx: SiteTransaction, entryId: string, settings: CoreSettings) {
    const [row] = await tx
      .select({ entry: entries, supports: contentTypes.supports })
      .from(entries)
      .innerJoin(
        contentTypes,
        and(eq(contentTypes.siteId, entries.siteId), eq(contentTypes.slug, entries.typeSlug)),
      )
      .where(eq(entries.id, entryId));
    if (!row || row.entry.status !== 'published') return { entry: null, open: false } as const;
    const tooOld =
      settings.commentCloseAfterDays > 0 &&
      row.entry.publishedAt !== null &&
      Date.now() - row.entry.publishedAt.getTime() > settings.commentCloseAfterDays * 86_400_000;
    const open = row.supports.includes('comments') && row.entry.commentStatus === 'open' && !tooOld;
    return { entry: row.entry, open } as const;
  }

  /** Posts a comment from the public site; returns its status. */
  async post(
    siteId: string,
    input: NewComment,
    who: Commenter | null,
    client: { ip: string; userAgent: string | null; locale: string; origin: string },
  ): Promise<{ id: string; status: CommentStatus }> {
    const L = (en: string, it: string) => say(client.locale, en, it);
    const settings = await this.settings.getCore(siteId);
    if (!who && settings.commentRegistration)
      throw new ForbiddenException(L('Sign in to comment.', 'Accedi per commentare.'));
    const content = input.content.replace(/\r\n/g, '\n').trim();
    if (!content) throw new BadRequestException(L('Write a comment.', 'Scrivi un commento.'));
    if (content.length > 10_000)
      throw new BadRequestException(L('The comment is too long.', 'Il commento è troppo lungo.'));
    const authorName = (who?.displayName ?? input.authorName ?? '').trim().slice(0, 120);
    const authorEmail = (who?.email ?? input.authorEmail ?? '').trim().toLowerCase().slice(0, 200);
    const rawUrl = (input.authorUrl ?? '').trim();
    const authorUrl = rawUrl
      ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).slice(0, 300)
      : null;
    if (!who && settings.commentRequireNameEmail) {
      if (!authorName) throw new BadRequestException(L('Write your name.', 'Scrivi il tuo nome.'));
      if (!EMAIL_RE.test(authorEmail))
        throw new BadRequestException(
          L('Write a valid email address.', 'Scrivi un indirizzo email valido.'),
        );
    }
    if (authorEmail && !EMAIL_RE.test(authorEmail))
      throw new BadRequestException(
        L('Write a valid email address.', 'Scrivi un indirizzo email valido.'),
      );
    // Per person (several people may share an address), and a ceiling per address.
    const who_ = who?.userId ?? (authorEmail || client.ip);
    if (
      !allow(`comment:burst:${who_}`, 1, 10_000) ||
      !allow(`comment:hour:${client.ip}`, 60, 3600_000)
    ) {
      throw new HttpException(
        L(
          'You are commenting too fast: wait a moment.',
          'Stai commentando troppo velocemente: aspetta un momento.',
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const result = await withContext(
      this.database.db,
      { siteId, ...(who ? { userId: who.userId } : {}) },
      async (tx) => {
        const { entry, open } = await this.openFor(tx, input.entryId, settings);
        if (!entry)
          throw new NotFoundException(L('This entry does not exist.', 'Questa voce non esiste.'));
        if (!open)
          throw new ForbiddenException(L('Comments are closed.', 'I commenti sono chiusi.'));
        let parentId: string | null = null;
        if (input.parentId) {
          const [parent] = await tx
            .select()
            .from(comments)
            .where(and(eq(comments.id, input.parentId), eq(comments.entryId, entry.id)));
          if (!parent || parent.status !== 'approved')
            throw new BadRequestException(
              L('You cannot reply to this comment.', 'Non puoi rispondere a questo commento.'),
            );
          // Replies deeper than the setting go under the deepest allowed comment.
          parentId =
            (await this.depthOf(tx, parent.id)) >= settings.commentThreadDepth
              ? parent.parentId
              : parent.id;
        }
        const trusted = Boolean(
          who && (who.capabilities.includes('moderate_comments') || entry.authorId === who.userId),
        );
        const [before] = authorEmail
          ? await tx
              .select({ n: count() })
              .from(comments)
              .where(and(eq(comments.authorEmail, authorEmail), eq(comments.status, 'approved')))
          : [{ n: 0 }];
        const status = moderate(
          settings,
          { content, authorName: authorName || 'Anonymous', authorEmail, authorUrl },
          { trusted, approvedBefore: Number(before?.n ?? 0) > 0 },
        );
        const [row] = await tx
          .insert(comments)
          .values({
            siteId,
            entryId: entry.id,
            parentId,
            userId: who?.userId ?? null,
            authorName: authorName || say(client.locale, 'Anonymous', 'Anonimo'),
            authorEmail,
            authorUrl,
            content,
            status,
            ip: client.ip,
            userAgent: client.userAgent?.slice(0, 300) ?? null,
            notifyReplies: input.notifyReplies === true && Boolean(authorEmail),
          })
          .returning();
        if (status === 'approved') await this.recount(tx, entry.id);
        return { row: row!, entry };
      },
    );

    await this.afterChange(siteId, result.row, null, client.origin);
    return { id: result.row.id, status: result.row.status };
  }

  /** Approved comments of an entry as a tree, newest or oldest first, a page at a time. */
  async forEntry(
    tx: SiteTransaction,
    entry: { id: string; authorId: string | null },
    settings: CoreSettings,
    options: {
      page: number;
      viewerId?: string | null;
      gravatar?: (email: string) => string | null;
    },
  ): Promise<{ items: PublicComment[]; total: number; pages: number; page: number }> {
    const rows = await tx
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.entryId, entry.id),
          eq(comments.type, 'comment'),
          options.viewerId
            ? or(
                eq(comments.status, 'approved'),
                and(eq(comments.status, 'pending'), eq(comments.userId, options.viewerId)),
              )
            : eq(comments.status, 'approved'),
        ),
      )
      .orderBy(asc(comments.createdAt))
      .limit(5000);
    const byId = new Map<string, PublicComment>();
    for (const r of rows) {
      byId.set(r.id, {
        id: r.id,
        parentId: r.parentId,
        authorName: r.authorName,
        authorUrl: r.authorUrl,
        avatar: {
          initials: initials(r.authorName),
          url: options.gravatar && r.authorEmail ? options.gravatar(r.authorEmail) : null,
        },
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        pending: r.status === 'pending',
        byPostAuthor: Boolean(r.userId && r.userId === entry.authorId),
        replies: [],
      });
    }
    const top: PublicComment[] = [];
    for (const c of byId.values()) {
      const parent = c.parentId ? byId.get(c.parentId) : undefined;
      if (parent) parent.replies.push(c);
      else top.push(c);
    }
    if (settings.commentOrder === 'newest') top.reverse();
    const per = settings.commentsPerPage;
    const pages = per > 0 ? Math.max(1, Math.ceil(top.length / per)) : 1;
    const page = Math.min(Math.max(1, options.page), pages);
    const items = per > 0 ? top.slice((page - 1) * per, page * per) : top;
    return { items, total: rows.filter((r) => r.status === 'approved').length, pages, page };
  }

  // ---- Admin ---------------------------------------------------------------------------

  async list(
    siteId: string,
    auth: AuthContext,
    query: { status?: string; search?: string; entryId?: string; page?: number; perPage?: number },
  ): Promise<{
    items: CommentView[];
    total: number;
    counts: Record<CommentStatus | 'all', number>;
  }> {
    this.assertModerator(auth);
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const filters: SQL[] = [];
      if (query.status && ['pending', 'approved', 'spam', 'trash'].includes(query.status))
        filters.push(eq(comments.status, query.status as CommentStatus));
      else filters.push(sql`${comments.status} <> 'trash'`, sql`${comments.status} <> 'spam'`);
      if (query.entryId && /^[0-9a-f-]{36}$/i.test(query.entryId))
        filters.push(eq(comments.entryId, query.entryId));
      if (query.search?.trim()) {
        const q = `%${query.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
        filters.push(
          or(
            ilike(comments.content, q),
            ilike(comments.authorName, q),
            ilike(comments.authorEmail, q),
          )!,
        );
      }
      const where = and(...filters);
      const perPage = Math.min(Math.max(query.perPage ?? 20, 1), 100);
      const page = Math.max(query.page ?? 1, 1);
      const [rows, [total], countRows] = await Promise.all([
        tx
          .select({ c: comments, title: entries.title })
          .from(comments)
          .innerJoin(entries, eq(entries.id, comments.entryId))
          .where(where)
          .orderBy(desc(comments.createdAt))
          .limit(perPage)
          .offset((page - 1) * perPage),
        tx.select({ n: count() }).from(comments).where(where),
        tx.select({ status: comments.status, n: count() }).from(comments).groupBy(comments.status),
      ]);
      const counts = { all: 0, pending: 0, approved: 0, spam: 0, trash: 0 } as Record<
        CommentStatus | 'all',
        number
      >;
      for (const r of countRows) {
        counts[r.status as CommentStatus] = Number(r.n);
        if (r.status === 'pending' || r.status === 'approved') counts.all += Number(r.n);
      }
      return {
        items: rows.map((r) => this.view(r.c, r.title)),
        total: Number(total?.n ?? 0),
        counts,
      };
    });
  }

  /** Waiting comments, for the menu badge. */
  async pendingCount(siteId: string, auth: AuthContext): Promise<number> {
    if (!auth.capabilities.includes('moderate_comments')) return 0;
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const [row] = await tx
        .select({ n: count() })
        .from(comments)
        .where(eq(comments.status, 'pending'));
      return Number(row?.n ?? 0);
    });
  }

  async setStatus(
    siteId: string,
    auth: AuthContext,
    ids: string[],
    status: CommentStatus,
    origin: string,
  ): Promise<number> {
    this.assertModerator(auth);
    const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500);
    if (valid.length === 0) return 0;
    const changed = await withContext(
      this.database.db,
      { siteId, userId: auth.userId },
      async (tx) => {
        const before = await tx.select().from(comments).where(inArray(comments.id, valid));
        const rows = await tx
          .update(comments)
          .set({ status, updatedAt: sql`now()` })
          .where(inArray(comments.id, valid))
          .returning();
        for (const entryId of new Set(rows.map((r) => r.entryId))) await this.recount(tx, entryId);
        await this.audit.record(tx, {
          siteId,
          userId: auth.userId,
          action: `comment.${status}`,
          targetType: 'comment',
          meta: { ids: valid },
        });
        return rows.map((row) => ({
          row,
          from: before.find((b) => b.id === row.id)?.status ?? 'pending',
        }));
      },
    );
    for (const { row, from } of changed)
      if (from !== row.status) await this.afterChange(siteId, row, from, origin);
    return changed.length;
  }

  async update(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: {
      content?: string;
      authorName?: string;
      authorEmail?: string;
      authorUrl?: string | null;
    },
  ) {
    this.assertModerator(auth);
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const changes: Partial<CommentRow> = {};
      if (input.content !== undefined) {
        if (!input.content.trim()) throw new BadRequestException('The comment cannot be empty.');
        changes.content = input.content.trim().slice(0, 10_000);
      }
      if (input.authorName !== undefined)
        changes.authorName = input.authorName.trim().slice(0, 120) || 'Anonymous';
      if (input.authorEmail !== undefined)
        changes.authorEmail = input.authorEmail.trim().toLowerCase().slice(0, 200);
      if (input.authorUrl !== undefined)
        changes.authorUrl = input.authorUrl?.trim() ? input.authorUrl.trim().slice(0, 300) : null;
      const [row] = await tx
        .update(comments)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(comments.id, id))
        .returning();
      if (!row) throw new NotFoundException('This comment does not exist.');
      const [entry] = await tx
        .select({ title: entries.title })
        .from(entries)
        .where(eq(entries.id, row.entryId));
      await this.cache.invalidate(siteId, [`entry:${row.entryId}`]);
      return this.view(row, entry?.title ?? '');
    });
  }

  /** A moderator's reply: approved at once, and it approves the comment answered. */
  async reply(
    siteId: string,
    auth: AuthContext,
    parentId: string,
    content: string,
    origin: string,
  ) {
    this.assertModerator(auth);
    const parent = await withContext(
      this.database.db,
      { siteId, userId: auth.userId },
      async (tx) => {
        const [row] = await tx.select().from(comments).where(eq(comments.id, parentId));
        return row ?? null;
      },
    );
    if (!parent) throw new NotFoundException('This comment does not exist.');
    if (parent.status !== 'approved')
      await this.setStatus(siteId, auth, [parent.id], 'approved', origin);
    const settings = await this.settings.getCore(siteId);
    const row = await withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const depth = await this.depthOf(tx, parent.id);
      const [inserted] = await tx
        .insert(comments)
        .values({
          siteId,
          entryId: parent.entryId,
          parentId: depth >= settings.commentThreadDepth ? parent.parentId : parent.id,
          userId: auth.userId,
          authorName: auth.displayName,
          authorEmail: auth.email,
          content: content.trim().slice(0, 10_000),
          status: 'approved',
        })
        .returning();
      await this.recount(tx, parent.entryId);
      return inserted!;
    });
    await this.afterChange(siteId, row, null, origin);
    return row.id;
  }

  /** Deletes comments for good (from the trash or spam), with their replies. */
  async remove(siteId: string, auth: AuthContext, ids: string[]): Promise<number> {
    this.assertModerator(auth);
    const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500);
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const rows = await tx
        .delete(comments)
        .where(and(inArray(comments.id, valid), inArray(comments.status, ['trash', 'spam'])))
        .returning();
      // Replies to deleted comments move up a level.
      if (rows.length)
        await tx
          .update(comments)
          .set({ parentId: null })
          .where(
            inArray(
              comments.parentId,
              rows.map((r) => r.id),
            ),
          );
      for (const entryId of new Set(rows.map((r) => r.entryId))) await this.recount(tx, entryId);
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'comment.deleted',
        targetType: 'comment',
        meta: { ids: rows.map((r) => r.id) },
      });
      return rows.length;
    });
  }

  /** Opens or closes comments on an entry. */
  async setEntryStatus(
    siteId: string,
    auth: AuthContext,
    entryId: string,
    status: 'open' | 'closed',
  ): Promise<void> {
    await withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const [entry] = await tx.select().from(entries).where(eq(entries.id, entryId));
      if (!entry) throw new NotFoundException('This entry does not exist.');
      const mine = entry.authorId === auth.userId;
      if (!(
        auth.capabilities.includes('edit_others_entries') ||
        (mine && auth.capabilities.includes('edit_entries'))
      )) {
        throw new ForbiddenException('You cannot change this entry.');
      }
      await tx.update(entries).set({ commentStatus: status }).where(eq(entries.id, entryId));
    });
    await this.cache.invalidate(siteId, [`entry:${entryId}`]);
  }

  // ---- Inside ------------------------------------------------------------------------------

  private assertModerator(auth: AuthContext): void {
    if (!auth.capabilities.includes('moderate_comments'))
      throw new ForbiddenException('You cannot moderate comments.');
  }

  private async depthOf(tx: SiteTransaction, id: string): Promise<number> {
    let depth = 0;
    let current: string | null = id;
    while (current && depth < 20) {
      depth++;
      const [row] = await tx
        .select({ parentId: comments.parentId })
        .from(comments)
        .where(eq(comments.id, current));
      current = row?.parentId ?? null;
    }
    return depth;
  }

  private async recount(tx: SiteTransaction, entryId: string): Promise<void> {
    await tx
      .update(entries)
      .set({
        commentCount: sql`(select count(*) from ${comments} where ${comments.entryId} = ${entryId} and ${comments.status} = 'approved' and ${comments.type} = 'comment')`,
      })
      .where(eq(entries.id, entryId));
  }

  private view(r: CommentRow, entryTitle: string): CommentView {
    return {
      id: r.id,
      entryId: r.entryId,
      entryTitle,
      parentId: r.parentId,
      type: r.type,
      status: r.status,
      userId: r.userId,
      authorName: r.authorName,
      authorEmail: r.authorEmail,
      authorUrl: r.authorUrl,
      content: r.content,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /** Cache, plugin events and emails after a comment is created or changes status. */
  private async afterChange(
    siteId: string,
    row: CommentRow,
    from: string | null,
    origin: string,
  ): Promise<void> {
    await this.cache.invalidate(siteId, [`entry:${row.entryId}`]);
    const event = {
      id: row.id,
      entryId: row.entryId,
      parentId: row.parentId,
      type: row.type,
      status: row.status,
      userId: row.userId,
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      content: row.content,
    };
    if (from === null)
      await this.plugins.emit(
        'comment.created',
        { comment: event },
        siteId,
        row.userId ?? undefined,
      );
    else await this.plugins.emit('comment.status', { comment: event, from }, siteId);
    try {
      await this.notify(siteId, row, from, origin);
    } catch (error) {
      this.logger.warn(`Comment notification not sent: ${String(error)}`);
    }
  }

  private async notify(
    siteId: string,
    row: CommentRow,
    from: string | null,
    origin: string,
  ): Promise<void> {
    const settings = await this.settings.getCore(siteId);
    const info = await withContext(this.database.db, { siteId }, async (tx) => {
      const [entry] = await tx.select().from(entries).where(eq(entries.id, row.entryId));
      const [site] = await tx.select({ name: sites.name }).from(sites).where(eq(sites.id, siteId));
      const [author] = entry?.authorId
        ? await tx
            .select({ email: users.email, locale: users.locale })
            .from(users)
            .where(eq(users.id, entry.authorId))
        : [];
      const moderators =
        settings.commentNotifyModerators && row.status === 'pending' && from === null
          ? await tx
              .select({ email: users.email, locale: users.locale })
              .from(siteMembers)
              .innerJoin(users, eq(users.id, siteMembers.userId))
              .innerJoin(roles, eq(roles.id, siteMembers.roleId))
              .where(
                and(
                  eq(users.status, 'active'),
                  sql`'moderate_comments' = ANY (${roles.capabilities})`,
                ),
              )
          : [];
      const [parent] = row.parentId
        ? await tx.select().from(comments).where(eq(comments.id, row.parentId))
        : [];
      return { entry, siteName: site?.name ?? 'Cleitext', author, moderators, parent };
    });
    if (!info.entry) return;
    const link = `${origin}/admin/comments?status=${row.status === 'pending' ? 'pending' : 'all'}`;
    const quote = row.content.length > 600 ? `${row.content.slice(0, 600)}…` : row.content;
    // Moderators: a comment is waiting.
    for (const m of info.moderators) {
      await this.mail.send(
        {
          to: m.email,
          subject: say(
            m.locale,
            `[${info.siteName}] A comment is waiting on "${info.entry.title}"`,
            `[${info.siteName}] Un commento è in attesa su "${info.entry.title}"`,
          ),
          text: [
            `${row.authorName}${row.authorEmail ? ` <${row.authorEmail}>` : ''}:`,
            '',
            quote,
            '',
            say(m.locale, 'Approve or remove it here:', 'Approvalo o rimuovilo qui:'),
            link,
          ].join('\n'),
        },
        siteId,
      );
    }
    if (row.status !== 'approved') return;
    // The entry's author, about a published comment (not their own).
    if (
      settings.commentNotifyAuthor &&
      info.author &&
      info.author.email !== row.authorEmail &&
      (from === null || from === 'pending')
    ) {
      await this.mail.send(
        {
          to: info.author.email,
          subject: say(
            info.author.locale,
            `[${info.siteName}] New comment on "${info.entry.title}"`,
            `[${info.siteName}] Nuovo commento su "${info.entry.title}"`,
          ),
          text: [`${row.authorName}:`, '', quote, '', link].join('\n'),
        },
        siteId,
      );
    }
    // Who asked to hear about replies.
    if (
      info.parent?.notifyReplies &&
      info.parent.authorEmail &&
      info.parent.authorEmail !== row.authorEmail &&
      (from === null || from === 'pending')
    ) {
      await this.mail.send(
        {
          to: info.parent.authorEmail,
          subject: `[${info.siteName}] ${row.authorName} — "${info.entry.title}"`,
          text: [`${row.authorName}:`, '', quote].join('\n'),
        },
        siteId,
      );
    }
  }
}

export type { CommentRow };
