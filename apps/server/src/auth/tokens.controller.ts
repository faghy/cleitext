import { withContext, type DatabaseClient } from '@cleitext/db';
import { createApiTokenRequestSchema, type ApiTokenView } from '@cleitext/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth, CurrentSite } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { ApiTokenService } from './api-token.service.js';

/** API tokens (docs/SPECIFICATIONS.md §6.4, RF-USR-08). */
@Controller('tokens')
export class TokensController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly tokens: ApiTokenService,
    private readonly audit: AuditService,
  ) {}

  /** The user's tokens; `?all=1` lists every token of the site (`manage_users`). */
  @Get()
  list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query('all') all: string | undefined,
  ): Promise<ApiTokenView[]> {
    return this.tokens.list(site.id, auth, all === '1' || all === 'true');
  }

  /** The plain token is in the response only this once. */
  @Post()
  async create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ token: string; view: ApiTokenView }> {
    const input = parseBody(createApiTokenRequestSchema, body);
    const created = await this.tokens.create(site.id, auth, input);
    await this.record(site, auth, 'token.created', created.view.id, request.ip, {
      name: created.view.name,
      scopes: created.view.scopes,
    });
    return created;
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.tokens.revoke(site.id, auth, id);
    await this.record(site, auth, 'token.revoked', id, request.ip);
  }

  private record(
    site: SiteContext,
    auth: AuthContext,
    action: string,
    targetId: string,
    ip: string,
    meta?: Record<string, unknown>,
  ) {
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, (tx) =>
      this.audit.record(tx, {
        siteId: site.id,
        userId: auth.userId,
        action,
        targetType: 'token',
        targetId,
        ...(meta ? { meta } : {}),
        ip,
      }),
    );
  }
}
