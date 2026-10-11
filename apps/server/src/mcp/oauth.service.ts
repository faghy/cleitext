import { createHash, randomBytes } from 'node:crypto';
import {
  apiTokens,
  oauthClients,
  oauthCodes,
  oauthRefreshTokens,
  withContext,
  type DatabaseClient,
} from '@cleitext/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { TOKEN_PREFIX } from '../auth/api-token.service.js';
import { hashToken } from '../auth/crypto.js';
import { DATABASE } from '../database/database.module.js';

/**
 * OAuth 2.1 for AI assistants (RF-AI-02): dynamic client registration,
 * authorization codes with PKCE (S256 only), and rotating refresh tokens.
 * Access tokens are API tokens of the user, marked with the client, so they
 * show up (and are revoked) with the other tokens in the profile.
 */

export const OAUTH_SCOPES = ['read', 'write', 'publish'] as const;
const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_S = 7 * 24 * 3600;
const REFRESH_TTL_MS = 90 * 24 * 3600 * 1000;

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export interface OAuthClient {
  clientId: string;
  name: string;
  redirectUris: string[];
}

/** An authorization request that passed the checks. */
export interface CheckedRequest {
  client: OAuthClient;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  state: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** https, or http on the loopback (native apps, RFC 8252); no fragments. */
export function validRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return createHash('sha256').update(verifier).digest('base64url') === challenge;
}

@Injectable()
export class OAuthService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  private run<T>(siteId: string, fn: Parameters<typeof withContext<T>>[2]) {
    return withContext(this.database.db, { siteId }, fn);
  }

  async register(
    siteId: string,
    input: { name: string; redirectUris: string[] },
  ): Promise<OAuthClient> {
    if (input.redirectUris.length === 0 || input.redirectUris.length > 10) {
      throw new OAuthError('invalid_redirect_uri', 'Give between 1 and 10 redirect URIs.');
    }
    const bad = input.redirectUris.find((u) => !validRedirectUri(u));
    if (bad) throw new OAuthError('invalid_redirect_uri', `Not an allowed redirect URI: ${bad}`);
    const client: OAuthClient = {
      clientId: `cxc_${randomBytes(16).toString('base64url')}`,
      name: input.name.trim().slice(0, 100) || 'AI assistant',
      redirectUris: input.redirectUris,
    };
    await this.run(siteId, (tx) => tx.insert(oauthClients).values({ siteId, ...client }));
    return client;
  }

  async client(siteId: string, clientId: string): Promise<OAuthClient | null> {
    const [row] = await this.run(siteId, (tx) =>
      tx.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)),
    );
    return row ? { clientId: row.clientId, name: row.name, redirectUris: row.redirectUris } : null;
  }

  /** The checks of an authorization request (query of /oauth/authorize). */
  async checkRequest(
    siteId: string,
    q: Record<string, string | undefined>,
  ): Promise<CheckedRequest | { problem: string }> {
    if (q.response_type !== 'code')
      return { problem: 'Only the authorization code flow is supported.' };
    const client = q.client_id ? await this.client(siteId, q.client_id) : null;
    if (!client)
      return { problem: 'This assistant is not registered on this site: connect it again.' };
    const redirectUri =
      q.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (
      !redirectUri ||
      !client.redirectUris.includes(redirectUri) ||
      !validRedirectUri(redirectUri)
    ) {
      return { problem: 'The redirect address does not match the one the assistant registered.' };
    }
    if (!q.code_challenge || q.code_challenge_method !== 'S256') {
      return { problem: 'PKCE (S256) is required.' };
    }
    const asked = (q.scope ?? '').split(/\s+/).filter(Boolean);
    const scopes: string[] =
      asked.length > 0 ? OAUTH_SCOPES.filter((s) => asked.includes(s)) : ['read', 'write'];
    if (scopes.length === 0) return { problem: 'No known permission was requested.' };
    // write includes read.
    if (scopes.includes('write') && !scopes.includes('read')) scopes.unshift('read');
    return {
      client,
      redirectUri,
      scopes,
      codeChallenge: q.code_challenge,
      state: q.state ?? '',
    };
  }

  /** A single-use code for the user's consent. */
  async createCode(
    siteId: string,
    input: {
      clientId: string;
      userId: string;
      redirectUri: string;
      codeChallenge: string;
      scopes: string[];
    },
  ): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.run(siteId, async (tx) => {
      await tx.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date()));
      await tx.insert(oauthCodes).values({
        siteId,
        codeHash: hashToken(code),
        ...input,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      });
    });
    return code;
  }

  async exchangeCode(
    siteId: string,
    input: { code: string; clientId: string; redirectUri: string; codeVerifier: string },
  ): Promise<TokenResponse> {
    const row = await this.run(siteId, async (tx) => {
      // Single use: the code is deleted whatever happens next.
      const [found] = await tx
        .delete(oauthCodes)
        .where(eq(oauthCodes.codeHash, hashToken(input.code)))
        .returning();
      return found;
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new OAuthError(
        'invalid_grant',
        'The authorization code is not valid (or was already used).',
      );
    }
    if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) {
      throw new OAuthError(
        'invalid_grant',
        'The code was issued to another client or redirect URI.',
      );
    }
    if (!pkceMatches(input.codeVerifier, row.codeChallenge)) {
      throw new OAuthError('invalid_grant', 'The PKCE code verifier does not match.');
    }
    return this.issue(siteId, row.userId, row.clientId, row.scopes);
  }

  /** A new access token and refresh token; the old pair stops working. */
  async refresh(
    siteId: string,
    input: { refreshToken: string; clientId: string },
  ): Promise<TokenResponse> {
    const row = await this.run(siteId, async (tx) => {
      const [found] = await tx
        .select()
        .from(oauthRefreshTokens)
        .where(
          and(
            eq(oauthRefreshTokens.tokenHash, hashToken(input.refreshToken)),
            gt(oauthRefreshTokens.expiresAt, new Date()),
          ),
        );
      if (found && found.clientId === input.clientId) {
        // Deleting the access token also deletes this refresh token (cascade).
        await tx.delete(apiTokens).where(eq(apiTokens.id, found.apiTokenId));
        return found;
      }
      return undefined;
    });
    if (!row) {
      throw new OAuthError('invalid_grant', 'The refresh token is not valid.');
    }
    return this.issue(siteId, row.userId, row.clientId, row.scopes);
  }

  private async issue(
    siteId: string,
    userId: string,
    clientId: string,
    scopes: string[],
  ): Promise<TokenResponse> {
    const client = await this.client(siteId, clientId);
    const access = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const refresh = `cxr_${randomBytes(32).toString('base64url')}`;
    await this.run(siteId, async (tx) => {
      const [token] = await tx
        .insert(apiTokens)
        .values({
          siteId,
          userId,
          name: `${client?.name ?? 'AI assistant'} (MCP)`,
          tokenHash: hashToken(access),
          prefix: access.slice(0, TOKEN_PREFIX.length + 6),
          scopes,
          expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000),
          createdBy: userId,
          oauthClientId: clientId,
        })
        .returning({ id: apiTokens.id });
      await tx.insert(oauthRefreshTokens).values({
        siteId,
        tokenHash: hashToken(refresh),
        clientId,
        userId,
        apiTokenId: token!.id,
        scopes,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      });
    });
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_S,
      refresh_token: refresh,
      scope: scopes.join(' '),
    };
  }
}
