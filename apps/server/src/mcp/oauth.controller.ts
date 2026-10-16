import { ADMIN_PATH } from '@cleitext/shared';
import { withContext, type DatabaseClient } from '@cleitext/db';
import { Controller, Get, Inject, Options, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { NoCsrf, Public } from '../common/decorators.js';
import { DATABASE } from '../database/database.module.js';
import { SettingsService } from '../settings/settings.service.js';
import { siteOrigin } from './origin.js';
import { OAUTH_SCOPES, OAuthError, OAuthService } from './oauth.service.js';

/**
 * OAuth 2.1 endpoints for AI assistants (RF-AI-02), discovered from /mcp:
 * metadata (RFC 9728, RFC 8414), dynamic registration (RFC 7591), the
 * authorization endpoint (the consent is in the admin, see consent.controller)
 * and the token endpoint. Only when MCP is on for the site.
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

  /** The consent happens in the admin (Connect an assistant), signed in as usual. */
  @Get('oauth/authorize')
  async authorize(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!(await this.enabled(request))) return this.notFound(reply);
    const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
    return reply.header('cache-control', 'no-store').redirect(`${ADMIN_PATH}/connect${query}`, 302);
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
