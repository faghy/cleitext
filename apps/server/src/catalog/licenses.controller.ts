import { licenseRequestSchema, type LicensedType, type LicenseView } from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { siteOrigin } from '../mcp/origin.js';
import { CatalogService } from './catalog.service.js';
import { LicensesService } from './licenses.service.js';

const slugOf = (slug: string) => {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) throw new BadRequestException('Unknown slug.');
  return slug;
};

/** The four actions on a license, for themes and plugins alike. */
abstract class LicenseActions {
  protected abstract readonly type: LicensedType;

  constructor(
    protected readonly licenses: LicensesService,
    protected readonly catalog: CatalogService,
  ) {}

  protected async activateItem(
    site: SiteContext,
    auth: AuthContext,
    slug: string,
    body: unknown,
    request: FastifyRequest,
  ): Promise<LicenseView> {
    const { key } = parseBody(licenseRequestSchema, body);
    const paid = await this.catalog.paidInfo(this.type, slugOf(slug));
    if (!paid) throw new NotFoundException(`This ${this.type} does not need a license.`);
    return this.licenses.activate(site.id, auth, {
      type: this.type,
      slug,
      key,
      server: paid.server,
      origin: siteOrigin(request),
      ip: request.ip,
    });
  }

  protected async refreshItem(
    site: SiteContext,
    auth: AuthContext,
    slug: string,
  ): Promise<LicenseView> {
    const view = await this.licenses.refresh(site.id, auth, {
      type: this.type,
      slug: slugOf(slug),
    });
    if (!view) throw new NotFoundException(`This site has no license for this ${this.type}.`);
    return view;
  }

  protected deactivateItem(
    site: SiteContext,
    auth: AuthContext,
    slug: string,
    request: FastifyRequest,
  ): Promise<{ warning: string | null }> {
    return this.licenses.deactivate(
      site.id,
      auth,
      { type: this.type, slug: slugOf(slug) },
      request.ip,
    );
  }
}

/**
 * Licenses of paid themes for this site (RF-CAT-03): entered by whoever
 * manages the site's themes, one per theme and site.
 */
@Controller('licenses')
@RequireCapability('manage_themes')
export class LicensesController extends LicenseActions {
  protected readonly type = 'theme' as const;

  constructor(licenses: LicensesService, catalog: CatalogService) {
    super(licenses, catalog);
  }

  /** Every license of the site, themes and plugins. */
  @Get()
  async list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<LicenseView[]> {
    return [...(await this.licenses.list(site.id, auth)).values()];
  }

  @Put(':slug')
  activate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<LicenseView> {
    return this.activateItem(site, auth, slug, body, request);
  }

  @Post(':slug/refresh')
  @HttpCode(200)
  refresh(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
  ): Promise<LicenseView> {
    return this.refreshItem(site, auth, slug);
  }

  @Delete(':slug')
  @HttpCode(200)
  deactivate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<{ warning: string | null }> {
    return this.deactivateItem(site, auth, slug, request);
  }
}

/** Licenses of paid plugins for this site: entered by whoever activates plugins. */
@Controller('licenses/plugins')
@RequireCapability('activate_plugins')
export class PluginLicensesController extends LicenseActions {
  protected readonly type = 'plugin' as const;

  constructor(licenses: LicensesService, catalog: CatalogService) {
    super(licenses, catalog);
  }

  @Get()
  async list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<LicenseView[]> {
    return [...(await this.licenses.list(site.id, auth)).values()].filter(
      (license) => license.type === 'plugin',
    );
  }

  @Put(':slug')
  activate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<LicenseView> {
    return this.activateItem(site, auth, slug, body, request);
  }

  @Post(':slug/refresh')
  @HttpCode(200)
  refresh(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
  ): Promise<LicenseView> {
    return this.refreshItem(site, auth, slug);
  }

  @Delete(':slug')
  @HttpCode(200)
  deactivate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<{ warning: string | null }> {
    return this.deactivateItem(site, auth, slug, request);
  }
}
