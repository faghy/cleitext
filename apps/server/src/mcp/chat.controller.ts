import {
  aiModelsRequestSchema,
  aiProviderRequestSchema,
  assistantChatRequestSchema,
  CSRF_HEADER,
  type AiProviderView,
  type AssistantChatEvent,
  type AssistantChatMessage,
  type FreeAiStatus,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { apiContext } from './api-context.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { ChatService, type ChatEntry } from './chat.service.js';
import { siteOrigin } from './origin.js';
import { OAuthService } from './oauth.service.js';
import { editorOf } from './tools.js';

/** Admin → Chriss → Chat (RF-AI-03), and its AI provider. */
@Controller('assistants')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly adapter: HttpAdapterHost,
    private readonly plugins: PluginHost,
    private readonly settings: SettingsService,
    private readonly oauth: OAuthService,
  ) {}

  /** The provider: set by super admins, since the server calls the address they give. */
  @Get('provider')
  @RequireCapability('manage_plugins')
  provider(@CurrentSite() site: SiteContext): Promise<AiProviderView | null> {
    return this.chat.view(site.id);
  }

  @Put('provider')
  @RequireCapability('manage_plugins')
  async saveProvider(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<AiProviderView | null> {
    const input = parseBody(aiProviderRequestSchema, body);
    await this.chat.save(site.id, auth.userId, input, request.ip);
    return this.chat.view(site.id);
  }

  /** Asks the saved provider a short question: its error, as the provider gives it, when it fails. */
  @Post('provider/test')
  @HttpCode(200)
  @RequireCapability('manage_plugins')
  async testProvider(
    @CurrentSite() site: SiteContext,
  ): Promise<{ ok: boolean; model?: string; answer?: string; error?: string }> {
    try {
      return await this.chat.test(site.id);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** The models the provider offers, to choose one (core 0.116). */
  @Post('provider/models')
  @HttpCode(200)
  @RequireCapability('manage_plugins')
  async providerModels(
    @CurrentSite() site: SiteContext,
    @Body() body: unknown,
  ): Promise<{ models: string[] } | { models: []; error: string }> {
    const input = parseBody(aiModelsRequestSchema, body ?? {});
    try {
      return { models: await this.chat.models(site.id, input) };
    } catch (error) {
      return { models: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Chriss base, the free AI: offered by this server, in use, today's requests left. */
  @Get('provider/free')
  @RequireCapability('manage_plugins')
  freeStatus(@CurrentSite() site: SiteContext): Promise<FreeAiStatus> {
    return this.chat.freeStatus(site.id);
  }

  /** Chooses Chriss base: the site registers with the relay and keeps its key. */
  @Post('provider/free')
  @HttpCode(200)
  @RequireCapability('manage_plugins')
  async activateFree(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
  ): Promise<AiProviderView | null> {
    try {
      await this.chat.activateFree(site.id, auth.userId, siteOrigin(request), request.ip);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
    return this.chat.view(site.id);
  }

  @Delete('provider')
  @HttpCode(204)
  @RequireCapability('manage_plugins')
  async removeProvider(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.chat.remove(site.id, auth.userId, request.ip);
  }

  /**
   * One question: the answer is streamed as JSON lines (AssistantChatEvent),
   * since the assistant may work for minutes. The tools act as the user.
   */
  @Post('chat')
  @RequireCapability('edit_entries')
  async ask(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // The admin (session), or the official app with its OAuth token (core 0.117):
    // other API tokens use MCP.
    const token = auth.apiToken;
    if (token) {
      if (!(await this.oauth.isAppToken(site.id, token.id)))
        throw new ForbiddenException('The chat is for the admin: use MCP instead.');
      if (!token.scopes.includes('write'))
        throw new ForbiddenException('The chat needs a token that may write.');
    }
    const input = parseBody(assistantChatRequestSchema, body);
    const scopes = ['read', 'write'];
    if (
      input.publish &&
      auth.capabilities.includes('publish_entries') &&
      (!token || token.scopes.includes('publish'))
    )
      scopes.push('publish');
    const credentials: Record<string, string> = { origin: siteOrigin(request) };
    // The tools act as the token, or as the session.
    for (const name of token ? ['authorization'] : ['cookie', CSRF_HEADER]) {
      const value = request.headers[name];
      if (typeof value === 'string') credentials[name] = value;
    }
    // Chriss base with no free question left: a plain 429 before the stream.
    const quota = await this.chat.freeQuotaExceeded(site.id);
    if (quota) {
      reply
        .code(429)
        .header('retry-after', String(quota.retryAfter))
        .type('application/json')
        .send({ error: 'quota_exceeded', limit: quota.limit, resetAt: quota.resetAt });
      return;
    }
    const ctx = apiContext(
      this.adapter.httpAdapter.getInstance<FastifyInstance>(),
      request,
      credentials,
      scopes,
      { plugins: this.plugins, settings: this.settings },
    );
    // Opened from an entry's editor: the entry, read as the user (null if they cannot).
    let entry: ChatEntry | null = null;
    if (input.entryId) {
      const found = await ctx.api('GET', `/entries/${input.entryId}`);
      if (found.status === 200) {
        const view = found.data as {
          id: string;
          title: string;
          type: string;
          locale: string;
          status: string;
          revision?: { document?: Parameters<typeof editorOf>[0] };
        };
        entry = {
          id: view.id,
          title: view.title,
          type: view.type,
          locale: view.locale,
          status: view.status,
          editor: editorOf(view.revision?.document),
        };
      }
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // Proxies must pass every line on at once.
      'x-accel-buffering': 'no',
    });
    const emit = (event: AssistantChatEvent) => {
      if (!reply.raw.writableEnded) reply.raw.write(`${JSON.stringify(event)}\n`);
    };
    // Keeps proxies from closing a connection that waits for the provider.
    const ping = setInterval(() => emit({ type: 'ping' }), 10_000);
    try {
      await this.chat.answer(
        site.id,
        ctx,
        { name: auth.displayName, locale: auth.locale },
        input.messages as AssistantChatMessage[],
        emit,
        entry,
      );
    } catch (error) {
      request.log.error(error, 'Admin chat failed');
      emit({ type: 'error', message: 'The chat failed on the server. Try again later.' });
    } finally {
      clearInterval(ping);
      reply.raw.end();
    }
  }
}
