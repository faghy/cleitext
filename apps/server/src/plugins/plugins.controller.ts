import { settings, withContext, type DatabaseClient } from '@cleitext/db';
import { labelText } from '@cleitext/plugin-sdk';
import {
  fieldsValidator,
  licenseStorageKey,
  type LicenseView,
  type PluginAdminInfo,
  type PluginBlockView,
  type PluginView,
} from '@cleitext/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { LicensesService } from '../catalog/licenses.service.js';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { PluginError, PluginHost, type LoadedPlugin } from './plugin-host.service.js';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { assertCanUpload, packageRoot, runCli, unpackPackage } from './package-upload.js';
import { PluginServicesProvider } from './plugin-services.service.js';

/** Plugins on the current site (docs/SPECIFICATIONS.md §6.4, RF-PLG-02). */
@Controller()
export class PluginsController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly host: PluginHost,
    private readonly services: PluginServicesProvider,
    private readonly audit: AuditService,
    private readonly licenses: LicensesService,
  ) {}

  @Get('plugins')
  @RequireCapability('activate_plugins')
  async list(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PluginView[]> {
    const active = await this.host.activeSlugs(site.id);
    const licenses = await this.licenses.list(site.id, auth);
    return Promise.all(
      this.host
        .list()
        .map(async (plugin) =>
          view(plugin, active.has(plugin.slug), await this.host.scope(plugin.slug), licenses),
        ),
    );
  }

  @Post('plugins/:slug/activate')
  @HttpCode(200)
  @RequireCapability('activate_plugins')
  async activate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<PluginView> {
    // Paid plugins: a license for this site (RF-CAT-03). Without one the
    // plugin is installed as a demo and cannot be activated.
    const paid = this.host.get(slug)?.manifest.paid;
    if (paid && !(await this.licenses.has(site.id, auth, { type: 'plugin', slug }))) {
      throw new HttpException(
        {
          message: 'This plugin is paid: enter a license key for this site to activate it.',
        },
        402,
      );
    }
    await this.change(() => this.host.activate(site.id, auth.userId, slug));
    await this.record(site.id, auth, 'plugin.activated', slug, request.ip);
    return view(
      this.plugin(slug),
      true,
      await this.host.scope(slug),
      await this.licenses.list(site.id, auth),
    );
  }

  @Post('plugins/:slug/deactivate')
  @HttpCode(200)
  @RequireCapability('activate_plugins')
  async deactivate(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<PluginView> {
    this.plugin(slug);
    await this.change(() => this.host.deactivate(site.id, auth.userId, slug));
    await this.record(site.id, auth, 'plugin.deactivated', slug, request.ip);
    return view(this.plugin(slug), false, await this.host.scope(slug));
  }

  /** Activation on every site, by a super admin (RF-PLG-15). */
  @Post('plugins/:slug/network')
  @HttpCode(200)
  @RequireCapability('manage_plugins')
  async network(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<PluginView> {
    const { network } = z.object({ network: z.boolean() }).parse(body ?? {});
    this.plugin(slug);
    await this.change(() => this.host.setNetwork(site.id, auth.userId, slug, network));
    await this.record(
      site.id,
      auth,
      network ? 'plugin.network_activated' : 'plugin.network_deactivated',
      slug,
      request.ip,
    );
    const active = await this.host.activeSlugs(site.id);
    return view(this.plugin(slug), active.has(slug), await this.host.scope(slug));
  }

  /**
   * Upload Plugin (RF-PLG-10): a built .zip/.tgz package, installed by the CLI
   * like `plugin:install`. Not verified by a registry: the admin warns first.
   */
  @Post('plugins/upload')
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
      const root = await packageRoot(dir, 'cleitext.plugin.json');
      const manifest = JSON.parse(
        await readFile(path.join(root, 'cleitext.plugin.json'), 'utf8'),
      ) as { slug?: string; version?: string };
      const message = await runCli(['plugin:install', root], this.config);
      await this.record(site.id, auth, 'plugin.uploaded', String(manifest.slug), request.ip);
      return { slug: String(manifest.slug), version: String(manifest.version), message };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Delete (RF-PLG-04): removes a plugin that no site uses, with ALL its data,
   * through the CLI (`plugin:uninstall`), as the database owner.
   */
  @Delete('plugins/:slug')
  @HttpCode(204)
  @RequireCapability('manage_plugins')
  async remove(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    this.plugin(slug);
    await runCli(['plugin:uninstall', slug, '--yes', '--only-inactive'], this.config);
    await this.record(site.id, auth, 'plugin.deleted', slug, request.ip);
  }

  /** Admin extensions of the active plugins, for any signed-in user. */
  @Get('plugins/admin')
  async admin(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<PluginAdminInfo[]> {
    const active = await this.host.activePlugins(site.id);
    return active.map((plugin) => ({
      slug: plugin.slug,
      name: plugin.manifest.name,
      version: plugin.version,
      adminUrl: plugin.manifest.admin
        ? `/admin-plugins/${plugin.slug}/${plugin.version}/${plugin.manifest.admin}`
        : null,
      settings:
        plugin.settings && auth.capabilities.includes(settingsCapability(plugin))
          ? { title: plugin.settings.title ?? plugin.manifest.name, fields: plugin.settings.fields }
          : null,
    })) as PluginAdminInfo[];
  }

  @Get('plugins/:slug/settings')
  async getSettings(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
  ): Promise<Record<string, unknown>> {
    const plugin = await this.settingsPlugin(site.id, auth, slug);
    return this.services.settings(plugin, site.id);
  }

  /** Updates plugin settings; `null` resets a value to its default. */
  @Patch('plugins/:slug/settings')
  async updateSettings(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<Record<string, unknown>> {
    const plugin = await this.settingsPlugin(site.id, auth, slug);
    const fields = plugin.settings!.fields;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Send an object of settings.');
    }
    const changes = body as Record<string, unknown>;
    const known = new Set(fields.map((f) => f.name));
    const unknown = Object.keys(changes).filter((key) => !known.has(key));
    if (unknown.length) throw new BadRequestException(`Unknown settings: ${unknown.join(', ')}.`);
    const toSet = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== null));
    const result = fieldsValidator(fields.map((f) => ({ ...f, required: false }))).safeParse(toSet);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Some settings are not valid.',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const namespace = `plugin:${slug}`;
    await withContext(this.database.db, { siteId: site.id, userId: auth.userId }, async (tx) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) {
          await tx
            .delete(settings)
            .where(and(eq(settings.namespace, namespace), eq(settings.key, key)));
        } else {
          await tx
            .insert(settings)
            .values({ siteId: site.id, namespace, key, value })
            .onConflictDoUpdate({
              target: [settings.siteId, settings.namespace, settings.key],
              set: { value },
            });
        }
      }
      await this.audit.record(tx, {
        siteId: site.id,
        userId: auth.userId,
        action: 'settings.updated',
        targetType: 'settings',
        targetId: namespace,
        meta: { keys: Object.keys(changes) },
        ip: request.ip,
      });
    });
    await this.host.emitSettingsChange(site.id);
    return this.services.settings(plugin, site.id);
  }

  /** Blocks of the plugins active on the site, for the editor. */
  @Get('blocks')
  @RequireCapability('edit_entries')
  async blocks(@CurrentSite() site: SiteContext): Promise<PluginBlockView[]> {
    const active = await this.host.activePlugins(site.id);
    return active.flatMap((plugin) =>
      plugin.blocks.map((block) => ({
        type: block.type,
        plugin: plugin.slug,
        title: block.title,
        description: block.description ?? null,
        icon: block.icon ?? null,
        category: block.category ?? 'widgets',
        version: block.version ?? 1,
        attributes: block.attributes ?? [],
      })),
    );
  }

  // ---- Helpers --------------------------------------------------------------------

  private plugin(slug: string): LoadedPlugin {
    const plugin = this.host.get(slug);
    if (!plugin) throw new NotFoundException('Plugin not found.');
    return plugin;
  }

  private async settingsPlugin(
    siteId: string,
    auth: AuthContext,
    slug: string,
  ): Promise<LoadedPlugin> {
    const plugin = this.host.get(slug);
    const active = await this.host.activeSlugs(siteId);
    if (!plugin?.settings || !active.has(slug))
      throw new NotFoundException('Plugin settings not found.');
    if (!auth.capabilities.includes(settingsCapability(plugin))) {
      throw new ForbiddenException('You are not allowed to do this.');
    }
    return plugin;
  }

  private async change(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      if (error instanceof PluginError) throw new BadRequestException(error.message);
      if (error instanceof NotFoundException) throw error;
      // An `onActivate` that fails is reported to the administrator.
      throw new BadRequestException(
        `The plugin failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async record(
    siteId: string,
    auth: AuthContext,
    action: string,
    slug: string,
    ip: string,
  ) {
    await withContext(this.database.db, { siteId, userId: auth.userId }, (tx) =>
      this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action,
        targetType: 'plugin',
        targetId: slug,
        ip,
      }),
    );
  }
}

function settingsCapability(plugin: LoadedPlugin): string {
  return plugin.settings?.capability ?? 'manage_settings';
}

function view(
  plugin: LoadedPlugin,
  active: boolean,
  scope: { network: boolean; mustUse: boolean },
  licenses?: ReadonlyMap<string, LicenseView>,
): PluginView {
  const { manifest } = plugin;
  return {
    slug: plugin.slug,
    name: manifest.name,
    version: plugin.version,
    description: manifest.description ?? null,
    author: manifest.author ?? null,
    homepage: manifest.homepage ?? null,
    license: manifest.license,
    permissions: manifest.permissions,
    requires: manifest.requires?.plugins ?? {},
    active: active && plugin.status === 'loaded',
    network: scope.network,
    mustUse: scope.mustUse,
    status: plugin.status,
    error: plugin.error,
    contributes: {
      types: plugin.types.map((t) => t.slug),
      taxonomies: plugin.taxonomies.map((t) => t.slug),
      blocks: plugin.blocks.map((b) => `${b.type} (${labelText(b.title)})`),
      settings: Boolean(plugin.settings),
      admin: Boolean(manifest.admin),
    },
    stats: { ...plugin.stats, totalMs: Math.round(plugin.stats.totalMs) },
    paid: manifest.paid
      ? {
          purchaseUrl: manifest.paid.purchaseUrl ?? null,
          license: licenses?.get(licenseStorageKey('plugin', plugin.slug)) ?? null,
        }
      : null,
  };
}

/** The `file` field of a multipart upload. */
export async function uploadedFile(
  request: FastifyRequest,
): Promise<{ data: Buffer; filename: string }> {
  if (!request.isMultipart())
    throw new BadRequestException('Send the package as multipart/form-data.');
  const part = await request.file();
  if (!part || part.fieldname !== 'file') throw new BadRequestException('Missing "file" field.');
  try {
    return { data: await part.toBuffer(), filename: part.filename };
  } catch {
    throw new BadRequestException('The package is too large.');
  }
}
