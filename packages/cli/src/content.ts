/**
 * Content operations of the CLI: `entry:reassign` gives all of a user's
 * entries to another writer, like WordPress's "Attribute all content to"
 * when a user is deleted (docs/DEPLOYMENT.md §13, RF-CNT-18).
 */
import {
  auditLog,
  contentTypes,
  entries,
  media,
  roles,
  siteMembers,
  sites,
  users,
  withSiteContext,
  type Database,
} from '@cleitext/db';
import { and, eq, sql } from 'drizzle-orm';
import { OperationError } from './operations.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReassignInput {
  /** Site slug. */
  site: string;
  /** The current author: email or user id. */
  from: string;
  /** The new author: email or user id; an active member who can write entries. */
  to: string;
  /** Only entries of this content type (media stay as they are then). */
  type?: string | undefined;
}

export interface ReassignResult {
  site: string;
  from: { id: string; email: string };
  to: { id: string; email: string };
  type: string | null;
  /** Entries given to the new author, every status and language. */
  entries: number;
  /** Of which published (their public pages changed). */
  published: number;
  /** Media files now shown as uploaded by the new author. */
  media: number;
}

/**
 * Gives every entry of `from` on a site (drafts, trash and translations
 * included) to `to`, and the media `from` uploaded. Revisions keep who saved
 * them: they are the history of the entry, not its authorship.
 */
export async function reassignEntries(db: Database, input: ReassignInput): Promise<ReassignResult> {
  const [site] = await db.select().from(sites).where(eq(sites.slug, input.site));
  if (!site) throw new OperationError(`No site with slug "${input.site}".`, 'not_found');
  const from = await findUser(db, input.from);
  const to = await findUser(db, input.to);
  if (from.id === to.id) {
    throw new OperationError('--from and --to are the same user.', 'invalid_option');
  }

  const result = await withSiteContext(db, site.id, async (tx) => {
    const [member] = await tx
      .select({ capabilities: roles.capabilities })
      .from(siteMembers)
      .innerJoin(roles, eq(roles.id, siteMembers.roleId))
      .where(and(eq(siteMembers.siteId, site.id), eq(siteMembers.userId, to.id)));
    if (!member) {
      throw new OperationError(`${to.email} is not a member of ${site.slug}.`, 'not_member');
    }
    if (to.status !== 'active') {
      throw new OperationError(`The account ${to.email} is not active.`, 'user_inactive');
    }
    if (!member.capabilities.includes('edit_entries')) {
      throw new OperationError(
        `${to.email} cannot write entries on ${site.slug}: give them a role such as Contributor, Author or Editor.`,
        'cannot_write',
      );
    }
    if (input.type) {
      const [type] = await tx
        .select({ slug: contentTypes.slug })
        .from(contentTypes)
        .where(eq(contentTypes.slug, input.type));
      if (!type) {
        throw new OperationError(`Unknown content type "${input.type}".`, 'not_found');
      }
    }

    // The modification date stays: the content did not change.
    const moved = await tx
      .update(entries)
      .set({ authorId: to.id })
      .where(
        and(
          eq(entries.authorId, from.id),
          input.type ? eq(entries.typeSlug, input.type) : undefined,
        ),
      )
      .returning({ status: entries.status });
    const files = input.type
      ? []
      : await tx
          .update(media)
          .set({ uploadedBy: to.id })
          .where(eq(media.uploadedBy, from.id))
          .returning({ id: media.id });
    const counts = {
      entries: moved.length,
      published: moved.filter((e) => e.status === 'published').length,
      media: files.length,
    };
    await tx.insert(auditLog).values({
      siteId: site.id,
      userId: null,
      action: 'entries.reassigned',
      targetType: 'user',
      targetId: from.id,
      meta: { from: from.id, to: to.id, type: input.type ?? null, ...counts, via: 'cli' },
      ip: null,
    });
    return counts;
  });

  // Entry pages, listings, author archives and feeds: the whole site's cache.
  if (result.entries > 0) {
    const payload = JSON.stringify({ siteId: site.id, tags: ['site'] });
    await db.execute(sql`select pg_notify('cleitext_cache', ${payload})`);
  }
  return {
    site: site.slug,
    from: { id: from.id, email: from.email },
    to: { id: to.id, email: to.email },
    type: input.type ?? null,
    ...result,
  };
}

/** A user by id or by email address. */
async function findUser(db: Database, ref: string) {
  const value = ref.trim();
  const [user] = await db
    .select({ id: users.id, email: users.email, status: users.status })
    .from(users)
    .where(UUID_RE.test(value) ? eq(users.id, value.toLowerCase()) : eq(users.email, value));
  if (!user) throw new OperationError(`No user "${value}".`, 'not_found');
  return user;
}
