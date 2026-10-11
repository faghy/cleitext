import { createHmac } from 'node:crypto';
import { withContext, type DatabaseClient } from '@cleitext/db';
import { Controller, Get, Inject, Options, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { safeEqual } from '../auth/crypto.js';
import { NoCsrf, Public } from '../common/decorators.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { escape, translate, type Lang } from '../install/page.js';
import { SettingsService } from '../settings/settings.service.js';
import { siteOrigin } from './mcp.controller.js';
import { OAUTH_SCOPES, OAuthError, OAuthService, validRedirectUri } from './oauth.service.js';

/**
 * OAuth 2.1 endpoints for AI assistants (RF-AI-02), discovered from /mcp:
 * metadata (RFC 9728, RFC 8414), dynamic registration (RFC 7591), the
 * consent page and the token endpoint. Only when MCP is on for the site.
 */

type Body = Record<string, string | string[] | undefined>;

@Controller()
@Public()
@NoCsrf()
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly settings: SettingsService,
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async enabled(request: FastifyRequest): Promise<boolean> {
    if (!request.site) return false;
    const core = await withContext(this.database.db, { siteId: request.site.id }, (tx) =>
      this.settings.core(tx),
    );
    return core.mcp === true;
  }

  private notFound(reply: FastifyReply) {
    return reply
      .code(404)
      .type('application/json')
      .send({ error: 'MCP is not enabled on this site.' });
  }

  @Get('.well-known/oauth-protected-resource')
  async resource(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!(await this.enabled(request))) return this.notFound(reply);
    const origin = siteOrigin(request);
    return cors(reply).send({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ['header'],
      resource_name: 'Cleitext',
    });
  }

  @Get('.well-known/oauth-protected-resource/mcp')
  resourceForPath(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.resource(request, reply);
  }

  @Get('.well-known/oauth-authorization-server')
  async server(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!(await this.enabled(request))) return this.notFound(reply);
    const origin = siteOrigin(request);
    return cors(reply).send({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: OAUTH_SCOPES,
    });
  }

  @Options([
    'oauth/register',
    'oauth/token',
    '.well-known/oauth-authorization-server',
    '.well-known/oauth-protected-resource',
  ])
  preflight(@Res() reply: FastifyReply) {
    return cors(reply)
      .header('access-control-allow-methods', 'GET, POST, OPTIONS')
      .header('access-control-allow-headers', 'content-type, authorization, mcp-protocol-version')
      .code(204)
      .send();
  }

  @Post('oauth/register')
  async register(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!(await this.enabled(request))) return this.notFound(reply);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const uris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((u) => typeof u === 'string')
      : [];
    try {
      const client = await this.oauth.register(request.site!.id, {
        name: typeof body.client_name === 'string' ? body.client_name : 'AI assistant',
        redirectUris: uris as string[],
      });
      return cors(reply)
        .code(201)
        .send({
          client_id: client.clientId,
          client_name: client.name,
          redirect_uris: client.redirectUris,
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        });
    } catch (error) {
      return oauthError(reply, error);
    }
  }

  @Get('oauth/authorize')
  async authorize(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!(await this.enabled(request))) return this.notFound(reply);
    const q = request.query as Record<string, string | undefined>;
    const lang = langOf(request);
    const checked = await this.check(request, q);
    if ('problem' in checked)
      return consentPage(reply, lang, 400, `<p>${escape(checked.problem ?? '')}</p>`, null);
    if (!request.auth || request.auth.apiToken) {
      return reply.redirect(`/admin/login?redirect=${encodeURIComponent(request.url)}`, 302);
    }
    const auth = request.auth;
    const t = (s: string, v?: Record<string, string>) => escape(translate(lang, s, v));
    const canPublish = auth.capabilities.includes('publish_entries');
    const wantsPublish = checked.scopes.includes('publish');
    const hidden = Object.entries({
      client_id: checked.client.clientId,
      redirect_uri: checked.redirectUri,
      state: q.state ?? '',
      code_challenge: q.code_challenge ?? '',
      scope: checked.scopes.join(' '),
      csrf: this.csrf(auth.sessionId),
    })
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${escape(v)}">`)
      .join('');
    const body = `<h1>${t('Connect {app}', { app: checked.client.name })}</h1>
<p>${translate(lang, '{app} wants to work on {site} as {user}.', {
      app: `<strong>${escape(checked.client.name)}</strong>`,
      site: `<strong>${escape(request.host)}</strong>`,
      user: `<strong>${escape(auth.displayName)}</strong>`,
    })}</p>
<form method="post" action="/oauth/authorize">${hidden}
<fieldset><legend>${t('It will be able to')}</legend>
<ul>
<li>${t('read pages, posts, media and menus')}</li>
${checked.scopes.includes('write') ? `<li>${t('create and change drafts, upload images, set menus')}</li>` : ''}
</ul>
${canPublish ? `<label class="check"><input type="checkbox" name="publish" ${wantsPublish ? 'checked' : ''}> ${t('also publish (otherwise everything stays a draft)')}</label>` : ''}
</fieldset>
<p class="hint">${t('It acts with your permissions, and everything it does is in the activity log. You can disconnect it at any time in your profile (API tokens).')}</p>
<button type="submit" name="decision" value="allow">${t('Allow')}</button>
<button type="submit" name="decision" value="deny" class="button secondary">${t('Cancel')}</button>
</form>`;
    return consentPage(reply, lang, 200, body, checked.redirectUri);
  }

  @Post('oauth/authorize')
  async approve(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!(await this.enabled(request))) return this.notFound(reply);
    const body = (request.body ?? {}) as Body;
    const field = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined);
    const lang = langOf(request);
    const checked = await this.check(request, {
      response_type: 'code',
      client_id: field('client_id'),
      redirect_uri: field('redirect_uri'),
      code_challenge: field('code_challenge'),
      code_challenge_method: 'S256',
      scope: field('scope'),
    });
    if ('problem' in checked)
      return consentPage(reply, lang, 400, `<p>${escape(checked.problem ?? '')}</p>`, null);
    const auth = request.auth;
    // The consent comes from the signed-in user, on this site's own page.
    const origin = request.headers.origin;
    if (
      !auth ||
      auth.apiToken ||
      !safeEqual(field('csrf') ?? '', this.csrf(auth.sessionId)) ||
      (origin && origin !== siteOrigin(request))
    ) {
      return consentPage(
        reply,
        lang,
        403,
        `<p>${escape(translate(lang, 'The request has expired: start again from your assistant.'))}</p>`,
        null,
      );
    }
    const back = new URL(checked.redirectUri);
    const state = field('state');
    if (state) back.searchParams.set('state', state);
    back.searchParams.set('iss', siteOrigin(request));
    if (field('decision') !== 'allow') {
      back.searchParams.set('error', 'access_denied');
      return reply.redirect(back.toString(), 302);
    }
    const scopes = checked.scopes.filter((s) => s !== 'publish');
    if (body.publish === 'on' && auth.capabilities.includes('publish_entries'))
      scopes.push('publish');
    const code = await this.oauth.createCode(request.site!.id, {
      clientId: checked.client.clientId,
      userId: auth.userId,
      redirectUri: checked.redirectUri,
      codeChallenge: field('code_challenge')!,
      scopes,
    });
    back.searchParams.set('code', code);
    return reply.redirect(back.toString(), 302);
  }

  @Post('oauth/token')
  async token(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!(await this.enabled(request))) return this.notFound(reply);
    const body = (request.body ?? {}) as Body;
    const field = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
    try {
      const siteId = request.site!.id;
      const clientId = field('client_id');
      if (!(await this.oauth.client(siteId, clientId)))
        throw new OAuthError('invalid_client', 'Unknown client.', 401);
      const tokens =
        field('grant_type') === 'authorization_code'
          ? await this.oauth.exchangeCode(siteId, {
              code: field('code'),
              clientId,
              redirectUri: field('redirect_uri'),
              codeVerifier: field('code_verifier'),
            })
          : field('grant_type') === 'refresh_token'
            ? await this.oauth.refresh(siteId, { refreshToken: field('refresh_token'), clientId })
            : (() => {
                throw new OAuthError(
                  'unsupported_grant_type',
                  'Use authorization_code or refresh_token.',
                );
              })();
      return cors(reply).header('cache-control', 'no-store').send(tokens);
    } catch (error) {
      return oauthError(reply, error);
    }
  }

  /** The checks of an authorization request, shared by the page and its form. */
  private async check(request: FastifyRequest, q: Record<string, string | undefined>) {
    if (q.response_type !== 'code')
      return { problem: 'Only the authorization code flow is supported.' };
    const client = q.client_id ? await this.oauth.client(request.site!.id, q.client_id) : null;
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
    const scopes =
      asked.length > 0 ? OAUTH_SCOPES.filter((s) => asked.includes(s)) : ['read', 'write'];
    if (scopes.length === 0) return { problem: 'No known permission was requested.' };
    // write includes read.
    if (scopes.includes('write') && !scopes.includes('read')) scopes.unshift('read');
    return { client, redirectUri: redirectUri as string, scopes: [...scopes] as string[] };
  }

  private csrf(sessionId: string): string {
    return createHmac('sha256', this.config.appSecret)
      .update(`oauth-consent:${sessionId}`)
      .digest('base64url');
  }
}

