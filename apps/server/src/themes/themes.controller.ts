import { additionalCssSchema, type AdditionalCssView, type ThemeView } from '@cleitext/shared';
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
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CurrentAuth, CurrentSite, Public, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import { PUBLIC_CSP } from '../common/security-headers.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { siteOrigin } from '../mcp/origin.js';
import { PublicService } from '../public/public.service.js';
import { isThemeAvailable, themeDirectory, themeFor, themeParent } from '../public/themes.js';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { uploadedFile } from '../plugins/plugins.controller.js';
import { assertCanUpload, packageRoot, runCli, unpackPackage } from '../plugins/package-upload.js';
import { PREVIEW_SCRIPT } from './preview-script.js';
import { zipThemeFolder } from './theme-package.js';
import { ThemesService } from './themes.service.js';

const settingsBody = z.object({ values: z.record(z.string(), z.unknown()) });
/** Additional CSS (core 0.79): a part left out is not changed. */
const additionalCssBody = z.object({
  site: z.string().optional(),
  theme: z.string().optional(),
});
const childBody = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  /** Activate it on this site at once (the parent's settings are copied). */
  activate: z.boolean().optional(),
});
const previewBody = z.object({
  path: z.string().startsWith('/').max(500).default('/'),
  values: z.record(z.string(), z.unknown()),
  /** Unsaved Additional CSS (core 0.79). */
  additionalCss: z.object({ site: additionalCssSchema, theme: additionalCssSchema }).optional(),
  /** Answer `{ url }`: the page is kept a few minutes at that address (see `previewFrame`). */
  frame: z.boolean().optional(),
});

/**
 * Customize previews kept for their frame: served from an address of their
 * own, they get the public pages' policy, so the theme's inline scripts run
 * (a srcdoc frame inherits the admin's policy, which blocks them).
 */
const frames = new Map<string, { html: string; expires: number }>();
const FRAME_TTL = 5 * 60_000;
function keepFrame(html: string): string {
  const now = Date.now();
  for (const [key, frame] of frames) if (frame.expires < now) frames.delete(key);
  while (frames.size >= 200) frames.delete(frames.keys().next().value!);
  const token = randomBytes(18).toString('base64url');
  frames.set(token, { html, expires: now + FRAME_TTL });
  return token;
}
const livePreviewBody = z.object({ path: z.string().startsWith('/').max(500).default('/') });
const areaBody = z.object({ document: z.unknown() });
const importBody = z.object({ data: z.unknown() });
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

  /**
   * Create child theme (core 0.79): a new theme built on this one, with an
   * empty style.css and a README (`theme:child --install`). No code is
   * uploaded; it can be activated at once with the parent's settings.
   */
  @Post(':slug/child')
  @RequireCapability('manage_plugins')
  async createChild(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') parent: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ slug: string; name: string; parent: string; warnings: string[] }> {
    if (!this.config.packages.installFromUi) {
      throw new BadRequestException('Installing from the admin is turned off on this server.');
    }
    const { name, slug, activate } = parseBody(childBody, body);
    if (!isThemeAvailable(parent))
      throw new NotFoundException(`The theme "${parent}" is not installed.`);
    if (themeParent(parent)) {
      throw new BadRequestException(
        `${themeFor(parent).name} is a child theme: make the child of ${themeFor(themeParent(parent)).name} instead.`,
      );
    }
    if (isThemeAvailable(slug))
      throw new BadRequestException(`A theme "${slug}" is already installed.`);
    await runCli(['theme:child', parent, slug, '--name', name, '--install'], this.config);
    await this.themes.reload();
    await this.themes.record(site.id, auth, 'theme.created', slug, request.ip);
    const warnings = activate
      ? (await this.themes.activate(site.id, auth, slug, request.ip)).warnings
      : [];
    return { slug, name, parent, warnings };
  }

  /** Download: a child theme as a zip, to edit it and upload it back (core 0.79). */
  @Get(':slug/download')
  @RequireCapability('manage_plugins')
  async download(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const dir = /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? themeDirectory(slug) : null;
    if (!dir) throw new NotFoundException('Theme not found.');
    // Only child themes: a theme of its own (a paid one too) comes from its catalog.
    if (!themeParent(slug)) {
      throw new BadRequestException('Only child themes can be downloaded.');
    }
    let zip: Uint8Array;
    try {
      zip = await zipThemeFolder(dir, slug);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
    void reply
      .type('application/zip')
      .header('content-disposition', `attachment; filename="${slug}.zip"`)
      .header('cache-control', 'no-store');
    return Buffer.from(zip);
  }

  /** Additional CSS of the site (core 0.79): for every theme and for the active one. */
  @Get('additional-css')
  @RequireCapability('edit_theme_settings')
  additionalCss(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AdditionalCssView> {
    return this.themes.additionalCss(site.id, auth);
  }

  @Put('additional-css')
  @RequireCapability('edit_theme_settings')
  saveAdditionalCss(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<AdditionalCssView> {
    const values = parseBody(additionalCssBody, body);
    return this.themes.saveAdditionalCss(site.id, auth, values, request.ip);
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
  @HttpCode(200)
  @RequireCapability('manage_themes')
  activate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<{ warnings: string[] }> {
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

  /** The script of the Customize preview: pencils and links (no data, no login). */
  @Public()
  @Get('preview.js')
  previewScript(@Res({ passthrough: true }) reply: FastifyReply): string {
    void reply
      .type('text/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=3600');
    return PREVIEW_SCRIPT;
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
  ): Promise<string | { url: string }> {
    const { path, values, frame, additionalCss } = parseBody(previewBody, body);
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
      { themeSettings, ...(additionalCss ? { additionalCss } : {}) },
    );
    if (response.redirect) throw new BadRequestException('This address redirects elsewhere.');
    // The preview's script (pencils, links) as a file: a srcdoc frame blocks inline ones.
    const html = (response.html ?? '').replace(
      /<head>/i,
      `<head><base href="${origin}/"><script src="/api/v1/themes/preview.js"></script>`,
    );
    if (frame) return { url: `/api/v1/themes/preview/${keepFrame(html)}` };
    void reply.type('text/html; charset=utf-8').header('cache-control', 'no-store');
    return html;
  }

  /** A preview kept by `POST active/preview` with `frame`: its address is its secret. */
  @Public()
  @Get('preview/:token')
  previewFrame(
    @Param('token') token: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): string {
    const kept = frames.get(token);
    if (!kept || kept.expires < Date.now())
      throw new NotFoundException('This preview has expired.');
    void reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      // Without an origin of its own, even when opened outside the frame.
      .header('content-security-policy', `${PUBLIC_CSP}; sandbox allow-scripts allow-forms`)
      .header('x-robots-tag', 'noindex');
    return kept.html;
  }

  /** Converts settings exported from another system with the active theme (`importSettings`). */
  @Post('active/import')
  @HttpCode(200)
  @RequireCapability('edit_theme_settings')
  importSettings(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ) {
    const { data } = parseBody(importBody, body);
    return this.themes.importSettings(site.id, auth, data);
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

  /** The active theme's options for each page or post, shown in the editor. */
  @Get('active/entry-fields')
  @RequireCapability('edit_entries')
  entryFields(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext) {
    return this.themes.entryFields(site.id, auth);
  }

  /** CSS of the active theme for the editor's canvas (RF-THM-03, editor styles). */
  @Get('active/editor-styles')
  @RequireCapability('edit_entries')
  async editorStyles(@CurrentSite() site: SiteContext, @CurrentAuth() auth: AuthContext) {
    return { css: await this.themes.editorCss(site.id, auth) };
  }
}
