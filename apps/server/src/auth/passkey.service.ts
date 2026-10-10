import { userPasskeys, webauthnChallenges, type DatabaseClient } from '@cleitext/db';
import type { PasskeyView } from '@cleitext/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import { generateToken, hashToken } from './crypto.js';

/** Time to complete a passkey prompt. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Where the request comes from: the relying party is the site's host. */
export interface RelyingParty {
  /** Host name without port, e.g. example.com */
  id: string;
  /** e.g. https://example.com */
  origin: string;
  name: string;
}

/** Passkeys (WebAuthn, RF-USR-05), with @simplewebauthn/server. */
@Injectable()
export class PasskeyService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  async list(userId: string): Promise<PasskeyView[]> {
    const rows = await this.database.db
      .select()
      .from(userPasskeys)
      .where(eq(userPasskeys.userId, userId))
      .orderBy(asc(userPasskeys.createdAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.rpId,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    }));
  }

  /** Options for `navigator.credentials.create()`, and the challenge cookie value. */
  async registrationOptions(
    rp: RelyingParty,
    user: { id: string; email: string; displayName: string },
  ): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; token: string }> {
    const existing = await this.database.db
      .select({ id: userPasskeys.id, transports: userPasskeys.transports })
      .from(userPasskeys)
      .where(and(eq(userPasskeys.userId, user.id), eq(userPasskeys.rpId, rp.id)));
    const options = await generateRegistrationOptions({
      rpName: rp.name,
      rpID: rp.id,
      userName: user.email,
      userDisplayName: user.displayName,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
      // Discoverable credentials: sign-in without typing the email.
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    const token = await this.saveChallenge(options.challenge, 'register', user.id);
    return { options, token };
  }

  async register(
    rp: RelyingParty,
    userId: string,
    token: string | undefined,
    response: RegistrationResponseJSON,
    name: string,
  ): Promise<PasskeyView> {
    const challenge = await this.takeChallenge(token, 'register', userId);
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        requireUserVerification: false,
      });
    } catch (error) {
      throw new BadRequestException(`The passkey could not be verified: ${message(error)}`);
    }
    if (!verification.verified) throw new BadRequestException('The passkey could not be verified.');
    const { credential } = verification.registrationInfo;
    const [row] = await this.database.db
      .insert(userPasskeys)
      .values({
        id: credential.id,
        userId,
        rpId: rp.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ?? [],
        name: name.trim() || 'Passkey',
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new BadRequestException('This passkey is already registered.');
    return {
      id: row.id,
      name: row.name,
      domain: row.rpId,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: null,
    };
  }

  /** Options for `navigator.credentials.get()`: any passkey of this domain. */
  async authenticationOptions(
    rp: RelyingParty,
  ): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; token: string }> {
    const options = await generateAuthenticationOptions({
      rpID: rp.id,
      userVerification: 'preferred',
    });
    const token = await this.saveChallenge(options.challenge, 'login', null);
    return { options, token };
  }

  /** The user a passkey assertion belongs to, after checking it; null if invalid. */
  async authenticate(
    rp: RelyingParty,
    token: string | undefined,
    response: AuthenticationResponseJSON,
  ): Promise<string | null> {
    const challenge = await this.takeChallenge(token, 'login', null);
    const [passkey] = await this.database.db
      .select()
      .from(userPasskeys)
      .where(and(eq(userPasskeys.id, response.id), eq(userPasskeys.rpId, rp.id)));
    if (!passkey) return null;
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
          counter: passkey.counter,
          transports: passkey.transports,
        },
        requireUserVerification: false,
      });
    } catch {
      return null;
    }
    if (!verification.verified) return null;
    await this.database.db
      .update(userPasskeys)
      .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: sql`now()` })
      .where(eq(userPasskeys.id, passkey.id));
    return passkey.userId;
  }

  async rename(userId: string, id: string, name: string): Promise<void> {
    const updated = await this.database.db
      .update(userPasskeys)
      .set({ name: name.trim() || 'Passkey' })
      .where(and(eq(userPasskeys.id, id), eq(userPasskeys.userId, userId)))
      .returning({ id: userPasskeys.id });
    if (updated.length === 0) throw new NotFoundException('Passkey not found.');
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.database.db
      .delete(userPasskeys)
      .where(and(eq(userPasskeys.id, id), eq(userPasskeys.userId, userId)))
      .returning({ id: userPasskeys.id });
    if (deleted.length === 0) throw new NotFoundException('Passkey not found.');
  }

  private async saveChallenge(
    challenge: string,
    kind: 'register' | 'login',
    userId: string | null,
  ): Promise<string> {
    const token = generateToken();
    await this.database.db
      .delete(webauthnChallenges)
      .where(lt(webauthnChallenges.expiresAt, sql`now()`));
    await this.database.db.insert(webauthnChallenges).values({
      id: hashToken(token),
      challenge,
      kind,
      userId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
    return token;
  }

  /** The pending challenge of this browser (single use). */
  private async takeChallenge(
    token: string | undefined,
    kind: 'register' | 'login',
    userId: string | null,
  ): Promise<string> {
    const expired = new BadRequestException('The passkey prompt has expired: try again.');
    if (!token) throw expired;
    const [row] = await this.database.db
      .delete(webauthnChallenges)
      .where(
        and(
          eq(webauthnChallenges.id, hashToken(token)),
          eq(webauthnChallenges.kind, kind),
          gt(webauthnChallenges.expiresAt, sql`now()`),
        ),
      )
      .returning();
    if (!row || (userId !== null && row.userId !== userId)) throw expired;
    return row.challenge;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
