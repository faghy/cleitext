import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { withContext, type DatabaseClient } from '@cleitext/db';
import { Controller, Delete, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { NoCsrf, Public } from '../common/decorators.js';
import { DATABASE } from '../database/database.module.js';
import { appRoot } from '../install/token.js';
import { SettingsService } from '../settings/settings.service.js';
import { ToolError } from './errors.js';
import { allowed, toolList, TOOLS, type ApiResult, type ToolContext } from './tools.js';

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

const INSTRUCTIONS = `You are connected to a Cleitext site, a CMS with a block editor like WordPress.
Start with get_site, then read get_block_guide before writing: pages and posts are made of
blocks, and the theme has its own sections and patterns. Everything you create is a draft:
share the preview link, and publish only when the user asks. People edit your work in the
block editor afterwards, so keep it made of blocks, in the language of each entry.`;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export function siteOrigin(request: FastifyRequest): string {
  return `${request.protocol}://${request.host}`;
}

@Controller('mcp')
@Public()
@NoCsrf()
export class McpController {
  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly settings: SettingsService,
    @Inject(DATABASE) private readonly database: DatabaseClient,
  ) {}

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

  /** No server-initiated stream: every answer comes with its request. */
  @Get()
  get(@Res() reply: FastifyReply) {
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
          serverInfo: { name: 'cleitext', title: 'Cleitext', version: VERSION },
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, { tools: toolList(scopes) });
      case 'tools/call': {
        const name = String(message.params?.name ?? '');
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
        if (!allowed(tool, scopes)) {
          return rpcResult(
            id,
            toolText(
              `This connection may not use ${name}: it needs the "${tool.scope}" permission.`,
              true,
            ),
          );
        }
        const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          const data = await tool.run(this.context(request), args);
          return rpcResult(
            id,
            toolText(typeof data === 'string' ? data : JSON.stringify(data, null, 2)),
          );
        } catch (error) {
          if (error instanceof ToolError) return rpcResult(id, toolText(error.message, true));
          request.log.error(error, `MCP tool ${name} failed`);
          return rpcResult(id, toolText('The tool failed on the server. Try again later.', true));
        }
      }
      case 'resources/list':
        return rpcResult(id, { resources: [] });
      case 'prompts/list':
        return rpcResult(id, { prompts: [] });
      default:
        return rpcError(id, -32601, `Method not found: ${message.method}`);
    }
  }

  /** Calls to the REST API of the site, as the connected user (same token, same host). */
  private context(request: FastifyRequest): ToolContext {
    const fastify = this.adapter.httpAdapter.getInstance<FastifyInstance>();
    const headers = {
      host: request.headers.host ?? request.host,
      authorization: request.headers.authorization!,
      ...(request.headers['x-forwarded-proto']
        ? { 'x-forwarded-proto': request.headers['x-forwarded-proto'] }
        : {}),
      ...(request.headers['x-forwarded-for']
        ? { 'x-forwarded-for': request.headers['x-forwarded-for'] }
        : {}),
    };
    const send = async (
      method: string,
      path: string,
      payload: string | Buffer | undefined,
      type?: string,
    ) => {
      const response = await fastify.inject({
        method: method as 'GET',
        url: `/api/v1${path}`,
        headers: { ...headers, ...(type ? { 'content-type': type } : {}) },
        remoteAddress: request.ip,
        ...(payload !== undefined ? { payload } : {}),
      });
      let data: unknown;
      try {
        data = response.body ? JSON.parse(response.body) : null;
      } catch {
        data = response.body;
      }
      return { status: response.statusCode, data } satisfies ApiResult;
    };
    return {
      origin: siteOrigin(request),
      scopes: request.auth!.apiToken!.scopes,
      api: (method, path, body) =>
        send(
          method,
          path,
          body === undefined ? undefined : JSON.stringify(body),
          body === undefined ? undefined : 'application/json',
        ),
      upload: (filename, data) => {
        const boundary = `cleitext${randomBytes(12).toString('hex')}`;
        const safeName = filename.replace(/["\r\n]/g, '');
        const payload = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
          ),
          data,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        return send('POST', '/media', payload, `multipart/form-data; boundary=${boundary}`);
      },
    };
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
