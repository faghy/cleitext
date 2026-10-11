import {
  userRecoveryCodes,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { seal, unseal } from '../common/secrets.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { hashToken } from './crypto.js';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from './totp.js';

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
}

/** TOTP two-factor authentication with recovery codes (RF-USR-04). */
@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private asUser<T>(siteId: string, userId: string, fn: (tx: SiteTransaction) => Promise<T>) {
    return withContext(this.database.db, { siteId, userId }, fn);
  }

  async status(siteId: string, userId: string): Promise<TwoFactorStatus> {
    const user = await this.user(siteId, userId);
    const codes = await this.database.db
      .select({ hash: userRecoveryCodes.codeHash })
      .from(userRecoveryCodes)
      .where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)));
    return { enabled: Boolean(user?.totpConfirmedAt), recoveryCodesLeft: codes.length };
  }

  async isEnabled(siteId: string, userId: string): Promise<boolean> {
    return Boolean((await this.user(siteId, userId))?.totpConfirmedAt);
  }

  /** Starts the setup: a new pending secret, shown once as text and QR code. */
  async setup(
    siteId: string,
    userId: string,
    issuer: string,
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.user(siteId, userId);
    if (!user) throw new BadRequestException('Unknown user.');
    if (user.totpConfirmedAt) {
      throw new ConflictException('Two-factor authentication is already on: turn it off first.');
    }
    const secret = generateTotpSecret();
    await this.asUser(siteId, userId, (tx) =>
      tx
        .update(users)
        .set({ totpSecret: this.sealSecret(secret), totpLastStep: null })
        .where(eq(users.id, userId)),
    );
    return { secret, otpauthUrl: otpauthUrl(issuer, user.email, secret) };
  }

  /** Confirms the setup with a first code; returns the recovery codes, shown once. */
  async enable(siteId: string, userId: string, code: string): Promise<string[]> {
    const user = await this.user(siteId, userId);
    if (!user?.totpSecret) throw new BadRequestException('Start the setup first.');
    if (user.totpConfirmedAt)
      throw new ConflictException('Two-factor authentication is already on.');
    const step = verifyTotp(this.unsealSecret(user.totpSecret), code, null);
    if (step === null) throw new BadRequestException('The code is not correct. Try the next one.');
    await this.asUser(siteId, userId, (tx) =>
      tx
        .update(users)
        .set({ totpConfirmedAt: sql`now()`, totpLastStep: step })
        .where(eq(users.id, userId)),
    );
    return this.newRecoveryCodes(userId);
  }

  async disable(siteId: string, userId: string): Promise<void> {
    await this.asUser(siteId, userId, (tx) =>
      tx
        .update(users)
        .set({ totpSecret: null, totpConfirmedAt: null, totpLastStep: null })
        .where(eq(users.id, userId)),
    );
    await this.database.db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  }

  /** Replaces all recovery codes (the old ones stop working). */
  async newRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes();
    await this.database.db.transaction(async (tx) => {
      await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
      await tx
        .insert(userRecoveryCodes)
        .values(codes.map((code) => ({ userId, codeHash: recoveryHash(code) })));
    });
    return codes;
  }

  /**
   * Checks a code at sign-in or before a sensitive action: an authenticator
   * code (each works once) or an unused recovery code (consumed).
   */
  async verify(siteId: string, userId: string, code: string): Promise<'totp' | 'recovery' | null> {
    const user = await this.user(siteId, userId);
    if (!user?.totpSecret || !user.totpConfirmedAt) return null;
    const step = verifyTotp(this.unsealSecret(user.totpSecret), code, user.totpLastStep);
    if (step !== null) {
      // Conditional update: two requests with the same code cannot both pass.
      const updated = await this.asUser(siteId, userId, (tx) =>
        tx
          .update(users)
          .set({ totpLastStep: step })
          .where(and(eq(users.id, userId), sql`coalesce(${users.totpLastStep}, -1) < ${step}`))
          .returning({ id: users.id }),
      );
      return updated.length > 0 ? 'totp' : null;
    }
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length !== 10) return null;
    const used = await this.database.db
      .update(userRecoveryCodes)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(userRecoveryCodes.userId, userId),
          eq(userRecoveryCodes.codeHash, recoveryHash(normalized)),
          isNull(userRecoveryCodes.usedAt),
        ),
      )
      .returning({ hash: userRecoveryCodes.codeHash });
    return used.length > 0 ? 'recovery' : null;
  }

  private async user(siteId: string, userId: string) {
    const [user] = await this.asUser(siteId, userId, (tx) =>
      tx
        .select({
          email: users.email,
          totpSecret: users.totpSecret,
          totpConfirmedAt: users.totpConfirmedAt,
          totpLastStep: users.totpLastStep,
        })
        .from(users)
        .where(eq(users.id, userId)),
    );
    return user;
  }

  private sealSecret(secret: string): string {
    return JSON.stringify(seal(this.config.appSecret, secret));
  }

  private unsealSecret(stored: string): string {
    const secret = unseal(this.config.appSecret, JSON.parse(stored));
    if (secret === null) {
      throw new BadRequestException(
        'The two-factor secret cannot be read (the server key changed). Ask an administrator to reset it.',
      );
    }
    return secret;
  }
}

function recoveryHash(code: string): string {
  return hashToken(`recovery:${normalizeRecoveryCode(code)}`);
}
