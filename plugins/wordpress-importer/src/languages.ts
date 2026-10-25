/**
 * The languages of a multilingual WordPress site, as its export shows them
 * (since 1.28.0). Pure functions, used by the server and by the admin's
 * preview of the file (no XML parser, no Node APIs).
 *
 * What a WXR can say about languages:
 * - WPML: with its "Export and Import" add-on, every post has the meta
 *   `_wpml_import_language_code`, `_wpml_import_source_language_code` and
 *   `_wpml_import_translation_group` (WPML's `trid`); other tools write
 *   `wpml_language`, `language_code`, `trid` or `_icl_lang_duplicate_of`,
 *   and some a map of the translations (`_icl_translations`, JSON or PHP).
 * - Polylang: every post is in a term of the `language` taxonomy
 *   (`<category domain="language" nicename="en">`) and translations share a
 *   `post_translations` term.
 * - Addresses: posts of the other languages have links starting with their
 *   language (`/en/rooms/`, or `?lang=en`) when the site used directories.
 * - WP-CLI's export of a WPML site has none of these: translations share the
 *   address of the page in the main language (see wpml.ts).
 */

/** What the detection reads of an item of the export. */
export interface ItemFacts {
  id: number;
  type: string;
  /** The item's address, as exported. */
  link: string;
  /** Post meta that may hold languages (only the keys below are needed). */
  meta: Record<string, string>;
  /** Terms of the item (`<category domain nicename>`). */
  categories: { domain: string; nicename: string }[];
}

export const LANGUAGE_KEYS = [
  '_wpml_import_language_code',
  'wpml_language',
  '_wpml_language',
  'language_code',
  '_icl_lang',
];
export const GROUP_KEYS = [
  '_wpml_import_translation_group',
  'trid',
  '_wpml_trid',
  'wpml_trid',
  '_icl_trid',
];
export const SOURCE_KEYS = ['_wpml_import_source_language_code', 'source_language_code'];
export const DUPLICATE_KEYS = ['_icl_lang_duplicate_of'];
export const MAP_KEYS = ['_icl_translations', 'icl_translations', '_wpml_translations'];
/** Every meta key the detection reads. */
export const META_KEYS = new Set([
  ...LANGUAGE_KEYS,
  ...GROUP_KEYS,
  ...SOURCE_KEYS,
  ...DUPLICATE_KEYS,
  ...MAP_KEYS,
]);
/** Taxonomies whose terms are languages (Polylang's, and WPML's in some exports). */
const LANGUAGE_TAXONOMIES = new Set(['language', 'wpml_language']);
const GROUP_TAXONOMY = 'post_translations';

/** WordPress's language codes (`en`, `pt-br`, `zh_hans`): lowercase, with `-`. */
export function languageCode(value: string): string | null {
  const code = value.trim().toLowerCase().replace(/_/g, '-');
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(code) ? code : null;
}

/** The site's language for a WordPress language code: the same, or the same base language. */
export function matchLocale(code: string, locales: string[]): string | null {
  const wanted = code.toLowerCase();
  const exact = locales.find((l) => l.toLowerCase() === wanted);
  if (exact) return exact;
  const base = wanted.split('-')[0]!;
  return (
    locales.find((l) => l.toLowerCase() === base) ??
    locales.find((l) => l.toLowerCase().split('-')[0] === base) ??
    null
  );
}

/** The language at the start of an address (`/en/…`, `?lang=en`), if it is one of `codes`. */
export function addressLanguage(link: string, codes: Set<string>): string | null {
  let path: string;
  let query: string;
  try {
    const url = new URL(link, 'https://x.invalid');
    path = url.pathname;
    query = url.searchParams.get('lang') ?? '';
  } catch {
    return null;
  }
  const fromQuery = query && languageCode(query);
  if (fromQuery && codes.has(fromQuery)) return fromQuery;
  const first = languageCode(path.split('/')[1] ?? '');
  return first && codes.has(first) ? first : null;
}

