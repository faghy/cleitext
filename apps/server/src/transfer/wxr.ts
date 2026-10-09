import type { CxdBlock } from '@cleitext/blocks';
import { newBlockId } from '@cleitext/blocks';
import { XMLParser } from 'fast-xml-parser';
import { htmlToCxd } from './html-to-cxd.js';
import type { TransferDocumentInput, TransferMenuItem } from './model.js';

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
  for (const t of (channel['wp:term'] as Node[] | undefined) ?? []) {
    if (text(t['wp:term_taxonomy']) === 'nav_menu') {
      menuNames.set(text(t['wp:term_slug']), decode(text(t['wp:term_name'])));
    }
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
  let comments = 0;
  const entryRefs = new Map<number, string>();
  for (const item of items) {
    const type = text(item['wp:post_type']);
    const status = STATUS[text(item['wp:status'])];
    if (type === 'attachment' || type === 'nav_menu_item') continue;
    if (type !== 'post' && type !== 'page') {
      if (
        ![
          'revision',
          'wp_navigation',
          'wp_template',
          'wp_template_part',
          'wp_global_styles',
          'customize_changeset',
          'oembed_cache',
          'custom_css',
          'wp_block',
          'user_request',
        ].includes(type)
      ) {
        skippedTypes.set(type, (skippedTypes.get(type) ?? 0) + 1);
      }
      continue;
    }
    if (!status) continue; // trash, auto-draft, inherit
    const id = Number(text(item['wp:post_id']));
    const title = decode(text(item.title));
    const content = text(item['content:encoded']);
    const document = htmlToCxd(content, {
      mediaRef: (attachment) => attachmentRefs.get(attachment),
      warn: (message) => warnings.push(`${title || `#${id}`}: ${message}`),
    });
    // The featured image opens the content, unless it is already there.
    const thumbnail = Number(meta(item, '_thumbnail_id') ?? NaN);
    const thumbnailRef = attachmentRefs.get(thumbnail);
    if (thumbnailRef && !JSON.stringify(document.blocks).includes(`"${thumbnailRef}"`)) {
      const file = media.find((m) => m.ref === thumbnailRef)!;
      document.blocks.unshift(imageBlock(thumbnailRef, file.file, file.alt?.[locale] ?? ''));
    }
    comments += ((item['wp:comment'] as Node[] | undefined) ?? []).length;
    if (/\[[a-z_-]+[^\]]*\]/i.test(content) && !/<!--\s+wp:shortcode/.test(content)) {
      warnings.push(`${title || `#${id}`}: contains shortcodes, left as text.`);
    }
    const categories = ((item.category as Node[] | undefined) ?? []).map((c) => ({
      domain: String(c['@_domain'] ?? ''),
      slug: String(c['@_nicename'] ?? ''),
    }));
    const gmt = text(item['wp:post_date_gmt']);
    const date = gmt && !gmt.startsWith('0000') ? `${gmt.replace(' ', 'T')}Z` : undefined;
    const ref = `post:${id}`;
    entryRefs.set(id, ref);
    const link = text(item.link);
    const parent = Number(text(item['wp:post_parent']) || 0);
    entries.push({
      ref,
      type: type === 'post' ? 'article' : 'page',
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
      terms: {
        category: categories
          .filter((c) => c.domain === 'category')
          .map((c) => `category:${c.slug}`),
        tag: categories.filter((c) => c.domain === 'post_tag').map((c) => `tag:${c.slug}`),
      },
      ...(link && status === 'published' ? { oldPaths: [link, ...(id ? [`/?p=${id}`] : [])] } : {}),
    });
  }
  for (const [type, n] of skippedTypes) {
    warnings.push(`${n} item(s) of the custom type "${type}" were not imported.`);
  }
  if (comments)
    warnings.push(`${comments} comment(s) were not imported (comments come with a plugin).`);

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
        if (kind === 'taxonomy' && (object === 'category' || object === 'post_tag')) {
          const term = findTermRef(channel, object, objectId);
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
  const list =
    (channel[taxonomy === 'category' ? 'wp:category' : 'wp:tag'] as Node[] | undefined) ?? [];
  const found = list.find((t) => Number(text(t['wp:term_id'])) === id);
  if (!found) return undefined;
  return taxonomy === 'category'
    ? `category:${text(found['wp:category_nicename'])}`
    : `tag:${text(found['wp:tag_slug'])}`;
}

/** Links to the old site become relative, so they follow the new domain. */
function relativeTo(url: string, base: string): string {
  if (base && url.startsWith(base)) return url.slice(base.replace(/\/+$/, '').length) || '/';
  return url;
}

function imageBlock(ref: string, url: string, alt: string): CxdBlock {
  return { id: newBlockId(), type: 'core/image', v: 1, attrs: { id: ref, url, alt } };
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
