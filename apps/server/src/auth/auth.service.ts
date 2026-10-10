import { findLogin, sites, users, withContext, type DatabaseClient } from '@cleitext/db';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { MailService } from '../mail/mail.service.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { IdentityService } from './identity.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { SessionService, UserTokenService } from './session.service.js';

const INVALID_CREDENTIALS = 'The email or password is not correct.';
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface ClientInfo {
  ip: string;
  userAgent: string | null;
  /** Origin used to build links in emails, e.g. https://example.com */
  origin: string;
}

export interface InvitationMeta {
  siteId: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly tokens: UserTokenService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  /**
   * Email + password login (RF-USR-01, RF-USR-09). Every failure answers with
   * the same message, whether the email exists or not.
   */
  async login(
    siteId: string,
    input: { email: string; password: string; remember: boolean },
    client: ClientInfo,
  ): Promise<{ auth: AuthContext; token: string; expiresAt: Date }> {
    const wait = await this.throttle.retryAfter(input.email, client.ip);
    if (wait > 0) throw tooManyAttempts(wait);

    const login = await findLogin(this.database.db, input.email);
    const valid = await verifyPassword(login?.passwordHash ?? null, input.password);
    const auth =
      login && valid && login.status === 'active'
        ? await this.identity.load(siteId, login.userId, '')
        : null;

    if (!login || !auth) {
      await this.throttle.recordFailure(input.email, client.ip);
      await withContext(this.database.db, { siteId }, (tx) =>
        this.audit.record(tx, {
          siteId,
          userId: login?.userId ?? null,
          action: 'user.login.failed',
          meta: { email: input.email },
          ip: client.ip,
        }),
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.throttle.recordSuccess(input.email);
    const session = await this.sessions.create({
      userId: auth.userId,
      remember: input.remember,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    await withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      await tx
        .update(users)
        .set({ lastLoginAt: sql`now()` })
        .where(eq(users.id, auth.userId));
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'user.login',
        ip: client.ip,
      });
    });
    return { auth, ...session };
  }

  async logout(siteId: string, auth: AuthContext, ip: string): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    await withContext(this.database.db, { siteId, userId: auth.userId }, (tx) =>
      this.audit.record(tx, { siteId, userId: auth.userId, action: 'user.logout', ip }),
    );
  }

  /**
   * Starts a password reset (RF-USR-02). Always succeeds from the caller's
   * point of view, so that it cannot be used to discover accounts.
   */
  async forgotPassword(siteId: string, email: string, client: ClientInfo): Promise<void> {
    const login = await findLogin(this.database.db, email);
    if (!login || login.status !== 'active') return;

    await this.tokens.revokePending('password_reset', login.userId);
    const token = await this.tokens.issue({
      kind: 'password_reset',
      userId: login.userId,
      ttlMs: PASSWORD_RESET_TTL_MS,
    });
    const siteName = await this.siteName(siteId);
    await this.mail.send(
      {
        to: email,
        subject: `Reset your password on ${siteName}`,
        text: [
          `Someone asked to reset the password for ${email} on ${siteName}.`,
          '',
          'To choose a new password, open this link within one hour:',
          `${client.origin}/admin/reset-password?token=${token}`,
          '',
          'If you did not ask for this, ignore this email: your password will not change.',
        ].join('\n'),
      },
      siteId,
    );
  }

  /** Completes a password reset: new password, token consumed, sessions revoked. */
  async resetPassword(
    siteId: string,
    input: { token: string; password: string },
    client: ClientInfo,
  ): Promise<void> {
    const record = await this.tokens.peek('password_reset', input.token);
    if (!record || !(await this.tokens.consume('password_reset', input.token))) {
      throw new HttpException('This link is invalid or has expired.', HttpStatus.GONE);
    }
    const passwordHash = await hashPassword(input.password);
    await withContext(this.database.db, { siteId, userId: record.userId }, async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
      await this.audit.record(tx, {
        siteId,
        userId: record.userId,
        action: 'user.password.reset',
        ip: client.ip,
      });
    });
    await this.sessions.revokeAll(record.userId);
  }

  /** Public details of a pending invitation, shown on the acceptance page. */
  async invitation(siteId: string, token: string) {
    const record = await this.tokens.peek('invitation', token);
    const meta = record?.meta as InvitationMeta | undefined;
    if (!record || meta?.siteId !== siteId) {
      throw new NotFoundException('This invitation is invalid or has expired.');
    }
    return withContext(this.database.db, { siteId, userId: record.userId }, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, record.userId));
      const [site] = await tx.select().from(sites).where(eq(sites.id, siteId));
      return {
        email: user?.email ?? '',
        displayName: user?.displayName ?? '',
        siteName: site?.name ?? '',
      };
    });
  }

  /** Accepts an invitation (RF-USR-03): sets the password and signs the user in. */
  async acceptInvitation(
    siteId: string,
    input: { token: string; password: string; displayName?: string | undefined },
    client: ClientInfo,
  ): Promise<{ auth: AuthContext; token: string; expiresAt: Date }> {
    const record = await this.tokens.peek('invitation', input.token);
    const meta = record?.meta as InvitationMeta | undefined;
    if (!record || meta?.siteId !== siteId) {
      throw new HttpException('This invitation is invalid or has expired.', HttpStatus.GONE);
    }
    if (!(await this.tokens.consume('invitation', input.token))) {
      throw new HttpException('This invitation is invalid or has expired.', HttpStatus.GONE);
    }

    const passwordHash = await hashPassword(input.password);
    const auth = await withContext(
      this.database.db,
      { siteId, userId: record.userId },
      async (tx) => {
        await tx
          .update(users)
          .set({
            passwordHash,
            status: 'active',
            lastLoginAt: sql`now()`,
            ...(input.displayName ? { displayName: input.displayName } : {}),
          })
          .where(eq(users.id, record.userId));
        await this.audit.record(tx, {
          siteId,
          userId: record.userId,
          action: 'user.invitation.accepted',
          ip: client.ip,
        });
        return this.identity.loadInTx(tx, siteId, record.userId, '');
      },
    );
    if (!auth) throw new HttpException('This invitation is no longer valid.', HttpStatus.GONE);

    const session = await this.sessions.create({
      userId: auth.userId,
      remember: false,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return { auth, ...session };
  }

  private async siteName(siteId: string): Promise<string> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const [site] = await tx.select({ name: sites.name }).from(sites).where(eq(sites.id, siteId));
      return site?.name ?? 'Cleitext';
    });
  }
}

function tooManyAttempts(retryAfterSeconds: number): HttpException {
  return new HttpException(
    { message: 'Too many failed attempts. Try again later.', retryAfter: retryAfterSeconds },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
