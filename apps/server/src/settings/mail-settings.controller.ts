import { settings, withContext, type DatabaseClient } from '@cleitext/db';
import {
  mailSettingsRequestSchema,
  testMailRequestSchema,
  type MailSettingsView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { seal } from '../common/secrets.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { MAIL_NAMESPACE, MailService } from '../mail/mail.service.js';

/** Email settings of the site, with a test message (RF-SET-02). */
@Controller('settings/mail')
@RequireCapability('manage_settings')
export class MailSettingsController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get(@CurrentSite() site: SiteContext): Promise<MailSettingsView> {
    return this.mail.view(site.id);
  }

  @Put()
  async update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<MailSettingsView> {
    const input = parseBody(mailSettingsRequestSchema, body);
    await withContext(this.database.db, { siteId: site.id, userId: auth.userId }, async (tx) => {
      const values: Record<string, unknown> = {
        host: input.host,
        port: input.port,
        security: input.security,
        user: input.user || null,
        from: input.from,
      };
      // The password is kept when omitted, removed with an empty string.
      if (input.password !== undefined) {
        values.password = input.password ? seal(this.config.appSecret, input.password) : null;
      }
      for (const [key, value] of Object.entries(values)) {
        await tx.delete(settings).where(eqNamespaceKey(key));
        if (value !== null)
          await tx
            .insert(settings)
            .values({ siteId: site.id, namespace: MAIL_NAMESPACE, key, value });
      }
      await this.audit.record(tx, {
        siteId: site.id,
        userId: auth.userId,
        action: 'settings.updated',
        targetType: 'settings',
        targetId: MAIL_NAMESPACE,
        meta: { keys: Object.keys(values) },
        ip: request.ip,
      });
    });
    this.mail.forget(site.id);
    return this.mail.view(site.id);
  }

  /** Back to the server's settings. */
  @Delete()
  async reset(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<MailSettingsView> {
    await withContext(this.database.db, { siteId: site.id, userId: auth.userId }, (tx) =>
      tx.delete(settings).where(eq(settings.namespace, MAIL_NAMESPACE)),
    );
    this.mail.forget(site.id);
    return this.mail.view(site.id);
  }

  @Post('test')
  @HttpCode(200)
  async test(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<{ sent: true }> {
    const { to } = parseBody(testMailRequestSchema, body);
    try {
      await this.mail.send(
        {
          to,
          subject: 'Cleitext test email',
          text: `This is a test sent by ${auth.displayName} from the Cleitext settings.\nIf you can read it, email works.`,
        },
        site.id,
      );
    } catch (error) {
      // Shown to the administrator: the SMTP server's answer helps fixing the settings.
      throw new BadRequestException(
        `The email could not be sent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { sent: true };
  }
}

function eqNamespaceKey(key: string) {
  return and(eq(settings.namespace, MAIL_NAMESPACE), eq(settings.key, key));
}
