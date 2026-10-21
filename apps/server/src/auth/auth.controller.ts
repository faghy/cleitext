import {
  ADMIN_PATH,
  acceptInviteRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  passkeyLoginRequestSchema,
  resetPasswordRequestSchema,
  twoFactorLoginRequestSchema,
  type MeResponse,
  type TwoFactorChallenge,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
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
import { PluginHost } from '../plugins/plugin-host.service.js';

/**
 * The admin's sign-in forms a plugin can protect against bots (plugin API
 * 1.38): the password step only. Passkeys and the 2FA step stay as they
 * are; API tokens never go through these endpoints.
 */
export const ADMIN_FORMS = {
  login: 'core/admin-login',
  forgot: 'core/admin-lost-password',
  reset: 'core/admin-reset-password',
} as const;
const ADMIN_FORM_IDS: string[] = Object.values(ADMIN_FORMS);

/** Authentication endpoints (docs/SPECIFICATIONS.md §6.1). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly identity: IdentityService,
    private readonly passkeys: PasskeyService,
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
  ) {}

  /**
   * The bot protection of an admin sign-in form, from a plugin
   * (`form.challenge`): markup with the widget and its script, or empty.
   */
  @Public()
  @Get('challenge')
  async challenge(
    @CurrentSite() site: SiteContext,
    @Query('form') form: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ html: string }> {
    void reply.header('cache-control', 'no-store');
    if (!ADMIN_FORM_IDS.includes(String(form))) return { html: '' };
    const html = await this.plugins.formChallenge({
      siteId: site.id,
      form: String(form),
      locale: adminLocale(request),
      signedIn: false,
    });
    return { html };
  }

  /** Refuses a submission the site's bot protection does not let through (`form.verify`). */
  private async guard(
    siteId: string,
    form: string,
    body: unknown,
    request: FastifyRequest,
  ): Promise<void> {
    const fields = {
      ...(body && typeof body === 'object' ? (body as Record<string, unknown>) : {}),
    };
    // Plugins get the challenge's fields, never the password.
    delete fields.password;
    const locale = adminLocale(request);
    const result = await this.plugins.formVerify({
      siteId,
      form,
      locale,
      fields,
      ip: request.ip,
      host: request.hostname,
      signedIn: false,
    });
    if (!result.ok) {
      throw new BadRequestException(
        result.message ??
          (locale.startsWith('it')
            ? 'Conferma di non essere un robot, poi riprova.'
            : 'Please confirm that you are not a robot, then try again.'),
      );
    }
  }

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
    await this.guard(site.id, ADMIN_FORMS.login, body, request);
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

  /**
   * One-time sign-in link from a hosting panel (`cleitext login-link`):
   * signs in and opens the admin. 2FA is not asked (see AuthService.loginPanel).
   */
  @Public()
  @Get('one-time')
  async oneTime(
    @CurrentSite() site: SiteContext,
    @Query('token') token: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    void reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    try {
      const result = await this.authService.loginPanel(
        site.id,
        String(token ?? ''),
        clientInfo(request),
      );
      setSessionCookie(request, reply, result.token, {
        remember: false,
        expiresAt: result.expiresAt,
      });
      await reply.redirect(`${ADMIN_PATH}/`, 303);
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      const status = error.getStatus();
      const it = adminLocale(request).startsWith('it');
      const message =
        status === 429
          ? it
            ? 'Troppi tentativi. Riprova più tardi.'
            : 'Too many attempts. Try again later.'
          : it
            ? 'Questo link di accesso non è valido o è scaduto: creane un altro dal pannello.'
            : 'This sign-in link is invalid or has expired: create a new one from the panel.';
      await reply
        .code(status)
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cleitext</title><p>${message}</p><p><a href="${ADMIN_PATH}/">${it ? 'Accedi' : 'Sign in'}</a></p>`,
        );
    }
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
    await this.guard(site.id, ADMIN_FORMS.forgot, body, request);
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
    await this.guard(site.id, ADMIN_FORMS.reset, body, request);
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

/** The admin's language before sign-in: the browser's (`Accept-Language`). */
function adminLocale(request: FastifyRequest): string {
  const first = String(request.headers['accept-language'] ?? '').split(/[,;]/)[0] ?? '';
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(first.trim()) ? first.trim().toLowerCase() : 'en';
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
