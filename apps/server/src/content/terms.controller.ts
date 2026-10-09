import {
  createTermRequestSchema,
  updateTermRequestSchema,
  type TaxonomyView,
  type TermView,
} from '@cleitext/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { TermsService } from './terms.service.js';

const uuid = new ParseUUIDPipe();

/** Taxonomies and terms (docs/SPECIFICATIONS.md §6.3). */
@Controller()
@RequireCapability('edit_entries')
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Get('taxonomies')
  taxonomies(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<TaxonomyView[]> {
    return this.termsService.listTaxonomies(site.id, auth);
  }

  @Get('taxonomies/:slug/terms')
  terms(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Query('locale') locale: string | undefined,
  ): Promise<TermView[]> {
    return this.termsService.listTerms(site.id, auth, slug, locale);
  }

  @Post('taxonomies/:slug/terms')
  create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
  ): Promise<TermView> {
    return this.termsService.createTerm(
      site.id,
      auth,
      slug,
      parseBody(createTermRequestSchema, body),
    );
  }

  @Patch('terms/:id')
  update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ): Promise<TermView> {
    return this.termsService.updateTerm(
      site.id,
      auth,
      id,
      parseBody(updateTermRequestSchema, body),
    );
  }

  @Delete('terms/:id')
  @HttpCode(204)
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
  ): Promise<void> {
    await this.termsService.deleteTerm(site.id, auth, id);
  }
}
