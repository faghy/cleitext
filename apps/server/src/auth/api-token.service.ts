import { apiTokens, siteMembers, users, withContext, type DatabaseClient } from '@cleitext/db';
import type { ApiTokenScope, ApiTokenView } from '@cleitext/shared';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { hashToken } from './crypto.js';
import { randomBytes } from 'node:crypto';

/** Every API token starts with this, so it can be recognized (e.g. by secret scanners). */
export const TOKEN_PREFIX = 'ctx_';
/** `last_used_at` is refreshed at most this often. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** API tokens with scopes and expiry (RF-USR-08), used as `Authorization: Bearer`. */
@Injectable()
export class ApiTokenService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  /** The token's owner and scopes, if the token is valid on this site. */
  async authenticate(
    siteId: string,
    token: string,
  ): Promise<{ id: string; userId: string; scopes: string[] } | null> {
    if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
    return withContext(this.database.db, { siteId }, async (tx) => {
      const [row] = await tx
        .select()
        .from(apiTokens)
        .where(
          and(
            eq(apiTokens.tokenHash, hashToken(token)),
            or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, sql`now()`)),
          ),
        );
      if (!row?.userId) return null;
      if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
        await tx
          .update(apiTokens)
          .set({ lastUsedAt: sql`now()` })
          .where(eq(apiTokens.id, row.id));
      }
      return { id: row.id, userId: row.userId, scopes: row.scopes };
    });
  }

  /** The user's tokens; with `all`, every token of the site (`manage_users`). */
  async list(siteId: string, auth: AuthContext, all: boolean): Promise<ApiTokenView[]> {
    if (all && !auth.capabilities.includes('manage_users'))
      throw new ForbiddenException('You cannot see the tokens of other users.');
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const rows = await tx
        .select({ token: apiTokens, owner: users.displayName })
        .from(apiTokens)
        .leftJoin(users, eq(users.id, apiTokens.userId))
        .where(all ? undefined : eq(apiTokens.userId, auth.userId))
        .orderBy(desc(apiTokens.createdAt));
      return rows.map(({ token, owner }) => toView(token, owner));
    });
  }

  /**
   * Creates a token for the user, or for another member (`manage_users`).
   * The plain token is returned only now.
   */
  async create(
    siteId: string,
    auth: AuthContext,
    input: {
      name: string;
      scopes: ApiTokenScope[];
      expiresInDays: number | null;
      userId?: string | undefined;
    },
  ): Promise<{ token: string; view: ApiTokenView }> {
    const owner = input.userId ?? auth.userId;
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      if (owner !== auth.userId) {
        if (!auth.capabilities.includes('manage_users'))
          throw new ForbiddenException('You cannot create tokens for other users.');
        const [member] = await tx
          .select()
          .from(siteMembers)
          .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, owner)));
        if (!member) throw new BadRequestException('This user is not a member of the site.');
      }
      const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
      const [row] = await tx
        .insert(apiTokens)
        .values({
          siteId,
          userId: owner,
          name: input.name.trim(),
          tokenHash: hashToken(token),
          prefix: token.slice(0, TOKEN_PREFIX.length + 6),
          scopes: [...new Set(input.scopes)],
          expiresAt:
            input.expiresInDays === null
              ? null
              : new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000),
          createdBy: auth.userId,
        })
        .returning();
      const [user] = await tx
        .select({ name: users.displayName })
        .from(users)
        .where(eq(users.id, owner));
      return { token, view: toView(row!, user?.name ?? null) };
    });
  }

  /** Revokes one of the user's tokens, or any token of the site (`manage_users`). */
  async revoke(siteId: string, auth: AuthContext, id: string): Promise<void> {
    const deleted = await withContext(this.database.db, { siteId, userId: auth.userId }, (tx) =>
      tx
        .delete(apiTokens)
        .where(
          and(
            eq(apiTokens.id, id),
            auth.capabilities.includes('manage_users')
              ? undefined
              : eq(apiTokens.userId, auth.userId),
          ),
        )
        .returning({ id: apiTokens.id }),
    );
    if (deleted.length === 0) throw new NotFoundException('Token not found.');
  }
}

function toView(row: typeof apiTokens.$inferSelect, owner: string | null): ApiTokenView {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as ApiTokenScope[],
    owner: row.userId ? { id: row.userId, displayName: owner ?? '' } : null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    assistant: row.oauthClientId !== null,
  };
}
