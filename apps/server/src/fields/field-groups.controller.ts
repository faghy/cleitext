import type { DynamicSourceInfo } from '@cleitext/plugin-sdk';
import type { FieldGroupInput, FieldObject, FieldScreenView } from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DynamicSourcesService } from './dynamic-sources.service.js';
import { FieldGroupsService } from './field-groups.service.js';
import { UserFieldsService } from './user-fields.service.js';
import type { UserFieldsView } from '@cleitext/shared';

const OBJECTS = new Set<FieldObject>(['entry', 'term', 'user']);
const valuesSchema = z.object({ fields: z.record(z.string(), z.unknown()) });

/**
 * Custom fields (plugin API 1.47): the field groups of the site's owners
 * (`/field-groups`, no visual builder in the core), the groups each admin
 * screen shows with their rules (`/field-screens/<object>`), user fields,
 * and the dynamic data sources.
 */
@Controller()
export class FieldGroupsController {
  constructor(
    private readonly groups: FieldGroupsService,
    private readonly userFields: UserFieldsService,
    private readonly dynamic: DynamicSourcesService,
  ) {}

  @Get('field-groups')
  @RequireCapability('manage_content_types')
  list(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext) {
    return this.groups.listSite(site.id, auth.userId);
  }

  @Post('field-groups')
  @RequireCapability('manage_content_types')
  create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<FieldGroupInput> {
    return this.groups.saveSite(site.id, body, { auth, ip: request.ip, create: true });
  }

  @Get('field-groups/:id')
  @RequireCapability('manage_content_types')
  get(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<FieldGroupInput> {
    return this.groups.getSite(site.id, id, auth.userId);
  }

  /** Replaces (or adds) the group with this id. */
  @Put('field-groups/:id')
  @RequireCapability('manage_content_types')
  save(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<FieldGroupInput> {
    const group = { ...(body && typeof body === 'object' ? body : {}), id };
    return this.groups.saveSite(site.id, group, { auth, ip: request.ip });
  }

  @Delete('field-groups/:id')
  @HttpCode(204)
  @RequireCapability('manage_content_types')
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.groups.removeSite(site.id, id, { auth, ip: request.ip });
  }

  /**
   * Every group an admin screen may show (`entry`, `term`, `user`), with its
   * rules: the editor shows those that match, live, as the entry changes.
   */
  @Get('field-screens/:object')
  async screen(
    @CurrentSite() site: SiteContext,
    @Param('object') object: string,
  ): Promise<FieldScreenView> {
    if (!OBJECTS.has(object as FieldObject)) throw new BadRequestException('Unknown screen.');
    const [groups, templates] = await Promise.all([
      this.groups.groups(site.id, object as FieldObject),
      object === 'entry' ? this.groups.pageTemplates(site.id) : Promise.resolve([]),
    ]);
    return { groups, templates };
  }

  /** A member's user fields, as an administrator edits them. */
  @Get('users/:id/fields')
  @RequireCapability('manage_users')
  memberFields(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserFieldsView> {
    return this.userFields.get(site.id, auth, id, 'edit');
  }

  @Put('users/:id/fields')
  @RequireCapability('manage_users', 'promote_users')
  saveMemberFields(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<UserFieldsView> {
    return this.userFields.save(site.id, auth, id, parseBody(valuesSchema, body).fields, 'edit');
  }

  /** The signed-in person's own user fields (their profile). */
  @Get('profile/fields')
  ownFields(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<UserFieldsView> {
    return this.userFields.get(site.id, auth, auth.userId, 'profile');
  }

  @Put('profile/fields')
  saveOwnFields(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<UserFieldsView> {
    return this.userFields.save(
      site.id,
      auth,
      auth.userId,
      parseBody(valuesSchema, body).fields,
      'profile',
    );
  }

  /** The dynamic data sources of the site, for pickers (Fresco's dynamic tags, bindings). */
  @Get('dynamic-sources')
  @RequireCapability('edit_entries')
  sources(@CurrentSite() site: SiteContext): Promise<DynamicSourceInfo[]> {
    return this.dynamic.sources(site.id);
  }
}
