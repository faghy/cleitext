import {
  aiProviderRequestSchema,
  assistantChatRequestSchema,
  CSRF_HEADER,
  type AiProviderView,
  type AssistantChatEvent,
  type AssistantChatMessage,
} from '@cleitext/shared';
import {
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
import { ChatService } from './chat.service.js';
import { siteOrigin } from './origin.js';

/** Admin → AI assistants → Chat (RF-AI-03), and its AI provider. */
@Controller('assistants')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly adapter: HttpAdapterHost,
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
    if (auth.apiToken) throw new ForbiddenException('The chat is for the admin: use MCP instead.');
    const input = parseBody(assistantChatRequestSchema, body);
    const scopes = ['read', 'write'];
    if (input.publish && auth.capabilities.includes('publish_entries')) scopes.push('publish');
    const credentials: Record<string, string> = { origin: siteOrigin(request) };
    for (const name of ['cookie', CSRF_HEADER]) {
      const value = request.headers[name];
      if (typeof value === 'string') credentials[name] = value;
    }
    const ctx = apiContext(
      this.adapter.httpAdapter.getInstance<FastifyInstance>(),
      request,
      credentials,
      scopes,
    );

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
