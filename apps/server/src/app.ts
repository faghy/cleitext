import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { FastifyReply } from 'fastify';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { IdentityService } from './auth/identity.service.js';
import { SessionService } from './auth/session.service.js';
import { ApiTokenService } from './auth/api-token.service.js';
import type { AppConfig } from './config/config.js';
import { PublicService } from './public/public.service.js';
import { createRequestHook } from './tenancy/request-hook.js';
import { SiteResolverService } from './tenancy/site-resolver.service.js';
import { PageCacheService } from './public/page-cache.service.js';
import { PluginHost } from './plugins/plugin-host.service.js';
import { PluginRoutes } from './plugins/plugin-routes.js';
import { adminCsp, inlineScriptHashes, securityHeaders } from './common/security-headers.js';
import { servePluginAsset } from './plugins/plugin-assets.js';

/** Builds the application without listening, so tests can use `inject()`. */
export async function createApp(config: AppConfig): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ trustProxy: config.trustProxy });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(config), adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.media.maxBytes, files: 1, fields: 5 },
  });
  // Uploaded files. In production nginx serves /media directly (§18.1);
  // the request hook still restricts each site to its own folder.
  await mkdir(config.media.path, { recursive: true });
  await app.register(fastifyStatic, {
    root: config.media.path,
    prefix: '/media/',
    decorateReply: false,
    index: false,
    dotfiles: 'deny',
    maxAge: '365d',
    immutable: true,
    // Opened directly, an SVG cannot run anything or load other resources.
    setHeaders: (res, file) => {
      if (file.endsWith('.svg')) {
        void res.header(
          'content-security-policy',
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        );
      }
    },
  });
  // The built admin (production): hashed assets cached for a year, and the
  // single-page app answering every other /admin address.
  if (config.admin.path) {
    await app.register(fastifyStatic, {
      root: join(config.admin.path, 'assets'),
      prefix: '/admin/assets/',
      decorateReply: false,
      index: false,
      maxAge: '365d',
      immutable: true,
    });
    const indexHtml = await readFile(join(config.admin.path, 'index.html'), 'utf8');
    const csp = adminCsp(inlineScriptHashes(indexHtml));
    const sendAdmin = (_request: unknown, reply: FastifyReply) =>
      reply
        .header('cache-control', 'no-cache')
        .header('content-security-policy', csp)
        .header('cross-origin-opener-policy', 'same-origin')
        .header('x-frame-options', 'DENY')
        .header('x-content-type-options', 'nosniff')
        .header('referrer-policy', 'same-origin')
        .type('text/html; charset=utf-8')
        .send(indexHtml);
    const instance = app.getHttpAdapter().getInstance();
    instance.get('/admin', sendAdmin);
    instance.get('/admin/*', sendAdmin);
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
        sessions: app.get(SessionService),
        identity: app.get(IdentityService),
        apiTokens: app.get(ApiTokenService),
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

  // Public site: every other GET/HEAD (docs/ARCHITECTURE.md §12).
  const publicService = app.get(PublicService);
  fastify.post('/*', (request, reply) => publicService.handlePost(request, reply));
  app
    .getHttpAdapter()
    .getInstance()
    .get('/*', (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/admin')) {
        return reply.callNotFound();
      }
      return publicService.handle(request, reply);
    });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
