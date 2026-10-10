import { Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { UpdatesService, type UpdateCheckView, type UpdateStatusView } from './updates.service.js';

/** Dashboard → Updates (RF-SYS-UPD): for super admins, who can install code. */
@Controller('updates')
@RequireCapability('manage_plugins')
export class UpdatesController {
  constructor(private readonly updates: UpdatesService) {}

  @Get()
  check(@Query('force') force?: string): Promise<UpdateCheckView> {
    return this.updates.check(force === '1');
  }

  @Get('status')
  status(): UpdateStatusView | null {
    return this.updates.status();
  }

  @Post('core')
  @HttpCode(202)
  start(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
  ): Promise<UpdateStatusView> {
    return this.updates.start(site.id, auth, request.ip);
  }
}
