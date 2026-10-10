import type { ContentLocale } from '@cleitext/plugin-sdk';

/**
 * Public URLs (docs/SPECIFICATIONS.md RF-SET-03): permalink patterns per
 * content type, language prefixes, hierarchical page paths.
 *
 * Languages come from the language plugin (LanguagesService): the default
 * has no prefix. Without the plugin there is only the default language.
 */

export interface TypeInfo {
  slug: string;
  permalink: string;
  hierarchical: boolean;
}

export interface EntryRef {
  id: string;
  typeSlug: string;
  locale: string;
  slug: string;
  parentId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

/** Where a page is served, when some language has its own domain. */
export interface UrlOrigin {
  host: string;
  primaryHost: string;
  scheme: string;
}

export class UrlBuilder {
  private origin: UrlOrigin | null = null;

  constructor(
    private readonly locales: ContentLocale[],
    private readonly types: Map<string, TypeInfo>,
    /** Path segments of hierarchical entries by id (e.g. ['about', 'team']). */
    private readonly paths: Map<string, string[]>,
  ) {}

  get defaultLocale(): string {
    return (this.locales.find((l) => l.isDefault) ?? this.locales[0])?.code ?? 'en';
  }

  /**
   * The host serving the page. Addresses of languages served on another
   * domain become absolute. Only set when some language has a domain.
   */
  at(origin: UrlOrigin): this {
    this.origin = origin;
    return this;
  }

  /** The language whose own domain serves this page, if any. */
  hostLocale(): string | null {
    if (!this.origin || this.locales.length < 2) return null;
    return this.locales.find((l) => !l.isDefault && l.host === this.origin!.host)?.code ?? null;
  }

  /** Path prefix of a language: none for the default one and for those with a domain. */
  prefix(locale: string): string {
    if (this.locales.length < 2) return '';
    const info = this.locales.find((l) => l.code === locale);
    if (!info || info.isDefault || info.host || !info.prefix) return '';
    return normalizePrefix(info.prefix);
  }

  /** What comes before a path: the prefix, and the origin when on another domain. */
  private base(locale: string): string {
    const prefix = this.prefix(locale);
    if (!this.origin || this.locales.length < 2) return prefix;
    const info = this.locales.find((l) => l.code === locale);
    const target = info && !info.isDefault && info.host ? info.host : this.origin.primaryHost;
    return target === this.origin.host ? prefix : `${this.origin.scheme}://${target}${prefix}`;
  }

  home(locale: string): string {
    const base = this.base(locale);
    return !base ? '/' : /^https?:\/\/[^/]+$/.test(base) ? `${base}/` : base;
  }

  /** RSS feed of the latest posts in a language (RF-THM-08). */
  feed(locale: string): string {
    return `${this.base(locale)}/feed`;
  }

  search(locale: string): string {
    return `${this.base(locale)}/search`;
  }

  term(taxonomy: string, slug: string, locale: string): string {
    return `${this.base(locale)}/${taxonomy}/${slug}`;
  }

  entry(entry: EntryRef): string {
    const type = this.types.get(entry.typeSlug);
    const pattern = type?.permalink ?? '/{slug}';
    const date = entry.publishedAt ?? entry.createdAt;
    const path = pattern
      .replace('{path}', (this.paths.get(entry.id) ?? [entry.slug]).join('/'))
      .replace('{slug}', entry.slug)
      .replace('{year}', String(date.getUTCFullYear()))
      .replace('{month}', String(date.getUTCMonth() + 1).padStart(2, '0'));
    return `${this.base(entry.locale)}${path}`;
  }

  /** `/page/2` style pagination of a listing URL. */
  page(base: string, page: number): string {
    if (page <= 1) return base;
    return `${base.replace(/\/$/, '')}/page/${page}`;
  }

  /** Splits `/it/foo` into the language and the rest of the path. */
  splitLocale(path: string): { locale: string; rest: string } {
    const onDomain = this.hostLocale();
    if (onDomain) return { locale: onDomain, rest: path };
    for (const info of this.locales) {
      if (info.isDefault || info.host || !info.prefix) continue;
      const prefix = normalizePrefix(info.prefix);
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        return { locale: info.code, rest: path.slice(prefix.length) || '/' };
      }
    }
    return { locale: this.defaultLocale, rest: path };
  }
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export interface PermalinkMatch {
  type: string;
  slug: string;
  /** Parent slugs for hierarchical types. */
  parents: string[];
  year?: number;
  month?: number;
}

/**
 * Matches a path against the permalink patterns. Patterns with fixed parts
 * or dates are tried before catch-all `{path}` patterns.
 */
export function matchPermalink(path: string, types: TypeInfo[]): PermalinkMatch | null {
  const ordered = [...types].sort((a, b) => specificity(b.permalink) - specificity(a.permalink));
  for (const type of ordered) {
    const regex = patternToRegex(type.permalink);
    const match = regex.exec(path);
    if (!match?.groups) continue;
    const { path: fullPath, slug, year, month } = match.groups;
    if (fullPath) {
      const segments = fullPath.split('/');
      return { type: type.slug, slug: segments.at(-1)!, parents: segments.slice(0, -1) };
    }
    if (slug) {
      return {
        type: type.slug,
        slug,
        parents: [],
        ...(year ? { year: Number(year) } : {}),
        ...(month ? { month: Number(month) } : {}),
      };
    }
  }
  return null;
}

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';

function patternToRegex(pattern: string): RegExp {
  let source = '';
  for (const part of pattern.split(/(\{[a-z]+\})/)) {
    if (part === '{path}') source += `(?<path>${SEGMENT}(?:/${SEGMENT})*)`;
    else if (part === '{slug}') source += `(?<slug>${SEGMENT})`;
    else if (part === '{year}') source += '(?<year>\\d{4})';
    else if (part === '{month}') source += '(?<month>\\d{2})';
    else source += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}/?$`);
}

function specificity(pattern: string): number {
  if (pattern.includes('{path}')) return 0;
  return (
    pattern.replace(/\{[a-z]+\}/g, '').length +
    (pattern.match(/\{(year|month)\}/g)?.length ?? 0) * 10
  );
}
