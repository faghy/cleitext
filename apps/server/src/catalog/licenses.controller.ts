import { licenseRequestSchema, type LicenseView } from '@cleitext/shared';
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

/**
 * Licenses of paid themes for this site (RF-CAT-03): entered by whoever
 * manages the site's themes, one per theme and site.
 */
@Controller('licenses')
@RequireCapability('manage_themes')
export class LicensesController {
  constructor(
    private readonly licenses: LicensesService,
    private readonly catalog: CatalogService,
  ) {}

  @Get()
  async list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<LicenseView[]> {
    return [...(await this.licenses.list(site.id, auth)).values()];
  }

  @Put(':slug')
  async activate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<LicenseView> {
    const { key } = parseBody(licenseRequestSchema, body);
    const paid = await this.catalog.paidInfo(slugOf(slug));
    if (!paid) throw new NotFoundException('This theme does not need a license.');
    return this.licenses.activate(site.id, auth, {
      slug,
      key,
      server: paid.server,
      origin: siteOrigin(request),
      ip: request.ip,
    });
  }

  @Post(':slug/refresh')
  @HttpCode(200)
  async refresh(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
  ): Promise<LicenseView> {
    const view = await this.licenses.refresh(site.id, auth, slugOf(slug));
    if (!view) throw new NotFoundException('This site has no license for this theme.');
    return view;
  }

  @Delete(':slug')
  @HttpCode(200)
  deactivate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<{ warning: string | null }> {
    return this.licenses.deactivate(site.id, auth, slugOf(slug), request.ip);
  }
}
