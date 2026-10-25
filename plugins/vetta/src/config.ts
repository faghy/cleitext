/**
 * Vetta's settings: one flat map of values (like the fields of a form),
 * stored under `config`. Per content type and taxonomy keys carry the slug:
 * `pt_<type>_title`, `tax_<taxonomy>_robots_noindex`. Missing values take
 * the defaults below.
 */

export type Config = Record<string, unknown>;

/** Modules that can be switched off on the dashboard. */
export const MODULES = [
  'analysis',
  'schema',
  'social',
  'sitemap',
  'breadcrumbs',
  'localSeo',
  'imageSeo',
  'links',
  'llms',
  'robotsTxt',
  'monitor404',
  'indexNow',
] as const;
export type Module = (typeof MODULES)[number];

/** On unless switched off; these few are off until switched on. */
const OFF_BY_DEFAULT: Module[] = ['localSeo', 'imageSeo', 'llms', 'robotsTxt', 'monitor404'];

export const DEFAULTS: Config = {
  separator: '–',
  capitalize_titles: false,
  robots_noindex: false,
  robots_nofollow: false,
  robots_noarchive: false,
  robots_noimageindex: false,
  robots_nosnippet: false,
  max_snippet: -1,
  max_video_preview: -1,
  max_image_preview: 'large',
  noindex_empty_terms: true,
  noindex_search: true,
  noindex_paginated: false,
  home_title: '%sitename% %page% %sep% %sitedesc%',
  home_description: '',
  search_title: '%search_query% %page% %sep% %sitename%',
  not_found_title: '%title% %sep% %sitename%',
  author_title: '%name% %sep% %sitename% %page%',
  author_noindex: true,
  og_image: null,
  twitter_card: 'summary_large_image',
  twitter_site: '',
  facebook_url: '',
  facebook_app_id: '',
  knowledge_kind: 'organization',
  knowledge_name: '',
  knowledge_alternate: '',
  knowledge_logo: null,
  knowledge_description: '',
  knowledge_email: '',
  knowledge_phone: '',
  knowledge_same_as: [],
  local_type: 'LocalBusiness',
  local_street: '',
  local_locality: '',
  local_region: '',
  local_postal_code: '',
  local_country: '',
  local_hours: [],
  local_price_range: '',
  local_legal_name: '',
  local_vat_id: '',
  local_latitude: '',
  local_longitude: '',
  verify_google: '',
  verify_bing: '',
  verify_yandex: '',
  verify_baidu: '',
  verify_pinterest: '',
  verify_norton: '',
  breadcrumbs_separator: '›',
  breadcrumbs_home: true,
  breadcrumbs_home_label: '',
  breadcrumbs_prefix: '',
  breadcrumbs_search_format: '',
  breadcrumbs_hide_title: false,
  sitemap_images: true,
  sitemap_exclude: '',
  links_nofollow_external: false,
  links_new_window_external: true,
  links_nofollow_images: false,
  links_nofollow_domains: '',
  links_follow_domains: '',
  image_add_alt: true,
  image_alt_format: '%filename%',
  image_add_title: false,
  image_title_format: '%title% %count(title)%',
  llms_limit: 50,
  llms_summary: '',
  llms_extra: '',
  robots_txt: '',
  monitor_limit: 500,
  monitor_ignore_query: true,
  monitor_exclude: '',
  indexnow_key: '',
  indexnow_auto: true,
};

/** Defaults per content type: `pt_<slug>_<name>`. */
export const TYPE_DEFAULTS: Record<string, unknown> = {
  title: '%title% %sep% %sitename%',
  description: '%excerpt%',
  custom_robots: false,
  robots_noindex: false,
  robots_nofollow: false,
  schema: 'auto',
  sitemap: true,
  llms: true,
  indexnow: true,
};

/** Defaults per taxonomy: `tax_<slug>_<name>`. */
export const TAXONOMY_DEFAULTS: Record<string, unknown> = {
  title: '%term% %sep% %sitename%',
  description: '%term_description%',
  custom_robots: false,
  robots_noindex: false,
  robots_nofollow: false,
  sitemap: true,
};

/** The key part of a slug (`event-series` → `event_series`). */
export const keyOf = (slug: string) => slug.replace(/[^a-z0-9]/gi, '_').toLowerCase();

export function value(config: Config, key: string): unknown {
  return key in config && config[key] !== undefined && config[key] !== null && config[key] !== ''
    ? config[key]
    : DEFAULTS[key];
}

export function text(config: Config, key: string): string {
  const v = value(config, key);
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
}

