import {
  roleRequestSchema,
  updateRoleRequestSchema,
  type CapabilityCatalog,
  type RoleView,
} from '@cleitext/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { RolesService } from './roles.service.js';

const uuid = new ParseUUIDPipe();

/** Roles (docs/SPECIFICATIONS.md §6.4, RF-USR-06). */
@Controller('roles')
@RequireCapability('manage_users')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext): Promise<RoleView[]> {
    return this.roles.list(site.id, auth);
  }

  @Get('capabilities')
  capabilities(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<CapabilityCatalog> {
    return this.roles.catalog(site.id, auth.locale);
  }

  @Post()
  @RequireCapability('manage_users', 'promote_users')
  create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<RoleView> {
    return this.roles.create(site.id, auth, parseBody(roleRequestSchema, body), request.ip);
  }

  @Patch(':id')
  @RequireCapability('manage_users', 'promote_users')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<RoleView> {
    return this.roles.update(
      site.id,
      auth,
      id,
      parseBody(updateRoleRequestSchema, body),
      request.ip,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireCapability('manage_users', 'promote_users')
  remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.roles.remove(site.id, auth, id, request.ip);
  }
}
