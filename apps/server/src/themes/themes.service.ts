import type { CxdDocument } from '@cleitext/blocks';
import { settings, sites, withContext, type DatabaseClient } from '@cleitext/db';
import {
  fieldsValidator,
  type FieldDefinition,
  type LicenseView,
  type ThemeView,
} from '@cleitext/shared';
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { validateDocument } from '../content/entries.service.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { AREAS_NAMESPACE, themeNamespace, themeSettings } from '../public/theme-data.js';
import {
  installedThemes,
  isThemeAvailable,
  loadThemes,
  themeFailures,
  themeFor,
  themePaid,
} from '../public/themes.js';
import { LicensesService } from '../catalog/licenses.service.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { switchThemePlugins } from './theme-plugins.js';

/** Themes per site: activation, settings, block areas (RF-THM-01/03/04). */
@Injectable()
export class ThemesService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger('Themes');

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly cache: PageCacheService,
    private readonly audit: AuditService,
    private readonly licenses: LicensesService,
    private readonly plugins: PluginHost,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  onApplicationBootstrap(): void {
    // `cleitext theme:install` notifies every process.
    this.cache.onThemesChange(() => {
      void this.reload().catch((error: unknown) =>
        this.logger.error(`Reload failed: ${String(error)}`),
      );
    });
  }

  /** Reloads the installed themes: after an installation, before answering. */
  async reload(): Promise<void> {
    await loadThemes(this.config.themes.path);
    for (const [slug, error] of themeFailures()) {
      this.logger.error(`Theme ${slug} could not be loaded: ${error}`);
    }
    this.cache.clearLocal();
  }

  private run<T>(siteId: string, auth: AuthContext, fn: Parameters<typeof withContext<T>>[2]) {
    return withContext(this.database.db, { siteId, userId: auth.userId }, fn);
  }

  async activeSlug(siteId: string, auth: AuthContext): Promise<string> {
    const [site] = await this.run(siteId, auth, (tx) =>
      tx.select({ theme: sites.themeSlug }).from(sites).where(eq(sites.id, siteId)),
    );
    return themeFor(site?.theme).slug;
  }

  async list(siteId: string, auth: AuthContext): Promise<ThemeView[]> {
    const active = await this.activeSlug(siteId, auth);
    const licenses = await this.licenses.list(siteId, auth);
    const views: ThemeView[] = installedThemes().map(({ theme, bundled }) => ({
      slug: theme.slug,
      name: theme.name,
      version: theme.version,
      description: theme.description ?? null,
      bundled,
      active: theme.slug === active,
      menuLocations: theme.menuLocations,
      areas: theme.areas ?? {},
      settings: theme.settings ?? [],
      settingsSections: theme.settingsSections ?? [],
      presets: theme.presets ?? [],
      entryFields: theme.entryFields ?? null,
      paid: paidView(theme.slug, licenses),
      error: null,
    }));
    for (const [slug, error] of themeFailures()) {
      views.push({
        slug,
        name: slug,
        version: '',
        description: null,
        bundled: false,
        active: false,
        menuLocations: {},
        areas: {},
        settings: [],
        settingsSections: [],
        presets: [],
        entryFields: null,
        paid: null,
        error,
      });
    }
    return views;
  }

  async activate(
    siteId: string,
    auth: AuthContext,
    slug: string,
    ip: string,
  ): Promise<{ warnings: string[] }> {
    if (!isThemeAvailable(slug))
      throw new NotFoundException(`The theme "${slug}" is not installed.`);
    // Paid themes: a license for this site, activated once with the license
    // server (RF-CAT-03). Without one the theme can only be tried (Live Preview).
    if (themePaid(slug) && !(await this.licenses.has(siteId, auth, { type: 'theme', slug }))) {
      throw new HttpException(
        {
          message:
            'This theme is paid: enter a license key for this site to activate it. You can try it with Live Preview.',
        },
        402,
      );
    }
    const previous = await this.activeSlug(siteId, auth).catch(() => null);
    await this.run(siteId, auth, async (tx) => {
      await tx.execute(sql`select cleitext_app_set_theme(${slug})`);
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'theme.activated',
        targetType: 'theme',
        targetId: slug,
        ip,
      });
    });
    await this.cache.invalidate(siteId, ['site'], { sites: true });
    return {
      warnings: await switchThemePlugins(
        { db: this.database.db, host: this.plugins, siteId, userId: auth.userId },
        previous,
        slug,
      ),
    };
  }

  /** Values of the active theme's settings, defaults included. */
  async settings(siteId: string, auth: AuthContext): Promise<Record<string, unknown>> {
    const theme = themeFor(await this.activeSlug(siteId, auth));
    return this.run(siteId, auth, (tx) => themeSettings(tx, theme));
  }

  /** Checks values against the theme's settings schema. */
  async validSettings(
    siteId: string,
    auth: AuthContext,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const theme = themeFor(await this.activeSlug(siteId, auth));
    const fields = theme.settings ?? [];
    const known = new Set(fields.map((f) => f.name));
    const parsed = fieldsValidator(fields).safeParse(
      Object.fromEntries(Object.entries(values).filter(([key]) => known.has(key))),
    );
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Some settings are not valid.',
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }

  /**
   * Setting values from a file exported by another system, converted by the
   * active theme (`importSettings`): only the values that pass validation.
   */
  async importSettings(
    siteId: string,
    auth: AuthContext,
    data: unknown,
  ): Promise<{ values: Record<string, unknown>; skipped: number }> {
    const theme = themeFor(await this.activeSlug(siteId, auth));
    const converted = theme.importSettings?.(data) ?? null;
    if (!converted) {
      throw new BadRequestException('The active theme cannot read this file.');
    }
    const fields = theme.settings ?? [];
    const values: Record<string, unknown> = {};
    let skipped = 0;
    for (const field of fields) {
      if (!(field.name in converted)) continue;
      const one = fieldsValidator([field]).safeParse({ [field.name]: converted[field.name] });
      if (one.success) values[field.name] = converted[field.name];
      else skipped++;
    }
    return { values, skipped };
  }

  async saveSettings(
    siteId: string,
    auth: AuthContext,
    values: Record<string, unknown>,
    ip: string,
  ): Promise<Record<string, unknown>> {
    const slug = await this.activeSlug(siteId, auth);
    const clean = await this.validSettings(siteId, auth, values);
    await this.run(siteId, auth, async (tx) => {
      await tx
        .insert(settings)
        .values({ siteId, namespace: themeNamespace(slug), key: 'values', value: clean })
        .onConflictDoUpdate({
          target: [settings.siteId, settings.namespace, settings.key],
          set: { value: clean },
        });
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'settings.updated',
        targetType: 'settings',
        targetId: themeNamespace(slug),
        ip,
      });
    });
    await this.cache.invalidate(siteId, ['site']);
    return this.settings(siteId, auth);
  }

  async area(
    siteId: string,
    auth: AuthContext,
    name: string,
    locale: string,
  ): Promise<CxdDocument> {
    await this.assertArea(siteId, auth, name);
    const [row] = await this.run(siteId, auth, (tx) =>
      tx
        .select({ value: settings.value })
        .from(settings)
        .where(and(eq(settings.namespace, AREAS_NAMESPACE), eq(settings.key, `${name}:${locale}`))),
    );
    return (
      (row?.value as CxdDocument | undefined) ??
      themeFor(await this.activeSlug(siteId, auth)).areaDefaults?.[name] ?? {
        schema: 1,
        blocks: [],
      }
    );
  }

  async saveArea(
    siteId: string,
    auth: AuthContext,
    name: string,
    locale: string,
    document: unknown,
    ip: string,
  ): Promise<CxdDocument> {
    await this.assertArea(siteId, auth, name);
    const clean = validateDocument(document, auth);
    await this.run(siteId, auth, async (tx) => {
      await tx
        .insert(settings)
        .values({ siteId, namespace: AREAS_NAMESPACE, key: `${name}:${locale}`, value: clean })
        .onConflictDoUpdate({
          target: [settings.siteId, settings.namespace, settings.key],
          set: { value: clean },
        });
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'settings.updated',
        targetType: 'settings',
        targetId: `${AREAS_NAMESPACE}:${name}`,
        ip,
      });
    });
    await this.cache.invalidate(siteId, ['site']);
    return clean;
  }

  async recordUpload(siteId: string, auth: AuthContext, slug: string, ip: string): Promise<void> {
    await this.record(siteId, auth, 'theme.uploaded', slug, ip);
  }

  async record(
    siteId: string,
    auth: AuthContext,
    action: 'theme.uploaded' | 'theme.deleted',
    slug: string,
    ip: string,
  ): Promise<void> {
    await this.run(siteId, auth, (tx) =>
      this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action,
        targetType: 'theme',
        targetId: slug,
        ip,
      }),
    );
  }

  /** CSS of the active theme for the block editor's canvas. */
  /** How to build pages with the active theme, for AI assistants (MCP). */
  async aiGuide(
    siteId: string,
    auth: AuthContext,
  ): Promise<{ slug: string; name: string; guide: string | null }> {
    const theme = themeFor(await this.activeSlug(siteId, auth));
    return { slug: theme.slug, name: theme.name, guide: theme.aiGuide ?? null };
  }

  async entryFields(
    siteId: string,
    auth: AuthContext,
  ): Promise<{ types?: string[]; fields: FieldDefinition[] } | null> {
    return themeFor(await this.activeSlug(siteId, auth)).entryFields ?? null;
  }

  async editorCss(siteId: string, auth: AuthContext): Promise<string> {
    const theme = themeFor(await this.activeSlug(siteId, auth));
    if (typeof theme.editorCss !== 'function') return theme.editorCss ?? '';
    // The chosen colors and fonts, as on the site.
    const values = await this.run(siteId, auth, (tx) => themeSettings(tx, theme));
    try {
      return theme.editorCss(values);
    } catch {
      return '';
    }
  }

  private async assertArea(siteId: string, auth: AuthContext, name: string): Promise<void> {
    const theme = themeFor(await this.activeSlug(siteId, auth));
    if (!theme.areas || !(name in theme.areas)) {
      throw new NotFoundException(`The theme has no area "${name}".`);
    }
  }
}

function paidView(slug: string, licenses: ReadonlyMap<string, LicenseView>): ThemeView['paid'] {
  const paid = themePaid(slug);
  return paid
    ? { purchaseUrl: paid.purchaseUrl ?? null, license: licenses.get(slug) ?? null }
    : null;
}
