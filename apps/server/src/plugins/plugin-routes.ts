import type { RouteRequest, RouteResponse, UploadedFile } from '@cleitext/plugin-sdk';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assertTokenAllowed, verifyCsrf, verifySameOrigin } from '../auth/auth.guard.js';
import { PluginHost, type LoadedPlugin } from './plugin-host.service.js';
import { referralCookies } from './conversions.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Request as plugin handlers see it. */
export function routeRequest(
  request: FastifyRequest,
  siteId: string,
  path: string,
  params: Record<string, string>,
  options: {
    anonymous?: boolean;
    plugin?: string;
    locale?: string;
    /** The uploaded file, already received (`readUpload`). */
    upload?: UploadedFile | null;
  } = {},
): RouteRequest {
  const url = new URL(request.url, 'http://local');
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (name === 'cookie' || name === 'authorization') continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  const auth = options.anonymous ? null : request.auth;
  const raw = (request as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
  return {
    siteId,
    method: request.method,
    path,
    params,
    query: Object.fromEntries(url.searchParams),
    queryAll: [...url.searchParams].reduce<Record<string, string[]>>((all, [key, value]) => {
      (all[key] ??= []).push(value);
      return all;
    }, {}),
    body: request.body ?? null,
    rawBody: raw === undefined ? null : Buffer.isBuffer(raw) ? raw : Buffer.from(raw),
    ip: request.ip,
    user: auth
      ? { id: auth.userId, displayName: auth.displayName, capabilities: [...auth.capabilities] }
      : null,
    headers,
    cookies: pluginCookies(request, options.plugin),
    // Referral codes kept with the visitor's consent (plugin API 1.58).
    referrals: referralCookies(request.cookies ?? {}),
    origin: `${request.protocol}://${request.host}`,
    locale: options.locale ?? '',
    async file() {
      if (options.upload !== undefined) return options.upload;
      return readUpload(request);
    },
  };
}

/**
 * The `file` part of a multipart request, received whole, with the text
 * fields of the form (plugin API 1.56); null when there is no such file.
 */
export async function readUpload(request: FastifyRequest): Promise<UploadedFile | null> {
  if (!request.isMultipart()) return null;
  let upload: UploadedFile | null = null;
  const fields: Record<string, string> = {};
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const data = await part.toBuffer();
        if (part.fieldname === 'file' && !upload) {
          upload = { filename: part.filename, mime: part.mimetype, data };
        }
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'FST_FILES_LIMIT' || code === 'FST_FIELDS_LIMIT' || code === 'FST_PARTS_LIMIT') {
      throw new HttpException('Too many parts in the form.', HttpStatus.BAD_REQUEST);
    }
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new HttpException('The file is too large.', HttpStatus.PAYLOAD_TOO_LARGE);
    }
    throw error;
  }
  if (!upload) return null;
  return Object.keys(fields).length ? { ...upload, fields } : upload;
}

/** A plugin's own cookies: named `<slug>_…` (never the session or another plugin's). */
function pluginCookies(
  request: FastifyRequest,
  plugin: string | undefined,
): Record<string, string> {
  if (!plugin) return {};
  const prefix = `${plugin.replace(/-/g, '_')}_`;
  return Object.fromEntries(
    Object.entries(request.cookies ?? {}).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith(prefix) && typeof entry[1] === 'string',
    ),
  );
}

/** Cookies a plugin sets: its own names only, HTTP-only, Lax, secure on HTTPS. */
export function setPluginCookies(
  request: FastifyRequest,
  reply: FastifyReply,
  plugin: string,
  cookies: RouteResponse['cookies'],
): void {
  const prefix = `${plugin.replace(/-/g, '_')}_`;
  for (const cookie of cookies ?? []) {
    if (!cookie.name.startsWith(prefix) || !/^[A-Za-z0-9_-]{1,64}$/.test(cookie.name)) {
      throw new Error(`Plugins can only set cookies named "${prefix}…" (got "${cookie.name}")`);
    }
    void reply.setCookie(cookie.name, cookie.value.slice(0, 2048), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: request.protocol === 'https',
      ...(cookie.maxAge !== undefined ? { maxAge: Math.max(0, Math.floor(cookie.maxAge)) } : {}),
    });
  }
}

/** Sends a plugin handler result: a string or a Buffer as is, anything else as JSON. */
export async function sendRouteResponse(reply: FastifyReply, result: RouteResponse): Promise<void> {
  for (const [name, value] of Object.entries(result.headers ?? {})) void reply.header(name, value);
  const status = result.status ?? (result.body === undefined ? 204 : 200);
  if (typeof result.body === 'string') {
    await reply
      .code(status)
      .type(result.contentType ?? 'text/plain; charset=utf-8')
      .send(result.body);
  } else if (Buffer.isBuffer(result.body)) {
    await reply
      .code(status)
      .type(result.contentType ?? 'application/octet-stream')
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

      if (route.webhook) {
        // Other servers: the handler checks who is calling.
      } else if (route.public) {
        if (!SAFE_METHODS.has(request.method)) verifySameOrigin(request);
      } else {
        if (request.auth?.apiToken) assertTokenAllowed(request);
        else if (!SAFE_METHODS.has(request.method)) verifyCsrf(request);
        if (!request.auth) return problem(reply, 401, 'Unauthorized', 'Sign in to continue.');
        if (route.capability && !request.auth.capabilities.includes(route.capability)) {
          return problem(reply, 403, 'Forbidden', 'You are not allowed to do this.');
        }
      }
      // An upload is received before the handler's time starts (core 0.82): a
      // large file on a slow connection takes longer than plugin code may.
      const upload = request.isMultipart() ? await readUpload(request) : undefined;
      const outcome = await this.host.runHook(
        { plugin: slug, name: `${request.method} ${route.path}`, siteId: site.id },
        () =>
          route.handler(
            routeRequest(request, site.id, path, params, {
              anonymous: route.webhook === true,
              plugin: plugin.slug,
              ...(upload !== undefined ? { upload } : {}),
            }),
          ),
      );
      if (!outcome.ok) return problem(reply, 500, 'Internal Server Error');
      if (!route.webhook) setPluginCookies(request, reply, slug, outcome.value.cookies);
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
