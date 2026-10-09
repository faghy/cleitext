import { updateCoreSettingsRequestSchema, type CoreSettings } from '@cleitext/shared';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { SettingsService } from './settings.service.js';

/** General settings (RF-SET-01, docs/SPECIFICATIONS.md §6.4). */
@Controller('settings')
@RequireCapability('manage_settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
}
