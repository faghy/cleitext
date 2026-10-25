import type { ContentLocale, TranslatableKind, TranslationLink } from '@cleitext/plugin-sdk';
import {
  siteDomains,
  sites,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { PageCacheService } from '../public/page-cache.service.js';

const CACHE_MS = 30_000;

/** Where the core keeps language data for a language plugin (migration 0016, imports). */
export const PENDING = { namespace: 'languages', key: 'pending' } as const;
const CODE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Content languages of a site (M7). The core knows only the default
 * language; a language plugin (permission `languages`) adds the others and
 * links translations. Without one, nothing here touches the database or
 * calls a plugin: monolingual sites pay nothing for multilingual support.
 */
@Injectable()
export class LanguagesService {
  private readonly cache = new Map<string, { value: ContentLocale[]; expiresAt: number }>();

  constructor(
    private readonly host: PluginHost,
    cache: PageCacheService,
    @Inject(DATABASE) private readonly database: DatabaseClient,
  ) {
    // `changed()` in any process clears every process.
    cache.onSiteChange(() => this.cache.clear());
  }

  /** The site's languages, the default first and without a prefix. */
  async locales(siteId: string, defaultLocale: string): Promise<ContentLocale[]> {
    const only: ContentLocale[] = [
      { code: defaultLocale, name: defaultLocale.toUpperCase(), prefix: '', isDefault: true },
    ];
    const plugin = await this.host.languagePlugin(siteId);
    if (!plugin) return only;

    const key = `${siteId}|${defaultLocale}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const outcome = await this.host.runHook(
      { plugin: plugin.slug, name: 'languages.locales', siteId },
      () => plugin.languageProvider!.locales(siteId),
    );
    const value = outcome.ok ? normalize(outcome.value, defaultLocale) : only;
    // A language domain must be one of the site's own domains, not the primary one.
    if (value.some((l) => l.host)) {
      const aliases = new Set(
        (
          await withContext(this.database.db, { siteId }, (tx) =>
            tx
              .select({ host: siteDomains.host })
              .from(siteDomains)
              .where(and(eq(siteDomains.siteId, siteId), eq(siteDomains.isPrimary, false))),
          )
        ).map((d) => d.host.toLowerCase()),
      );
      for (const locale of value) if (locale.host && !aliases.has(locale.host)) delete locale.host;
    }
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_MS });
    return value;
  }

  /**
   * Whether a secondary domain of the site serves one of its languages (it
   * is then not redirected to the primary one). Only asked for those domains.
   */
  async isLanguageHost(siteId: string, host: string): Promise<boolean> {
    if (!(await this.host.languagePlugin(siteId))) return false;
    const defaultLocale = await withContext(this.database.db, { siteId }, (tx) =>
      defaultLocaleIn(tx, siteId),
    );
    const name = host.toLowerCase();
    return (await this.locales(siteId, defaultLocale)).some((l) => l.host === name);
  }

  /** The site's languages, reading its default language in the transaction. */
  async localesIn(tx: SiteTransaction, siteId: string): Promise<ContentLocale[]> {
    return this.locales(siteId, await defaultLocaleIn(tx, siteId));
  }

  /** Whether a language can be used for content on the site. */
  async allowed(siteId: string, defaultLocale: string, code: string): Promise<boolean> {
    if (code === defaultLocale) return true;
    return (await this.locales(siteId, defaultLocale)).some((l) => l.code === code);
  }

  /** Other language versions of the given items; empty without a language plugin. */
  async translations(
    siteId: string,
    kind: TranslatableKind,
    ids: string[],
  ): Promise<Map<string, TranslationLink[]>> {
    const result = new Map<string, TranslationLink[]>();
    if (ids.length === 0) return result;
    const plugin = await this.host.languagePlugin(siteId);
    if (!plugin) return result;
    const outcome = await this.host.runHook(
      { plugin: plugin.slug, name: 'languages.translations', siteId },
      () => plugin.languageProvider!.translations(siteId, kind, [...new Set(ids)]),
    );
    if (!outcome.ok) return result;
    for (const id of ids) {
      const links = outcome.value[id];
      if (Array.isArray(links)) {
        result.set(
          id,
          links.filter((l) => l && typeof l.id === 'string' && typeof l.locale === 'string'),
        );
      }
    }
    return result;
  }

  /**
   * For lists in `locale` (never the default language): the entries already
   * translated into it, when the language plugin shows the untranslated ones
   * of the default language; null otherwise.
   */
  async fallback(siteId: string, locale: string): Promise<string[] | null> {
    const plugin = await this.host.languagePlugin(siteId);
    const provide = plugin?.languageProvider?.fallback;
    if (!plugin || !provide) return null;
    const outcome = await this.host.runHook(
      { plugin: plugin.slug, name: 'languages.fallback', siteId },
      () => provide.call(plugin.languageProvider, siteId, locale),
    );
    if (!outcome.ok || !Array.isArray(outcome.value)) return null;
    return outcome.value.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id));
  }

  /**
   * The block the language plugin gives as the site's language switcher
   * (plugin API 1.54), for themes placing `<LanguageSwitcher>`: one of its
   * own registered blocks, else null.
   */
  async switcherBlock(siteId: string): Promise<string | null> {
    const plugin = await this.host.languagePlugin(siteId);
    const type = plugin?.languageProvider?.switcher?.block;
    if (!plugin || typeof type !== 'string') return null;
    return plugin.blocks.some((block) => block.type === type) ? type : null;
  }

  /** Whether the site has a language plugin (the multilingual UI shows only then). */
  async multilingual(siteId: string): Promise<boolean> {
    return (await this.host.languagePlugin(siteId)) !== null;
  }
}

/** Trusts nothing from the plugin: valid codes, unique, the default first, prefixes safe. */
function normalize(list: ContentLocale[], defaultLocale: string): ContentLocale[] {
  const seen = new Set<string>();
  const out: ContentLocale[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item.code !== 'string' || !CODE_RE.test(item.code) || seen.has(item.code))
      continue;
    seen.add(item.code);
    const isDefault = item.code === defaultLocale;
    const prefix =
      isDefault || typeof item.prefix !== 'string'
        ? ''
        : item.prefix
            .trim()
            .replace(/\/+$/, '')
            .replace(/^(?!\/)/, '/');
    const host =
      !isDefault &&
      typeof item.host === 'string' &&
      /^[a-z0-9.-]{1,253}$/.test(item.host.toLowerCase())
        ? item.host.toLowerCase()
        : undefined;
    out.push({
      code: item.code,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : item.code,
      prefix: isDefault || /^\/[a-z0-9-]+$/i.test(prefix) ? prefix : `/${item.code}`,
      isDefault,
      ...(host ? { host } : {}),
    });
  }
  const index = out.findIndex((l) => l.isDefault);
  if (index === -1) {
    out.unshift({
      code: defaultLocale,
      name: defaultLocale.toUpperCase(),
      prefix: '',
      isDefault: true,
    });
  } else if (index > 0) {
    out.unshift(...out.splice(index, 1));
  }
  // A language without a prefix would clash with the default.
  for (const locale of out)
    if (!locale.isDefault && !locale.prefix) locale.prefix = `/${locale.code}`;
  return out;
}

export async function defaultLocaleIn(tx: SiteTransaction, siteId: string): Promise<string> {
  const [site] = await tx
    .select({ defaultLocale: sites.defaultLocale })
    .from(sites)
    .where(eq(sites.id, siteId));
  return site?.defaultLocale ?? 'en';
}
