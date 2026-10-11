/** Settings of the SEO page, shared by the server and the admin. */

export interface SeoConfig {
  /** Content types kept out of search results: noindex, and no sitemap. */
  hiddenTypes: string[];
  /** Taxonomies whose archives are kept out of search results. */
  hiddenTaxonomies: string[];
  /** Images of the pages in the XML sitemaps. */
  sitemapImages: boolean;
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
