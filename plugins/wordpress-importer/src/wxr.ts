import { XMLParser } from 'fast-xml-parser';
import { htmlToCxd } from '@cleitext/blocks/html';
import { elementorToFresco } from './elementor.js';
import type { TransferDocumentInput, TransferMenuItem } from '@cleitext/blocks/transfer';

type Node = Record<string, unknown>;

const ARRAYS = new Set([
  'item',
  'category',
  'wp:author',
  'wp:category',
  'wp:tag',
  'wp:term',
  'wp:postmeta',
  'wp:comment',
]);

const STATUS: Record<string, 'published' | 'draft' | 'pending' | 'private' | 'scheduled'> = {
  publish: 'published',
  draft: 'draft',
  pending: 'pending',
  private: 'private',
  future: 'scheduled',
};

export interface WxrOptions {
  /** Content language (the WXR file has one). */
  locale: string;
  /** Role given to imported authors. Default `author`. */
  authorRole?: string;
  /**
   * Pages built with Elementor: `fresco` turns their layout into a Fresco
   * page (default), `content` keeps only the HTML WordPress exported.
   */
  elementor?: 'fresco' | 'content';
}

export interface WxrResult {
  document: TransferDocumentInput;
  /** What could not be converted exactly (part of the report). */
  warnings: string[];
}

