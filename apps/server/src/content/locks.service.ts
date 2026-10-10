import { entryLocks, users, withContext, type DatabaseClient } from '@cleitext/db';
import type { EntryLockView } from '@cleitext/shared';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { EntriesService } from './entries.service.js';

/** A lock lasts this long; the editor refreshes it while it stays open. */
export const LOCK_TTL_SECONDS = 120;

/**
 * Concurrent editing lock (RF-CNT-15): one editor at a time per entry, with a
 * warning for the others and the option to take over.
 */
@Injectable()
export class LocksService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly entries: EntriesService,
  ) {}

  /** Takes or refreshes the lock; someone else's lock is taken only with `takeover`. */
  async acquire(
    siteId: string,
    auth: AuthContext,
    entryId: string,
    takeover: boolean,
  ): Promise<EntryLockView> {
    await this.entries.get(siteId, auth, entryId); // exists and readable
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const [current] = await tx
        .select({
          userId: entryLocks.userId,
          name: users.displayName,
          expiresAt: entryLocks.expiresAt,
        })
        .from(entryLocks)
        .leftJoin(users, eq(users.id, entryLocks.userId))
        .where(and(eq(entryLocks.entryId, entryId), sql`${entryLocks.expiresAt} > now()`));
      if (current && current.userId !== auth.userId && !takeover) {
        throw new ConflictException({
          message: `${current.name ?? 'Someone'} is editing this entry.`,
          lockedBy: { id: current.userId, displayName: current.name ?? '' },
        });
      }
      const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000);
      await tx
        .insert(entryLocks)
        .values({ entryId, siteId, userId: auth.userId, expiresAt })
        .onConflictDoUpdate({
          target: entryLocks.entryId,
          set: { userId: auth.userId, expiresAt },
        });
      return { lockedBy: null, expiresAt: expiresAt.toISOString() };
    });
  }

  /** Who holds the lock, if not the current user. */
  async status(siteId: string, auth: AuthContext, entryId: string): Promise<EntryLockView> {
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const [current] = await tx
        .select({
          userId: entryLocks.userId,
          name: users.displayName,
          expiresAt: entryLocks.expiresAt,
        })
        .from(entryLocks)
        .leftJoin(users, eq(users.id, entryLocks.userId))
        .where(and(eq(entryLocks.entryId, entryId), sql`${entryLocks.expiresAt} > now()`));
      if (!current || current.userId === auth.userId) {
        return { lockedBy: null, expiresAt: current?.expiresAt.toISOString() ?? null };
      }
      return {
        lockedBy: { id: current.userId, displayName: current.name ?? '' },
        expiresAt: current.expiresAt.toISOString(),
      };
    });
  }

  /** Releases the user's own lock (closing the editor). */
  async release(siteId: string, auth: AuthContext, entryId: string): Promise<void> {
    await withContext(this.database.db, { siteId, userId: auth.userId }, (tx) =>
      tx
        .delete(entryLocks)
        .where(and(eq(entryLocks.entryId, entryId), eq(entryLocks.userId, auth.userId))),
    );
  }
}
