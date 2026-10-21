import { ADMIN_PATH } from '@cleitext/shared';
import { findLogin, sites, users, withContext, type DatabaseClient } from '@cleitext/db';
import {
  ForbiddenException,
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
import { assertPasswordNotBreached } from './password-policy.js';
import { IdentityService } from './identity.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { SessionService, UserTokenService } from './session.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { PasskeyService, type RelyingParty } from './passkey.service.js';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

const INVALID_CREDENTIALS = 'The email or password is not correct.';
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** Time to type the 2FA code after a correct password. */
const TWO_FACTOR_TTL_MS = 5 * 60 * 1000;
const INVALID_CODE = 'The code is not correct.';

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
    private readonly twoFactor: TwoFactorService,
    private readonly passkeys: PasskeyService,
  ) {}

  /**
   * Email + password login (RF-USR-01, RF-USR-09). Every failure answers with
   * the same message, whether the email exists or not.
   */
  async login(
    siteId: string,
    input: { email: string; password: string; remember: boolean },
    client: ClientInfo,
  ): Promise<
    | { auth: AuthContext; token: string; expiresAt: Date }
    | { twoFactorRequired: true; challenge: string }
  > {
    const wait = await this.throttle.retryAfter(input.email, client.ip);
    if (wait > 0) throw tooManyAttempts(wait);

    const login = await findLogin(this.database.db, input.email);
    const valid = await verifyPassword(login?.passwordHash ?? null, input.password);
    const auth =
      login && valid && login.status === 'active'
        ? await this.identity.load(siteId, login.userId, '')
        : null;

    // A sign-up waiting for its email confirmation: say so, the password was right.
    if (login && valid && login.status === 'pending') {
      throw new ForbiddenException('Confirm your email address first: open the link we sent you.');
    }
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

    if (auth.twoFactor.enabled) {
      // The password was right: the session waits for the second factor.
      const challenge = await this.tokens.issue({
        kind: 'login_2fa',
        userId: auth.userId,
        ttlMs: TWO_FACTOR_TTL_MS,
        meta: { remember: input.remember, email: input.email },
      });
      return { twoFactorRequired: true, challenge };
    }
    await this.throttle.recordSuccess(input.email);
    return this.startSession(siteId, auth, input.remember, client, 'password');
  }

  /** Second step of a 2FA sign-in: authenticator or recovery code (RF-USR-04). */
  async loginTwoFactor(
    siteId: string,
    input: { challenge: string; code: string },
    client: ClientInfo,
  ): Promise<{ auth: AuthContext; token: string; expiresAt: Date; remember: boolean }> {
    const record = await this.tokens.peek('login_2fa', input.challenge);
    if (!record) {
      throw new UnauthorizedException('The sign-in has expired: enter your password again.');
    }
    const meta = record.meta as { remember?: boolean; email?: string };
    const email = meta.email ?? '';
    const wait = await this.throttle.retryAfter(email, client.ip);
    if (wait > 0) throw tooManyAttempts(wait);

    const method = await this.twoFactor.verify(siteId, record.userId, input.code);
    if (!method) {
      await this.throttle.recordFailure(email, client.ip);
      await withContext(this.database.db, { siteId }, (tx) =>
        this.audit.record(tx, {
          siteId,
          userId: record.userId,
          action: 'user.login.failed',
          meta: { email, step: '2fa' },
          ip: client.ip,
        }),
      );
      throw new UnauthorizedException(INVALID_CODE);
    }
    const auth = await this.identity.load(siteId, record.userId, '');
    if (!auth || !(await this.tokens.consume('login_2fa', input.challenge))) {
      throw new UnauthorizedException('The sign-in has expired: enter your password again.');
    }
    await this.throttle.recordSuccess(email);
    const remember = Boolean(meta.remember);
    return { ...(await this.startSession(siteId, auth, remember, client, method)), remember };
  }

  /** Passkey sign-in (RF-USR-05): the passkey is both factors, no TOTP step. */
  async loginPasskey(
    siteId: string,
    rp: RelyingParty,
    token: string | undefined,
    response: AuthenticationResponseJSON,
    client: ClientInfo,
  ): Promise<{ auth: AuthContext; token: string; expiresAt: Date }> {
    const userId = await this.passkeys.authenticate(rp, token, response);
    const auth = userId ? await this.identity.load(siteId, userId, '') : null;
    if (!auth) {
      await withContext(this.database.db, { siteId }, (tx) =>
        this.audit.record(tx, {
          siteId,
          userId,
          action: 'user.login.failed',
          meta: { method: 'passkey' },
          ip: client.ip,
        }),
      );
      throw new UnauthorizedException('This passkey cannot sign in to this site.');
    }
    return this.startSession(siteId, auth, false, client, 'passkey');
  }

  /**
   * One-time sign-in link from a hosting panel (`cleitext login-link`, as WP
   * Toolkit's "Log in"). Only who has shell access to the installation can
   * issue one, so it is a trusted sign-in: the second factor is not asked.
   * The link works once, for a minute (five at most), on the site it was
   * issued for, and only for an active user who may use that site.
   */
  async loginPanel(
    siteId: string,
    token: string,
    client: ClientInfo,
  ): Promise<{ auth: AuthContext; token: string; expiresAt: Date }> {
    const wait = await this.throttle.ipRetryAfter(client.ip);
    if (wait > 0) throw tooManyAttempts(wait);
    const invalid = () =>
      new HttpException('This sign-in link is invalid or has expired.', HttpStatus.GONE);
    const record = token ? await this.tokens.peek('panel_login', token) : null;
    const meta = record?.meta as { siteId?: string } | undefined;
    if (!record || meta?.siteId !== siteId) {
      await this.throttle.recordIpFailure(client.ip);
      throw invalid();
    }
    // Used up whatever happens next: a link is never tried twice.
    if (!(await this.tokens.consume('panel_login', token))) throw invalid();
    const auth = await this.identity.load(siteId, record.userId, '');
    if (!auth) {
      await withContext(this.database.db, { siteId }, (tx) =>
        this.audit.record(tx, {
          siteId,
          userId: record.userId,
          action: 'user.login.failed',
          meta: { method: 'panel' },
          ip: client.ip,
        }),
      );
      throw invalid();
    }
    return this.startSession(siteId, auth, false, client, 'panel');
  }

  private async startSession(
    siteId: string,
    auth: AuthContext,
    remember: boolean,
    client: ClientInfo,
    method: 'password' | 'totp' | 'recovery' | 'passkey' | 'panel',
  ): Promise<{ auth: AuthContext; token: string; expiresAt: Date }> {
    const session = await this.sessions.create({
      userId: auth.userId,
      remember,
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
        action: method === 'panel' ? 'auth.login_panel' : 'user.login',
        ...(method === 'password' ? {} : { meta: { method } }),
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
  async forgotPassword(
    siteId: string,
    email: string,
    client: ClientInfo,
    /** Page where the link leads: the admin's, or the site's own account page. */
    resetUrl = `${client.origin}${ADMIN_PATH}/reset-password`,
  ): Promise<void> {
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
          `${resetUrl}?token=${token}`,
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
    // Before the link is used up, so that the person can try another password.
    assertPasswordNotBreached(input.password);
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
    assertPasswordNotBreached(input.password);
    const record = await this.tokens.peek('invitation', input.token);
    const meta = record?.meta as InvitationMeta | undefined;
    if (!record || meta?.siteId !== siteId) {
      throw new HttpException('This invitation is invalid or has expired.', HttpStatus.GONE);
    }
    if (!(await this.tokens.consume('invitation', input.token))) {
      throw new HttpException('This invitation is invalid or has expired.', HttpStatus.GONE);
    }

    const passwordHash = await hashPassword(input.password);
    const active = await this.identity.activePlugins(siteId);
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
        return this.identity.loadInTx(tx, siteId, record.userId, '', active);
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
