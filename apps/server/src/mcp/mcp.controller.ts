import { adminUrl } from '@cleitext/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withContext, type DatabaseClient } from '@cleitext/db';
import { Controller, Delete, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { NoCsrf, Public } from '../common/decorators.js';
import { DATABASE } from '../database/database.module.js';
import { appRoot } from '../install/token.js';
import { SettingsService } from '../settings/settings.service.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { apiContext } from './api-context.js';
import { siteOrigin } from './origin.js';
import { callTool, MCP_INSTRUCTIONS, siteTools, toolList, TOOLS } from './tools.js';

/**
 * MCP server of a site (RF-AI-01): `POST /mcp`, JSON-RPC over the stateless
 * Streamable HTTP transport. Assistants authenticate with an API token or an
 * OAuth access token (an API token too); the site turns it on in Settings.
 */

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const VERSION = (() => {
  try {
    return (
      JSON.parse(readFileSync(join(appRoot(), 'package.json'), 'utf8')) as { version: string }
    ).version;
  } catch {
    return 'dev';
  }
})();

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

@Controller('mcp')
@Public()
@NoCsrf()
export class McpController {
  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly settings: SettingsService,
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
  ) {}

  /** The tools' access to the site, as the token's owner. */
  private toolContext(request: FastifyRequest, scopes: string[]) {
    return apiContext(
      this.adapter.httpAdapter.getInstance<FastifyInstance>(),
      request,
      { authorization: request.headers.authorization! },
      scopes,
      { plugins: this.plugins, settings: this.settings },
    );
  }

  /** MCP is off unless the site turned it on (Settings → AI assistants). */
  async enabled(siteId: string): Promise<boolean> {
    const core = await withContext(this.database.db, { siteId }, (tx) => this.settings.core(tx));
    return core.mcp === true;
  }

  @Post()
  async post(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (!request.site || !(await this.enabled(request.site.id))) {
      return reply
        .code(404)
        .type('application/json')
        .send({ error: 'MCP is not enabled on this site.' });
    }
    // DNS rebinding: browsers send Origin; it must be this site.
    const origin = request.headers.origin;
    if (origin && safeHost(origin) !== request.host) {
      return reply.code(403).type('application/json').send({ error: 'Origin not allowed.' });
    }
    if (!request.auth?.apiToken) {
      return reply
        .code(401)
        .header(
          'www-authenticate',
          `Bearer resource_metadata="${siteOrigin(request)}/.well-known/oauth-protected-resource"`,
        )
        .type('application/json')
        .send({ error: 'Connect your account: an access token is required.' });
    }

    const body = request.body as JsonRpcMessage | JsonRpcMessage[] | undefined;
    const messages = Array.isArray(body) ? body : body ? [body] : [];
    if (messages.length === 0) {
      return reply
        .code(400)
        .type('application/json')
        .send(rpcError(null, -32700, 'Parse error'));
    }
    const answers: unknown[] = [];
    for (const message of messages) {
      const answer = await this.handle(request, message);
      if (answer) answers.push(answer);
    }
    if (answers.length === 0) return reply.code(202).send();
    return reply
      .code(200)
      .type('application/json')
      .send(Array.isArray(body) ? answers : answers[0]);
  }

  /**
   * No server-initiated stream: every answer comes with its request. Someone
   * opening the address in a browser lands on Admin → Chriss.
   */
  @Get()
  get(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (/text\/html/.test(request.headers.accept ?? '')) {
      return reply.redirect(adminUrl('/assistants'), 302);
    }
    return reply.code(405).header('allow', 'POST').send();
  }

  @Delete()
  remove(@Res() reply: FastifyReply) {
    return reply.code(405).header('allow', 'POST').send();
  }

  private async handle(request: FastifyRequest, message: JsonRpcMessage) {
    const id = message.id;
    const isNotification = id === undefined || id === null;
    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return isNotification ? null : rpcError(id ?? null, -32600, 'Invalid request');
    }
    if (isNotification) return null;
    const scopes = request.auth!.apiToken!.scopes;
    switch (message.method) {
      case 'initialize': {
        const asked = String(message.params?.protocolVersion ?? '');
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'cleitext', title: 'Cleitext (Chriss)', version: VERSION },
          instructions: MCP_INSTRUCTIONS,
        });
      }
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list': {
        const tools = await siteTools(this.toolContext(request, scopes)).catch((error: unknown) => {
          request.log.error(error, 'MCP plugin tools failed');
          return TOOLS;
        });
        return rpcResult(id, { tools: toolList(scopes, tools) });
      }
      case 'tools/call': {
        const name = String(message.params?.name ?? '');
        const ctx = this.toolContext(request, scopes);
        if (!TOOLS.some((t) => t.name === name)) {
          const tools = await siteTools(ctx).catch(() => TOOLS);
          if (!tools.some((t) => t.name === name)) {
            return rpcError(id, -32602, `Unknown tool: ${name}`);
          }
        }
        const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
        const result = await callTool(ctx, name, args, (error) =>
          request.log.error(error, `MCP tool ${name} failed`),
        );
        return rpcResult(id, toolText(result.text, result.isError));
      }
      case 'resources/list':
        return rpcResult(id, { resources: [] });
      case 'prompts/list':
        return rpcResult(id, { prompts: [] });
      default:
        return rpcError(id, -32601, `Method not found: ${message.method}`);
    }
  }
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

function toolText(text: string, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
