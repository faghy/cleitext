import { updateCoreSettingsRequestSchema, type CoreSettings } from '@cleitext/shared';
import { Body, Controller, Get, Patch, Put, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { PUBLIC_CSP } from '../common/security-headers.js';
import { PublicService } from '../public/public.service.js';
import { SettingsService } from './settings.service.js';

const maintenanceBody = z.object({ enabled: z.boolean() });
const LOCALE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;

/** General settings (RF-SET-01, docs/SPECIFICATIONS.md §6.4). */
@Controller('settings')
@RequireCapability('manage_settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly publicService: PublicService,
  ) {}

  @Get('core')
  get(@CurrentSite() site: SiteContext): Promise<CoreSettings> {
    return this.settingsService.getCore(site.id);
  }

  @Patch('core')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<CoreSettings> {
    return this.settingsService.updateCore(
      site.id,
      auth.userId,
      parseBody(updateCoreSettingsRequestSchema, body),
    );
  }

  /** Maintenance mode (RF-SIT-06): visitors get a 503 page, signed-in users see the site. */
  @Get('maintenance')
  async maintenance(@CurrentSite() site: SiteContext): Promise<{ enabled: boolean }> {
    return { enabled: await this.settingsService.maintenance(site.id) };
  }

  @Put('maintenance')
  async setMaintenance(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ enabled: boolean }> {
    const { enabled } = parseBody(maintenanceBody, body);
    return {
      enabled: await this.settingsService.setMaintenance(site.id, auth.userId, enabled, request.ip),
    };
  }

  /**
   * The maintenance page as visitors get it (a plugin's or the theme's), in
   * a language (`?locale=it`), with a <base>: shown in a sandboxed frame.
   */
  @Get('maintenance/preview')
  async maintenancePreview(
    @CurrentSite() site: SiteContext,
    @Query('locale') locale: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const origin = `${request.protocol}://${request.host}`;
    const page = await this.publicService.maintenance(site.id, origin, '/', {
      preview: true,
      ...(locale && LOCALE.test(locale) ? { locale } : {}),
    });
    void reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      // Without an origin of its own, even when opened outside the frame.
      .header('content-security-policy', `${PUBLIC_CSP}; sandbox`)
      .header('x-robots-tag', 'noindex');
    return (page.html ?? '').replace(/<head>/i, `<head><base href="${origin}/">`);
  }
}
