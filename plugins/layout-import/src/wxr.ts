/**
 * A WordPress export (WXR, Tools → Export) read in the browser: the entries
 * laid out with `[av_…]` shortcodes, and the ids of the old site they refer
 * to (pages and posts, attachments, categories and tags). A small reader of
 * the export's fixed shape, without a DOM, so it can be tested.
 */
import { countElements, hasLayout } from './shortcodes.js';
import { countJsonElements, JSON_LAYOUT } from './json-layout.js';
import type { ImportMaps } from './convert.js';

export interface ExportEntry {
  /** Id on the old site. */
  id: string;
  /** WordPress post type (`page`, `post`, `portfolio`…). */
  wpType: string;
  /** The matching content type of this site (`page`, `article`, `portfolio`…). */
  type: string;
  slug: string;
  title: string;
  status: string;
  content: string;
  /** How many `[av_…]` elements it has. */
  elements: number;
}

export interface ExportFile {
  entries: ExportEntry[];
  maps: Required<Pick<ImportMaps, 'posts' | 'media' | 'terms'>> & { origin?: string };
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** The text of an XML element's body: CDATA sections as they are, entities decoded elsewhere. */
function value(raw: string): string {
  let out = '';
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let last = 0;
  for (const m of raw.matchAll(re)) {
    out += decodeXml(raw.slice(last, m.index));
    out += m[1];
    last = m.index + m[0].length;
  }
  return (out + decodeXml(raw.slice(last))).trim();
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1]!.toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first element with this name in a piece of XML. */
function field(xml: string, name: string): string {
  const m = new RegExp(`<${escape(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(name)}>`).exec(xml);
  return m ? value(m[1]!) : '';
}

function all(xml: string, name: string): string[] {
  return [
    ...xml.matchAll(
      new RegExp(`<${escape(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(name)}>`, 'g'),
    ),
  ].map((m) => m[1]!);
}

/** The path of an address of the old site (`/about/team`), or null for `?page_id=` links. */
export function pathOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (/(^|&)(p|page_id|attachment_id)=/.test(u.search.slice(1))) return null;
    return u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return null;
  }
}

/** A WordPress post type as the content type the importer made of it. */
export function contentTypeOf(wpType: string): string | null {
  if (wpType === 'post') return 'article';
  if (wpType === 'page') return 'page';
  const slug = wpType.toLowerCase();
  return /^[a-z][a-z0-9_-]{0,31}$/.test(slug) ? slug : null;
}

/** Types that are not content. */
const INTERNAL = new Set([
  'attachment',
  'nav_menu_item',
  'revision',
  'custom_css',
  'customize_changeset',
  'oembed_cache',
  'wp_block',
  'wp_template',
  'wp_template_part',
  'wp_navigation',
  'wp_global_styles',
]);

export function readExport(xml: string): ExportFile {
  const channel = xml.slice(0, Math.max(0, xml.indexOf('<item>')) || xml.length);
  const origin = (field(channel, 'wp:base_blog_url') || field(channel, 'link')).replace(/\/$/, '');
  const maps: ExportFile['maps'] = {
    posts: {},
    media: {},
    terms: {},
    ...(origin ? { origin } : {}),
  };
  for (const c of all(channel, 'wp:category')) {
    maps.terms[field(c, 'wp:term_id')] = {
      taxonomy: 'category',
      slug: field(c, 'wp:category_nicename'),
    };
  }
  for (const t of all(channel, 'wp:tag')) {
    maps.terms[field(t, 'wp:term_id')] = { taxonomy: 'tag', slug: field(t, 'wp:tag_slug') };
  }
  for (const t of all(channel, 'wp:term')) {
    const taxonomy = field(t, 'wp:term_taxonomy');
    const id = field(t, 'wp:term_id');
    if (maps.terms[id]) continue;
    maps.terms[id] = {
      taxonomy: taxonomy === 'post_tag' ? 'tag' : 'category',
      slug: field(t, 'wp:term_slug'),
    };
  }
  const entries: ExportEntry[] = [];
  for (const item of all(xml, 'item')) {
    const wpType = field(item, 'wp:post_type');
    const id = field(item, 'wp:post_id');
    if (wpType === 'attachment') {
      const url = field(item, 'wp:attachment_url');
      if (url) maps.media[id] = url;
      continue;
    }
    if (INTERNAL.has(wpType)) continue;
    const link = pathOf(field(item, 'link'));
    if (link && id) maps.posts[id] = link;
    const status = field(item, 'wp:status');
    const type = contentTypeOf(wpType);
    if (!type || status === 'trash' || status === 'auto-draft') continue;
    // A page builder that keeps the page as JSON in a field, when it built the page.
    const meta = (key: string) =>
      all(item, 'wp:postmeta')
        .filter((m) => field(m, 'wp:meta_key') === key)
        .map((m) => field(m, 'wp:meta_value'))[0] ?? '';
    const json = meta('_elementor_edit_mode') === 'builder' ? meta('_elementor_data') : '';
    const content = json.trim().startsWith('[')
      ? JSON_LAYOUT + json
      : field(item, 'content:encoded');
    if (!content.startsWith(JSON_LAYOUT) && !hasLayout(content)) continue;
    entries.push({
      id,
      wpType,
      type,
      slug: safeDecode(field(item, 'wp:post_name')),
      title: decodeXml(field(item, 'title')),
      status,
      content,
      elements: content.startsWith(JSON_LAYOUT)
        ? countJsonElements(content.slice(JSON_LAYOUT.length))
        : countElements(content),
    });
  }
  return { entries, maps };
}