/** WordPress export (WXR 1.x) → transfer document (RF-IMP-01). */
export function wxrToDocument(xml: string, options: WxrOptions): WxrResult {
  const warnings: string[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
    isArray: (name) => ARRAYS.has(name),
  });
  const root = parser.parse(xml) as Node;
  const channel = ((root.rss as Node | undefined)?.channel ?? null) as Node | null;
  if (!channel || !String(channel['wp:wxr_version'] ?? '').startsWith('1.')) {
    throw new Error('This is not a WordPress export (WXR) file.');
  }
  const locale = options.locale;
  const baseUrl = text(channel['wp:base_blog_url']) || text(channel.link);
  const items = (channel.item as Node[] | undefined) ?? [];

  // ---- Authors ------------------------------------------------------------------------
  const loginById = new Map(
    ((channel['wp:author'] as Node[] | undefined) ?? []).map((a) => [
      text(a['wp:author_id']),
      text(a['wp:author_login']),
    ]),
  );
  const authors = ((channel['wp:author'] as Node[] | undefined) ?? []).map((a) => ({
    ref: `user:${text(a['wp:author_login'])}`,
    email: text(a['wp:author_email']),
    displayName: text(a['wp:author_display_name']) || text(a['wp:author_login']),
    role: options.authorRole ?? 'author',
  }));

  // ---- Terms ----------------------------------------------------------------------------
  const terms: NonNullable<TransferDocumentInput['terms']> = [];
  for (const c of (channel['wp:category'] as Node[] | undefined) ?? []) {
    const slug = text(c['wp:category_nicename']);
    const parent = text(c['wp:category_parent']);
    terms.push({
      ref: `category:${slug}`,
      taxonomy: 'category',
      locale,
      slug,
      name: decode(text(c['wp:cat_name'])) || slug,
      description: text(c['wp:category_description']) || null,
      ...(parent ? { parentRef: `category:${parent}` } : {}),
    });
  }
  for (const t of (channel['wp:tag'] as Node[] | undefined) ?? []) {
    const slug = text(t['wp:tag_slug']);
    terms.push({
      ref: `tag:${slug}`,
      taxonomy: 'tag',
      locale,
      slug,
      name: decode(text(t['wp:tag_name'])) || slug,
    });
  }
  const menuNames = new Map<string, string>();
  /** Taxonomies of themes and plugins (portfolio categories…): WordPress slug → Cleitext's. */
  const customTaxonomies = new Map<string, { slug: string; hierarchical: boolean }>();
  for (const t of (channel['wp:term'] as Node[] | undefined) ?? []) {
    const taxonomy = text(t['wp:term_taxonomy']);
    if (taxonomy === 'nav_menu') {
      menuNames.set(text(t['wp:term_slug']), decode(text(t['wp:term_name'])));
      continue;
    }
    if (INTERNAL_TAXONOMIES.has(taxonomy) || SHOP_TAXONOMIES.has(taxonomy)) continue;
    const own = structureSlug(taxonomy);
    if (!own) continue;
    const slug = text(t['wp:term_slug']);
    const parent = text(t['wp:term_parent']);
    const known = customTaxonomies.get(taxonomy);
    customTaxonomies.set(taxonomy, {
      slug: own,
      hierarchical: Boolean(known?.hierarchical || parent),
    });
    terms.push({
      ref: `${taxonomy}:${slug}`,
      taxonomy: own,
      locale,
      slug,
      name: decode(text(t['wp:term_name'])) || slug,
      description: text(t['wp:term_description']) || null,
      ...(parent ? { parentRef: `${taxonomy}:${parent}` } : {}),
    });
  }

  // ---- Attachments ------------------------------------------------------------------------
  const media: NonNullable<TransferDocumentInput['media']> = [];
  const attachmentRefs = new Map<number, string>();
  const attachmentUrls = new Map<string, string>();
  for (const item of items) {
    if (text(item['wp:post_type']) !== 'attachment') continue;
    const id = Number(text(item['wp:post_id']));
    const url = text(item['wp:attachment_url']);
    if (!url) continue;
    const ref = `att:${id}`;
    const alt = meta(item, '_wp_attachment_image_alt');
    const filename = decodeURIComponent(url.split('/').pop() ?? `file-${id}`).split('?')[0]!;
    media.push({
      ref,
      file: url,
      filename,
      ...(alt ? { alt: { [locale]: alt } } : {}),
      ...(text(item['excerpt:encoded'])
        ? { caption: { [locale]: stripTags(text(item['excerpt:encoded'])) } }
        : {}),
      urls: [url],
    });
    attachmentRefs.set(id, ref);
    attachmentUrls.set(url, ref);
  }

  // ---- Posts and pages ------------------------------------------------------------------
  const entries: NonNullable<TransferDocumentInput['entries']> = [];
  const skippedTypes = new Map<string, number>();
  let pingbacks = 0;
  let trashedComments = 0;
  let elementorPages = 0;
  const entryRefs = new Map<number, string>();
  /** Types of themes and plugins (portfolio…): WordPress slug → Cleitext's, and an address. */
  const customTypes = new Map<string, { slug: string; permalink: string | null }>();
  /** The content types each taxonomy is used by. */
  const taxonomyTypes = new Map<string, Set<string>>();
  for (const item of items) {
    const type = text(item['wp:post_type']);
    const status = STATUS[text(item['wp:status'])];
    if (type === 'attachment' || type === 'nav_menu_item') continue;
    const custom =
      type !== 'post' &&
      type !== 'page' &&
      !INTERNAL_TYPES.has(type) &&
      !SHOP_TYPES.has(type) &&
      structureSlug(type);
    if (custom && !customTypes.has(type)) customTypes.set(type, { slug: custom, permalink: null });
    if (type !== 'post' && type !== 'page' && !custom) {
      // WordPress's own records are not content; shop items and odd names are reported.
      if (!INTERNAL_TYPES.has(type)) skippedTypes.set(type, (skippedTypes.get(type) ?? 0) + 1);
      continue;
    }
    if (!status) continue; // trash, auto-draft, inherit
    const id = Number(text(item['wp:post_id']));
    const entryType = type === 'post' ? 'article' : type === 'page' ? 'page' : (custom as string);
    const title = decode(text(item.title));
    const content = text(item['content:encoded']);
    let document = htmlToCxd(content, {
      mediaRef: (attachment) => attachmentRefs.get(attachment),
      warn: (message) => warnings.push(`${title || `#${id}`}: ${message}`),
    });
    // Elementor pages: their layout, as a Fresco page.
    const elementorData = meta(item, '_elementor_data');
    if (
      options.elementor !== 'content' &&
      meta(item, '_elementor_edit_mode') === 'builder' &&
      elementorData
    ) {
      const blocks = elementorToFresco(elementorData, {
        mediaRef: (attachment) => attachmentRefs.get(attachment),
        warn: (message) => warnings.push(`${title || `#${id}`}: ${message}`),
      });
      if (blocks && blocks.length > 0) {
        document = { schema: 1, blocks, editor: { id: 'fresco' } };
        elementorPages++;
      }
    }
    // The featured image stays the featured image; when it also opens the content,
    // only once (themes show it above the content).
    const thumbnailRef = attachmentRefs.get(Number(meta(item, '_thumbnail_id') ?? NaN));
    const first = document.blocks[0];
    if (
      thumbnailRef &&
      !document.editor &&
      first?.type === 'core/image' &&
      first.attrs.id === thumbnailRef
    ) {
      document.blocks.shift();
    }
    const gmt = text(item['wp:post_date_gmt']);
    const date = gmt && !gmt.startsWith('0000') ? `${gmt.replace(' ', 'T')}Z` : undefined;
    // Comments: approved, waiting and spam ones (pingbacks are links, not comments).
    const comments: NonNullable<NonNullable<TransferDocumentInput['entries']>[number]['comments']> =
      [];
    for (const c of (item['wp:comment'] as Node[] | undefined) ?? []) {
      const kind = text(c['wp:comment_type']);
      if (kind === 'pingback' || kind === 'trackback') {
        pingbacks++;
        continue;
      }
      const approved = text(c['wp:comment_approved']);
      const commentStatus =
        approved === '1'
          ? 'approved'
          : approved === '0'
            ? 'pending'
            : approved === 'spam'
              ? 'spam'
              : null;
      if (!commentStatus) {
        trashedComments++;
        continue;
      }
      const commentGmt = text(c['wp:comment_date_gmt']);
      const parentId = text(c['wp:comment_parent']);
      const login = loginById.get(text(c['wp:comment_user_id']));
      const authorUrl = text(c['wp:comment_author_url']);
      const ip = text(c['wp:comment_author_IP']);
      comments.push({
        ref: `comment:${text(c['wp:comment_id'])}`,
        ...(parentId && parentId !== '0' ? { parentRef: `comment:${parentId}` } : {}),
        ...(login ? { userRef: `user:${login}` } : {}),
        authorName: decode(text(c['wp:comment_author'])) || 'Anonymous',
        authorEmail: text(c['wp:comment_author_email']),
        ...(authorUrl ? { authorUrl } : {}),
        content: decode(text(c['wp:comment_content'])),
        status: commentStatus,
        createdAt:
          commentGmt && !commentGmt.startsWith('0000')
            ? `${commentGmt.replace(' ', 'T')}Z`
            : (date ?? new Date().toISOString()),
        ...(ip ? { ip } : {}),
      });
    }
    // Galleries become galleries; other shortcodes stay as text.
    if (
      /\[(?!gallery\b)[a-z_-]+[^\]]*\]/i.test(content) &&
      !/<!--\s+wp:shortcode/.test(content)
    ) {
      warnings.push(`${title || `#${id}`}: contains shortcodes, left as text.`);
    }
    const categories = ((item.category as Node[] | undefined) ?? []).map((c) => ({
      domain: String(c['@_domain'] ?? ''),
      slug: String(c['@_nicename'] ?? ''),
    }));
    const ref = `post:${id}`;
    entryRefs.set(id, ref);
    const link = text(item.link);
    const parent = Number(text(item['wp:post_parent']) || 0);
    // A custom type keeps the addresses it had: /portfolio/{slug} from /portfolio/my-work/.
    const slugOfItem = decodeURIComponent(text(item['wp:post_name']));
    const typeInfo = customTypes.get(type);
    if (typeInfo && !typeInfo.permalink && link && slugOfItem) {
      const path = relativeTo(link, baseUrl).replace(/\/+$/, '');
      if (path.endsWith(`/${slugOfItem}`) && path.startsWith('/')) {
        typeInfo.permalink = `${path.slice(0, -slugOfItem.length)}{slug}`;
      }
    }
    const ownTerms: Record<string, string[]> = {};
    for (const c of categories) {
      const taxonomy = customTaxonomies.get(c.domain);
      if (!taxonomy) continue;
      (ownTerms[taxonomy.slug] ??= []).push(`${c.domain}:${c.slug}`);
      taxonomyTypes.set(
        taxonomy.slug,
        (taxonomyTypes.get(taxonomy.slug) ?? new Set()).add(entryType),
      );
    }
    const seo = seoFields(item);
    entries.push({
      ref,
      type: entryType,
      locale,
      ...(parent ? { parentRef: `post:${parent}` } : {}),
      slug: decodeURIComponent(text(item['wp:post_name'])) || title,
      title,
      status,
      authorRef: `user:${text(item['dc:creator'])}`,
      ...(date ? { publishedAt: status === 'scheduled' ? null : date, createdAt: date } : {}),
      ...(status === 'scheduled' && date ? { scheduledAt: date } : {}),
      position: Number(text(item['wp:menu_order']) || 0),
      document,
      ...(thumbnailRef ? { featuredMediaRef: thumbnailRef } : {}),
      ...(seo ? { fields: { seo } } : {}),
      terms: {
        category: categories
          .filter((c) => c.domain === 'category')
          .map((c) => `category:${c.slug}`),
        tag: categories.filter((c) => c.domain === 'post_tag').map((c) => `tag:${c.slug}`),
        ...ownTerms,
      },
      ...(link && status === 'published' ? { oldPaths: [link, ...(id ? [`/?p=${id}`] : [])] } : {}),
      ...(text(item['wp:comment_status'])
        ? { commentStatus: text(item['wp:comment_status']) === 'open' ? 'open' : 'closed' }
        : {}),
      ...(comments.length ? { comments } : {}),
    });
  }
  for (const [type, n] of skippedTypes) {
    warnings.push(
      SHOP_TYPES.has(type)
        ? `${n} item(s) of the shop type "${type}" were not imported: import products into Cleishop from a CSV export.`
        : `${n} item(s) of the custom type "${type}" were not imported.`,
    );
  }
  const contentTypes = [...customTypes.entries()].map(([wp, t]) => ({
    slug: t.slug,
    name: { [locale.split('-')[0]!]: label(wp) },
    hierarchical: false,
    permalink: t.permalink ?? `/${t.slug}/{slug}`,
  }));
  const taxonomies = [...customTaxonomies.entries()].map(([wp, t]) => ({
    slug: t.slug,
    name: { [locale.split('-')[0]!]: label(wp) },
    hierarchical: t.hierarchical,
    contentTypes: [...(taxonomyTypes.get(t.slug) ?? [])],
  }));
  // Posts at the root (/%postname%/): Cleitext puts them at /{year}/{slug} unless told.
  const postPaths = items
    .filter((i) => text(i['wp:post_type']) === 'post' && text(i['wp:status']) === 'publish')
    .map((i) => relativeTo(text(i.link), baseUrl));
  if (postPaths.length > 0 && postPaths.every((p) => /^\/[^/?]+\/?$/.test(p))) {
    warnings.push(
      'Posts had addresses like /my-post: to keep them, set the permalink of Posts to /{slug} in Content structure before importing (otherwise the old addresses redirect).',
    );
  }
  if (elementorPages) {
    warnings.push(
      `${elementorPages} page(s) built with Elementor were imported as Fresco pages: activate the Fresco plugin to show and edit them.`,
    );
  }
  if (pingbacks) warnings.push(`${pingbacks} pingback(s) and trackback(s) were not imported.`);
  if (trashedComments) warnings.push(`${trashedComments} trashed comment(s) were not imported.`);

  // ---- Menus ------------------------------------------------------------------------------
  const menus: NonNullable<TransferDocumentInput['menus']> = [];
  const navItems = items.filter((i) => text(i['wp:post_type']) === 'nav_menu_item');
  for (const [slug, name] of menuNames) {
    const own = navItems
      .filter((i) =>
        ((i.category as Node[] | undefined) ?? []).some(
          (c) => c['@_domain'] === 'nav_menu' && c['@_nicename'] === slug,
        ),
      )
      .sort((a, b) => Number(text(a['wp:menu_order'])) - Number(text(b['wp:menu_order'])));
    const byParent = new Map<string, Node[]>();
    for (const item of own) {
      const parent = meta(item, '_menu_item_menu_item_parent') ?? '0';
      byParent.set(parent, [...(byParent.get(parent) ?? []), item]);
    }
    const build = (parent: string): TransferMenuItem[] =>
      (byParent.get(parent) ?? []).map((item) => {
        const kind = meta(item, '_menu_item_type');
        const object = meta(item, '_menu_item_object');
        const objectId = Number(meta(item, '_menu_item_object_id') ?? 0);
        const label = decode(text(item.title)) || null;
        const children = build(text(item['wp:post_id']));
        const target = meta(item, '_menu_item_target') === '_blank' ? ('_blank' as const) : null;
        if (kind === 'post_type' && entryRefs.has(objectId)) {
          return { kind: 'entry', entryRef: entryRefs.get(objectId), label, target, children };
        }
        if (kind === 'taxonomy') {
          const term = findTermRef(channel, object ?? '', objectId);
          if (term) return { kind: 'term', termRef: term, label, target, children };
        }
        const url = meta(item, '_menu_item_url');
        return url
          ? { kind: 'url', url: relativeTo(url, baseUrl), label: label ?? url, target, children }
          : { kind: 'custom', label: label ?? 'Item', children };
      });
    menus.push({ name, locale, items: build('0') });
  }

  return {
    warnings,
    document: {
      format: 'cleitext-transfer',
      version: 1,
      source: {
        kind: 'wordpress',
        name: decode(text(channel.title)),
        url: baseUrl,
        exportedAt: new Date().toISOString(),
      },
      site: {
        ...(text(channel.title) ? { title: decode(text(channel.title)) } : {}),
        ...(text(channel.description) ? { tagline: decode(text(channel.description)) } : {}),
      },
      users: authors.filter((a) => a.email),
      contentTypes,
      taxonomies,
      terms,
      media,
      entries,
      menus,
    },
  };
}

// ---- Helpers ---------------------------------------------------------------------------

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    const node = value as Node;
    return '#text' in node ? String(node['#text']) : '';
  }
  return String(value).trim();
}

