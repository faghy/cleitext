import { createHash, randomBytes } from 'node:crypto';
import type { Database } from './client.js';
import { userTokens } from './schema/index.js';

/**
 * Single-use tokens (`user_tokens`): only their SHA-256 is stored. The server
 * issues most of them (email links, the 2FA step); the CLI issues
 * `panel_login`, the one-time sign-in link of a hosting panel
 * (`cleitext login-link`).
 */
export const USER_TOKEN_KINDS = [
  'password_reset',
  'invitation',
  'login_2fa',
  'email_verify',
  'panel_login',
] as const;
export type UserTokenKind = (typeof USER_TOKEN_KINDS)[number];

/** A panel sign-in link lasts a minute by default, five at most. */
export const PANEL_LOGIN_DEFAULT_TTL_SECONDS = 60;
export const PANEL_LOGIN_MAX_TTL_SECONDS = 300;

/** Tokens are stored only as SHA-256 hashes (hex). */
export function hashUserToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Stores a new token and returns it (256 bits, base64url). */
export async function issueUserToken(
  db: Database,
  input: { kind: UserTokenKind; userId: string; ttlMs: number; meta?: Record<string, unknown> },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + input.ttlMs);
  await db.insert(userTokens).values({
    tokenHash: hashUserToken(token),
    kind: input.kind,
    userId: input.userId,
    meta: input.meta ?? {},
    expiresAt,
  });
  return { token, expiresAt };
}
