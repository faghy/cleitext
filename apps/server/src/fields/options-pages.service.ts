import {
  optionsPages,
  optionValues,
  sites,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import {
  exportFieldValues,
  mayMatchOptionsPage,
  OPTIONS_PAGE_CAPABILITY,
  optionsPageSchema,
  sortFieldGroups,
  translatableField,
  type FieldDefinition,
  type FieldGroupView,
  type FieldValues,
  type OptionsPageInput,
  type OptionsPageView,
  type OptionsScreenView,
} from '@cleitext/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { defaultLocaleIn, LanguagesService } from '../content/languages.service.js';
import { DATABASE } from '../database/database.module.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { themeFor } from '../public/themes.js';
import { formatContext, formattedFields } from './field-format.js';
import { FieldGroupsService } from './field-groups.service.js';
import type { FormatScope } from './field-values.service.js';

/** Where the values of the default language are kept (`option_values.locale`). */
const BASE = '';

/** The fields of an options page: its own and its groups'. */
interface PageFields {
  own: readonly FieldDefinition[];
  groups: readonly FieldGroupView[];
}

const isRecord = (value: unknown): value is FieldValues =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The values of an options page in a language: translatable fields from
 * the language's own values (a `translate` field falls back to the default
 * language's, an `ignore` one starts empty), the others from the default
 * language's.
 */
export function localizedValues(
  fields: PageFields,
  base: FieldValues,
  local: FieldValues | undefined,
): FieldValues {
  const pick = (
    target: FieldValues,
    own: FieldValues | undefined,
    list: readonly FieldDefinition[],
  ) => {
    for (const field of list) {
      if (!translatableField(field)) continue;
      if (own && field.name in own) target[field.name] = own[field.name];
      else if (field.translation === 'ignore') delete target[field.name];
    }
  };
  const out: FieldValues = { ...base };
  pick(out, local, fields.own);
  for (const group of fields.groups) {
    const merged: FieldValues = isRecord(base[group.id])
      ? { ...(base[group.id] as FieldValues) }
      : {};
    const own = isRecord(local?.[group.id]) ? (local![group.id] as FieldValues) : undefined;
    pick(merged, own, group.fields);
    if (Object.keys(merged).length > 0 || group.id in base) out[group.id] = merged;
  }
  return out;
}

/**
 * The translatable values among some values (what a language keeps of its
 * own): those of `translate` fields equal to the default language's are left
 * out, so they keep following it until changed.
 */
function translatableValues(
  fields: PageFields,
  values: FieldValues,
  base: FieldValues,
): FieldValues {
  const out: FieldValues = {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const pick = (
    target: FieldValues,
    from: FieldValues,
    defaults: FieldValues,
    list: readonly FieldDefinition[],
  ) => {
    for (const field of list) {
      if (!translatableField(field) || !(field.name in from)) continue;
      const value = from[field.name];
      if (value === undefined || value === null || value === '') continue;
      if (field.translation !== 'ignore' && same(value, defaults[field.name])) continue;
      target[field.name] = value;
    }
  };
  pick(out, values, base, fields.own);
  for (const group of fields.groups) {
    if (!isRecord(values[group.id])) continue;
    const nested: FieldValues = {};
    const defaults = isRecord(base[group.id]) ? (base[group.id] as FieldValues) : {};
    pick(nested, values[group.id] as FieldValues, defaults, group.fields);
    if (Object.keys(nested).length > 0) out[group.id] = nested;
  }
  return out;
}

/** The values of `from` for the keys of `keys` (and of its groups' values). */
function sameKeys(from: FieldValues, keys: FieldValues): FieldValues {
  const out: FieldValues = {};
  for (const [key, value] of Object.entries(keys)) {
    if (!(key in from)) continue;
    out[key] =
      isRecord(value) && isRecord(from[key])
        ? Object.fromEntries(
            Object.keys(value)
              .filter((name) => name in (from[key] as FieldValues))
              .map((name) => [name, (from[key] as FieldValues)[name]]),
          )
        : from[key];
  }
  return out;
}

/**
 * Options pages (plugin API 1.48): the site owners' (stored here), the
 * plugins' and the theme's; their field groups (`optionsPage` rules) and
 * their values, per site and, for translatable fields, per language.
 */
@Injectable()
export class OptionsPagesService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
    private readonly fieldGroups: FieldGroupsService,
    private readonly languages: LanguagesService,
    private readonly audit: AuditService,
    private readonly cache: PageCacheService,
  ) {}

  private run<T>(
    siteId: string,
    userId: string | undefined,
    fn: Parameters<typeof withContext<T>>[2],
  ) {
    return withContext(this.database.db, { siteId, ...(userId ? { userId } : {}) }, fn);
  }

  // ---- The site owners' pages ------------------------------------------------------------

  async listSite(siteId: string, userId?: string): Promise<OptionsPageInput[]> {
    const rows = await this.run(siteId, userId, (tx) =>
      tx.select().from(optionsPages).orderBy(asc(optionsPages.slug)),
    );
    return rows.flatMap((row) => {
      const parsed = optionsPageSchema.safeParse(row.definition);
      return parsed.success ? [parsed.data as OptionsPageInput] : [];
    });
  }

  /** Saves a page of the site's owners: `create` refuses a slug in use, otherwise it replaces. */
  async saveSite(
    siteId: string,
    input: unknown,
    options: { auth?: AuthContext; ip?: string; create?: boolean } = {},
  ): Promise<OptionsPageInput> {
    const parsed = optionsPageSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'The options page is not valid.',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const page = parsed.data as OptionsPageInput;
    const others = [
      ...(await this.plugins.pluginOptionsPages(siteId)),
      ...(await this.themePages(siteId)),
    ];
    const taken = others.find((p) => p.slug === page.slug);
    if (taken) {
      throw new ConflictException(
        `${taken.source === 'theme' ? 'The theme' : 'A plugin'} has an options page "${page.slug}": choose another slug.`,
      );
    }
    await this.run(siteId, options.auth?.userId, async (tx) => {
      const [existing] = await tx
        .select({ slug: optionsPages.slug })
        .from(optionsPages)
        .where(eq(optionsPages.slug, page.slug));
      if (existing && options.create) {
        throw new ConflictException(`There is already an options page "${page.slug}".`);
      }
      if (existing) {
        await tx
          .update(optionsPages)
          .set({ definition: page, updatedAt: new Date() })
          .where(eq(optionsPages.slug, page.slug));
      } else {
        await tx.insert(optionsPages).values({ siteId, slug: page.slug, definition: page });
      }
      await this.audit.record(tx, {
        siteId,
        userId: options.auth?.userId ?? null,
        action: existing ? 'options_page.updated' : 'options_page.created',
        targetType: 'options_page',
        targetId: page.slug,
        ip: options.ip ?? '',
      });
    });
    return page;
  }

  /** Removes a page of the site's owners; its values stay (a page made again finds them). */
  async removeSite(
    siteId: string,
    slug: string,
    options: { auth?: AuthContext; ip?: string } = {},
  ): Promise<void> {
    await this.run(siteId, options.auth?.userId, async (tx) => {
      const removed = await tx
        .delete(optionsPages)
        .where(and(eq(optionsPages.siteId, siteId), eq(optionsPages.slug, slug)))
        .returning({ slug: optionsPages.slug });
      if (removed.length === 0)
        throw new NotFoundException('There is no options page with this slug.');
      await this.audit.record(tx, {
        siteId,
        userId: options.auth?.userId ?? null,
        action: 'options_page.deleted',
        targetType: 'options_page',
        targetId: slug,
        ip: options.ip ?? '',
      });
    });
  }

  // ---- Every page --------------------------------------------------------------------------

  private async themePages(siteId: string): Promise<OptionsPageView[]> {
    const [site] = await this.run(siteId, undefined, (tx) =>
      tx.select({ theme: sites.themeSlug }).from(sites).where(eq(sites.id, siteId)),
    );
    const theme = await this.plugins.effectiveTheme(siteId, themeFor(site?.theme));
    return (theme.optionsPages ?? []).flatMap((page) => {
      const parsed = optionsPageSchema.safeParse(page);
      return parsed.success
        ? [{ ...(parsed.data as OptionsPageInput), source: 'theme' as const }]
        : [];
    });
  }

  /**
   * The options pages of a site: the plugins', the theme's, then the owners'
   * (a slug is used once, in that order), by position and title.
   */
  async pages(siteId: string): Promise<OptionsPageView[]> {
    const all: OptionsPageView[] = [
      ...(await this.plugins.pluginOptionsPages(siteId)),
      ...(await this.themePages(siteId)),
      ...(await this.listSite(siteId)).map((page) => ({ ...page, source: 'site' as const })),
    ];
    const seen = new Set<string>();
    const unique = all.filter((page) => !seen.has(page.slug) && seen.add(page.slug));
    return sortFieldGroups(unique.map((page) => ({ ...page, order: page.position ?? 100 }))).map(
      ({ order: _order, ...page }) => page as OptionsPageView,
    );
  }

  /** The pages a person may open (their capability). */
  async visiblePages(siteId: string, auth: AuthContext): Promise<OptionsPageView[]> {
    return (await this.pages(siteId)).filter((page) => allowed(page, auth));
  }

  async page(siteId: string, slug: string): Promise<OptionsPageView> {
    const page = (await this.pages(siteId)).find((p) => p.slug === slug);
    if (!page) throw new NotFoundException('There is no options page with this slug.');
    return page;
  }

  /** The groups of a page: whose `optionsPage` rules name it (for the person editing, with a role). */
  async groupsFor(siteId: string, slug: string, role?: string | null): Promise<FieldGroupView[]> {
    const groups = (await this.fieldGroups.groups(siteId, 'options')).filter(
      (g) => g.storage !== 'document',
    );
    if (role === undefined)
      return groups.filter((g) => mayMatchOptionsPage(g.location ?? [], slug));
    return this.fieldGroups.matching(siteId, {
      object: 'options',
      optionsPage: slug,
      currentUserRole: role,
    });
  }

  private async fieldsOf(siteId: string, page: OptionsPageView, role?: string | null) {
    return { own: page.fields ?? [], groups: await this.groupsFor(siteId, page.slug, role) };
  }

  // ---- Values ------------------------------------------------------------------------------

  /** The default language and, when it is another one, the stored key of a language. */
  private async localeKey(siteId: string, locale: string | undefined) {
    const defaultLocale = await this.run(siteId, undefined, (tx) => defaultLocaleIn(tx, siteId));
    const locales = await this.languages.locales(siteId, defaultLocale);
    if (!locale || locale === defaultLocale) return { key: BASE, locale: defaultLocale, locales };
    if (!locales.some((l) => l.code === locale)) {
      throw new BadRequestException(`The site has no language "${locale}".`);
    }
    return { key: locale, locale, locales };
  }

  private async stored(tx: SiteTransaction, slug: string): Promise<Map<string, FieldValues>> {
    const rows = await tx.select().from(optionValues).where(eq(optionValues.page, slug));
    return new Map(rows.map((row) => [row.locale, row.fields as FieldValues]));
  }

  /** The values of a page in a language (the default one when omitted), as stored. */
  async values(siteId: string, slug: string, locale?: string): Promise<FieldValues> {
    const page = await this.page(siteId, slug);
    const { key } = await this.localeKey(siteId, locale);
    const rows = await this.run(siteId, undefined, (tx) => this.stored(tx, slug));
    const base = rows.get(BASE) ?? {};
    if (key === BASE) return base;
    return localizedValues(await this.fieldsOf(siteId, page), base, rows.get(key));
  }

  /** A page as edited by someone: its fields and groups and its values in a language. */
  async screen(
    siteId: string,
    slug: string,
    auth: AuthContext,
    locale?: string,
  ): Promise<OptionsScreenView> {
    const page = await this.page(siteId, slug);
    if (!allowed(page, auth)) throw new ForbiddenException('You cannot open this options page.');
    const lang = await this.localeKey(siteId, locale);
    const fields = await this.fieldsOf(siteId, page, auth.role?.slug ?? null);
    const rows = await this.run(siteId, auth.userId, (tx) => this.stored(tx, slug));
    const base = rows.get(BASE) ?? {};
    const translationsOnly = lang.key !== BASE;
    const only = (list: readonly FieldDefinition[]) =>
      translationsOnly ? list.filter(translatableField) : [...list];
    return {
      page: { ...page, fields: only(page.fields ?? []) },
      groups: fields.groups
        .map((group) => ({ ...group, fields: only(group.fields) }))
        .filter((group) => group.fields.length > 0),
      values: translationsOnly ? localizedValues(fields, base, rows.get(lang.key)) : base,
      locale: lang.locale,
      locales: lang.locales.map((l) => ({ code: l.code, name: l.name, isDefault: l.isDefault })),
      translationsOnly,
    };
  }

  /**
   * Saves new values of a page, checked against its fields and groups
   * (required ones too); other values are kept. In a language other than
   * the default one only translatable fields are saved, as that language's.
   */
  async save(
    siteId: string,
    slug: string,
    changes: FieldValues,
    options: { auth?: AuthContext | null; locale?: string; ip?: string } = {},
  ): Promise<FieldValues> {
    const page = await this.page(siteId, slug);
    const auth = options.auth ?? null;
    if (auth && !allowed(page, auth)) {
      throw new ForbiddenException('You cannot save this options page.');
    }
    const lang = await this.localeKey(siteId, options.locale);
    const role = auth ? (auth.role?.slug ?? null) : undefined;
    const fields = await this.fieldsOf(siteId, page, role);
    const groupIds = new Set(fields.groups.map((g) => g.id));
    const rows = await this.run(siteId, auth?.userId, (tx) => this.stored(tx, slug));
    const base = rows.get(BASE) ?? {};
    // Own fields are replaced, groups merged field by field.
    const merge = (current: FieldValues, next: FieldValues) => {
      const out = { ...current };
      for (const [key, value] of Object.entries(next)) {
        out[key] =
          groupIds.has(key) && isRecord(value) && isRecord(current[key])
            ? { ...(current[key] as FieldValues), ...value }
            : value;
      }
      return out;
    };
    const translating = lang.key !== BASE;
    const local = translating
      ? merge(rows.get(lang.key) ?? {}, translatableValues(fields, changes, base))
      : undefined;
    const candidate = translating ? localizedValues(fields, base, local) : merge(base, changes);
    const screen = {
      object: 'options' as const,
      optionsPage: slug,
      ...(role !== undefined ? { currentUserRole: role } : {}),
    };
    const result = await this.fieldGroups.check(siteId, fields.own, candidate, screen);
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Some fields are not valid.',
        errors: result.errors,
      });
    }
    // A language keeps only what was written in it (as checked and normalized).
    const stored = translating ? sameKeys(result.values, local!) : result.values;
    await this.run(siteId, auth?.userId, async (tx) => {
      await tx
        .insert(optionValues)
        .values({ siteId, page: slug, locale: lang.key, fields: stored })
        .onConflictDoUpdate({
          target: [optionValues.siteId, optionValues.page, optionValues.locale],
          set: { fields: stored, updatedAt: sql`now()` },
        });
      await this.audit.record(tx, {
        siteId,
        userId: auth?.userId ?? null,
        action: 'options.updated',
        targetType: 'options_page',
        targetId: slug,
        ...(translating ? { meta: { locale: lang.locale } } : {}),
        ip: options.ip ?? '',
      });
    });
    // Pages may show options anywhere (header, footer…).
    await this.cache.invalidate(siteId, ['site']);
    return translating ? localizedValues(fields, base, stored) : stored;
  }

  /**
   * Every page's values in a language, formatted for templates (`useOption`,
   * dynamic data): by field name, `group.name` and each group's id. Only
   * pages with values.
   */
  async formatted(scope: FormatScope): Promise<Record<string, Record<string, unknown>>> {
    const rows = await scope.tx.select().from(optionValues);
    if (rows.length === 0) return {};
    const defaultLocale = await defaultLocaleIn(scope.tx, scope.siteId);
    const key = scope.locale === defaultLocale ? BASE : scope.locale;
    const byPage = new Map<string, Map<string, FieldValues>>();
    for (const row of rows) {
      (byPage.get(row.page) ?? byPage.set(row.page, new Map()).get(row.page)!).set(
        row.locale,
        row.fields as FieldValues,
      );
    }
    const pages = await this.pages(scope.siteId);
    const groups = (await this.fieldGroups.groups(scope.siteId, 'options')).filter(
      (g) => g.storage !== 'document',
    );
    const context = formatContext(scope.tx, scope.siteId, scope.locale, scope.urls);
    const out: Record<string, Record<string, unknown>> = {};
    for (const [slug, stored] of byPage) {
      const page = pages.find((p) => p.slug === slug);
      // Values of a page no longer defined: as they are.
      const fields: PageFields = page
        ? {
            own: page.fields ?? [],
            groups: groups.filter((g) => mayMatchOptionsPage(g.location ?? [], slug)),
          }
        : { own: [], groups: [] };
      const base = stored.get(BASE) ?? {};
      const values = key === BASE ? base : localizedValues(fields, base, stored.get(key));
      out[slug] = await formattedFields(fields.own, fields.groups, values, context);
      if (!page) Object.assign(out[slug], values);
    }
    return out;
  }

  /** Every value of every page, with references as refs, for a site export. */
  async exportValues(
    siteId: string,
  ): Promise<{ page: string; locale?: string; fields: FieldValues }[]> {
    const rows = await this.run(siteId, undefined, (tx) =>
      tx.select().from(optionValues).orderBy(asc(optionValues.page), asc(optionValues.locale)),
    );
    if (rows.length === 0) return [];
    const pages = await this.pages(siteId);
    const out: { page: string; locale?: string; fields: FieldValues }[] = [];
    for (const row of rows) {
      const page = pages.find((p) => p.slug === row.page);
      const values = row.fields as FieldValues;
      let fields = values;
      if (page) {
        const defs = await this.fieldsOf(siteId, page);
        fields = exportFieldValues(defs.own, values);
        for (const group of defs.groups) {
          if (isRecord(values[group.id]))
            fields[group.id] = exportFieldValues(group.fields, values[group.id] as FieldValues);
        }
      }
      out.push({ page: row.page, ...(row.locale ? { locale: row.locale } : {}), fields });
    }
    return out;
  }
}

/** Whether a person may open a page (its capability, `manage_settings` by default). */
export function allowed(page: OptionsPageInput, auth: AuthContext): boolean {
  return auth.capabilities.includes(page.capability ?? OPTIONS_PAGE_CAPABILITY);
}