function meta(item: Node, key: string): string | undefined {
  const entry = ((item['wp:postmeta'] as Node[] | undefined) ?? []).find(
    (m) => text(m['wp:meta_key']) === key,
  );
  return entry ? text(entry['wp:meta_value']) : undefined;
}

function findTermRef(channel: Node, taxonomy: string, id: number): string | undefined {
  if (taxonomy !== 'category' && taxonomy !== 'post_tag') {
    const found = ((channel['wp:term'] as Node[] | undefined) ?? []).find(
      (t) => text(t['wp:term_taxonomy']) === taxonomy && Number(text(t['wp:term_id'])) === id,
    );
    return found ? `${taxonomy}:${text(found['wp:term_slug'])}` : undefined;
  }
  const list =
    (channel[taxonomy === 'category' ? 'wp:category' : 'wp:tag'] as Node[] | undefined) ?? [];
  const found = list.find((t) => Number(text(t['wp:term_id'])) === id);
  if (!found) return undefined;
  return taxonomy === 'category'
    ? `category:${text(found['wp:category_nicename'])}`
    : `tag:${text(found['wp:tag_slug'])}`;
}

/** WordPress's own types and taxonomies, never content. */
const INTERNAL_TYPES = new Set([
  'revision',
  'wp_navigation',
  'wp_template',
  'wp_template_part',
  'wp_global_styles',
  'wp_font_family',
  'wp_font_face',
  'customize_changeset',
  'oembed_cache',
  'custom_css',
  'wp_block',
  'user_request',
  'elementor_library',
  'elementor_snippet',
  'elementor_font',
  'elementor_icons',
  'e-landing-page',
  'acf-field-group',
  'acf-field',
  'wpcf7_contact_form',
  'rank_math_schema',
  'scheduled-action',
]);
const INTERNAL_TAXONOMIES = new Set([
  'category',
  'post_tag',
  'nav_menu',
  'post_format',
  'link_category',
  'wp_theme',
  'wp_template_part_area',
  'wp_pattern_category',
  'elementor_library_type',
  'elementor_library_category',
  'elementor_font_type',
  'translation_priority',
  'language',
  'post_translations',
  'term_language',
  'term_translations',
]);
/** WooCommerce: products go to Cleishop through its CSV import. */
const SHOP_TYPES = new Set([
  'product',
  'product_variation',
  'shop_order',
  'shop_coupon',
  'shop_order_refund',
]);
const SHOP_TAXONOMIES = new Set([
  'product_cat',
  'product_tag',
  'product_type',
  'product_visibility',
  'product_shipping_class',
]);
/** Addresses that belong to Cleitext itself or its default types. */
const RESERVED = new Set([
  'admin',
  'cl-admin',
  'admin-plugins',
  'plugin-assets',
  'api',
  'media',
  'health',
  'feed',
  'search',
  'page',
  'author',
  'account',
  'article',
  'category',
  'tag',
  'robots',
  'sitemap',
]);

