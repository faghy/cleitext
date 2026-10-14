import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  contentTypes,
  detached,
  plugins,
  settings,
  sitePlugins,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import {
  fieldListSchema,
  fieldsValidator,
  labelText,
  type FieldDefinition,
  type Label,
} from '@cleitext/shared';
import {
  pluginManifestSchema,
  SDK_VERSION,
  type Actions,
  type ApiRoute,
  type ContentTypeDefinition,
  type ErasureResult,
  type FieldGroupDefinition,
  type LanguageProvider,
  type PersonalDataEraser,
  type PersonalDataExporter,
  type PersonalDataGroup,
  type TrackerDeclaration,
  type Filters,
  type PluginBlockDefinition,
  type PluginDefinition,
  type PluginManifest,
  type PublicRoute,
} from '@cleitext/plugin-sdk';
import { installServerSharedModules } from '@cleitext/plugin-sdk/host';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { and, eq, or, sql } from 'drizzle-orm';
import semver from 'semver';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { blockRegistry } from '../content/block-registry.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { createPluginContext, type PluginServices } from './plugin-context.js';
import { AuditService } from '../audit/audit.service.js';
import { compileRoute, type CompiledRoute } from './route-matcher.js';

/** Default priority of hooks, as in WordPress. */
const DEFAULT_PRIORITY = 10;
/** A handler slower than this is abandoned (its plugin keeps running). */
const HOOK_TIMEOUT_MS = 5_000;
/** RF-PLG-05: this many failures on a site within the window deactivate the plugin there. */
const FAILURE_LIMIT = 10;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
/** Settings namespace and key of the Dashboard notices about deactivated plugins. */
export const PLUGIN_NOTICES = { namespace: 'plugins', key: 'notices' } as const;
const ACTIVE_CACHE_MS = 30_000;

export interface HookRegistration {
  plugin: string;
  kind: 'action' | 'filter';
  name: string;
  priority: number;
  order: number;
  handler: (value: unknown, context: unknown) => unknown;
}

export interface PluginStats {
  calls: number;
  errors: number;
  totalMs: number;
  lastError: string | null;
}

/** A plugin installed on this server, with what it registered. */
export interface LoadedPlugin {
  slug: string;
  version: string;
  manifest: PluginManifest;
  dir: string;
  definition: PluginDefinition | null;
  status: 'loaded' | 'error';
  error: string | null;
  types: ContentTypeDefinition[];
  fieldGroups: FieldGroupDefinition[];
  blocks: PluginBlockDefinition<Record<string, unknown>, unknown>[];
  apiRoutes: (ApiRoute & { compiled: CompiledRoute })[];
  publicRoutes: (PublicRoute & { compiled: CompiledRoute })[];
  settings: { fields: FieldDefinition[]; title?: unknown; capability?: string } | null;
  capabilities: Map<string, { label: unknown; roles: string[] }>;
  hooks: HookRegistration[];
  /** Set by `ctx.languages.provide` (permission `languages`). */
  languageProvider: LanguageProvider | null;
  /** Registered with `ctx.privacy` (GDPR requests). */
  exporters: PersonalDataExporter[];
  erasers: PersonalDataEraser[];
  /** Registered with `ctx.privacy.declareTrackers`. */
  trackerProviders: ((siteId: string) => TrackerDeclaration[] | Promise<TrackerDeclaration[]>)[];
  stats: PluginStats;
}

export class PluginError extends Error {}

/**
 * Loads installed plugins and runs them (docs/ARCHITECTURE.md §11): hooks,
 * content types, blocks, routes, settings and capabilities. Plugins are
 * installed globally and activated per site; everything they add is only
 * visible on sites where they are active.
 *
 * Installing or updating a plugin from the CLI notifies every process,
 * which reloads its plugins without restarting.
 */
