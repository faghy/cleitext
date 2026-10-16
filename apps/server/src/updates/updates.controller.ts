import {
  autoUpdatesRequestSchema,
  type AutoUpdateResult,
  type AutoUpdatesView,
} from '@cleitext/shared';
import { Body, Controller, Get, HttpCode, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { parseBody } from '../common/problem.js';
import { siteOrigin } from '../mcp/origin.js';
import { AutoUpdatesService } from './auto-updates.service.js';
import { UpdatesService, type UpdateCheckView, type UpdateStatusView } from './updates.service.js';

/** Dashboard → Updates (RF-SYS-UPD): for super admins, who can install code. */
@Controller('updates')
@RequireCapability('manage_plugins')
export class UpdatesController {
  constructor(
    private readonly updates: UpdatesService,
    private readonly auto: AutoUpdatesService,
  ) {}

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

  /** Automatic updates: the core policy and the plugins and themes chosen. */
  @Get('auto')
  autoView(): AutoUpdatesView {
    return this.auto.view();
  }

  @Put('auto')
  autoChange(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): AutoUpdatesView {
    const input = parseBody(autoUpdatesRequestSchema, body);
    return this.auto.change(
      { ...(input.core ? { core: input.core } : {}), ...(input.item ? { item: input.item } : {}) },
      { siteId: site.id, userId: auth.userId!, origin: siteOrigin(request) },
    );
  }

  /** Runs the automatic updates now (they otherwise run about twice a day). */
  @Post('auto/run')
  @HttpCode(200)
  autoRun(): Promise<AutoUpdateResult[]> {
    return this.auto.run();
  }
}
