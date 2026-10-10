import { type ThemeView } from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { PublicService } from '../public/public.service.js';
import { ThemesService } from './themes.service.js';

const settingsBody = z.object({ values: z.record(z.string(), z.unknown()) });
const previewBody = z.object({
  path: z.string().startsWith('/').max(500).default('/'),
  values: z.record(z.string(), z.unknown()),
});
const areaBody = z.object({ document: z.unknown() });
const localeQuery = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);

/** Appearance → Themes, Customize and Areas (RF-THM-01/03/04). */
@Controller('themes')
export class ThemesController {
  constructor(
    private readonly themes: ThemesService,
    private readonly publicService: PublicService,
  ) {}

  @Get()
  @RequireCapability('manage_themes')
  list(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext): Promise<ThemeView[]> {
    return this.themes.list(site.id, auth);
  }

  @Post(':slug/activate')
  @HttpCode(204)
  @RequireCapability('manage_themes')
  activate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.themes.activate(site.id, auth, slug, request.ip);
  }

  /** The active theme and its settings' values. */
  @Get('active')
  @RequireCapability('edit_theme_settings')
  async active(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext) {
    const slug = await this.themes.activeSlug(site.id, auth);
    const theme = (
      await this.themes.list(site.id, { ...auth, capabilities: auth.capabilities })
    ).find((t) => t.slug === slug);
    return { theme, values: await this.themes.settings(site.id, auth) };
  }

  @Put('active/settings')
  @RequireCapability('edit_theme_settings')
  saveSettings(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const { values } = parseBody(settingsBody, body);
    return this.themes.saveSettings(site.id, auth, values, request.ip);
  }

  /**
   * A page of the site with unsaved settings, for the Customize preview.
   * Answered as HTML with a <base>, shown in a sandboxed frame by the admin.
   */
  @Post('active/preview')
  @HttpCode(200)
  @RequireCapability('edit_theme_settings')
  async preview(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const { path, values } = parseBody(previewBody, body);
    const themeSettings = {
      ...(await this.themes.settings(site.id, auth)),
      ...(await this.themes.validSettings(site.id, auth, values)),
    };
    const origin = `${request.protocol}://${request.host}`;
    const [pathname, search = ''] = path.split('?');
    const response = await this.publicService.respond(
      site.id,
      origin,
      pathname!,
      new URLSearchParams(search),
      auth,
      { themeSettings },
    );
    if (response.redirect) throw new BadRequestException('This address redirects elsewhere.');
    void reply.type('text/html; charset=utf-8').header('cache-control', 'no-store');
    return (response.html ?? '').replace(/<head>/i, `<head><base href="${origin}/">`);
  }

  @Get('active/areas/:name')
  @RequireCapability('edit_theme_settings')
  area(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('name') name: string,
    @Query('locale') locale: string,
  ) {
    return this.themes.area(site.id, auth, name, parseBody(localeQuery, locale));
  }

  @Put('active/areas/:name')
  @RequireCapability('edit_theme_settings')
  saveArea(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('name') name: string,
    @Query('locale') locale: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const { document } = parseBody(areaBody, body);
    return this.themes.saveArea(
      site.id,
      auth,
      name,
      parseBody(localeQuery, locale),
      document,
      request.ip,
    );
  }

  /** CSS of the active theme for the editor's canvas (RF-THM-03, editor styles). */
  @Get('active/editor-styles')
  @RequireCapability('edit_entries')
  async editorStyles(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext) {
    return { css: await this.themes.editorCss(site.id, auth) };
  }
}