@Injectable()
export class PluginHost implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Plugins');
  private loaded = new Map<string, LoadedPlugin>();
  private readonly active = new Map<string, { slugs: Set<string>; expiresAt: number }>();
  private readonly synced = new Set<string>();
  private generation = 0;
  private hookOrder = 0;
  private services: PluginServices | null = null;
  private retry: NodeJS.Timeout | undefined;
  /** Recent failures per plugin and site (`slug:siteId`), for RF-PLG-05. */
  private readonly failures = new Map<string, number[]>();
  private readonly disabling = new Set<string>();

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly cache: PageCacheService,
    private readonly audit: AuditService,
  ) {}

  /** Late binding of the services plugins use (avoids circular providers). */
  bind(services: PluginServices): void {
    this.services = services;
  }

  onApplicationShutdown(): void {
    clearTimeout(this.retry);
  }

  onApplicationBootstrap(): void {
    this.cache.onPluginsChange(() => {
      void this.reload().catch((error: unknown) =>
        this.logger.error(`Reload failed: ${String(error)}`),
      );
    });
    // After the change is saved, outside the transaction that made it.
    this.cache.onInvalidate((siteId, tags) => {
      if (this.loaded.size === 0) return;
      detached(() => setImmediate(() => void this.emit('cache.invalidated', { tags }, siteId)));
    });
    this.cache.onSiteChange(() => {
      this.active.clear();
      // A plugin activated for the whole network adds its types on every site.
      this.synced.clear();
    });
  }

  // ---- Loading ------------------------------------------------------------------------

  /** Loads every installed plugin. A plugin that fails is reported, not fatal. */
  async load(): Promise<void> {
    await installServerSharedModules();
    let rows: (typeof plugins.$inferSelect)[];
    try {
      rows = await this.database.db.select().from(plugins).orderBy(plugins.slug);
    } catch (error) {
      // The server still starts (health checks report the database); plugins load later.
      this.logger.error(`Cannot read installed plugins, retrying in 10 s: ${describeError(error)}`);
      clearTimeout(this.retry);
      this.retry = setTimeout(() => void this.reload().catch(() => {}), 10_000);
      this.retry.unref();
      return;
    }
    const next = new Map<string, LoadedPlugin>();
    this.generation++;
    for (const row of rows) {
      next.set(row.slug, await this.loadOne(row.slug, row.version));
    }
    for (const plugin of this.loaded.values()) {
      for (const block of plugin.blocks) blockRegistry.unregister(block.type);
    }
    this.loaded = next;
    for (const plugin of next.values()) {
      for (const block of plugin.blocks) registerBlockDefinition(block);
    }
    this.active.clear();
    this.synced.clear();
    const summary = [...next.values()].map(
      (p) => `${p.slug}@${p.version}${p.status === 'error' ? ' (error)' : ''}`,
    );
    if (summary.length) this.logger.log(`Plugins: ${summary.join(', ')}`);
  }

  /** Reloads plugins after an install, update or uninstall (in every process). */
  async reload(): Promise<void> {
    await this.load();
    this.cache.clearLocal();
  }

  private async loadOne(slug: string, version: string): Promise<LoadedPlugin> {
    const dir = path.join(this.config.plugins.path, slug);
    const plugin: LoadedPlugin = {
      slug,
      version,
      manifest: {
        slug,
        name: slug,
        version,
        apiVersion: '',
        license: 'GPL-2.0-or-later',
        permissions: [],
        capabilities: [],
      },
      dir,
      definition: null,
      status: 'loaded',
      error: null,
      types: [],
      fieldGroups: [],
      blocks: [],
      apiRoutes: [],
      publicRoutes: [],
      settings: null,
      capabilities: new Map(),
      hooks: [],
      languageProvider: null,
      exporters: [],
      erasers: [],
      trackerProviders: [],
      stats: { calls: 0, errors: 0, totalMs: 0, lastError: null },
    };
    try {
      const { readFile } = await import('node:fs/promises');
      const manifestFile = path.join(dir, 'cleitext.plugin.json');
      if (!existsSync(manifestFile)) throw new PluginError(`Files missing in ${dir}`);
      plugin.manifest = pluginManifestSchema.parse(
        JSON.parse(await readFile(manifestFile, 'utf8')),
      );
      if (plugin.manifest.slug !== slug) throw new PluginError('Manifest slug does not match');
      if (!semver.satisfies(SDK_VERSION, plugin.manifest.apiVersion)) {
        throw new PluginError(
          `Needs plugin API ${plugin.manifest.apiVersion}; this server has ${SDK_VERSION}`,
        );
      }
      if (plugin.manifest.server) {
        const file = path.join(dir, plugin.manifest.server);
        // A new URL per load, so that a reload picks up updated code.
        const url = `${pathToFileURL(file).href}?v=${encodeURIComponent(plugin.manifest.version)}&g=${this.generation}`;
        const module = (await import(url)) as { default?: PluginDefinition };
        if (!module.default || typeof module.default.setup !== 'function') {
          throw new PluginError('The server entry must export definePlugin({ setup }) as default');
        }
        plugin.definition = module.default;
        await module.default.setup(createPluginContext(plugin, this));
      }
    } catch (error) {
      plugin.status = 'error';
      plugin.error = error instanceof Error ? error.message : String(error);
      // Nothing half-registered stays around.
      Object.assign(plugin, {
        types: [],
        fieldGroups: [],
        blocks: [],
        apiRoutes: [],
        publicRoutes: [],
        settings: null,
        hooks: [],
        languageProvider: null,
        exporters: [],
        erasers: [],
        trackerProviders: [],
      });
      plugin.capabilities.clear();
      this.logger.error(`Plugin ${slug} could not be loaded: ${plugin.error}`);
    }
    return plugin;
  }

  // ---- Registration (called by plugin contexts during setup) --------------------------

  addHook(
    plugin: LoadedPlugin,
    kind: 'action' | 'filter',
    name: string,
    handler: HookRegistration['handler'],
    priority?: number,
  ): void {
    plugin.hooks.push({
      plugin: plugin.slug,
      kind,
      name,
      handler,
      priority: priority ?? DEFAULT_PRIORITY,
      order: this.hookOrder++,
    });
  }

  addPrivacyHandler(
    plugin: LoadedPlugin,
    kind: 'exporter' | 'eraser',
    handler: PersonalDataExporter | PersonalDataEraser,
  ): void {
    if (handler.id !== plugin.slug && !handler.id.startsWith(`${plugin.slug}.`)) {
      throw new PluginError(
        `Privacy ${kind} ids must start with the plugin slug ("${plugin.slug}")`,
      );
    }
    if (kind === 'exporter') plugin.exporters.push(handler as PersonalDataExporter);
    else plugin.erasers.push(handler as PersonalDataEraser);
  }

  /** The trackers that the plugins active on a site add to it, with their rules. */
  async trackers(siteId: string): Promise<TrackerDeclaration[]> {
    const result: TrackerDeclaration[] = [];
    for (const plugin of await this.activePlugins(siteId)) {
      for (const provider of plugin.trackerProviders) {
        try {
          for (const tracker of await provider(siteId)) {
            if (tracker.id === plugin.slug || tracker.id.startsWith(`${plugin.slug}.`)) {
              result.push(tracker);
            }
          }
        } catch (error) {
          this.logger.error(`Trackers of ${plugin.slug} failed: ${String(error)}`);
        }
      }
    }
    return result;
  }

  /** GDPR access request: the core's data, then each active plugin's. */
  async exportPersonalData(siteId: string, email: string) {
    const address = email.trim().toLowerCase();
    const results: { source: string; label: Label; groups: PersonalDataGroup[] }[] = [
      {
        source: 'core',
        label: { en: 'Account', it: 'Account' },
        groups: await this.pluginServices.corePersonalData(siteId, address),
      },
    ];
    for (const plugin of await this.activePlugins(siteId)) {
      for (const exporter of plugin.exporters) {
        try {
          results.push({
            source: exporter.id,
            label: exporter.label,
            groups: await exporter.export(siteId, address),
          });
        } catch (error) {
          this.logger.error(`Privacy exporter ${exporter.id} failed: ${String(error)}`);
          results.push({
            source: exporter.id,
            label: exporter.label,
            groups: [
              {
                id: `${exporter.id}.error`,
                label: { en: 'Error', it: 'Errore' },
                items: [{ error: 'This source could not be read.' }],
              },
            ],
          });
        }
      }
    }
    return results;
  }

  /** GDPR erasure request: each active plugin erases its data; accounts stay (Users). */
  async erasePersonalData(siteId: string, email: string) {
    const address = email.trim().toLowerCase();
    const account = (await this.pluginServices.corePersonalData(siteId, address)).length > 0;
    const results: ({ source: string; label: Label } & ErasureResult)[] = [
      {
        source: 'core',
        label: { en: 'Account', it: 'Account' },
        removed: 0,
        retained: account ? 1 : 0,
        messages: account
          ? ['The user account is kept: delete it from Users if it should go too.']
          : [],
      },
    ];
    for (const plugin of await this.activePlugins(siteId)) {
      for (const eraser of plugin.erasers) {
        try {
          results.push({
            source: eraser.id,
            label: eraser.label,
            ...(await eraser.erase(siteId, address)),
          });
        } catch (error) {
          this.logger.error(`Privacy eraser ${eraser.id} failed: ${String(error)}`);
          results.push({
            source: eraser.id,
            label: eraser.label,
            removed: 0,
            retained: 0,
            messages: ['This source could not be erased: try again or check the server log.'],
          });
        }
      }
    }
    return results;
  }

  addType(plugin: LoadedPlugin, definition: ContentTypeDefinition): void {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(definition.slug)) {
      throw new PluginError(`Invalid content type slug "${definition.slug}"`);
    }
    if (['page', 'article'].includes(definition.slug)) {
      throw new PluginError(`The content type "${definition.slug}" belongs to the core`);
    }
    fieldListSchema.parse(definition.fields ?? []);
    plugin.types.push(definition);
  }

  addFieldGroup(plugin: LoadedPlugin, definition: FieldGroupDefinition): void {
    if (definition.id !== plugin.slug && !definition.id.startsWith(`${plugin.slug}-`)) {
      throw new PluginError(`Field group ids must start with the plugin slug ("${plugin.slug}")`);
    }
    fieldListSchema.parse(definition.fields);
    plugin.fieldGroups.push(definition);
  }

  addBlock(
    plugin: LoadedPlugin,
    definition: PluginBlockDefinition<Record<string, unknown>, unknown>,
  ): void {
    if (
      !definition.type.startsWith(`${plugin.slug}/`) ||
      !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(definition.type)
    ) {
      throw new PluginError(`Block types must be named "${plugin.slug}/<name>"`);
    }
    fieldListSchema.parse(definition.attributes ?? []);
    plugin.blocks.push(definition);
  }

  addRoute(plugin: LoadedPlugin, kind: 'api', route: ApiRoute): void;
  addRoute(plugin: LoadedPlugin, kind: 'public', route: PublicRoute): void;
  addRoute(plugin: LoadedPlugin, kind: 'api' | 'public', route: ApiRoute | PublicRoute): void {
    if (!route.path.startsWith('/'))
      throw new PluginError(`Route paths start with "/": ${route.path}`);
    if (kind === 'api') {
      plugin.apiRoutes.push({ ...(route as ApiRoute), compiled: compileRoute(route.path) });
    } else {
      if (/^\/(api|admin|media|__preview)(\/|$)/.test(route.path)) {
        throw new PluginError(`The public path ${route.path} is reserved`);
      }
      plugin.publicRoutes.push({ ...(route as PublicRoute), compiled: compileRoute(route.path) });
    }
  }

  // ---- Queries ------------------------------------------------------------------------

  list(): LoadedPlugin[] {
    return [...this.loaded.values()];
  }

  get(slug: string): LoadedPlugin | undefined {
    return this.loaded.get(slug);
  }

  get pluginServices(): PluginServices {
    if (!this.services) throw new Error('Plugin services are not bound yet');
    return this.services;
  }

  /** Slugs of the plugins active on a site (loaded without errors). */
  async activeSlugs(siteId: string): Promise<Set<string>> {
    const cached = this.active.get(siteId);
    if (cached && cached.expiresAt > Date.now()) return cached.slugs;
    if (this.loaded.size === 0) return new Set();
    const { rows, everywhere } = await withContext(this.database.db, { siteId }, async (tx) => ({
      rows: await tx
        .select({ slug: sitePlugins.pluginSlug })
        .from(sitePlugins)
        .where(eq(sitePlugins.active, true)),
      // Network-activated and must-use plugins are active on every site (RF-PLG-15).
      everywhere: await tx
        .select({ slug: plugins.slug })
        .from(plugins)
        .where(or(eq(plugins.network, true), eq(plugins.mustUse, true))),
    }));
    const slugs = new Set(
      [...rows, ...everywhere]
        .map((r) => r.slug)
        .filter((slug) => this.loaded.get(slug)?.status === 'loaded'),
    );
    this.active.set(siteId, { slugs, expiresAt: Date.now() + ACTIVE_CACHE_MS });
    if (!this.synced.has(siteId)) {
      this.synced.add(siteId);
      // Content types follow the plugin code (e.g. after an update).
      await withContext(this.database.db, { siteId }, async (tx) => {
        for (const slug of slugs) await this.syncTypes(tx, siteId, this.loaded.get(slug)!);
      }).catch((error: unknown) => this.logger.error(`Type sync failed: ${String(error)}`));
    }
    return slugs;
  }

  /**
   * The language plugin active on a site, if any. Without one the site has
   * only its default language; with no plugin installed this costs nothing.
   */
  async languagePlugin(siteId: string): Promise<LoadedPlugin | null> {
    if (this.loaded.size === 0) return null;
    for (const plugin of this.loaded.values()) {
      if (plugin.languageProvider && (await this.activeSlugs(siteId)).has(plugin.slug)) {
        return plugin;
      }
    }
    return null;
  }

  async activePlugins(siteId: string): Promise<LoadedPlugin[]> {
    const slugs = await this.activeSlugs(siteId);
    return [...slugs].map((slug) => this.loaded.get(slug)!);
  }

  /** Field definitions of a content type on a site: its own fields plus field groups. */
  async fieldsFor(
    siteId: string,
    type: { slug: string; source: string; fieldsSchema: unknown },
  ): Promise<{ fields: FieldDefinition[]; groups: FieldGroupDefinition[] }> {
    const active = await this.activePlugins(siteId);
    const stored = (type.fieldsSchema as { fields?: unknown } | null)?.fields;
    const parsed = fieldListSchema.safeParse(stored ?? []);
    const owner = type.source.startsWith('plugin:')
      ? active.find((p) => p.slug === type.source.slice('plugin:'.length))
      : undefined;
    const fields =
      owner?.types.find((t) => t.slug === type.slug)?.fields ?? (parsed.success ? parsed.data : []);
    const groups = active.flatMap((p) => p.fieldGroups.filter((g) => g.types.includes(type.slug)));
    return { fields, groups };
  }

  /** Validates custom field values against the type fields and field groups. */
  async validateFields(
    siteId: string,
    type: { slug: string; source: string; fieldsSchema: unknown },
    values: Record<string, unknown>,
    options: { partial?: boolean } = {},
  ): Promise<
    | { ok: true; values: Record<string, unknown> }
    | { ok: false; errors: { path: string; message: string }[] }
  > {
    const found = await this.fieldsFor(siteId, type);
    // Drafts may be incomplete: required fields are checked when publishing.
    const relax = (list: FieldDefinition[]) =>
      options.partial ? list.map((f) => ({ ...f, required: false })) : list;
    const fields = relax(found.fields);
    const groups = found.groups.map((g) => ({ ...g, fields: relax(g.fields) }));
    const errors: { path: string; message: string }[] = [];
    const result: Record<string, unknown> = { ...values };
    const own = fieldsValidator(fields).safeParse(values);
    if (own.success) Object.assign(result, own.data);
    else
      for (const i of own.error.issues)
        errors.push({ path: `fields.${i.path.join('.')}`, message: i.message });
    for (const group of groups) {
      const value = values[group.id];
      if (value === undefined || value === null) continue;
      const parsed = fieldsValidator(group.fields).safeParse(value);
      if (parsed.success) result[group.id] = parsed.data;
      else
        for (const i of parsed.error.issues)
          errors.push({ path: `fields.${group.id}.${i.path.join('.')}`, message: i.message });
    }
    return errors.length ? { ok: false, errors } : { ok: true, values: result };
  }

  /**
   * Plugin capabilities for a role on a site: the roles named by the plugin,
   * or roles that list the capability themselves (custom roles). Super
   * admins get them all.
   */
  capabilitiesFor(
    activeSlugs: Iterable<string>,
    roleSlug: string | null,
    isSuperAdmin: boolean,
    roleCapabilities: readonly string[] = [],
  ): string[] {
    const result: string[] = [];
    for (const slug of activeSlugs) {
      const plugin = this.loaded.get(slug);
      if (!plugin) continue;
      for (const [name, capability] of plugin.capabilities) {
        if (
          isSuperAdmin ||
          (roleSlug && capability.roles.includes(roleSlug)) ||
          roleCapabilities.includes(name)
        )
          result.push(name);
      }
    }
    return result;
  }

  /** Capabilities defined by the plugins active on a site, for the role editor. */
  capabilityCatalog(
    activeSlugs: Iterable<string>,
  ): { name: string; plugin: string; label: unknown }[] {
    const result: { name: string; plugin: string; label: unknown }[] = [];
    for (const slug of activeSlugs) {
      const plugin = this.loaded.get(slug);
      if (!plugin) continue;
      for (const [name, capability] of plugin.capabilities) {
        result.push({ name, plugin: slug, label: capability.label });
      }
    }
    return result;
  }

  // ---- Hooks --------------------------------------------------------------------------

  /** Runs action handlers of the plugins active on the site; errors are isolated. */
  async emit<K extends keyof Actions>(
    name: K,
    payload: Actions[K],
    siteId: string,
    userId?: string,
  ): Promise<void> {
    if (this.loaded.size === 0) return;
    const context = userId ? { siteId, userId } : { siteId };
    for (const hook of await this.hooksFor(siteId, 'action', name)) {
      await this.runHook({ ...hook, siteId }, () => hook.handler(payload, context));
    }
  }

  /** Applies filters of the plugins active on the site, in priority order. */
  async applyFilter<K extends keyof Filters>(
    name: K,
    value: Filters[K][0],
    context: Filters[K][1],
    siteId: string,
  ): Promise<Filters[K][0]> {
    if (this.loaded.size === 0) return value;
    let current = value;
    for (const hook of await this.hooksFor(siteId, 'filter', name)) {
      const input = current;
      const output = await this.runHook({ ...hook, siteId }, () => hook.handler(input, context));
      // A failing filter is skipped: the value goes on unchanged.
      if (output.ok && output.value !== undefined) current = output.value as Filters[K][0];
    }
    return current;
  }

  private async hooksFor(
    siteId: string,
    kind: 'action' | 'filter',
    name: string,
  ): Promise<HookRegistration[]> {
    const active = await this.activePlugins(siteId);
    return active
      .flatMap((p) => p.hooks.filter((h) => h.kind === kind && h.name === name))
      .sort((a, b) => a.priority - b.priority || a.order - b.order);
  }

  /** Runs plugin code with timing, a timeout and error isolation (RF-PLG-05/06). */
  async runHook<T>(
    hook: { plugin: string; name: string; siteId?: string },
    fn: () => T | Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    const plugin = this.loaded.get(hook.plugin);
    const started = performance.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const value = await Promise.race([
        Promise.resolve().then(fn),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${HOOK_TIMEOUT_MS} ms`)),
            HOOK_TIMEOUT_MS,
          );
        }),
      ]);
      return { ok: true, value };
    } catch (error) {
      const message = describeError(error);
      if (plugin) {
        plugin.stats.errors++;
        plugin.stats.lastError = `${hook.name}: ${message}`;
      }
      this.logger.error(`Plugin ${hook.plugin}, ${hook.name}: ${message}`);
      if (hook.siteId) this.recordFailure(hook.plugin, hook.siteId, `${hook.name}: ${message}`);
      return { ok: false };
    } finally {
      clearTimeout(timer);
      if (plugin) {
        plugin.stats.calls++;
        plugin.stats.totalMs += performance.now() - started;
      }
    }
  }

  /**
   * A plugin failing again and again on a site is deactivated there, and the
   * Dashboard says so (RF-PLG-05). One slow or broken page should not keep
   * every visit waiting for its hooks.
   */
  private recordFailure(slug: string, siteId: string, error: string): void {
    const key = `${slug}:${siteId}`;
    const now = Date.now();
    const recent = (this.failures.get(key) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
    recent.push(now);
    this.failures.set(key, recent);
    if (recent.length < FAILURE_LIMIT || this.disabling.has(key)) return;
    this.disabling.add(key);
    void this.autoDeactivate(siteId, slug, error)
      .catch((cause: unknown) =>
        this.logger.error(`Could not deactivate ${slug}: ${describeError(cause)}`),
      )
      .finally(() => {
        this.disabling.delete(key);
        this.failures.delete(key);
      });
  }

  private async autoDeactivate(siteId: string, slug: string, error: string): Promise<void> {
    const deactivated = await withContext(this.database.db, { siteId }, async (tx) => {
      const rows = await tx
        .update(sitePlugins)
        .set({ active: false })
        .where(
          and(
            eq(sitePlugins.siteId, siteId),
            eq(sitePlugins.pluginSlug, slug),
            eq(sitePlugins.active, true),
          ),
        )
        .returning();
      if (rows.length === 0) return false;
      const [current] = await tx
        .select({ value: settings.value })
        .from(settings)
        .where(
          and(
            eq(settings.namespace, PLUGIN_NOTICES.namespace),
            eq(settings.key, PLUGIN_NOTICES.key),
          ),
        );
      const notices = Array.isArray(current?.value) ? (current.value as unknown[]) : [];
      const value = [
        ...notices.slice(-19),
        { plugin: slug, error: error.slice(0, 500), at: new Date().toISOString() },
      ];
      await tx
        .insert(settings)
        .values({ siteId, ...PLUGIN_NOTICES, value })
        .onConflictDoUpdate({
          target: [settings.siteId, settings.namespace, settings.key],
          set: { value },
        });
      await this.audit.record(tx, {
        siteId,
        userId: null,
        action: 'plugin.auto_deactivated',
        targetType: 'plugin',
        targetId: slug,
        meta: { error: error.slice(0, 500) },
        ip: null,
      });
      return true;
    });
    if (!deactivated) return;
    this.logger.warn(`Plugin ${slug} deactivated on site ${siteId} after repeated errors.`);
    await this.changed(siteId);
  }

  // ---- Activation ---------------------------------------------------------------------

  /** Whether a plugin is network-activated or must-use. */
  async scope(slug: string): Promise<{ network: boolean; mustUse: boolean }> {
    const [row] = await this.database.db
      .select({ network: plugins.network, mustUse: plugins.mustUse })
      .from(plugins)
      .where(eq(plugins.slug, slug));
    return { network: row?.network ?? false, mustUse: row?.mustUse ?? false };
  }

  /**
   * Activates or deactivates a plugin on every site (super admins, RF-PLG-15).
   * Every process forgets which plugins sites have, and syncs their types.
   */
  async setNetwork(siteId: string, userId: string, slug: string, network: boolean): Promise<void> {
    const plugin = this.loaded.get(slug);
    if (!plugin) throw new PluginError(`The plugin ${slug} is not installed.`);
    if (network && plugin.status === 'error')
      throw new PluginError(`The plugin ${slug} failed to load: ${plugin.error}`);
    await withContext(this.database.db, { siteId, userId }, (tx) =>
      tx.execute(sql`select cleitext_app_set_plugin_network(${slug}, ${network})`),
    );
    // Every process reloads its plugins and drops every cached page.
    await this.database.db.execute(
      sql`select pg_notify('cleitext_cache', ${JSON.stringify({ plugins: true })})`,
    );
    this.active.clear();
    this.synced.clear();
  }

  /** Activates a plugin on a site (RF-PLG-02): dependencies, types, `onActivate`. */
  async activate(siteId: string, userId: string, slug: string): Promise<void> {
    const plugin = this.loaded.get(slug);
    if (!plugin) throw new PluginError(`The plugin ${slug} is not installed.`);
    if (plugin.status === 'error')
      throw new PluginError(`The plugin ${slug} failed to load: ${plugin.error}`);
    const active = await this.activeSlugs(siteId);
    for (const [dependency, range] of Object.entries(plugin.manifest.requires?.plugins ?? {})) {
      const loaded = this.loaded.get(dependency);
      if (!loaded || !active.has(dependency) || !semver.satisfies(loaded.version, range)) {
        throw new PluginError(`Activate ${dependency} (${range}) first: ${slug} requires it.`);
      }
    }
    const site = await this.services!.site(siteId);
    await withContext(this.database.db, { siteId, userId }, async (tx) => {
      await this.syncTypes(tx, siteId, plugin);
      await tx
        .insert(sitePlugins)
        .values({ siteId, pluginSlug: slug, active: true, activatedAt: new Date() })
        .onConflictDoUpdate({
          target: [sitePlugins.siteId, sitePlugins.pluginSlug],
          set: { active: true, activatedAt: new Date() },
        });
      // Inside the transaction: a failing `onActivate` cancels the activation.
      if (plugin.definition?.onActivate) {
        await plugin.definition.onActivate(site, createPluginContext(plugin, this));
      }
    });
    await this.changed(siteId);
    await this.emit('plugin.activated', { plugin: slug }, siteId);
  }

  /** Deactivates a plugin on a site; its data is kept. */
  async deactivate(siteId: string, userId: string, slug: string): Promise<void> {
    const plugin = this.loaded.get(slug);
    const scope = await this.scope(slug);
    if (scope.mustUse) throw new PluginError(`${slug} is a must-use plugin: it is always active.`);
    if (scope.network) {
      throw new PluginError(
        `${slug} is active on the whole network: only a super admin can change it.`,
      );
    }
    const active = await this.activeSlugs(siteId);
    const dependents = [...active].filter(
      (other) => this.loaded.get(other)?.manifest.requires?.plugins?.[slug] !== undefined,
    );
    if (dependents.length) {
      throw new PluginError(`Deactivate ${dependents.join(', ')} first: they require ${slug}.`);
    }
    if (plugin?.definition?.onDeactivate && active.has(slug)) {
      const site = await this.services!.site(siteId);
      await this.runHook({ plugin: slug, name: 'onDeactivate' }, () =>
        plugin.definition!.onDeactivate!(site, createPluginContext(plugin, this)),
      );
    }
    await withContext(this.database.db, { siteId, userId }, (tx) =>
      tx
        .update(sitePlugins)
        .set({ active: false })
        .where(and(eq(sitePlugins.siteId, siteId), eq(sitePlugins.pluginSlug, slug))),
    );
    await this.emit('plugin.deactivated', { plugin: slug }, siteId);
    await this.changed(siteId);
  }

  /** Plugin settings changed: pages of the site are rendered again. */
  async emitSettingsChange(siteId: string): Promise<void> {
    await this.cache.invalidate(siteId, ['site']);
  }

  /** Plugin set of a site changed: every process refreshes, every page goes. */
  private async changed(siteId: string): Promise<void> {
    this.active.delete(siteId);
    await this.cache.invalidate(siteId, ['site'], { sites: true });
  }

  /** Creates or updates the plugin's content types on a site. */
  private async syncTypes(
    tx: SiteTransaction,
    siteId: string,
    plugin: LoadedPlugin,
  ): Promise<void> {
    for (const type of plugin.types) {
      const [existing] = await tx
        .select()
        .from(contentTypes)
        .where(eq(contentTypes.slug, type.slug));
      const source = `plugin:${plugin.slug}`;
      if (existing && existing.source !== source) {
        throw new PluginError(
          `A content type "${type.slug}" already exists on this site (${existing.source}).`,
        );
      }
      const values = {
        name: typeof type.name === 'string' ? { en: type.name } : type.name,
        hierarchical: type.hierarchical ?? false,
        permalink: type.permalink ?? `/${type.slug}/{slug}`,
        fieldsSchema: { fields: type.fields ?? [] },
        source,
      };
      // A permalink changed in the settings (RF-SET-03) is kept.
      if (existing)
        await tx
          .update(contentTypes)
          .set({ ...values, permalink: existing.permalink })
          .where(eq(contentTypes.id, existing.id));
      else await tx.insert(contentTypes).values({ siteId, slug: type.slug, ...values });
    }
  }

  /** Label helper for API views. */
  label(value: unknown, locale = 'en'): string {
    return labelText(value as never, locale);
  }
}

/** Adds a plugin block to the shared registry, so documents validate its attributes. */
function registerBlockDefinition(
  block: PluginBlockDefinition<Record<string, unknown>, unknown>,
): void {
  blockRegistry.unregister(block.type);
  blockRegistry.register({
    type: block.type,
    version: block.version ?? 1,
    title: labelText(block.title),
    category: block.category ?? 'widgets',
    attrs: fieldsValidator(block.attributes ?? []),
  });
}

/** Message of an error and of its causes (e.g. the database error behind a query). */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 3; depth++) {
    parts.push(current instanceof Error ? current.message.split('\n')[0]! : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(': ');
}