/** The address without its language (`/en/rooms/` → `/rooms/`). */
function withoutLanguage(link: string, code: string): string {
  try {
    const url = new URL(link, 'https://x.invalid');
    url.searchParams.delete('lang');
    const parts = url.pathname.split('/');
    if (languageCode(parts[1] ?? '') === code) parts.splice(1, 1);
    return `${parts.join('/') || '/'}${url.search}`;
  } catch {
    return link;
  }
}

/** A map of translations (`{"it":12,"en":34}` or PHP's `a:2:{s:2:"it";i:12;…}`): the ids. */
function translationIds(value: string): number[] {
  const ids: number[] = [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object') {
      for (const id of Object.values(parsed as Record<string, unknown>)) {
        const n = Number(id);
        if (Number.isInteger(n) && n > 0) ids.push(n);
      }
      return ids;
    }
  } catch {
    // PHP's serialize()
  }
  for (const match of value.matchAll(/s:\d+:"[^"]{1,20}";(?:i:(\d+)|s:\d+:"(\d+)");/g)) {
    const n = Number(match[1] ?? match[2]);
    if (n > 0) ids.push(n);
  }
  return ids;
}

export interface LanguageDetection {
  /** Where the languages come from. */
  source: 'wpml' | 'polylang' | 'addresses' | null;
  /**
   * Each item's language (a WordPress code); items without one are in the
   * main language when `source` is `addresses`, unknown otherwise.
   */
  languages: Map<number, string>;
  /** Items that translate each other: group → ids (groups of one are left out). */
  groups: Map<string, number[]>;
  /** The languages found, with how many items each has, the main one first. */
  found: { code: string; count: number }[];
  /** The main language (of the originals), when the data says. */
  main: string | null;
}

const first = (meta: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = meta[key]?.trim();
    if (value) return value;
  }
  return '';
};

/**
 * Languages and translation groups of the items. `prefixes` are the codes
 * accepted at the start of addresses (the site's languages); codes found in
 * the meta or terms are accepted too.
 */
export function detectLanguages(items: ItemFacts[], prefixes: string[] = []): LanguageDetection {
  const languages = new Map<number, string>();
  let source: LanguageDetection['source'] = null;
  const originals = new Map<string, number>();
  // Union-find of the items that translate each other.
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    let root = id;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  };
  const known = new Set(items.map((i) => i.id));
  const byGroup = new Map<string, number>();
  const join = (key: string, id: number) => {
    const other = byGroup.get(key);
    if (other === undefined) byGroup.set(key, id);
    else union(other, id);
  };

  for (const item of items) {
    const meta = languageCode(first(item.meta, LANGUAGE_KEYS));
    const term = item.categories.find((c) => LANGUAGE_TAXONOMIES.has(c.domain));
    const termCode = term ? languageCode(term.nicename) : null;
    if (meta) {
      languages.set(item.id, meta);
      source = 'wpml';
    } else if (termCode) {
      languages.set(item.id, termCode);
      source ??= term!.domain === 'language' ? 'polylang' : 'wpml';
    }
    const group = first(item.meta, GROUP_KEYS);
    if (group) join(`g:${group}`, item.id);
    const polylang = item.categories.find((c) => c.domain === GROUP_TAXONOMY);
    if (polylang?.nicename) join(`p:${polylang.nicename}`, item.id);
    const duplicateOf = Number(first(item.meta, DUPLICATE_KEYS));
    if (duplicateOf > 0 && known.has(duplicateOf)) union(duplicateOf, item.id);
    const map = first(item.meta, MAP_KEYS);
    if (map) for (const id of translationIds(map)) if (known.has(id)) union(id, item.id);
    const sourceLanguage = languageCode(first(item.meta, SOURCE_KEYS));
    if (languages.has(item.id) && !sourceLanguage && (group || polylang)) {
      const code = languages.get(item.id)!;
      originals.set(code, (originals.get(code) ?? 0) + 1);
    }
  }

  // Addresses with a language at the start: the language of the item, and the
  // page with the same address without it is the one it translates.
  const codes = new Set([
    ...prefixes.map((p) => languageCode(p)).filter((c): c is string => Boolean(c)),
    ...languages.values(),
  ]);
  const prefixed: { item: ItemFacts; code: string }[] = [];
  for (const item of items) {
    const code = item.link ? addressLanguage(item.link, codes) : null;
    if (!code) continue;
    prefixed.push({ item, code });
    if (!languages.has(item.id)) {
      languages.set(item.id, code);
      source ??= 'addresses';
    }
  }
  if (prefixed.length > 0) {
    const plain = new Map<string, number>();
    const prefixedIds = new Set(prefixed.map((p) => p.item.id));
    for (const item of items) {
      if (item.link && !prefixedIds.has(item.id))
        plain.set(`${item.type}|${pathOf(item.link)}`, item.id);
    }
    for (const { item, code } of prefixed) {
      const original = plain.get(`${item.type}|${pathOf(withoutLanguage(item.link, code))}`);
      if (original !== undefined) union(original, item.id);
    }
  }

  const groups = new Map<string, number[]>();
  for (const item of items) {
    if (!parent.has(item.id)) continue;
    const root = find(item.id);
    const key = `wp:${root}`;
    groups.set(key, [...(groups.get(key) ?? []), item.id]);
  }
  for (const [key, ids] of groups) if (ids.length < 2) groups.delete(key);

  const counts = new Map<string, number>();
  for (const code of languages.values()) counts.set(code, (counts.get(code) ?? 0) + 1);
  const ranked = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1])[0]?.[0];
  const main =
    source === 'addresses'
      ? null
      : (ranked(originals) ?? (source ? (ranked(counts) ?? null) : null));
  const found = [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => (a.code === main ? -1 : b.code === main ? 1 : b.count - a.count));
  return { source, languages, groups, found, main };
}