export function flag(config: Config, key: string): boolean {
  return value(config, key) === true;
}

export function typeValue(config: Config, type: string, name: string): unknown {
  const v = config[`pt_${keyOf(type)}_${name}`];
  return v === undefined || v === null || v === '' ? TYPE_DEFAULTS[name] : v;
}

export function taxonomyValue(config: Config, taxonomy: string, name: string): unknown {
  const v = config[`tax_${keyOf(taxonomy)}_${name}`];
  // Tags stay out of search by default, as Rank Math and Yoast do.
  if ((v === undefined || v === null || v === '') && taxonomy === 'tag') {
    if (name === 'custom_robots' || name === 'robots_noindex') return true;
    if (name === 'sitemap') return false;
  }
  return v === undefined || v === null || v === '' ? TAXONOMY_DEFAULTS[name] : v;
}

export function moduleOn(config: Config, module: Module): boolean {
  const v = config[`module_${module}`];
  return typeof v === 'boolean' ? v : !OFF_BY_DEFAULT.includes(module);
}

/** Lines of a textarea, trimmed, without empty ones. */
export const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const KEY_RE = /^[a-z][a-zA-Z0-9_]{0,95}$/;

/**
 * Settings sent from the admin, kept to plain values: strings (at most
 * 20,000 characters), numbers, booleans, null, lists of strings and lists of
 * small objects of those. Unknown shapes are dropped.
 */
export function sanitizeConfig(input: unknown): Config {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Config = {};
  const scalar = (v: unknown): v is string | number | boolean | null =>
    v === null ||
    typeof v === 'boolean' ||
    (typeof v === 'number' && Number.isFinite(v)) ||
    typeof v === 'string';
  for (const [key, raw] of Object.entries(input as Record<string, unknown>).slice(0, 2000)) {
    if (!KEY_RE.test(key)) continue;
    if (scalar(raw)) {
      out[key] = typeof raw === 'string' ? raw.slice(0, 20_000) : raw;
    } else if (Array.isArray(raw)) {
      const list = raw.slice(0, 200).filter((item) => {
        if (typeof item === 'string') return item.length <= 2000;
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        return Object.entries(item as Record<string, unknown>).every(
          ([k, v]) => KEY_RE.test(k) && scalar(v) && (typeof v !== 'string' || v.length <= 2000),
        );
      });
      out[key] = list;
    }
  }
  return out;
}

/** The per-entry fields of Vetta (field group `vetta`). */
export interface EntrySeo {
  title?: string | null;
  description?: string | null;
  keywords?: string | null;
  noindex?: boolean | null;
  nofollow?: boolean | null;
  noarchive?: boolean | null;
  noimageindex?: boolean | null;
  nosnippet?: boolean | null;
  canonical?: string | null;
  breadcrumbTitle?: string | null;
  pillar?: boolean | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  schema?: string | null;
  /** The title came from the SEO plugin, where it is the page's part of the title only. */
  legacyTitle?: boolean;
}

/** An entry's Vetta fields, falling back to the `seo` plugin's ones (sites moving over). */
export function entrySeo(fields: Record<string, unknown> | undefined): EntrySeo {
  const own = (fields?.vetta ?? {}) as EntrySeo;
  const old = (fields?.seo ?? {}) as {
    title?: string | null;
    description?: string | null;
    keyphrase?: string | null;
    noindex?: boolean | null;
    canonical?: string | null;
    socialImage?: string | null;
    /** Imported from Yoast SEO or Rank Math: the whole title, as there. */
    fullTitle?: boolean | null;
  };
  // The SEO plugin's own titles are the page's part; imported ones and those
  // with variables (`%%title%% - %%sitename%%`) are already the whole title.
  const legacy =
    !own.title?.trim() &&
    Boolean(old.title?.trim()) &&
    old.fullTitle !== true &&
    !/%%[a-z_]+%%/.test(old.title ?? '');
  return {
    ...own,
    title: own.title?.trim() || old.title?.trim() || null,
    ...(legacy ? { legacyTitle: true } : {}),
    description: own.description?.trim() || old.description?.trim() || null,
    keywords: own.keywords?.trim() || old.keyphrase?.trim() || null,
    noindex: own.noindex ?? old.noindex ?? null,
    canonical: own.canonical?.trim() || old.canonical?.trim() || null,
    ogImage: own.ogImage || old.socialImage || null,
  };
}

/** The keywords of an entry: the first is the main one; at most five. */
export function keywordsOf(seo: EntrySeo): string[] {
  return (seo.keywords ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 5);
}
