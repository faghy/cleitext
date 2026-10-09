import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdir } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { IdentityService } from './auth/identity.service.js';
import { SessionService } from './auth/session.service.js';
import type { AppConfig } from './config/config.js';
import { createRequestHook } from './tenancy/request-hook.js';
import { SiteResolverService } from './tenancy/site-resolver.service.js';

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
      }),
    );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
