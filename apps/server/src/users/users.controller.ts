import {
  inviteUserRequestSchema,
  updateMemberAccountRequestSchema,
  updateMemberRequestSchema,
  type MemberAccountView,
  type MemberView,
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
import { clientInfo } from '../auth/auth.controller.js';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { UsersService } from './users.service.js';

/** Site members (docs/SPECIFICATIONS.md §6.4). */
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @RequireCapability('manage_users')
  list(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext): Promise<MemberView[]> {
    return this.usersService.listMembers(site.id, auth);
  }

  @Post('users/invite')
  @RequireCapability('manage_users', 'promote_users')
  invite(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<MemberView> {
    const input = parseBody(inviteUserRequestSchema, body);
    return this.usersService.invite(site.id, auth, input, clientInfo(request));
  }

  @Patch('users/:id')
  @RequireCapability('promote_users')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<MemberView> {
    const { role } = parseBody(updateMemberRequestSchema, body);
    return this.usersService.changeRole(site.id, auth, id, role, clientInfo(request));
  }

  /** A member's account (RF-USR-12), and whether it can be edited here. */
  @Get('users/:id')
  @RequireCapability('manage_users')
  account(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MemberAccountView> {
    return this.usersService.account(site.id, auth, id);
  }

  @Patch('users/:id/account')
  @RequireCapability('manage_users', 'promote_users')
  updateAccount(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<MemberAccountView> {
    const input = parseBody(updateMemberAccountRequestSchema, body);
    return this.usersService.updateAccount(site.id, auth, id, input, clientInfo(request));
  }

  @Delete('users/:id')
  @HttpCode(204)
  @RequireCapability('manage_users')
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.usersService.remove(site.id, auth, id, clientInfo(request));
  }
}
