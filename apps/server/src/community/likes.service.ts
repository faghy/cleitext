import { entries, entryLikes, withContext, type DatabaseClient } from '@cleitext/db';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { allow, say } from './limits.js';

/**
 * Likes on entries: one per signed-in user, or per browser for visitors
 * (a random key kept in a cookie, stored only as a hash).
 */
@Injectable()
export class LikesService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly settings: SettingsService,
    private readonly cache: PageCacheService,
  ) {}

  /** Likes or unlikes; returns the new count and whether it is liked now. */
  async toggle(
    siteId: string,
    entryId: string,
    who: { userId: string } | { visitorKey: string },
    client: { ip: string; locale: string },
  ): Promise<{ count: number; liked: boolean }> {
    const settings = await this.settings.getCore(siteId);
    if (settings.likes === 'off')
      throw new ForbiddenException(
        say(
          client.locale,
          'Likes are off on this site.',
          'I “mi piace” sono disattivati su questo sito.',
        ),
      );
    if (settings.likes === 'users' && !('userId' in who))
      throw new ForbiddenException(
        say(client.locale, 'Sign in to like.', 'Accedi per mettere “mi piace”.'),
      );
    if (!allow(`like:${client.ip}`, 60, 3600_000))
      throw new HttpException('Too many likes: try again later.', HttpStatus.TOO_MANY_REQUESTS);
    const liker =
      'userId' in who
        ? `user:${who.userId}`
        : `visitor:${createHash('sha256').update(who.visitorKey).digest('hex')}`;
    const result = await withContext(
      this.database.db,
      { siteId, ...('userId' in who ? { userId: who.userId } : {}) },
      async (tx) => {
        const [entry] = await tx
          .select({ id: entries.id, status: entries.status })
          .from(entries)
          .where(eq(entries.id, entryId));
        if (!entry || entry.status !== 'published')
          throw new NotFoundException('This entry does not exist.');
        const removed = await tx
          .delete(entryLikes)
          .where(and(eq(entryLikes.entryId, entryId), eq(entryLikes.liker, liker)))
          .returning();
        if (removed.length === 0)
          await tx.insert(entryLikes).values({ siteId, entryId, liker }).onConflictDoNothing();
        const [row] = await tx
          .update(entries)
          .set({
            likeCount: sql`(select count(*) from ${entryLikes} where ${entryLikes.entryId} = ${entryId})`,
          })
          .where(eq(entries.id, entryId))
          .returning({ count: entries.likeCount });
        return { count: row?.count ?? 0, liked: removed.length === 0 };
      },
    );
    await this.cache.invalidate(siteId, [`entry:${entryId}`]);
    return result;
  }

  /** Whether this person or browser likes these entries. */
  async likedBy(
    siteId: string,
    entryIds: string[],
    who: { userId: string } | { visitorKey: string } | null,
  ): Promise<Set<string>> {
    if (!who || entryIds.length === 0) return new Set();
    const liker =
      'userId' in who
        ? `user:${who.userId}`
        : `visitor:${createHash('sha256').update(who.visitorKey).digest('hex')}`;
    const rows = await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .select({ entryId: entryLikes.entryId })
        .from(entryLikes)
        .where(and(eq(entryLikes.liker, liker), sql`${entryLikes.entryId} = ANY (${entryIds})`)),
    );
    return new Set(rows.map((r) => r.entryId));
  }
}
