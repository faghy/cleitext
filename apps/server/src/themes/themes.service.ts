import type { CxdDocument } from '@cleitext/blocks';
import { settings, sites, withContext, type DatabaseClient } from '@cleitext/db';
import {
  additionalCssProblem,
  ADDITIONAL_CSS_MAX,
  fieldsValidator,
  type AdditionalCssView,
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
import { WebFontsService } from '../public/web-fonts.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  AREAS_NAMESPACE,
  copyParentSettings,
  storedThemeSettings,
  themeNamespace,
  themeSettings,
} from '../public/theme-data.js';
import {
  installedThemes,
  isThemeAvailable,
  loadThemes,
  themeChildren,
  themeFailures,
  themeFor,
  themeLicensedAs,
  themePaid,
  themeParent,
} from '../public/themes.js';
import {
  readAdditionalCss,
  SITE_CSS_KEY,
  themeCssKey,
  writeAdditionalCss,
} from './additional-css.js';
import { LicensesService } from '../catalog/licenses.service.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import type { ThemeDefinition } from '@cleitext/theme-sdk';
import { hiddenSettings } from './theme-extensions.js';
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
    private readonly coreSettings: SettingsService,
    private readonly webFonts: WebFontsService,
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

  /** The site's theme with what its active plugins add (`ctx.themes.extend`). */
  async activeTheme(siteId: string, auth: AuthContext): Promise<ThemeDefinition> {
    return this.plugins.effectiveTheme(siteId, themeFor(await this.activeSlug(siteId, auth)));
  }

  async list(siteId: string, auth: AuthContext): Promise<ThemeView[]> {
    const active = await this.activeSlug(siteId, auth);
    const licenses = await this.licenses.list(siteId, auth);
    const themes = await Promise.all(
      installedThemes().map(async ({ theme, bundled }) => ({
        theme: await this.plugins.effectiveTheme(siteId, theme),
        bundled,
      })),
    );
    const views: ThemeView[] = themes.map(({ theme, bundled }) => {
      const parentSlug = themeParent(theme.slug);
      const parent = parentSlug ? themeFor(parentSlug) : null;
      const licensedAs = themeLicensedAs(theme.slug);
      return {
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
        menuItemFields: theme.menuItemFields ?? [],
        paid: paidView(theme.slug, licenses),
        error: null,
        parent: parent ? { slug: parent.slug, name: parent.name, version: parent.version } : null,
        children: themeChildren(theme.slug),
        // A child of a paid theme: the parent's license for this site (RF-CAT-03).
        needsParentLicense: Boolean(
          parentSlug && licensedAs === parentSlug && !licenses.get(parentSlug),
        ),
      };
    });
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
        menuItemFields: [],
        paid: null,
        error,
        parent: null,
        children: [],
        needsParentLicense: false,
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
    // A child of a paid theme needs the parent's license (core 0.79).
    const licensed = themeLicensedAs(slug);
    if (licensed && !(await this.licenses.has(siteId, auth, { type: 'theme', slug: licensed }))) {
      throw new HttpException(
        {
          message:
            licensed === slug
              ? 'This theme is paid: enter a license key for this site to activate it. You can try it with Live Preview.'
              : `This child theme is built on ${themeFor(licensed).name}, a paid theme: enter its license key for this site to activate it. You can try it with Live Preview.`,
        },
        402,
      );
    }
    const previous = await this.activeSlug(siteId, auth).catch(() => null);
    const parent = themeParent(slug);
    await this.run(siteId, auth, async (tx) => {
      // A child theme's first activation keeps the parent's Customize choices.
      if (parent) await copyParentSettings(tx, siteId, slug, parent);
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
    const theme = await this.activeTheme(siteId, auth);
    return this.run(siteId, auth, (tx) => themeSettings(tx, theme));
  }

  /** Checks values against the theme's settings schema. */
  async validSettings(
    siteId: string,
    auth: AuthContext,
    values: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const theme = await this.activeTheme(siteId, auth);
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
    const theme = await this.activeTheme(siteId, auth);
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
    const theme = await this.activeTheme(siteId, auth);
    const slug = theme.slug;
    let clean = await this.validSettings(siteId, auth, values);
    await this.run(siteId, auth, async (tx) => {
      // Values of settings added by plugins deactivated here are kept for their return.
      const hidden = hiddenSettings(theme);
      if (hidden.size > 0) {
        const stored = await storedThemeSettings(tx, slug, theme.parent);
        const kept = Object.entries(stored).filter(([name]) => hidden.has(name));
        clean = { ...Object.fromEntries(kept), ...clean };
      }
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
      (await this.activeTheme(siteId, auth)).areaDefaults?.[name] ?? {
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

  /** The site's Additional CSS (core 0.79): for every theme, and for the active one. */
  async additionalCss(siteId: string, auth: AuthContext): Promise<AdditionalCssView> {
    const themeSlug = await this.activeSlug(siteId, auth);
    const css = await this.run(siteId, auth, (tx) => readAdditionalCss(tx, themeSlug));
    return { ...css, themeSlug, max: ADDITIONAL_CSS_MAX };
  }

  /**
   * Additional CSS for the editor's canvas (core 0.80): for every theme, then
   * the active theme's, as the pages print it.
   */
  async editorAdditionalCss(siteId: string, auth: AuthContext): Promise<string> {
    const themeSlug = await this.activeSlug(siteId, auth);
    const css = await this.run(siteId, auth, (tx) => readAdditionalCss(tx, themeSlug));
    return [css.site, css.theme].filter((part) => part.trim()).join('\n');
  }

  /** Checks a part of Additional CSS: 400 with the reason when it cannot be saved. */
  checkAdditionalCss(css: string | undefined): void {
    const problem = css === undefined ? null : additionalCssProblem(css);
    if (problem) throw new BadRequestException(problem);
  }

  async saveAdditionalCss(
    siteId: string,
    auth: AuthContext,
    values: { site?: string | undefined; theme?: string | undefined },
    ip: string,
  ): Promise<AdditionalCssView> {
    this.checkAdditionalCss(values.site);
    this.checkAdditionalCss(values.theme);
    const themeSlug = await this.activeSlug(siteId, auth);
    await this.run(siteId, auth, async (tx) => {
      if (values.site !== undefined)
        await writeAdditionalCss(tx, siteId, SITE_CSS_KEY, values.site);
      if (values.theme !== undefined) {
        await writeAdditionalCss(tx, siteId, themeCssKey(themeSlug), values.theme);
      }
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'settings.updated',
        targetType: 'settings',
        targetId: 'additional-css',
        ip,
      });
    });
    await this.cache.invalidate(siteId, ['site']);
    return this.additionalCss(siteId, auth);
  }

  async recordUpload(siteId: string, auth: AuthContext, slug: string, ip: string): Promise<void> {
    await this.record(siteId, auth, 'theme.uploaded', slug, ip);
  }

  async record(
    siteId: string,
    auth: AuthContext,
    action: 'theme.uploaded' | 'theme.deleted' | 'theme.created',
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
    const theme = await this.activeTheme(siteId, auth);
    return { slug: theme.slug, name: theme.name, guide: theme.aiGuide ?? null };
  }

  async entryFields(
    siteId: string,
    auth: AuthContext,
  ): Promise<{ types?: string[]; fields: FieldDefinition[] } | null> {
    return themeFor(await this.activeSlug(siteId, auth)).entryFields ?? null;
  }

  async editorCss(siteId: string, auth: AuthContext): Promise<string> {
    const css = await this.themeEditorCss(siteId, auth);
    // Fonts imported from Google or Bunny Fonts: the site's copies, as on the public pages.
    const { webFonts } = await this.coreSettings.getCore(siteId);
    return this.webFonts.editorCss(siteId, css, webFonts);
  }

  private async themeEditorCss(siteId: string, auth: AuthContext): Promise<string> {
    const theme = await this.activeTheme(siteId, auth);
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
    const theme = await this.activeTheme(siteId, auth);
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
