import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ADMIN_PATH } from '@cleitext/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withContext, type DatabaseClient } from '@cleitext/db';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { IdentityService } from './auth/identity.service.js';
import { SessionService } from './auth/session.service.js';
import { ApiTokenService } from './auth/api-token.service.js';
import type { AppConfig } from './config/config.js';
import { fastifyTrustProxy } from './config/trust-proxy.js';
import { WebFontsService } from './public/web-fonts.service.js';
import { PublicService } from './public/public.service.js';
import { renamedMediaAddress } from './public/imported-media.js';
import { DATABASE } from './database/database.module.js';
import { createRequestHook } from './tenancy/request-hook.js';
import { SiteResolverService } from './tenancy/site-resolver.service.js';
import { LanguagesService } from './content/languages.service.js';
import { PageCacheService } from './public/page-cache.service.js';
import { PluginHost } from './plugins/plugin-host.service.js';
import { InstallReportService } from './catalog/install-report.service.js';
import { PluginRoutes } from './plugins/plugin-routes.js';
import { adminCsp, inlineScriptHashes, securityHeaders } from './common/security-headers.js';
import { servePluginAsset } from './plugins/plugin-assets.js';

/** Builds the application without listening, so tests can use `inject()`. */
export async function createApp(config: AppConfig): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ trustProxy: fastifyTrustProxy(config.trustProxy) });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(config), adapter, {
    bufferLogs: true,
    // Kept for plugin webhook routes, which check signatures over the body.
    rawBody: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1', {
    exclude: [
      'health/live',
      'health/ready',
      // MCP and the OAuth endpoints AI assistants discover from it (RF-AI-01/02).
      'mcp',
      'oauth/register',
      'oauth/authorize',
      'oauth/token',
      '.well-known/oauth-protected-resource',
      '.well-known/oauth-protected-resource/mcp',
      '.well-known/oauth-authorization-server',
    ],
  });

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.media.maxBytes, files: 1, fields: 5 },
  });
  // Uploaded files. In production nginx serves /media directly (§18.1);
  // the request hook still restricts each site to its own folder.
  await mkdir(config.media.path, { recursive: true });
  const database = app.get<DatabaseClient>(DATABASE);
  await app.register(
    async (scope: FastifyInstance) => {
      // A file that is not there: if `media:rename-imported` gave it another
      // name (core 0.86), 301 to the new address; else 404 as before.
      scope.setNotFoundHandler(async (request, reply) => {
        const site = request.site;
        const moved =
          site && (request.method === 'GET' || request.method === 'HEAD')
            ? await withContext(database.db, { siteId: site.id }, (tx) =>
                renamedMediaAddress(tx, site.id, request.url),
              )
            : null;
        if (moved) {
          return reply.header('cache-control', 'public, max-age=3600').redirect(moved, 301);
        }
        return reply
          .code(404)
          .type('application/problem+json')
          .send({ title: 'Not Found', status: 404 });
      });
      await scope.register(fastifyStatic, {
        root: config.media.path,
        prefix: '/',
        decorateReply: false,
        index: false,
        dotfiles: 'deny',
        maxAge: '365d',
        immutable: true,
        // Opened directly, an SVG cannot run anything or load other resources.
        setHeaders: (res, file) => {
          if (/\.svg$/i.test(file)) {
            void res.header(
              'content-security-policy',
              "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            );
          }
        },
      });
    },
    { prefix: '/media' },
  );
  // The built admin (production): hashed assets cached for a year, and the
  // single-page app answering every other address under ADMIN_PATH (/cl-admin).
  if (config.admin.path) {
    await app.register(fastifyStatic, {
      root: join(config.admin.path, 'assets'),
      prefix: `${ADMIN_PATH}/assets/`,
      decorateReply: false,
      index: false,
      maxAge: '365d',
      immutable: true,
    });
    // The Cleitext logo files (apps/admin/public/brand), e.g. /cl-admin/brand/logo.svg.
    if (existsSync(join(config.admin.path, 'brand'))) {
      await app.register(fastifyStatic, {
        root: join(config.admin.path, 'brand'),
        prefix: `${ADMIN_PATH}/brand/`,
        decorateReply: false,
        index: false,
        maxAge: '1d',
      });
    }
    const indexHtml = await readFile(join(config.admin.path, 'index.html'), 'utf8');
    const hashes = inlineScriptHashes(indexHtml);
    const csp = adminCsp(hashes);
    const plugins = app.get(PluginHost);
    /** A plugin's sign-in challenge adds its own origins (plugin API 1.38), and only those. */
    const cspFor = async (request: FastifyRequest): Promise<string> => {
      if (!request.site) return csp;
      try {
        const extra = await plugins.formSources(request.site.id);
        return extra.script.length || extra.frame.length ? adminCsp(hashes, extra) : csp;
      } catch {
        return csp;
      }
    };
    const sendAdmin = async (request: FastifyRequest, reply: FastifyReply) =>
      reply
        .header('cache-control', 'no-cache')
        .header('content-security-policy', await cspFor(request))
        .header('cross-origin-opener-policy', 'same-origin')
        .header('x-frame-options', 'DENY')
        .header('x-content-type-options', 'nosniff')
        .header('referrer-policy', 'same-origin')
        .type('text/html; charset=utf-8')
        .send(indexHtml);
    const instance = app.getHttpAdapter().getInstance();
    instance.get(ADMIN_PATH, sendAdmin);
    instance.get(`${ADMIN_PATH}/*`, sendAdmin);
  }

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (request, reply, payload) => {
      securityHeaders(request, reply);
      return payload;
    });

  app
    .getHttpAdapter()
    .getInstance()
    .addHook(
      'onRequest',
      createRequestHook({
        sites: app.get(SiteResolverService),
        languages: app.get(LanguagesService),
        sessions: app.get(SessionService),
        identity: app.get(IdentityService),
        apiTokens: app.get(ApiTokenService),
        reports: app.get(InstallReportService),
      }),
    );

  // Status or domain changes made by the CLI reach every process.
  app.get(PageCacheService).onSiteChange(() => app.get(SiteResolverService).invalidate());

  // (Url-encoded form bodies, posted to plugin routes, are parsed by NestJS.)
  const fastify = app.getHttpAdapter().getInstance();

  // Plugins (docs/ARCHITECTURE.md §11): loaded before serving requests.
  await app.get(PluginHost).load();
  const pluginRoutes = app.get(PluginRoutes);
  fastify.all('/api/v1/ext/:plugin/*', (request, reply) => pluginRoutes.handleApi(request, reply));
  fastify.get('/admin-plugins/:slug/:version/*', (request, reply) =>
    servePluginAsset(app.get(PluginHost), request, reply),
  );
  fastify.get('/plugin-assets/:slug/:version/*', (request, reply) =>
    servePluginAsset(app.get(PluginHost), request, reply, 'public'),
  );

  // Web fonts kept on the site (Settings → Privacy): names change with the content.
  const webFonts = app.get(WebFontsService);
  fastify.get('/_fonts/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    const found = request.site ? await webFonts.file(request.site.id, file) : null;
    if (!found) return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    return reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('access-control-allow-origin', '*')
      .type(found.mime)
      .send(Buffer.from(found.bytes.buffer, found.bytes.byteOffset, found.bytes.byteLength));
  });

  // Public site: every other GET/HEAD (docs/ARCHITECTURE.md §12).
  const publicService = app.get(PublicService);
  fastify.post('/*', (request, reply) => publicService.handlePost(request, reply));
  app
    .getHttpAdapter()
    .getInstance()
    .get('/*', (request, reply) => {
      if (
        request.url.startsWith('/api/') ||
        request.url.startsWith('/admin-plugins/') ||
        request.url === ADMIN_PATH ||
        request.url.startsWith(`${ADMIN_PATH}/`) ||
        request.url.startsWith(`${ADMIN_PATH}?`)
      ) {
        return reply.callNotFound();
      }
      return publicService.handle(request, reply);
    });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
