import { sites, users, withContext, type DatabaseClient } from '@cleitext/db';
import {
  passwordConfirmRequestSchema,
  twoFactorCodeRequestSchema,
  type TwoFactorSetupView,
  type TwoFactorStatusView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { verifyPassword } from '../auth/crypto.js';
import { TwoFactorService } from '../auth/two-factor.service.js';
import { CurrentAuth, CurrentSite } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

/** The signed-in user's two-factor authentication (RF-USR-04). */
@Controller('profile/2fa')
export class TwoFactorController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async status(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TwoFactorStatusView> {
    return this.twoFactor.status(site.id, auth.userId);
  }

  /** A new secret for the authenticator app; 2FA is on only after `enable`. */
  @Post('setup')
  @HttpCode(200)
  async setup(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TwoFactorSetupView> {
    const [row] = await withContext(this.database.db, { siteId: site.id }, (tx) =>
      tx.select({ name: sites.name }).from(sites).where(eq(sites.id, site.id)),
    );
    return this.twoFactor.setup(site.id, auth.userId, row?.name || 'Cleitext');
  }

  /** Confirms the setup with a code; the recovery codes are shown only now. */
  @Post('enable')
  @HttpCode(200)
  async enable(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ recoveryCodes: string[] }> {
    const { code } = parseBody(twoFactorCodeRequestSchema, body);
    const recoveryCodes = await this.twoFactor.enable(site.id, auth.userId, code);
    await this.record(site, auth, 'user.2fa.enabled', request.ip);
    return { recoveryCodes };
  }

  @Post('disable')
  @HttpCode(204)
  async disable(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.confirmPassword(site, auth, body);
    await this.twoFactor.disable(site.id, auth.userId);
    await this.record(site, auth, 'user.2fa.disabled', request.ip);
  }

  /** New recovery codes: the previous ones stop working. */
  @Post('recovery-codes')
  @HttpCode(200)
  async recoveryCodes(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<{ recoveryCodes: string[] }> {
    await this.confirmPassword(site, auth, body);
    if (!(await this.twoFactor.isEnabled(site.id, auth.userId))) {
      throw new BadRequestException('Two-factor authentication is off.');
    }
    return { recoveryCodes: await this.twoFactor.newRecoveryCodes(auth.userId) };
  }

  private async confirmPassword(site: SiteContext, auth: AuthContext, body: unknown) {
    const { password } = parseBody(passwordConfirmRequestSchema, body);
    const [user] = await withContext(
      this.database.db,
      { siteId: site.id, userId: auth.userId },
      (tx) => tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, auth.userId)),
    );
    if (!(await verifyPassword(user?.hash ?? null, password))) {
      throw new BadRequestException('The password is not correct.');
    }
  }

  private record(site: SiteContext, auth: AuthContext, action: string, ip: string) {
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, (tx) =>
      this.audit.record(tx, { siteId: site.id, userId: auth.userId, action, ip }),
    );
  }
}
