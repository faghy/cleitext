import {
  acceptInviteRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  passkeyLoginRequestSchema,
  resetPasswordRequestSchema,
  twoFactorLoginRequestSchema,
  type MeResponse,
  type TwoFactorChallenge,
} from '@cleitext/shared';
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { sites, withContext, type DatabaseClient } from '@cleitext/db';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import { PasskeyService, type RelyingParty } from './passkey.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, Public } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { AuthService, type ClientInfo } from './auth.service.js';
import {
  clearSessionCookie,
  setCsrfCookie,
  setSessionCookie,
  setWebauthnCookie,
  WEBAUTHN_COOKIE,
} from './cookies.js';
import { generateToken } from './crypto.js';
import { IdentityService } from './identity.service.js';

/** Authentication endpoints (docs/SPECIFICATIONS.md §6.1). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly identity: IdentityService,
    private readonly passkeys: PasskeyService,
    @Inject(DATABASE) private readonly database: DatabaseClient,
  ) {}

  /** Issues the CSRF token (cookie + body) required by state-changing requests. */
  @Public()
  @Get('csrf')
  csrf(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = generateToken();
    setCsrfCookie(request, reply, token);
    return { token };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @CurrentSite() site: SiteContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MeResponse | TwoFactorChallenge> {
    const input = parseBody(loginRequestSchema, body);
    const result = await this.authService.login(site.id, input, clientInfo(request));
    if ('twoFactorRequired' in result) return result;
    setSessionCookie(request, reply, result.token, {
      remember: input.remember,
      expiresAt: result.expiresAt,
    });
    return this.identity.me(site.id, result.auth);
  }

  /** Passkey sign-in, step 1: a challenge for any passkey of this domain (RF-USR-05). */
  @Public()
  @Post('passkey/options')
  @HttpCode(200)
  async passkeyOptions(
    @CurrentSite() site: SiteContext,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { options, token } = await this.passkeys.authenticationOptions(
      await relyingParty(this.database, site, request),
    );
    setWebauthnCookie(request, reply, token);
    return options;
  }

  @Public()
  @Post('passkey/verify')
  @HttpCode(200)
  async passkeyVerify(
    @CurrentSite() site: SiteContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MeResponse> {
    const { response } = parseBody(passkeyLoginRequestSchema, body);
    const result = await this.authService.loginPasskey(
      site.id,
      await relyingParty(this.database, site, request),
      request.cookies[WEBAUTHN_COOKIE],
      response as unknown as AuthenticationResponseJSON,
      clientInfo(request),
    );
    setSessionCookie(request, reply, result.token, {
      remember: false,
      expiresAt: result.expiresAt,
    });
    return this.identity.me(site.id, result.auth);
  }

  /** Second sign-in step for accounts with 2FA (RF-USR-04). */
  @Public()
  @Post('2fa')
  @HttpCode(200)
  async twoFactor(
    @CurrentSite() site: SiteContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MeResponse> {
    const input = parseBody(twoFactorLoginRequestSchema, body);
    const result = await this.authService.loginTwoFactor(site.id, input, clientInfo(request));
    setSessionCookie(request, reply, result.token, {
      remember: result.remember,
      expiresAt: result.expiresAt,
    });
    return this.identity.me(site.id, result.auth);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.authService.logout(site.id, auth, request.ip);
    clearSessionCookie(request, reply);
  }

  @Get('me')
  me(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext): Promise<MeResponse> {
    return this.identity.me(site.id, auth);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  async forgotPassword(
    @CurrentSite() site: SiteContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    const { email } = parseBody(forgotPasswordRequestSchema, body);
    await this.authService.forgotPassword(site.id, email, clientInfo(request));
    return { message: 'If the address is registered, we have sent a link to reset the password.' };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  async resetPassword(
    @CurrentSite() site: SiteContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const input = parseBody(resetPasswordRequestSchema, body);
    await this.authService.resetPassword(site.id, input, clientInfo(request));
  }

  @Public()
  @Get('invitation')
  invitation(@CurrentSite() site: SiteContext, @Query('token') token: string | undefined) {
    return this.authService.invitation(site.id, String(token ?? ''));
  }

  @Public()
  @Post('invitation/accept')
  @HttpCode(200)
  async acceptInvitation(
    @CurrentSite() site: SiteContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MeResponse> {
    const input = parseBody(acceptInviteRequestSchema, body);
    const result = await this.authService.acceptInvitation(site.id, input, clientInfo(request));
    setSessionCookie(request, reply, result.token, {
      remember: false,
      expiresAt: result.expiresAt,
    });
    return this.identity.me(site.id, result.auth);
  }
}

export function clientInfo(request: FastifyRequest): ClientInfo {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
    origin: `${request.protocol}://${request.host}`,
  };
}

/** The WebAuthn relying party of a request: the host it was made on. */
export async function relyingParty(
  database: DatabaseClient,
  site: SiteContext,
  request: FastifyRequest,
): Promise<RelyingParty> {
  const [row] = await withContext(database.db, { siteId: site.id }, (tx) =>
    tx.select({ name: sites.name }).from(sites).where(eq(sites.id, site.id)),
  );
  return {
    id: request.hostname,
    origin: `${request.protocol}://${request.host}`,
    name: row?.name || 'Cleitext',
  };
}
