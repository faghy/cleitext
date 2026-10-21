import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { siteOrigin } from './origin.js';
import type { PluginHost } from '../plugins/plugin-host.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import { siteAi } from './site-ai.js';
import type { ApiResult, ToolContext } from './tools.js';

/**
 * The REST API of the site for the tools, called as the person behind
 * `request`: `credentials` are the headers that authenticate them (a bearer
 * token for MCP, the session cookie and CSRF header for the admin chat).
 */
export function apiContext(
  fastify: FastifyInstance,
  request: FastifyRequest,
  credentials: Record<string, string>,
  scopes: string[],
  services: { plugins: PluginHost; settings: SettingsService },
): ToolContext {
  const forwarded = (name: string) => {
    const value = request.headers[name];
    return typeof value === 'string' ? { [name]: value } : {};
  };
  const headers = {
    host: request.headers.host ?? request.host,
    ...credentials,
    ...forwarded('x-forwarded-proto'),
    ...forwarded('x-forwarded-for'),
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
      // The address that connected, with the forwarded headers above: the
      // request resolves the visitor's address and scheme as this one did.
      remoteAddress: request.raw.socket?.remoteAddress ?? request.ip,
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
  const api: ToolContext['api'] = (method, path, body) =>
    send(
      method,
      path,
      body === undefined ? undefined : JSON.stringify(body),
      body === undefined ? undefined : 'application/json',
    );
  return {
    origin: siteOrigin(request),
    scopes,
    api,
    ai: siteAi(services.plugins, services.settings, {
      siteId: request.site!.id,
      userId: request.auth!.userId,
      capabilities: request.auth!.capabilities,
      api,
    }),
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
