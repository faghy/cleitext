import {
  saveOptionsRequestSchema,
  type OptionsPageInput,
  type OptionsPageView,
  type OptionsScreenView,
} from '@cleitext/shared';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { allowed, OptionsPagesService } from './options-pages.service.js';

/**
 * Options pages (plugin API 1.48): the pages of the admin menu
 * (`/options-pages`, the site owners' made with the API), and their values
 * (`/options/<slug>`, in a language with `?locale=`).
 */
@Controller()
export class OptionsPagesController {
  constructor(private readonly options: OptionsPagesService) {}

  /** The pages the signed-in person may open, for the menu (every source). */
  @Get('options-pages')
  list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<OptionsPageView[]> {
    return this.options.visiblePages(site.id, auth);
  }

  @Post('options-pages')
  @RequireCapability('manage_content_types')
  create(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<OptionsPageInput> {
    return this.options.saveSite(site.id, body, { auth, ip: request.ip, create: true });
  }

  @Get('options-pages/:slug')
  async get(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
  ): Promise<OptionsPageView> {
    const page = await this.options.page(site.id, slug);
    if (!allowed(page, auth) && !auth.capabilities.includes('manage_content_types')) {
      throw new ForbiddenException('You cannot open this options page.');
    }
    return page;
  }

  /** Replaces (or adds) the site owners' page with this slug. */
  @Put('options-pages/:slug')
  @RequireCapability('manage_content_types')
  save(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<OptionsPageInput> {
    const page = { ...(body && typeof body === 'object' ? body : {}), slug };
    return this.options.saveSite(site.id, page, { auth, ip: request.ip });
  }

  @Delete('options-pages/:slug')
  @HttpCode(204)
  @RequireCapability('manage_content_types')
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.options.removeSite(site.id, slug, { auth, ip: request.ip });
  }

  /** A page as edited: its fields and groups, and its values in a language. */
  @Get('options/:slug')
  screen(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Query('locale') locale: string | undefined,
  ): Promise<OptionsScreenView> {
    return this.options.screen(site.id, slug, auth, locale || undefined);
  }

  /** Saves new values (checked like entries' fields); answers the page as edited. */
  @Put('options/:slug')
  async update(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<OptionsScreenView> {
    const input = parseBody(saveOptionsRequestSchema, body);
    await this.options.save(site.id, slug, input.fields, {
      auth,
      ip: request.ip,
      ...(input.locale ? { locale: input.locale } : {}),
    });
    return this.options.screen(site.id, slug, auth, input.locale);
  }
}
