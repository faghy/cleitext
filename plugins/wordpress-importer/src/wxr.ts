import { XMLParser } from 'fast-xml-parser';
import { htmlToCxd, IMPORTED_BLOCK, texturizeHtml, texturizeText } from '@cleitext/blocks/html';
import { assignLanguages } from './wpml';
import { elementorToFresco, takeStretched, type ElementorContext } from './elementor.js';
import {
  convertConditions,
  customFont,
  isWebFont,
  kitToFresco,
  pageSettings,
  popupSettings,
  snippet,
  templateKind,
  type ConditionContext,
  type KitResult,
} from './elementor-site.js';
import { asSettings, type Settings } from './elementor-values.js';
import { metaValue } from './php.js';
import { WOO_TAXONOMIES, wooProduct } from './woocommerce.js';
import type { CxdBlock } from '@cleitext/blocks';
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
  /**
   * The site's languages, when it has more than one: pages translated with
   * WPML are recognised (they share their address in the export) and imported
   * in their language, as translations of each other.
   */
  locales?: string[];
  /**
   * Which comments come along: `approved` ones only (default), `all` (also
   * those waiting for approval and spam) or none (`skip`), for sites whose
   * comments were closed and only old spam is left. Pingbacks and trackbacks
   * never do, nor trashed comments.
   */
  comments?: 'approved' | 'all' | 'skip';
  /** The site's addresses already end with a slash (no need to suggest it). */
  trailingSlash?: boolean;
  /** Protects every imported form (Elementor's) with Cloudflare Turnstile. */
  formCaptcha?: 'turnstile';
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
  /** WooCommerce attribute values: `pa_colour:red` → "Red". */
  const wooTermNames = new Map<string, string>();
  /** Taxonomies of themes and plugins (portfolio categories…): WordPress slug → Cleitext's. */
  const customTaxonomies = new Map<string, { slug: string; hierarchical: boolean }>();
  for (const t of (channel['wp:term'] as Node[] | undefined) ?? []) {
    const taxonomy = text(t['wp:term_taxonomy']);
    if (taxonomy === 'nav_menu') {
      menuNames.set(text(t['wp:term_slug']), decode(text(t['wp:term_name'])));
      continue;
    }
    // WooCommerce: product categories and brands become Cleishop's; attribute values keep their names.
    const woo = WOO_TAXONOMIES[taxonomy];
    if (woo || taxonomy.startsWith('pa_')) {
      const slug = text(t['wp:term_slug']);
      const name = decode(text(t['wp:term_name'])) || slug;
      if (taxonomy.startsWith('pa_')) {
        wooTermNames.set(`${taxonomy}:${slug}`, name);
        continue;
      }
      const parent = text(t['wp:term_parent']);
      terms.push({
        ref: `${taxonomy}:${slug}`,
        taxonomy: woo!,
        locale,
        slug,
        name,
        description: text(t['wp:term_description']) || null,
        ...(parent ? { parentRef: `${taxonomy}:${parent}` } : {}),
      });
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

  // ---- Elementor: what pages and templates share ---------------------------------------
  const useElementor = options.elementor !== 'content';
  let protectedForms = 0;
  const elementor = prepareElementor(
    channel,
    items,
    locale,
    attachmentRefs,
    customTaxonomies,
    warnings,
    options.formCaptcha
      ? { formCaptcha: options.formCaptcha, protectedForm: () => protectedForms++ }
      : {},
  );

  // ---- Posts and pages ------------------------------------------------------------------
  const entries: NonNullable<TransferDocumentInput['entries']> = [];
  // Address and text of each entry, to recognise WPML translations at the end.
  const sources = new Map<string, { link: string; text: string }>();
  const skippedTypes = new Map<string, number>();
  let pingbacks = 0;
  let trashedComments = 0;
  let leftComments = 0;
  let unapprovedComments = 0;
  const commentsMode = options.comments ?? 'approved';
  let elementorPages = 0;
  const entryRefs = new Map<number, string>();
  /** Types of themes and plugins (portfolio…): WordPress slug → Cleitext's, and an address. */
  const customTypes = new Map<string, { slug: string; permalink: string | null }>();
  /** The content types each taxonomy is used by. */
  const taxonomyTypes = new Map<string, Set<string>>();
  // WooCommerce: variations by product, and the products' data for Cleishop.
  const variationsOf = new Map<number, Node[]>();
  for (const item of items) {
    if (text(item['wp:post_type']) !== 'product_variation') continue;
    const parent = Number(text(item['wp:post_parent']) || 0);
    variationsOf.set(parent, [...(variationsOf.get(parent) ?? []), item]);
  }
  const shopProducts: Record<string, unknown>[] = [];
  const mediaUrlOf = new Map(media.map((m) => [m.ref, m.file]));
  const wooContext = {
    locale,
    attachmentRefs,
    attachmentUrl: (ref: string) => mediaUrlOf.get(ref),
    entryRef: (id: number) => `post:${id}`,
    termNames: wooTermNames,
  };
  for (const item of items) {
    const type = text(item['wp:post_type']);
    const isProduct = type === 'product';
    if (type === 'product_variation') continue;
    const status = STATUS[text(item['wp:status'])];
    if (type === 'attachment' || type === 'nav_menu_item') continue;
    const custom =
      type !== 'post' &&
      type !== 'page' &&
      type !== LANDING_PAGE &&
      !INTERNAL_TYPES.has(type) &&
      !SHOP_TYPES.has(type) &&
      structureSlug(type);
    if (custom && !customTypes.has(type)) customTypes.set(type, { slug: custom, permalink: null });
    if (type !== 'post' && type !== 'page' && type !== LANDING_PAGE && !custom && !isProduct) {
      // WordPress's own records are not content; shop items and odd names are reported.
      if (!INTERNAL_TYPES.has(type)) skippedTypes.set(type, (skippedTypes.get(type) ?? 0) + 1);
      continue;
    }
    if (!status) continue; // trash, auto-draft, inherit
    const id = Number(text(item['wp:post_id']));
    // Elementor's landing pages are pages (at the same addresses).
    const entryType =
      type === 'post'
        ? 'article'
        : type === 'page' || type === LANDING_PAGE
          ? 'page'
          : isProduct
            ? 'product'
            : (custom as string);
    // WordPress shows titles and content with curly quotes and dashes (wptexturize).
    const title = texturizeText(decode(text(item.title)));
    const content = texturizeHtml(text(item['content:encoded']));
    let document = htmlToCxd(content, {
      // Blocks of other plugins (e.g. block libraries) are left to active plugins.
      keepUnknown: true,
      mediaRef: (attachment) => attachmentRefs.get(attachment),
      warn: (message) => warnings.push(`${title || `#${id}`}: ${message}`),
    });
    termIdsToSlugs(document.blocks, channel);
    // Shortcodes standing alone are left to active plugins (`import.shortcode`).
    const placed = shortcodeTexts(document.blocks);
    // Elementor pages: their layout and page settings, as a Fresco page.
    const elementorData = meta(item, '_elementor_data');
    if (useElementor && meta(item, '_elementor_edit_mode') === 'builder' && elementorData) {
      const blocks = elementorToFresco(
        elementorData,
        elementor.context((message) => warnings.push(`${title || `#${id}`}: ${message}`)),
      );
      if (blocks && blocks.length > 0) {
        const data = pageSettings(
          meta(item, '_wp_page_template') ?? '',
          asSettings(metaValue(meta(item, '_elementor_page_settings'))),
          elementor.hello,
          takeStretched(blocks),
        );
        document = {
          schema: 1,
          blocks,
          editor: { id: 'fresco', ...(Object.keys(data).length ? { data } : {}) },
        };
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
    // Comments: approved ones, or also waiting and spam ones, or none (`comments`);
    // pingbacks are links, not comments.
    const comments: NonNullable<NonNullable<TransferDocumentInput['entries']>[number]['comments']> =
      [];
    for (const c of (item['wp:comment'] as Node[] | undefined) ?? []) {
      const kind = text(c['wp:comment_type']);
      if (kind === 'pingback' || kind === 'trackback') {
        pingbacks++;
        continue;
      }
      if (commentsMode === 'skip') {
        leftComments++;
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
      if (commentsMode === 'approved' && commentStatus !== 'approved') {
        unapprovedComments++;
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
    // Galleries become galleries; shortcodes inside text stay as text.
    const rest = placed.reduce((text, shortcode) => text.replace(shortcode, ''), content);
    if (/\[(?!gallery\b)[a-z_-]+[^\]]*\]/i.test(rest) && !/<!--\s+wp:shortcode/.test(rest)) {
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
      // Product categories and brands (Cleishop's taxonomies).
      if (isProduct && WOO_TAXONOMIES[c.domain]) {
        (ownTerms[WOO_TAXONOMIES[c.domain]!] ??= []).push(`${c.domain}:${c.slug}`);
        continue;
      }
      const taxonomy = customTaxonomies.get(c.domain);
      if (!taxonomy) continue;
      (ownTerms[taxonomy.slug] ??= []).push(`${c.domain}:${c.slug}`);
      taxonomyTypes.set(
        taxonomy.slug,
        (taxonomyTypes.get(taxonomy.slug) ?? new Set()).add(entryType),
      );
    }
    const seo = seoFields(item);
    sources.set(ref, { link, text: `${title} ${content}` });
    entries.push({
      ref,
      type: entryType,
      locale,
      ...(parent ? { parentRef: `post:${parent}` } : {}),
      slug: decodeURIComponent(text(item['wp:post_name'])) || decode(text(item.title)),
      title,
      status,
      authorRef: `user:${text(item['dc:creator'])}`,
      ...(date ? { publishedAt: status === 'scheduled' ? null : date, createdAt: date } : {}),
      ...(status === 'scheduled' && date ? { scheduledAt: date } : {}),
      position: Number(text(item['wp:menu_order']) || 0),
      document,
      // A product's short description.
      ...(isProduct && stripTags(text(item['excerpt:encoded']))
        ? { excerpt: stripTags(text(item['excerpt:encoded'])).slice(0, 5_000) }
        : {}),
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
    if (isProduct) shopProducts.push(wooProduct(item, ref, variationsOf.get(id) ?? [], wooContext));
  }
  const translated = recogniseTranslations(entries, sources, locale, options.locales ?? []);
  if (translated > 0) {
    warnings.push(
      `${translated} page(s) or post(s) were recognised as WPML translations, with their language guessed from their text: check them in each language.`,
    );
  }
  for (const [type, n] of skippedTypes) {
    warnings.push(
      SHOP_TYPES.has(type)
        ? `${n} item(s) of the shop type "${type}" (orders, coupons) were not imported.`
        : `${n} item(s) of the custom type "${type}" were not imported.`,
    );
  }
  if (shopProducts.length > 0) {
    warnings.push(
      `${shopProducts.length} WooCommerce product(s) were imported for Cleishop, with prices, codes, stock, pictures and variations: activate Cleishop before importing to keep them.`,
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
  // WordPress's addresses end with a slash (/my-page/): Cleitext can keep them so.
  const ownPaths = items
    .filter(
      (i) =>
        ['post', 'page'].includes(text(i['wp:post_type'])) && text(i['wp:status']) === 'publish',
    )
    .map((i) => relativeTo(text(i.link), baseUrl))
    .filter((p) => p.startsWith('/') && p !== '/' && !p.includes('?'));
  if (!options.trailingSlash && ownPaths.length > 0 && ownPaths.every((p) => p.endsWith('/'))) {
    warnings.push(
      'The WordPress addresses end with a slash (/my-page/): to keep them exactly, turn on “End addresses with a slash” in Settings → Content structure (otherwise they redirect once to the form without it).',
    );
  }
  if (elementorPages) {
    warnings.push(
      `${elementorPages} page(s) built with Elementor were imported as Fresco pages: activate the Fresco plugin to show and edit them.`,
    );
  }
  // Elementor's templates (Theme Builder, popups, saved sections, global widgets).
  const plugins: Record<string, unknown> = {};
  // WooCommerce products' commercial data, for Cleishop.
  if (shopProducts.length > 0) plugins.shop = { products: shopProducts };
  if (useElementor) {
    entries.push(...elementor.templates());
    Object.assign(plugins, elementor.plugins());
  }
  if (protectedForms) {
    warnings.push(
      `${protectedForms} form(s) protected with Turnstile: add the site and secret keys in Fresco Pro → Forms → Spam protection.`,
    );
  }
  if (pingbacks) warnings.push(`${pingbacks} pingback(s) and trackback(s) were not imported.`);
  if (trashedComments) warnings.push(`${trashedComments} trashed comment(s) were not imported.`);
  if (leftComments) {
    warnings.push(`${leftComments} comment(s) were not imported, as chosen.`);
  }
  if (unapprovedComments) {
    warnings.push(
      `${unapprovedComments} comment(s) waiting for approval or marked as spam were not imported (only approved ones were chosen).`,
    );
  }

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
        const label = texturizeText(decode(text(item.title))) || null;
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
    // Menus shown by Elementor's nav menu widgets get a location of their own.
    const location = elementor.menuLocations.get(slug);
    menus.push({ name, locale, ...(location ? { location } : {}), items: build('0') });
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
      ...(Object.keys(plugins).length ? { plugins } : {}),
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

/** Spectra's post blocks of other plugins, filtered by WordPress term ids. */
const POST_BLOCKS = new Set([
  'uagb/post-grid',
  'uagb/post-carousel',
  'uagb/post-timeline',
  'uagb/post-masonry',
]);

/**
 * Blocks of other plugins that filter posts by category or tag keep WordPress's
 * term ids, which mean nothing on the new site: they become the terms' slugs.
 */
/** The shortcodes kept as placeholders for plugins, as written. */
function shortcodeTexts(blocks: CxdBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    const shortcode = block.attrs.shortcode as { text?: unknown } | undefined;
    if (block.type === IMPORTED_BLOCK && typeof shortcode?.text === 'string')
      out.push(shortcode.text);
    if (block.children) out.push(...shortcodeTexts(block.children));
  }
  return out;
}

function termIdsToSlugs(blocks: CxdBlock[], channel: Node): void {
  for (const block of blocks) {
    if (block.type === IMPORTED_BLOCK && POST_BLOCKS.has(String(block.attrs.name))) {
      const attrs = (block.attrs.attrs ?? {}) as Record<string, unknown>;
      const raw = attrs.categories;
      const ids = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
        .map((v) => String(v).trim())
        .filter((v) => /^\d+$/.test(v));
      if (ids.length > 0) {
        const taxonomy = String(attrs.taxonomyType || 'category');
        const slugs = ids
          .map((id) => findTermRef(channel, taxonomy, Number(id))?.split(':')[1])
          .filter((slug): slug is string => Boolean(slug));
        block.attrs = { ...block.attrs, attrs: { ...attrs, categories: slugs.join(',') } };
      }
    }
    if (block.children) termIdsToSlugs(block.children, channel);
  }
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

/** Elementor's landing pages: pages. */
const LANDING_PAGE = 'e-landing-page';

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

/**
 * WPML translations (see wpml.ts): each group gets its languages, a shared
 * translation reference, and only the main-language entry keeps the old
 * address. Returns how many entries got another language.
 */
function recogniseTranslations(
  entries: NonNullable<TransferDocumentInput['entries']>,
  sources: Map<string, { link: string; text: string }>,
  main: string,
  locales: string[],
): number {
  const candidates = [...new Set([main, ...locales])];
  if (candidates.length < 2) return 0;
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const link = sources.get(entry.ref)?.link;
    if (!link) continue;
    const key = `${entry.type}|${link}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  let moved = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const languages = assignLanguages(
      group.map((e) => sources.get(e.ref)!.text),
      candidates,
    );
    if (languages.every((l) => l === null)) continue;
    group.forEach((entry, i) => {
      const language = languages[i];
      if (!language) return;
      entry.locale = language;
      entry.translationRef = `wpml:${key}`;
      if (language !== main) {
        delete entry.oldPaths;
        moved++;
      }
    });
  }
  return moved;
}

// ---- Elementor's site parts ----------------------------------------------------------------

type TransferEntryInput = NonNullable<TransferDocumentInput['entries']>[number];

interface ElementorSite {
  /** The site used the Hello theme: Elementor pages filled the whole width. */
  hello: boolean;
  /** The conversion context of a page or template. */
  context(warn: (message: string) => void): ElementorContext;
  /** Menus shown by nav menu widgets: menu slug → location. */
  menuLocations: Map<string, string>;
  /** Templates of the Theme Builder, popups, saved sections and global widgets. */
  templates(): TransferEntryInput[];
  /** Data for Fresco (kit) and Fresco Pro (site CSS, custom code, fonts). */
  plugins(): Record<string, unknown>;
}

/**
 * Reads what an Elementor site keeps outside its pages: the kit, templates,
 * custom code and fonts, and the lookups conversions need (entries, terms,
 * menus by WordPress id).
 */
function prepareElementor(
  channel: Node,
  items: Node[],
  locale: string,
  attachmentRefs: Map<number, string>,
  customTaxonomies: Map<string, { slug: string; hierarchical: boolean }>,
  warnings: string[],
  forms: Pick<ElementorContext, 'formCaptcha' | 'protectedForm'> = {},
): ElementorSite {
  const mediaRef = (attachment: number) => attachmentRefs.get(attachment);
  const idOf = (item: Node) => Number(text(item['wp:post_id']));
  const typeOf = (item: Node) => text(item['wp:post_type']);
  const ownType = (type: string) =>
    type === 'post'
      ? 'article'
      : type === 'page' || type === LANDING_PAGE
        ? 'page'
        : INTERNAL_TYPES.has(type) ||
            SHOP_TYPES.has(type) ||
            type === 'attachment' ||
            type === 'nav_menu_item'
          ? undefined
          : (structureSlug(type) ?? undefined);

  // Entries the import will have (pages, posts, templates): references to them stay.
  const library = items.filter((item) => typeOf(item) === 'elementor_library');
  const kinds = new Map<number, ReturnType<typeof templateKind>>();
  const importable = new Set<number>();
  for (const item of items) {
    if (!STATUS[text(item['wp:status'])]) continue;
    if (typeOf(item) === 'elementor_library') {
      const kind = templateKind(meta(item, '_elementor_template_type') ?? '');
      if (kind) {
        kinds.set(idOf(item), kind);
        importable.add(idOf(item));
      }
    } else if (ownType(typeOf(item))) importable.add(idOf(item));
  }
  const entryRef = (post: number) => (importable.has(post) ? `post:${post}` : undefined);

  // Terms by WordPress id (unique across taxonomies).
  const termsById = new Map<number, { taxonomy: string; slug: string }>();
  for (const c of (channel['wp:category'] as Node[] | undefined) ?? []) {
    termsById.set(Number(text(c['wp:term_id'])), {
      taxonomy: 'category',
      slug: text(c['wp:category_nicename']),
    });
  }
  for (const t of (channel['wp:tag'] as Node[] | undefined) ?? []) {
    termsById.set(Number(text(t['wp:term_id'])), {
      taxonomy: 'post_tag',
      slug: text(t['wp:tag_slug']),
    });
  }
  const menuSlugs = new Map<number, string>();
  for (const t of (channel['wp:term'] as Node[] | undefined) ?? []) {
    const taxonomy = text(t['wp:term_taxonomy']);
    const id = Number(text(t['wp:term_id']));
    if (taxonomy === 'nav_menu') menuSlugs.set(id, text(t['wp:term_slug']));
    else termsById.set(id, { taxonomy, slug: text(t['wp:term_slug']) });
  }
  const taxonomySlug = (wp: string) =>
    wp === 'category' ? 'category' : wp === 'post_tag' ? 'tag' : customTaxonomies.get(wp)?.slug;
  const term = (taxonomy: string, id: number) => {
    const found = termsById.get(id);
    if (!found || (taxonomy && found.taxonomy !== taxonomy)) return undefined;
    const own = taxonomySlug(found.taxonomy);
    return own ? { taxonomy: own, slug: found.slug } : undefined;
  };

  // Menus shown by nav menu widgets (by slug, or by id in old data).
  const menuLocations = new Map<string, string>();
  const knownMenus = new Set(menuSlugs.values());
  const menuLocation = (menu: string) => {
    const slug = knownMenus.has(menu) ? menu : menuSlugs.get(Number(menu));
    if (!slug) return undefined;
    const location = slug.slice(0, 64);
    menuLocations.set(slug, location);
    return location;
  };

  // Fonts: custom ones (uploaded) and those to load from Google Fonts.
  const customFamilies = new Set(
    items
      .filter((item) => typeOf(item) === 'elementor_font')
      .map((item) => decode(text(item.title)).toLowerCase()),
  );
  const families = new Set<string>();
  const font = (family: string) => {
    if (isWebFont(family.trim(), customFamilies)) families.add(family.trim());
  };

  // The kit: the most recent published one (the export has no "active kit" option).
  const notes = new Map<string, number>();
  const note = (message: string) => notes.set(message, (notes.get(message) ?? 0) + 1);
  const kits = library
    .filter((item) => meta(item, '_elementor_template_type') === 'kit')
    .sort(
      (a, b) =>
        Number(text(b['wp:status']) === 'publish') - Number(text(a['wp:status']) === 'publish') ||
        text(b['wp:post_date_gmt']).localeCompare(text(a['wp:post_date_gmt'])) ||
        idOf(b) - idOf(a),
    );
  let kit: KitResult | null = null;
  if (kits[0]) {
    kit = kitToFresco(
      asSettings(metaValue(meta(kits[0], '_elementor_page_settings'))),
      {
        classes: metaValue(meta(kits[0], '_elementor_global_classes')),
        variables: metaValue(meta(kits[0], '_elementor_global_variables')),
      },
      { note, font },
    );
  }

  // Hello (the theme made for Elementor): pages had the whole width.
  const hello = items.some(
    (item) =>
      (typeOf(item) === 'custom_css' && /^hello-/.test(text(item.title))) ||
      ((item.category as Node[] | undefined) ?? []).some(
        (c) => c['@_domain'] === 'wp_theme' && /^hello-/.test(String(c['@_nicename'] ?? '')),
      ),
  );

  const context = (warn: (message: string) => void): ElementorContext => ({
    mediaRef,
    warn,
    entryRef,
    term,
    typeSlug: (type: string) => ownType(type),
    menuLocation,
    font,
    ...forms,
    ...(kit ? { kit: kit.info } : {}),
  });

  const conditions = (value: unknown, warn: (message: string) => void) => {
    const local = new Map<string, number>();
    const ctx: ConditionContext = {
      note: (message) => local.set(message, (local.get(message) ?? 0) + 1),
      entryRef,
      term,
      taxonomySlug,
      typeSlug: (type) => ownType(type),
    };
    const rules = convertConditions(value, ctx);
    for (const [message] of local) warn(`${message}.`);
    return rules;
  };

  const templates = (): TransferEntryInput[] => {
    const out: TransferEntryInput[] = [];
    const skipped = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const item of library) {
      const type = meta(item, '_elementor_template_type') ?? '';
      const status = STATUS[text(item['wp:status'])];
      if (!type || type === 'kit' || !status) continue;
      const kind = kinds.get(idOf(item));
      if (!kind) {
        skipped.set(type || 'unknown', (skipped.get(type || 'unknown') ?? 0) + 1);
        continue;
      }
      const id = idOf(item);
      const title = texturizeText(decode(text(item.title))) || `Template ${id}`;
      const warn = (message: string) => warnings.push(`Template "${title}": ${message}`);
      const raw = meta(item, '_elementor_data');
      const blocks = raw ? (elementorToFresco(raw, context(warn)) ?? []) : [];
      takeStretched(blocks);
      const page = asSettings(metaValue(meta(item, '_elementor_page_settings')));
      const data: Settings = {
        template: {
          kind,
          conditions: conditions(metaValue(meta(item, '_elementor_conditions')), warn),
        },
      };
      if (kind === 'popup') {
        const popupNotes = new Map<string, number>();
        data.popup = popupSettings(
          page,
          asSettings(metaValue(meta(item, '_elementor_popup_display_settings'))),
          { note: (m) => popupNotes.set(m, 1) },
        );
        for (const [message] of popupNotes) warn(`${message}.`);
      }
      if (type === 'error-404')
        warn('a "not found" template became a section template: place it on the site\'s 404 page.');
      if (str(page.custom_css).trim()) data.customCss = str(page.custom_css).trim();
      const gmt = text(item['wp:post_date_gmt']);
      const date = gmt && !gmt.startsWith('0000') ? `${gmt.replace(' ', 'T')}Z` : undefined;
      out.push({
        ref: `post:${id}`,
        type: 'fresco_template',
        locale,
        slug: decodeURIComponent(text(item['wp:post_name'])) || `template-${id}`,
        title,
        status,
        authorRef: `user:${text(item['dc:creator'])}`,
        ...(date ? { publishedAt: status === 'scheduled' ? null : date, createdAt: date } : {}),
        document: { schema: 1, blocks, editor: { id: 'fresco', data } },
      });
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    if (out.length) {
      const list = [...counts].map(([kind, n]) => `${n} ${kind}`).join(', ');
      warnings.push(
        `${out.length} Elementor template(s) (${list}) were imported as Fresco Pro theme templates: Fresco Pro must be active when importing to keep them.`,
      );
    }
    for (const [type, n] of skipped) {
      warnings.push(
        `${n} Elementor template(s) of the type "${type}" have no Fresco counterpart and were not imported.`,
      );
    }
    return out;
  };

  const plugins = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [message, n] of notes)
      warnings.push(`Elementor kit: ${message}${n > 1 ? ` (${n}×)` : ''}.`);
    if (kit || families.size) {
      out.fresco = { kit: { ...(kit?.kit ?? {}), googleFonts: [...families].slice(0, 30) } };
    }
    // Fresco Pro: site CSS, custom code and custom fonts.
    const snippets = items
      .filter((item) => typeOf(item) === 'elementor_snippet' && STATUS[text(item['wp:status'])])
      .map((item, i) =>
        snippet(
          {
            title: decode(text(item.title)),
            code: text(item['content:encoded']),
            location: meta(item, '_elementor_location') ?? '',
            published: text(item['wp:status']) === 'publish',
            conditions: conditions(metaValue(meta(item, '_elementor_conditions')), (m) =>
              warnings.push(`Custom code "${decode(text(item.title))}": ${m}`),
            ),
          },
          i,
        ),
      );
    const fonts = items
      .filter((item) => typeOf(item) === 'elementor_font')
      .map((item) =>
        customFont(
          decode(text(item.title)),
          metaValue(meta(item, 'elementor_font_files')),
          mediaRef,
        ),
      )
      .filter(Boolean);
    const icons = items.filter((item) => typeOf(item) === 'elementor_icons').length;
    if (icons)
      warnings.push(
        `${icons} custom icon set(s) of Elementor were not imported: upload their SVG icons in Fresco Pro.`,
      );
    const css = kit?.css ?? '';
    if (css || snippets.length || fonts.length || library.some((item) => kinds.has(idOf(item)))) {
      out['fresco-pro'] = {
        ...(css ? { css } : {}),
        ...(snippets.length ? { snippets } : {}),
        ...(fonts.length ? { fonts } : {}),
      };
    }
    return out;
  };

  return { hello, context, menuLocations, templates, plugins };
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