function pathOf(link: string): string {
  try {
    const url = new URL(link, 'https://x.invalid');
    url.searchParams.delete('lang');
    return `${url.pathname.replace(/\/+$/, '') || '/'}${url.search}`;
  } catch {
    return link;
  }
}

/** Item types whose languages matter for the preview (content, not WordPress's own records). */
const SKIPPED_TYPES = new Set([
  'attachment',
  'nav_menu_item',
  'revision',
  'custom_css',
  'customize_changeset',
  'oembed_cache',
  'wp_global_styles',
  'wp_navigation',
  'wp_template',
  'wp_template_part',
]);

const decodeXml = (value: string) =>
  value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/**
 * The facts of the export's content items, read without an XML parser: for
 * the admin's preview, before the file is uploaded.
 */
export function scanWxr(xml: string): ItemFacts[] {
  const out: ItemFacts[] = [];
  const tag = (chunk: string, name: string) => {
    const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(chunk);
    return match ? decodeXml(match[1]!) : '';
  };
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const chunk = match[1]!;
    const type = tag(chunk, 'wp:post_type');
    if (SKIPPED_TYPES.has(type)) continue;
    const meta: Record<string, string> = {};
    for (const row of chunk.matchAll(
      /<wp:postmeta>\s*<wp:meta_key>([\s\S]*?)<\/wp:meta_key>\s*<wp:meta_value>([\s\S]*?)<\/wp:meta_value>\s*<\/wp:postmeta>/g,
    )) {
      const key = decodeXml(row[1]!);
      if (META_KEYS.has(key) && !(key in meta)) meta[key] = decodeXml(row[2]!);
    }
    const categories: ItemFacts['categories'] = [];
    for (const row of chunk.matchAll(/<category\s+domain="([^"]*)"\s+nicename="([^"]*)"/g)) {
      categories.push({ domain: row[1]!, nicename: decodeXml(row[2]!) });
    }
    out.push({
      id: Number(tag(chunk, 'wp:post_id')) || 0,
      type,
      link: tag(chunk, 'link'),
      meta,
      categories,
    });
  }
  return out;
}

/**
 * Pages whose translations share one address (WP-CLI's export of a WPML
 * site): how many groups, for the preview (their languages are guessed from
 * the text during the import).
 */
export function sharedAddresses(items: ItemFacts[]): number {
  const seen = new Map<string, number>();
  for (const item of items) {
    if (!item.link) continue;
    const key = `${item.type}|${item.link}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.values()].filter((n) => n > 1).length;
}
