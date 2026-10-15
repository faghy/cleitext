import { sessions, userTokens, type DatabaseClient } from '@cleitext/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { generateToken, hashToken } from './crypto.js';

export interface SessionRecord {
  id: string;
  userId: string;
  remember: boolean;
  expiresAt: Date;
  lastSeenAt: Date;
}

/** Server-side sessions. Only token hashes are stored (docs/ARCHITECTURE.md §14). */
@Injectable()
export class SessionService {
  /** `lastSeenAt` is refreshed at most this often. */
  private static readonly TOUCH_INTERVAL_MS = 5 * 60 * 1000;

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(input: {
    userId: string;
    remember: boolean;
    ip: string | null;
    userAgent: string | null;
  }): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const ttlMs = input.remember
      ? this.config.session.rememberDays * 24 * 3600 * 1000
      : this.config.session.ttlHours * 3600 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.database.db.insert(sessions).values({
      id: hashToken(token),
      userId: input.userId,
      remember: input.remember,
      expiresAt,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
    });
    return { token, expiresAt };
  }

  /** Valid (non-expired) session for a cookie token, refreshing `lastSeenAt`. */
  async validate(token: string): Promise<SessionRecord | null> {
    const id = hashToken(token);
    const [row] = await this.database.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, sql`now()`)));
    if (!row) return null;
    if (Date.now() - row.lastSeenAt.getTime() > SessionService.TOUCH_INTERVAL_MS) {
      await this.database.db
        .update(sessions)
        .set({ lastSeenAt: sql`now()` })
        .where(eq(sessions.id, id));
    }
    return row;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async revokeForUser(userId: string, sessionId: string): Promise<boolean> {
    const deleted = await this.database.db
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .returning({ id: sessions.id });
    return deleted.length > 0;
  }

  /** Revokes every session of a user, optionally keeping one. */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.database.db
      .delete(sessions)
      .where(
        exceptSessionId
          ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
          : eq(sessions.userId, userId),
      );
  }

  async listForUser(userId: string) {
    return this.database.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, sql`now()`)))
      .orderBy(sql`${sessions.lastSeenAt} desc`);
  }

  /** Deletes expired sessions and used/expired tokens. */
  async purgeExpired(): Promise<void> {
    await this.database.db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
    await this.database.db
      .delete(userTokens)
      .where(lt(userTokens.expiresAt, sql`now() - interval '7 days'`));
  }
}

export type TokenKind = 'password_reset' | 'invitation' | 'login_2fa' | 'email_verify';

/** Single-use tokens sent by email (password reset, invitation). */
@Injectable()
export class UserTokenService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  async issue(input: {
    kind: TokenKind;
    userId: string;
    ttlMs: number;
    meta?: Record<string, unknown>;
  }): Promise<string> {
    const token = generateToken();
    await this.database.db.insert(userTokens).values({
      tokenHash: hashToken(token),
      kind: input.kind,
      userId: input.userId,
      meta: input.meta ?? {},
      expiresAt: new Date(Date.now() + input.ttlMs),
    });
    return token;
  }

  /** Valid (unused, unexpired) token of the given kind, without consuming it. */
  async peek(kind: TokenKind, token: string) {
    const [row] = await this.database.db
      .select()
      .from(userTokens)
      .where(
        and(
          eq(userTokens.tokenHash, hashToken(token)),
          eq(userTokens.kind, kind),
          isNull(userTokens.usedAt),
          gt(userTokens.expiresAt, sql`now()`),
        ),
      );
    return row ?? null;
  }

  /** Marks a token as used. Returns false if it was already consumed (race). */
  async consume(kind: TokenKind, token: string): Promise<boolean> {
    const updated = await this.database.db
      .update(userTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(userTokens.tokenHash, hashToken(token)),
          eq(userTokens.kind, kind),
          isNull(userTokens.usedAt),
          gt(userTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ hash: userTokens.tokenHash });
    return updated.length > 0;
  }

  /** Invalidates pending tokens of a kind for a user (e.g. older reset links). */
  async revokePending(kind: TokenKind, userId: string): Promise<void> {
    await this.database.db
      .update(userTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(eq(userTokens.userId, userId), eq(userTokens.kind, kind), isNull(userTokens.usedAt)),
      );
  }
}
