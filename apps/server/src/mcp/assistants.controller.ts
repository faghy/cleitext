import { withContext, type DatabaseClient } from '@cleitext/db';
import {
  oauthConsentRequestSchema,
  type AssistantsStatus,
  type OAuthConsentView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { SettingsService } from '../settings/settings.service.js';
import { ChatService } from './chat.service.js';
import { siteOrigin } from './origin.js';
import { OAuthService } from './oauth.service.js';

/**
 * Admin → Chriss (RF-AI-01/02): whether MCP is on, the address to give
 * the assistant, and the consent screen of /oauth/authorize, shown in the admin.
 */
@Controller()
export class AssistantsController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly settings: SettingsService,
    private readonly chat: ChatService,
    @Inject(DATABASE) private readonly database: DatabaseClient,
  ) {}

  private async enabled(siteId: string): Promise<boolean> {
    const core = await withContext(this.database.db, { siteId }, (tx) => this.settings.core(tx));
    return core.mcp === true;
  }

  @Get('assistants')
  async status(
    @CurrentSite() site: SiteContext,
    @Req() request: FastifyRequest,
  ): Promise<AssistantsStatus> {
    return {
      enabled: await this.enabled(site.id),
      address: `${siteOrigin(request)}/mcp`,
      chat: await this.chat.configured(site.id),
    };
  }

  /** What the assistant asks for, to show it before the user allows it. */
  @Get('oauth/consent')
  async consent(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, string | undefined>,
    @Req() request: FastifyRequest,
  ): Promise<OAuthConsentView> {
    const checked = await this.checked(site, auth, query);
    return {
      client: checked.client.name,
      site: request.host,
      user: auth.displayName,
      scopes: checked.scopes,
      canPublish: auth.capabilities.includes('publish_entries'),
    };
  }

  /** The user's answer: where to send the browser back to the assistant. */
  @Post('oauth/consent')
  @HttpCode(200)
  async decide(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ redirect: string }> {
    const input = parseBody(oauthConsentRequestSchema, body);
    const checked = await this.checked(site, auth, input.params);
    const back = new URL(checked.redirectUri);
    if (checked.state) back.searchParams.set('state', checked.state);
    back.searchParams.set('iss', siteOrigin(request));
    if (!input.allow) {
      back.searchParams.set('error', 'access_denied');
      return { redirect: back.toString() };
    }
    const scopes = checked.scopes.filter((s) => s !== 'publish');
    if (input.publish && auth.capabilities.includes('publish_entries')) scopes.push('publish');
    const code = await this.oauth.createCode(site.id, {
      clientId: checked.client.clientId,
      userId: auth.userId,
      redirectUri: checked.redirectUri,
      codeChallenge: checked.codeChallenge,
      scopes,
    });
    back.searchParams.set('code', code);
    return { redirect: back.toString() };
  }

  private async checked(
    site: SiteContext,
    auth: AuthContext,
    params: Record<string, string | undefined>,
  ) {
    // Only a person signed in to the admin can connect an assistant.
    if (auth.apiToken)
      throw new ForbiddenException('Sign in to the admin to connect an assistant.');
    if (!(await this.enabled(site.id)))
      throw new NotFoundException('AI assistants are turned off on this site.');
    const checked = await this.oauth.checkRequest(site.id, params);
    if ('problem' in checked) throw new BadRequestException(checked.problem);
    return checked;
  }
}
