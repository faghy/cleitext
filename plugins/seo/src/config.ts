/** Settings of the SEO page, shared by the server and the admin. */

export interface SeoConfig {
  /** Content types kept out of search results: noindex, and no sitemap. */
  hiddenTypes: string[];
  /** Taxonomies whose archives are kept out of search results. */
  hiddenTaxonomies: string[];
  /** Images of the pages in the XML sitemaps. */
  sitemapImages: boolean;
  /** Title templates by content type, e.g. `%%title%% %%sep%% %%sitename%%`. */
  titles: Record<string, string>;
  /** Who the site represents, for Google's knowledge panel (schema.org). */
  representation: {
    kind: 'organization' | 'person';
    name: string;
    /** Absolute address of the logo (organization) or photo (person). */
    logo: string;
    /** Social profiles and other pages about it. */
    sameAs: string[];
  };
}

export const DEFAULT_CONFIG: SeoConfig = {
  hiddenTypes: [],
  hiddenTaxonomies: [],
  sitemapImages: true,
  titles: {},
  representation: { kind: 'organization', name: '', logo: '', sameAs: [] },
};

export function withDefaults(saved: Partial<SeoConfig> | null): SeoConfig {
  const value = saved ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...value,
    representation: { ...DEFAULT_CONFIG.representation, ...value.representation },
  };
}

export const DEFAULT_TITLE = '%%title%% %%sep%% %%sitename%%';

/** The variables of title templates, as in Yoast SEO. */
export const TITLE_VARIABLES = [
  'title',
  'sep',
  'sitename',
  'excerpt',
  'category',
  'currentyear',
  'page',
] as const;

/**
 * Yoast SEO's `%%page%%` on an archive's later pages: the separator, then
 * "Page 2 of 22" ("Pagina 2 di 22"); nothing on the first page.
 */
export function pageVariable(
  locale: string,
  separator: string,
  page: number | undefined,
  pages: number | undefined,
): string {
  if (!page || page < 2) return '';
  const it = locale.toLowerCase().startsWith('it');
  const of = pages && pages >= page ? ` ${it ? 'di' : 'of'} ${pages}` : '';
  return `${separator} ${it ? 'Pagina' : 'Page'} ${page}${of}`;
}

export function applyTemplate(template: string, values: Record<string, string>): string {
  return (
    template
      .replace(/%%([a-z_]+)%%/g, (_m, name: string) => values[name] ?? '')
      .replace(/\s{2,}/g, ' ')
      // A variable without a value leaves no double separator ("Title – – Site").
      .replace(/(\s[-–—|·:])(?:\s+[-–—|·:])+(?=\s|$)/g, '$1')
      .replace(/^\s*[-–—|·:]\s*|\s*[-–—|·:]\s*$/g, '')
      .trim()
  );
}
