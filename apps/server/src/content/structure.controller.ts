import {
  createContentTypeRequestSchema,
  createTaxonomyRequestSchema,
  updateContentTypeRequestSchema,
  updateTaxonomyRequestSchema,
  type TaxonomyView,
} from '@cleitext/shared';
import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { StructureService } from './structure.service.js';

/** Content types and taxonomies from the admin (docs/SPECIFICATIONS.md §6.2–6.3). */
@Controller()
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  @Post('content-types')
  @RequireCapability('manage_content_types')
  createType(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    return this.structure.createType(
      site.id,
      auth,
      parseBody(createContentTypeRequestSchema, body),
      request.ip,
    );
  }

  @Patch('content-types/:slug')
  @RequireCapability('manage_content_types')
  updateType(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    return this.structure.updateType(
      site.id,
      auth,
      slug,
      parseBody(updateContentTypeRequestSchema, body),
      request.ip,
    );
  }

  @Delete('content-types/:slug')
  @HttpCode(204)
  @RequireCapability('manage_content_types')
  deleteType(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.structure.deleteType(site.id, auth, slug, request.ip);
  }

  @Post('taxonomies')
  @RequireCapability('manage_taxonomies')
  createTaxonomy(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<TaxonomyView> {
    return this.structure.createTaxonomy(
      site.id,
      auth,
      parseBody(createTaxonomyRequestSchema, body),
      request.ip,
    );
  }

  @Patch('taxonomies/:slug')
  @RequireCapability('manage_taxonomies')
  updateTaxonomy(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<TaxonomyView> {
    return this.structure.updateTaxonomy(
      site.id,
      auth,
      slug,
      parseBody(updateTaxonomyRequestSchema, body),
      request.ip,
    );
  }

  @Delete('taxonomies/:slug')
  @HttpCode(204)
  @RequireCapability('manage_taxonomies')
  deleteTaxonomy(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.structure.deleteTaxonomy(site.id, auth, slug, request.ip);
  }
}
