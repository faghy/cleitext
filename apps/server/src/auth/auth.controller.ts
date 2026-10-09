import {
  acceptInviteRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  type MeResponse,
} from '@cleitext/shared';
import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, Public } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { AuthService, type ClientInfo } from './auth.service.js';
import { clearSessionCookie, setCsrfCookie, setSessionCookie } from './cookies.js';
import { generateToken } from './crypto.js';
import { IdentityService } from './identity.service.js';

/** Authentication endpoints (docs/SPECIFICATIONS.md §6.1). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly identity: IdentityService,
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
  ): Promise<MeResponse> {
    const input = parseBody(loginRequestSchema, body);
    const result = await this.authService.login(site.id, input, clientInfo(request));
    setSessionCookie(request, reply, result.token, {
      remember: input.remember,
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