/** A WordPress type or taxonomy name as a Cleitext one (letters, digits, - and _), or null. */
function structureSlug(name: string): string | null {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 32);
  if (!slug) return null;
  if (RESERVED.has(slug)) slug = `wp-${slug}`.slice(0, 32);
  return /^[a-z][a-z0-9_-]{0,31}$/.test(slug) ? slug : null;
}

/** "portfolio_category" → "Portfolio category". */
function label(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').trim();
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 100) || name;
}

/** Search title, description, keyphrase, indexing and canonical from Yoast SEO or Rank Math. */
function seoFields(item: Node): Record<string, unknown> | null {
  // Rank Math writes %title%, Yoast and Cleitext %%title%%.
  const rankVars = (value: string) => value.replace(/(?<!%)%([a-z_]+)%(?!%)/g, '%%$1%%');
  const title = meta(item, '_yoast_wpseo_title') || rankVars(meta(item, 'rank_math_title') ?? '');
  const description =
    meta(item, '_yoast_wpseo_metadesc') || rankVars(meta(item, 'rank_math_description') ?? '');
  const keyphrase =
    meta(item, '_yoast_wpseo_focuskw') ||
    (meta(item, 'rank_math_focus_keyword') ?? '').split(',')[0]!.trim();
  const noindex =
    meta(item, '_yoast_wpseo_meta-robots-noindex') === '1' ||
    /"noindex"/.test(meta(item, 'rank_math_robots') ?? '');
  const canonical = meta(item, '_yoast_wpseo_canonical') || meta(item, 'rank_math_canonical_url');
  const seo: Record<string, unknown> = {
    ...(title ? { title: decode(title).slice(0, 70) } : {}),
    ...(description ? { description: decode(description).slice(0, 160) } : {}),
    ...(keyphrase ? { keyphrase: decode(keyphrase).slice(0, 100) } : {}),
    ...(noindex ? { noindex: true } : {}),
    ...(canonical && /^https?:\/\//.test(canonical) ? { canonical } : {}),
  };
  return Object.keys(seo).length > 0 ? seo : null;
}

/** Links to the old site become relative, so they follow the new domain. */
function relativeTo(url: string, base: string): string {
  if (base && url.startsWith(base)) return url.slice(base.replace(/\/+$/, '').length) || '/';
  return url;
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]*>/g, '')).trim();
}

function decode(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
