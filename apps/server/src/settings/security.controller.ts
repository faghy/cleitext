import { settings, withContext, type DatabaseClient } from '@cleitext/db';
import { securitySettingsSchema, type SecuritySettings } from '@cleitext/shared';
import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import {
  REQUIRE_2FA_KEY,
  SECURITY_NAMESPACE,
  TwoFactorService,
} from '../auth/two-factor.service.js';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

/** Settings → Security: roles that must use two-factor authentication. */
@Controller('settings/security')
@RequireCapability('manage_settings')
export class SecuritySettingsController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async get(@CurrentSite() site: SiteContext): Promise<SecuritySettings> {
    return { require2fa: await this.twoFactor.requiredRoles(site.id) };
  }

  @Put()
  async update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<SecuritySettings> {
    const input = parseBody(securitySettingsSchema, body);
    const require2fa = [...new Set(input.require2fa)];
    await withContext(this.database.db, { siteId: site.id, userId: auth.userId }, async (tx) => {
      await tx
        .delete(settings)
        .where(and(eq(settings.namespace, SECURITY_NAMESPACE), eq(settings.key, REQUIRE_2FA_KEY)));
      await tx.insert(settings).values({
        siteId: site.id,
        namespace: SECURITY_NAMESPACE,
        key: REQUIRE_2FA_KEY,
        value: require2fa,
      });
      await this.audit.record(tx, {
        siteId: site.id,
        userId: auth.userId,
        action: 'settings.updated',
        targetType: 'settings',
        targetId: SECURITY_NAMESPACE,
        meta: { keys: [REQUIRE_2FA_KEY] },
        ip: request.ip,
      });
    });
    return { require2fa };
  }
}
