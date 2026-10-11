import { withContext, type DatabaseClient } from '@cleitext/db';
import type { CatalogView } from '@cleitext/shared';
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { assertCanUpload } from '../plugins/package-upload.js';
import { CatalogService } from './catalog.service.js';

/**
 * Plugins → Add New and Appearance → Themes → Add New (RF-PLG-07): the
 * catalog, and installing or updating from it. Super admins only, since
 * installing puts code on the server.
 */
@Controller('catalog')
@RequireCapability('manage_plugins')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseClient,
  ) {}

  @Get()
  view(@Query('refresh') refresh?: string): Promise<CatalogView> {
    return this.catalog.view(refresh === '1');
  }

  @Post(':type/:slug/install')
  @HttpCode(200)
  async install(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('type') type: string,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<{ slug: string; version: string; message: string }> {
    if (type !== 'plugin' && type !== 'theme') throw new BadRequestException('Unknown type.');
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) throw new BadRequestException('Unknown slug.');
    // The same rules as uploads, without the warning: the package is verified.
    assertCanUpload({ ...this.config.packages, allowUnsigned: true }, auth);
    const result = await this.catalog.install(type, slug);
    await withContext(this.database.db, { siteId: site.id, userId: auth.userId }, (tx) =>
      this.audit.record(tx, {
        siteId: site.id,
        userId: auth.userId,
        action: `${type}.installed_from_catalog`,
        targetType: type,
        targetId: slug,
        meta: { version: result.version },
        ip: request.ip,
      }),
    );
    return { slug, ...result };
  }
}
