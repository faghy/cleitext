import { type ThemeView } from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
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
import { siteOrigin } from '../mcp/origin.js';
import { PublicService } from '../public/public.service.js';
import { isThemeAvailable } from '../public/themes.js';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { uploadedFile } from '../plugins/plugins.controller.js';
import { assertCanUpload, packageRoot, runCli, unpackPackage } from '../plugins/package-upload.js';
import { ThemesService } from './themes.service.js';

const settingsBody = z.object({ values: z.record(z.string(), z.unknown()) });
const previewBody = z.object({
  path: z.string().startsWith('/').max(500).default('/'),
  values: z.record(z.string(), z.unknown()),
});
const livePreviewBody = z.object({ path: z.string().startsWith('/').max(500).default('/') });
const areaBody = z.object({ document: z.unknown() });
const localeQuery = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);

/** Appearance → Themes, Customize and Areas (RF-THM-01/03/04). */
@Controller('themes')
export class ThemesController {
  constructor(
    private readonly themes: ThemesService,
    private readonly publicService: PublicService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @RequireCapability('manage_themes')
  list(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext): Promise<ThemeView[]> {
    return this.themes.list(site.id, auth);
  }

  /** Upload Theme: a built .zip/.tgz package, installed like `theme:install`. */
  @Post('upload')
  @RequireCapability('manage_plugins')
  async upload(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
  ): Promise<{ slug: string; version: string; message: string }> {
    assertCanUpload(this.config.packages, auth);
    const { data, filename } = await uploadedFile(request);
    const dir = await unpackPackage(data, filename);
    try {
      const root = await packageRoot(dir, 'theme.json');
      const manifest = JSON.parse(await readFile(path.join(root, 'theme.json'), 'utf8')) as {
        slug?: string;
        version?: string;
      };
      const message = await runCli(['theme:install', root], this.config);
      // Ready when the answer comes, not when the notice reaches this process.
      await this.themes.reload();
      await this.themes.recordUpload(site.id, auth, String(manifest.slug), request.ip);
      return { slug: String(manifest.slug), version: String(manifest.version), message };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Delete: removes an installed theme that no site uses (`theme:uninstall`). */
  @Delete(':slug')
  @HttpCode(204)
  @RequireCapability('manage_plugins')
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new NotFoundException('Theme not found.');
    await runCli(['theme:uninstall', slug], this.config);
    await this.themes.reload();
    await this.themes.record(site.id, auth, 'theme.deleted', slug, request.ip);
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

  /**
   * Live Preview: a page of the site with another installed theme, before
   * activating it. Also how a paid theme's demo is tried (RF-CAT-03).
   */
  @Post(':slug/preview')
  @HttpCode(200)
  @RequireCapability('manage_themes')
  async livePreview(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const { path } = parseBody(livePreviewBody, body);
    if (!isThemeAvailable(slug))
      throw new NotFoundException(`The theme "${slug}" is not installed.`);
    const origin = siteOrigin(request);
    const [pathname, search = ''] = path.split('?');
    const response = await this.publicService.respond(
      site.id,
      origin,
      pathname!,
      new URLSearchParams(search),
      auth,
      { theme: slug },
    );
    if (response.redirect) throw new BadRequestException('This address redirects elsewhere.');
    void reply.type('text/html; charset=utf-8').header('cache-control', 'no-store');
    return (response.html ?? '').replace(/<head>/i, `<head><base href="${origin}/">`);
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

  /** How to build pages with the active theme, for AI assistants (MCP). */
  @Get('active/guide')
  @RequireCapability('edit_entries')
  guide(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext) {
    return this.themes.aiGuide(site.id, auth);
  }

  /** CSS of the active theme for the editor's canvas (RF-THM-03, editor styles). */
  @Get('active/editor-styles')
  @RequireCapability('edit_entries')
  async editorStyles(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext) {
    return { css: await this.themes.editorCss(site.id, auth) };
  }
}
