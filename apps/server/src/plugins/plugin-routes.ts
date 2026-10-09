import type { RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyCsrf, verifySameOrigin } from '../auth/auth.guard.js';
import { PluginHost, type LoadedPlugin } from './plugin-host.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Request as plugin handlers see it. */
export function routeRequest(
  request: FastifyRequest,
  siteId: string,
  path: string,
  params: Record<string, string>,
): RouteRequest {
  const url = new URL(request.url, 'http://local');
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (name === 'cookie' || name === 'authorization') continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  const auth = request.auth;
  return {
    siteId,
    method: request.method,
    path,
    params,
    query: Object.fromEntries(url.searchParams),
    body: request.body ?? null,
    ip: request.ip,
    user: auth
      ? { id: auth.userId, displayName: auth.displayName, capabilities: [...auth.capabilities] }
      : null,
    headers,
  };
}

/** Sends a plugin handler result: a string as is, anything else as JSON. */
export async function sendRouteResponse(reply: FastifyReply, result: RouteResponse): Promise<void> {
  for (const [name, value] of Object.entries(result.headers ?? {})) void reply.header(name, value);
  const status = result.status ?? (result.body === undefined ? 204 : 200);
  if (typeof result.body === 'string') {
    await reply
      .code(status)
      .type(result.contentType ?? 'text/plain; charset=utf-8')
      .send(result.body);
  } else if (result.body === undefined) {
    await reply.code(status).send();
  } else {
    await reply
      .code(status)
      .type(result.contentType ?? 'application/json; charset=utf-8')
      .send(JSON.stringify(result.body));
  }
}

/**
 * REST endpoints of plugins, under `/api/v1/ext/<slug>/…` (docs/ARCHITECTURE.md
 * §11.4). Same rules as the core API: session, capabilities and CSRF.
 */
@Injectable()
export class PluginRoutes {
  private readonly logger = new Logger('PluginRoutes');

  constructor(private readonly host: PluginHost) {}

  async handleApi(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const site = request.site;
      const { plugin: slug } = request.params as { plugin: string };
      const path = `/${(request.params as Record<string, string>)['*'] ?? ''}`.replace(/\?.*$/, '');
      const active = site ? await this.host.activeSlugs(site.id) : new Set<string>();
      const plugin = this.host.get(slug);
      if (!site || !plugin || !active.has(slug)) return problem(reply, 404, 'Not Found');
      const match = this.find(plugin, request.method === 'HEAD' ? 'GET' : request.method, path);
      if (!match) return problem(reply, 404, 'Not Found');
      const { route, params } = match;

      if (route.public) {
        if (!SAFE_METHODS.has(request.method)) verifySameOrigin(request);
      } else {
        if (!SAFE_METHODS.has(request.method)) verifyCsrf(request);
        if (!request.auth) return problem(reply, 401, 'Unauthorized', 'Sign in to continue.');
        if (route.capability && !request.auth.capabilities.includes(route.capability)) {
          return problem(reply, 403, 'Forbidden', 'You are not allowed to do this.');
        }
      }
      const outcome = await this.host.runHook(
        { plugin: slug, name: `${request.method} ${route.path}` },
        () => route.handler(routeRequest(request, site.id, path, params)),
      );
      if (!outcome.ok) return problem(reply, 500, 'Internal Server Error');
      await sendRouteResponse(reply, outcome.value);
    } catch (error) {
      if (error instanceof HttpException) {
        return problem(
          reply,
          error.getStatus(),
          error.name.replace(/Exception$/, ''),
          error.message,
        );
      }
      this.logger.error(error);
      return problem(reply, 500, 'Internal Server Error');
    }
  }

  private find(plugin: LoadedPlugin, method: string, path: string) {
    for (const route of plugin.apiRoutes) {
      if (route.method !== method) continue;
      const params = route.compiled.match(path);
      if (params) return { route, params };
    }
    return null;
  }
}

async function problem(
  reply: FastifyReply,
  status: number,
  title: string,
  detail?: string,
): Promise<void> {
  await reply
    .code(status)
    .type('application/problem+json')
    .send({ title, status, ...(detail ? { detail } : {}) });
}
