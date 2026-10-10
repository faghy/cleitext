import { withContext, type DatabaseClient } from '@cleitext/db';
import {
  passkeyRegisterRequestSchema,
  passkeyRenameRequestSchema,
  type PasskeyView,
} from '@cleitext/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { relyingParty } from '../auth/auth.controller.js';
import { setWebauthnCookie, WEBAUTHN_COOKIE } from '../auth/cookies.js';
import { PasskeyService } from '../auth/passkey.service.js';
import { CurrentAuth, CurrentSite } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

/** The signed-in user's passkeys (RF-USR-05). */
@Controller('profile/passkeys')
export class PasskeysController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly passkeys: PasskeyService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<PasskeyView[]> {
    return this.passkeys.list(auth.userId);
  }

  /** Step 1: options for the browser's passkey prompt. */
  @Post('options')
  @HttpCode(200)
  async options(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { options, token } = await this.passkeys.registrationOptions(
      await relyingParty(this.database, site, request),
      { id: auth.userId, email: auth.email, displayName: auth.displayName },
    );
    setWebauthnCookie(request, reply, token);
    return options;
  }

  /** Step 2: the new credential, checked and saved. */
  @Post()
  async register(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<PasskeyView> {
    const { response, name } = parseBody(passkeyRegisterRequestSchema, body);
    const passkey = await this.passkeys.register(
      await relyingParty(this.database, site, request),
      auth.userId,
      request.cookies[WEBAUTHN_COOKIE],
      response as unknown as RegistrationResponseJSON,
      name,
    );
    await this.record(site, auth, 'user.passkey.added', request.ip);
    return passkey;
  }

  @Patch(':id')
  @HttpCode(204)
  async rename(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<void> {
    const { name } = parseBody(passkeyRenameRequestSchema, body);
    await this.passkeys.rename(auth.userId, id, name);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.passkeys.remove(auth.userId, id);
    await this.record(site, auth, 'user.passkey.removed', request.ip);
  }

  private record(site: SiteContext, auth: AuthContext, action: string, ip: string) {
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, (tx) =>
      this.audit.record(tx, { siteId: site.id, userId: auth.userId, action, ip }),
    );
  }
}