function cors(reply: FastifyReply): FastifyReply {
  return reply.header('access-control-allow-origin', '*').type('application/json');
}

function oauthError(reply: FastifyReply, error: unknown) {
  if (error instanceof OAuthError) {
    return cors(reply)
      .code(error.status)
      .send({ error: error.code, error_description: error.message });
  }
  throw error;
}

function langOf(request: FastifyRequest): Lang {
  const locale = request.auth?.locale ?? request.headers['accept-language'] ?? '';
  return /^\s*it\b/i.test(locale) ? 'it' : 'en';
}

/** The consent page: the installer's frame, with the assistant's address allowed as form target. */
function consentPage(
  reply: FastifyReply,
  lang: Lang,
  status: number,
  body: string,
  redirectUri: string | null,
) {
  const target = redirectUri ? new URL(redirectUri).origin : '';
  const t = (s: string) => escape(translate(lang, s));
  return reply
    .code(status)
    .header(
      'content-security-policy',
      `default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self' ${target}; frame-ancestors 'none'; base-uri 'none'`,
    )
    .header('cache-control', 'no-store')
    .header('x-frame-options', 'DENY')
    .header('referrer-policy', 'no-referrer')
    .type('text/html; charset=utf-8')
    .send(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${t('Connect an AI assistant')}</title>
<style>:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{margin:0}main{max-width:30rem;margin:3rem auto;padding:0 1rem}h1{font-size:1.4rem}fieldset{border:1px solid #8884;border-radius:.5rem;margin:1rem 0;padding:.5rem 1rem 1rem}label.check{display:flex;gap:.5rem;align-items:center;margin-top:.5rem}.hint{font-size:.85rem;opacity:.75}button{padding:.6rem 1.2rem;border:0;border-radius:.4rem;background:#0369a1;color:#fff;font:inherit;cursor:pointer;margin:.5rem .5rem 0 0}.secondary{background:transparent;color:inherit;border:1px solid #8886}.logo{display:flex;align-items:center;gap:.5rem;font-weight:700;font-size:1.2rem}</style></head>
<body><main><p class="logo"><svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#0369a1"/><path d="M38.5 22.5 A13.5 13.5 0 1 0 38.5 41.5" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><rect x="43" y="19" width="5" height="26" rx="2.5" fill="#7dd3fc"/></svg> Cleitext</p>${body}</main></body></html>`);
}
