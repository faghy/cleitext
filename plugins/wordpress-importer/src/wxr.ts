import { XMLParser } from 'fast-xml-parser';
import { htmlToCxd, IMPORTED_BLOCK, texturizeHtml, texturizeText } from '@cleitext/blocks/html';
import { assignLanguages } from './wpml';
import {
  detectLanguages,
  matchLocale,
  META_KEYS,
  switcherMenuLink,
  type ItemFacts,
  type LanguageDetection,
} from './languages';
import {
  elementorToFresco,
  restoreEmoji,
  takeStretched,
  type ElementorContext,
  type ElementorImageInfo,
  type ComponentInfo,
  asSettings,
  num,
  type Settings,
} from '@cleitext/blocks/elementor';
import { componentInfo, convertComponent } from './elementor-components.js';
import {
  convertConditions,
  customFont,
  isWebFont,
  kitToFresco,
  pageSettings,
  popupSettings,
  snippet,
  templateKind,
  themeDefaults,
  themeHeadingFonts,
  withHeadingFonts,
  type ConditionContext,
  type ElementorDefaults,
  type KitResult,
} from './elementor-site.js';
import { metaValue } from './php.js';
import {
  hrefs,
  postsPermalink,
  sitePath,
  taxonomyBase,
  type PostsPermalink,
} from './permalinks.js';
import { cmpWarning, emptyCmpReport, stripCmpBlocks, stripCmpCss } from './cmp.js';
import { oembedLookup, sharedOembeds } from './embeds.js';
import {
  markNewsletterEmbeds,
  newsletterEmbedsWarning,
  wrapClassicEmbeds,
} from './newsletter-embeds.js';
import {
  convertCf7,
  replaceCf7Shortcodes,
  type Cf7Form,
  type Cf7Lookup,
  type ConvertedForm,
} from './cf7.js';
import { wxrAdditionalCss } from './additional-css.js';
import { DIVI_TAXONOMIES, DIVI_TYPES, prepareDivi, type DiviItem } from './divi-site.js';
import { diviPageCss, diviToFresco } from '@cleitext/blocks/divi';
import { WOO_TAXONOMIES, wooProduct } from './woocommerce.js';
import type { CxdBlock } from '@cleitext/blocks';
import type { TransferDocumentInput, TransferMenuItem } from '@cleitext/blocks/transfer';
import type { WxrMetaAuthor, WxrMetaInput, WxrMetaItem, WxrMetaTerm } from '@cleitext/plugin-sdk';
import { assignRoles, type ImportedUser, type WpUserRoles } from './user-roles';

type Node = Record<string, unknown>;

const ARRAYS = new Set([
  'item',
  'category',
  'wp:author',
  'wp:category',
  'wp:tag',
  'wp:term',
  'wp:postmeta',
  'wp:termmeta',
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
  /** Role given to imported authors whose WordPress role is not known. Default `author`. */
  authorRole?: string;
  /**
   * The WordPress roles of the users (`wp user list`, 1.34.0): administrators
   * stay administrators, editors editors… (see user-roles.ts).
   */
  roles?: WpUserRoles[];
  /** Logins (or emails) of users made administrators (`?admins=`, 1.34.0). */
  admins?: string[];
  /**
   * The language of the accounts the import creates (1.34.0): the site's,
   * e.g. `it`. Without it the core's default (English).
   */
  userLocale?: string;
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
  /**
   * Protects every imported form (Elementor's): with the site's captcha
   * (`site`, the Captcha plugin) or Fresco Pro's own Turnstile keys.
   */
  formCaptcha?: 'site' | 'turnstile';
  /**
   * Divi's theme options (`et_divi`, uploaded with the export): the global
   * colors, fonts, presets and layout of pages built with Divi.
   */
  diviOptions?: Record<string, unknown> | null;
  /**
   * Where the widgets of Elementor pages took their colors and fonts from
   * when they had none of their own: the kit's global ones (`kit`, Elementor's
   * default), the theme's (`theme`: "Disable Default Colors" and "Disable
   * Default Fonts" were on in Elementor → Settings; WordPress options, not in
   * the export), or `auto` (default): the theme's when the kit still has
   * Elementor's own colors and the theme is not Hello.
   */
  elementorDefaults?: ElementorDefaults;
  /**
   * The title separator of Yoast SEO (`wpseo_titles.separator`, e.g.
   * `sc-pipe`, or the character itself), for the `%%sep%%` of the imported
   * titles. A hyphen without it, Yoast's default.
   */
  seoSeparator?: string;
  /**
   * The core takes the addresses of the export (`permalinks` of the transfer
   * document, plugin API 1.55): the posts' permalink and the categories' and
   * tags' bases go with the document. Older cores only get a hint.
   */
  corePermalinks?: boolean;
  /**
   * Uses the addresses of the export also on a site that already has posts,
   * categories or tags: their current addresses redirect. Without it, they
   * apply only where there is no content yet (the report says otherwise).
   */
  replacePermalinks?: boolean;
}

export interface WxrResult {
  document: TransferDocumentInput;
  /** What could not be converted exactly (part of the report). */
  warnings: string[];
  /**
   * Every item's post meta and every term's term meta, for the plugins that
   * read them (`import.wxrMeta`, plugin API 1.48), e.g. ACF's field values.
   */
  meta: WxrMetaInput;
  /** The authors and the role each gets on the site, with where it came from (1.34.0). */
  users: ImportedUser[];
}

/**
 * The month of an attachment's folder: the `/uploads/<yyyy>/<mm>/` of its
 * address, else its upload date (when WordPress did not organise uploads by
 * month), as an ISO date; undefined when neither is known.
 */
export function attachmentDate(url: string, gmt: string): string | undefined {
  const folder = /\/uploads\/(\d{4})\/(\d{2})\/[^/]+$/.exec(url.replace(/[?#].*$/, ''));
  if (folder && Number(folder[2]) >= 1 && Number(folder[2]) <= 12) {
    return `${folder[1]}-${folder[2]}-01T00:00:00Z`;
  }
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(gmt) && !gmt.startsWith('0000')
    ? `${gmt.replace(' ', 'T')}Z`
    : undefined;
}

const withDate = (date: string | undefined) => (date ? { date } : {});

/** `decodeURIComponent`, or the text itself when it is not encoded properly. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * A path inside WordPress's uploads folder (`2015/09/yoga-1.png`): from
 * `_wp_attached_file` (relative, or absolute as very old WordPress stored
 * it) or from an address (`…/wp-content/uploads/2015/09/yoga-1.png`).
 * Undefined for anything else, or a path that could leave the folder.
 */
export function uploadsPath(value: string, address = false): string | undefined {
  let rel = value.trim().replace(/[?#].*$/, '');
  const at = rel.lastIndexOf('/uploads/');
  if (at >= 0) rel = rel.slice(at + '/uploads/'.length);
  else if (address || rel.startsWith('/') || /^[a-z]:/i.test(rel)) return undefined;
  if (address) rel = safeDecode(rel);
  if (!rel || rel.length > 1_000 || rel.endsWith('/') || /[\\\0]/.test(rel)) return undefined;
  if (rel.split('/').some((part) => part === '' || part === '.' || part === '..')) return undefined;
  return rel;
}

/**
 * The files of an attachment on WordPress (1.33.1): its name and the month
 * of its folder from `_wp_attached_file` (the file on WordPress's disk,
 * which its address served), else from its address, else from `guid`; and
 * every address it had, for redirects and content: the attached file's,
 * `wp:attachment_url`, `guid` when it is a file of the uploads, and the
 * original of a `-scaled` image (`original_image` of its metadata).
 */
export function attachmentFiles(input: {
  url: string;
  guid: string;
  attached: string | undefined;
  metadata: string | undefined;
  gmt: string;
}): { filename: string | undefined; urls: string[]; date: string | undefined } {
  const attached = input.attached ? uploadsPath(input.attached) : undefined;
  const guid = /^https?:\/\//i.test(input.guid) ? uploadsPath(input.guid, true) : undefined;
  const fromUrl = uploadsPath(input.url, true);
  // The uploads folder's address: the one of its address, else of its guid.
  const base = [input.url, input.guid]
    .map((u) => /^(.*\/uploads\/)/.exec(u.replace(/[?#].*$/, ''))?.[1])
    .find(Boolean);
  const urls = new Set<string>();
  if (attached && base) urls.add(`${base}${attached}`);
  urls.add(input.url);
  if (guid) urls.add(input.guid);
  const data = metaValue(input.metadata);
  const original =
    data && typeof data === 'object' ? (data as Record<string, unknown>).original_image : undefined;
  if (attached && base && typeof original === 'string') {
    const dir = attached.includes('/') ? attached.slice(0, attached.lastIndexOf('/') + 1) : '';
    const path = uploadsPath(`${dir}${original}`);
    if (path && !original.includes('/')) urls.add(`${base}${path}`);
  }
  const name = (path: string | undefined) => path?.slice(path.lastIndexOf('/') + 1) || undefined;
  const month = (path: string | undefined) =>
    path && /^\d{4}\/\d{2}\/[^/]+$/.test(path) ? `/uploads/${path}` : undefined;
  const folder = month(attached) ?? month(fromUrl) ?? month(guid);
  return {
    filename: name(attached) ?? name(fromUrl) ?? name(safeDecode(input.url.replace(/[?#].*$/, ''))),
    urls: [...urls],
    date: attachmentDate(folder ?? '', input.gmt),
  };
}

/** WordPress export (WXR 1.x) → transfer document (RF-IMP-01). */
export function wxrToDocument(xml: string, options: WxrOptions): WxrResult {
  const warnings: string[] = [];
  /** Newsletter forms of email services offered to plugins, by service (since 1.30.0). */
  const newsletterEmbeds = new Map<string, number>();
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
  /** WordPress's oEmbed cache outside posts, for embeds without a Cleitext player. */
  const oembedShared = sharedOembeds(items, text);

  // ---- Authors ------------------------------------------------------------------------
  const loginById = new Map(
    ((channel['wp:author'] as Node[] | undefined) ?? []).map((a) => [
      text(a['wp:author_id']),
      text(a['wp:author_login']),
    ]),
  );
  const assigned = assignRoles(
    ((channel['wp:author'] as Node[] | undefined) ?? []).map((a) => ({
      login: text(a['wp:author_login']),
      email: text(a['wp:author_email']),
      displayName: text(a['wp:author_display_name']) || text(a['wp:author_login']),
    })),
    {
      authorRole: options.authorRole ?? 'author',
      ...(options.roles ? { roles: options.roles } : {}),
      ...(options.admins ? { admins: options.admins } : {}),
    },
  );
  const authors = assigned.map((a) => ({
    ref: `user:${a.login}`,
    email: a.email,
    displayName: a.displayName,
    role: a.role,
    ...(options.userLocale ? { locale: options.userLocale } : {}),
  }));
  if (options.admins?.length) {
    const known = new Set(assigned.flatMap((a) => [a.login.toLowerCase(), a.email.toLowerCase()]));
    for (const admin of options.admins) {
      if (!known.has(admin.toLowerCase())) {
        warnings.push(`Administrator "${admin}" is not an author of the export: left out.`);
      }
    }
  }
  // For plugins reading user ids in meta (`import.wxrMeta`, plugin API 1.49).
  const metaAuthors: WxrMetaAuthor[] = ((channel['wp:author'] as Node[] | undefined) ?? []).map(
    (a) => ({
      id: Number(text(a['wp:author_id'])) || 0,
      login: text(a['wp:author_login']),
      email: text(a['wp:author_email']),
      displayName: decode(text(a['wp:author_display_name'])) || text(a['wp:author_login']),
      ref: `user:${text(a['wp:author_login'])}`,
    }),
  );

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
  // The same by address without the size WordPress gave its copies, and addresses by ref.
  const attachmentKeys = new Map<string, string>();
  const mediaUrls = new Map<string, string>();
  for (const item of items) {
    if (text(item['wp:post_type']) !== 'attachment') continue;
    const id = Number(text(item['wp:post_id']));
    const url = text(item['wp:attachment_url']);
    if (!url) continue;
    const ref = `att:${id}`;
    const alt = meta(item, '_wp_attachment_image_alt');
    // The name and folder of the file on WordPress's disk, every address it had (1.33.1).
    const files = attachmentFiles({
      url,
      guid: text(item.guid),
      attached: meta(item, '_wp_attached_file'),
      metadata: meta(item, '_wp_attachment_metadata'),
      gmt: text(item['wp:post_date_gmt']),
    });
    media.push({
      ref,
      file: url,
      filename: (files.filename ?? `file-${id}`).slice(0, 255),
      ...(alt ? { alt: { [locale]: alt } } : {}),
      ...(text(item['excerpt:encoded'])
        ? { caption: { [locale]: stripTags(text(item['excerpt:encoded'])) } }
        : {}),
      urls: files.urls.filter((u) => u.length <= 2_000),
      // Stored in the same year and month folder as on WordPress (core 0.85).
      ...withDate(files.date),
    });
    attachmentRefs.set(id, ref);
    attachmentUrls.set(url, ref);
    attachmentKeys.set(mediaKey(url), ref);
    // Its other addresses, unless they are another attachment's.
    for (const address of files.urls) {
      if (!attachmentUrls.has(address)) attachmentUrls.set(address, ref);
      if (!attachmentKeys.has(mediaKey(address))) attachmentKeys.set(mediaKey(address), ref);
    }
    mediaUrls.set(ref, url);
  }
  const itemsById = new Map(items.map((item) => [Number(text(item['wp:post_id'])), item]));

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
    options.elementorDefaults ?? 'auto',
  );

  // ---- Divi: what pages and templates share ---------------------------------------------
  const diviFamilies = new Set<string>();
  const divi = prepareDivi({
    items: items
      .filter((item) => !['attachment', 'nav_menu_item'].includes(text(item['wp:post_type'])))
      .map((item) => diviItem(item)),
    locale,
    origin: baseUrl,
    options: options.diviOptions ?? null,
    mediaByUrl: (url) => attachmentUrls.get(url) ?? attachmentKeys.get(mediaKey(url)),
    attachment: (id) => {
      const ref = attachmentRefs.get(id);
      const url = ref ? mediaUrls.get(ref) : undefined;
      return url ? { ref, url } : undefined;
    },
    postLink: (id) => {
      const item = itemsById.get(id);
      const link = item ? text(item.link) : '';
      if (!link) return undefined;
      const path = relativeTo(link, baseUrl);
      return path.startsWith('/') ? path : link;
    },
    menus: ((channel['wp:term'] as Node[] | undefined) ?? [])
      .filter((t) => text(t['wp:term_taxonomy']) === 'nav_menu')
      .map((t) => ({
        id: Number(text(t['wp:term_id'])),
        slug: text(t['wp:term_slug']),
        items: items.filter(
          (i) =>
            text(i['wp:post_type']) === 'nav_menu_item' &&
            ((i.category as Node[] | undefined) ?? []).some(
              (c) => c['@_domain'] === 'nav_menu' && c['@_nicename'] === text(t['wp:term_slug']),
            ),
        ).length,
      })),
    conditions: elementor.conditionLookups,
    font: (family) => {
      if (/^[A-Za-z0-9][\w ]{0,59}$/.test(family.trim())) diviFamilies.add(family.trim());
    },
    warnings,
  });
  let diviPages = 0;

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
    // Emoji pasted as WordPress's images are characters again.
    const content = texturizeHtml(restoreEmoji(text(item['content:encoded'])));
    // Newsletter forms pasted in the classic editor are kept as HTML blocks.
    let document = htmlToCxd(wrapClassicEmbeds(content), {
      // Blocks of other plugins (e.g. block libraries) are left to active plugins.
      keepUnknown: true,
      mediaRef: (attachment) => attachmentRefs.get(attachment),
      warn: (message) => warnings.push(`${title || `#${id}`}: ${message}`),
      // Embeds of providers without a Cleitext player keep WordPress's cached HTML.
      oembedHtml: oembedLookup(
        (item['wp:postmeta'] as Node[] | undefined) ?? [],
        text,
        oembedShared,
      ),
    });
    // HTML blocks with a newsletter service's form are offered to plugins (`import.block`).
    const marked = markNewsletterEmbeds(document.blocks as CxdBlock[], newsletterEmbeds);
    if (marked !== document.blocks) document = { ...document, blocks: marked };
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
    } else if (useElementor && divi.isDiviPage(diviItem(item))) {
      // Pages built with Divi: their layout as a Fresco page, the whole width, without
      // the theme's title (Divi's pages show none).
      const warn = (message: string) => warnings.push(`${title || `#${id}`}: ${message}`);
      const gutter = Number(meta(item, '_et_pb_gutter_width')) || undefined;
      const pageCss = meta(item, '_et_pb_custom_css') ?? '';
      const blocks = diviToFresco(content, divi.context(warn, title, gutter));
      if (blocks && blocks.length > 0) {
        const rest = pageCss.trim() ? diviPageCss(blocks, pageCss) : '';
        document = {
          schema: 1,
          blocks,
          editor: {
            id: 'fresco',
            data: {
              layout: 'full',
              flush: true,
              hideTitle: true,
              ...(rest ? { customCss: rest } : {}),
            },
          },
        };
        diviPages++;
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
    if (
      document.editor?.id !== 'fresco' &&
      /\[(?!gallery\b)[a-z_-]+[^\]]*\]/i.test(rest) &&
      !/<!--\s+wp:shortcode/.test(rest)
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
    const seo = seoFields(item, options.seoSeparator);
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
  // ---- Languages: WPML's and Polylang's data, language addresses ------------------------
  const candidates = [...new Set([locale, ...(options.locales ?? [])])];
  const detection = detectLanguages(
    items.filter((i) => text(i['wp:post_type']) !== 'attachment').map(itemFacts),
    candidates,
  );
  const languages = siteLanguages(detection, locale, candidates);
  const decided = applyLanguages(entries, detection, languages, warnings);
  for (const [id, ref] of entryRefs) {
    if (decided.dropped.has(ref)) entryRefs.delete(id);
  }
  if (decided.dropped.size > 0) {
    for (let i = shopProducts.length - 1; i >= 0; i--) {
      const ref = (shopProducts[i]!.entry as { $entry?: string } | undefined)?.$entry;
      if (ref && decided.dropped.has(ref)) shopProducts.splice(i, 1);
    }
  }
  const translated = recogniseTranslations(entries, sources, locale, candidates, decided.kept);
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
  // The addresses of the posts and of category and tag archives, read from the links (1.31.0).
  const permalinks = sourcePermalinks(items, channel, baseUrl);
  if (permalinks.posts && !permalinks.posts.cleitext) {
    warnings.push(
      `Posts had addresses like ${permalinks.posts.wordpress} in WordPress, which Cleitext cannot keep: the old addresses redirect to the new ones.`,
    );
  } else if (permalinks.posts?.cleitext && !options.corePermalinks) {
    warnings.push(
      `Posts had addresses like ${permalinks.posts.wordpress}: to keep them, set the permalink of Posts to ${permalinks.posts.cleitext} in Content structure before importing (otherwise the old addresses redirect).`,
    );
  }
  const permalinkTypes: Record<string, string> = permalinks.posts?.cleitext
    ? { article: permalinks.posts.cleitext }
    : {};
  const permalinksDocument =
    options.corePermalinks &&
    (Object.keys(permalinkTypes).length > 0 || Object.keys(permalinks.bases).length > 0)
      ? {
          types: permalinkTypes,
          taxonomyBases: permalinks.bases,
          ...(options.replacePermalinks ? { replace: true } : {}),
        }
      : null;
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
  if (diviPages) {
    warnings.push(
      `${diviPages} page(s) built with Divi were imported as Fresco pages: activate the Fresco plugin to show and edit them.`,
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
    // Divi's Theme Builder and Library, and its theme options as Fresco's kit.
    entries.push(...divi.templates());
    const fresco = divi.fresco([...diviFamilies]);
    if (fresco) {
      const current = (plugins.fresco ?? {}) as Record<string, unknown>;
      plugins.fresco = {
        ...current,
        ...fresco,
        kit: { ...((current.kit as Record<string, unknown>) ?? {}), ...(fresco.kit as object) },
      };
    }
  }
  if (protectedForms) {
    warnings.push(
      options.formCaptcha === 'site'
        ? `${protectedForms} form(s) protected with the site captcha: activate the Captcha plugin and set its keys in Settings → Captcha.`
        : `${protectedForms} form(s) protected with Turnstile: add the site and secret keys in Fresco Pro → Forms → Spam protection (without them the Captcha plugin's keys are used).`,
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

  // ---- Contact Form 7 → Forms ----------------------------------------------------------
  const cf7 = cf7Lookup(items, detection, languages, locale, decode(text(channel.title)));
  if (cf7.forms > 0) {
    let blocks = 0;
    const missing = new Set<string>();
    for (const entry of entries) {
      const done = replaceCf7Shortcodes(entry.document.blocks as CxdBlock[], entry.locale, cf7);
      if (done.converted === 0 && done.missing.length === 0) continue;
      entry.document = { ...entry.document, blocks: done.blocks };
      blocks += done.converted;
      for (const text of done.missing) missing.add(text);
    }
    for (const [title, notes] of cf7.notes()) {
      warnings.push(`Contact Form 7 form "${title}": ${notes.join('; ')}.`);
    }
    if (blocks > 0) {
      warnings.push(
        `${blocks} Contact Form 7 shortcode(s) became Forms blocks (${cf7.used()} form(s)), with their fields, subject, Reply-To and thank-you message: activate the Forms plugin and set the address that receives the messages in Settings → Forms.`,
      );
    }
    for (const text of missing) {
      warnings.push(`${text}: the form is not in the export, the shortcode was kept as text.`);
    }
  }

  // ---- Cookie banners' leftovers (the Privacy plugin replaces them) ----------------------
  const cmp = emptyCmpReport();
  for (const entry of entries) {
    const blocks = stripCmpBlocks(entry.document.blocks as CxdBlock[], cmp);
    if (blocks !== entry.document.blocks) entry.document = { ...entry.document, blocks };
  }

  // ---- Menus ------------------------------------------------------------------------------
  const menus: NonNullable<TransferDocumentInput['menus']> = [];
  const navItems = items.filter((i) => text(i['wp:post_type']) === 'nav_menu_item');
  // Menus of other languages: WP-CLI's export of a WPML site has only the main
  // language's nav_menu terms, but every item names its menu (`<category domain="nav_menu">`).
  const menuOf = (item: Node) =>
    ((item.category as Node[] | undefined) ?? []).find((c) => c['@_domain'] === 'nav_menu');
  for (const item of navItems) {
    const category = menuOf(item);
    const slug = category ? String(category['@_nicename'] ?? '') : '';
    if (slug && !menuNames.has(slug)) menuNames.set(slug, decode(text(category)) || slug);
  }
  const entryByRef = new Map(entries.map((e) => [e.ref, e]));
  const menuLanguages: string[] = [];
  let switchers = 0;
  for (const [slug, name] of menuNames) {
    const own = navItems
      .filter((i) => String(menuOf(i)?.['@_nicename'] ?? '') === slug)
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
        // Polylang's language switcher: Multilingual's, with the same choices (1.29.0).
        const switcher = url
          ? switcherMenuLink(url, metaValue(meta(item, '_pll_menu_item')))
          : null;
        if (switcher) {
          switchers++;
          return {
            kind: 'url',
            url: switcher,
            label: label ?? 'Languages',
            target: null,
            children,
          };
        }
        return url
          ? { kind: 'url', url: relativeTo(url, baseUrl), label: label ?? url, target, children }
          : { kind: 'custom', label: label ?? 'Item', children };
      });
    const built = build('0');
    // The menu's language: its items' (WPML's data), else most of the pages it links to.
    const votes = new Map<string, number>();
    const vote = (code: string | null | undefined) => {
      if (code) votes.set(code, (votes.get(code) ?? 0) + 1);
    };
    for (const item of own) {
      const code = detection.languages.get(Number(text(item['wp:post_id'])));
      vote(code ? languages.get(code) : null);
    }
    if (votes.size === 0) {
      walkMenu(built, (item) => vote(item.entryRef ? entryByRef.get(item.entryRef)?.locale : null));
    }
    const menuLocale = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? locale;
    // Items linking to a page of another language link to its translation.
    walkMenu(built, (item) => {
      const target = item.entryRef ? entryByRef.get(item.entryRef) : undefined;
      if (!target || target.locale === menuLocale) return;
      const translation = translationIn(entries, target, menuLocale);
      if (translation) item.entryRef = translation.ref;
    });
    // Menus shown by Elementor's nav menu widgets get a location of their own.
    const location = elementor.menuLocations.get(slug) ?? divi.menuLocations.get(slug);
    menus.push({ name, locale: menuLocale, ...(location ? { location } : {}), items: built });
    menuLanguages.push(menuLocale);
  }
  if (switchers > 0) {
    warnings.push(
      `Polylang's language switcher in menus became Multilingual's (${switchers}×), with the same choices: it shows with Multilingual 1.6.0 or later.`,
    );
  }
  // Languages with translated pages but no menu: the main language's menus,
  // each item linking to the translation of its page.
  const translatedLocales = new Set(
    entries.filter((e) => e.translationRef && e.locale !== locale).map((e) => e.locale),
  );
  for (const target of translatedLocales) {
    if (menuLanguages.includes(target)) continue;
    for (const menu of menus.filter((m) => m.locale === locale)) {
      let missing = 0;
      const copy = (list: TransferMenuItem[]): TransferMenuItem[] =>
        list.flatMap((item): TransferMenuItem[] => {
          const children = copy(item.children ?? []);
          if (item.kind !== 'entry') return [{ ...item, children }];
          const from = item.entryRef ? entryByRef.get(item.entryRef) : undefined;
          const translation = from ? translationIn(entries, from, target) : undefined;
          if (!translation) {
            missing++;
            return children;
          }
          // The translated page's own title, not the main language's label.
          return [{ ...item, entryRef: translation.ref, label: null, children }];
        });
      const translatedItems = copy(menu.items as TransferMenuItem[]);
      menus.push({ ...menu, locale: target, items: translatedItems });
      warnings.push(
        `Menu "${menu.name}" was rebuilt in ${target} from the ${locale} one, each page replaced by its translation${missing ? ` (${missing} item(s) without a translation left out)` : ''}: check its labels and links.`,
      );
    }
  }

  // ---- Meta for plugins (`import.wxrMeta`) ------------------------------------------------
  const importedTerms = new Set(terms.map((t) => t.ref));
  const metaTerms: WxrMetaTerm[] = [];
  const addTerm = (node: Node, taxonomy: string, slug: string, name: string, ref: string) => {
    metaTerms.push({
      ref,
      id: Number(text(node['wp:term_id'])) || 0,
      taxonomy,
      slug,
      name: decode(name) || slug,
      imported: importedTerms.has(ref),
      meta: metaOf((node['wp:termmeta'] as Node[] | undefined) ?? []),
    });
  };
  for (const c of (channel['wp:category'] as Node[] | undefined) ?? []) {
    const slug = text(c['wp:category_nicename']);
    addTerm(c, 'category', slug, text(c['wp:cat_name']), `category:${slug}`);
  }
  for (const t of (channel['wp:tag'] as Node[] | undefined) ?? []) {
    const slug = text(t['wp:tag_slug']);
    addTerm(t, 'post_tag', slug, text(t['wp:tag_name']), `tag:${slug}`);
  }
  for (const t of (channel['wp:term'] as Node[] | undefined) ?? []) {
    const taxonomy = text(t['wp:term_taxonomy']);
    const slug = text(t['wp:term_slug']);
    addTerm(t, taxonomy, slug, text(t['wp:term_name']), `${taxonomy}:${slug}`);
  }
  const importedEntries = new Set(entries.map((e) => e.ref));
  const metaItems: WxrMetaItem[] = items.map((item) => {
    const id = Number(text(item['wp:post_id'])) || 0;
    const attachment = text(item['wp:post_type']) === 'attachment';
    const ref = attachment ? `att:${id}` : `post:${id}`;
    return {
      ref,
      id,
      type: text(item['wp:post_type']),
      status: text(item['wp:status']),
      name: safeDecodeUri(text(item['wp:post_name'])),
      title: decode(text(item.title)),
      content: text(item['content:encoded']),
      excerpt: text(item['excerpt:encoded']),
      parent: Number(text(item['wp:post_parent'])) || 0,
      menuOrder: Number(text(item['wp:menu_order'])) || 0,
      imported: attachment ? attachmentRefs.has(id) : importedEntries.has(ref),
      meta: metaOf((item['wp:postmeta'] as Node[] | undefined) ?? []),
    };
  });

  // ---- Additional CSS (the Customizer's, a `custom_css` post per theme) ---------------
  const additionalCss = wxrAdditionalCss(items);
  warnings.push(...additionalCss.warnings);
  if (additionalCss.css) additionalCss.css = stripCmpCss(additionalCss.css, cmp);
  const cmpLine = cmpWarning(cmp);
  if (cmpLine) warnings.push(cmpLine);
  const newsletterLine = newsletterEmbedsWarning(newsletterEmbeds);
  if (newsletterLine) warnings.push(newsletterLine);

  return {
    warnings,
    users: assigned
      .filter((a) => a.email)
      .map((a) => ({ ...a, displayName: decode(a.displayName) })),
    meta: {
      items: metaItems,
      terms: metaTerms,
      options: null,
      authors: metaAuthors,
      types: Object.fromEntries([...customTypes].map(([wp, t]) => [wp, t.slug])),
      taxonomies: Object.fromEntries([...customTaxonomies].map(([wp, t]) => [wp, t.slug])),
    },
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
        ...(additionalCss.css ? { additionalCss: { site: additionalCss.css } } : {}),
        // WordPress themes (Divi, Elementor's, most others) have no automatic dark
        // mode: the imported site stays light, where the active theme can choose.
        colorScheme: 'light',
      },
      users: authors.filter((a) => a.email),
      contentTypes,
      ...(permalinksDocument ? { permalinks: permalinksDocument } : {}),
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

/**
 * The structure of the posts' addresses and the first part of category and
 * tag archives (Cleitext's `category` and `tag`), read from the export's links.
 */
function sourcePermalinks(
  items: Node[],
  channel: Node,
  baseUrl: string,
): { posts: PostsPermalink | null; bases: Record<string, string> } {
  const posts = postsPermalink(
    items
      .filter((i) => text(i['wp:post_type']) === 'post' && text(i['wp:status']) === 'publish')
      .map((i) => ({
        id: Number(text(i['wp:post_id'])) || 0,
        link: text(i.link),
        slug: text(i['wp:post_name']),
        date: text(i['wp:post_date']),
        categories: ((i.category as Node[] | undefined) ?? [])
          .filter((c) => c['@_domain'] === 'category')
          .map((c) => String(c['@_nicename'] ?? '')),
      })),
    baseUrl,
  );
  // Links to archives: in the content, and custom links of menus.
  const links: string[] = [];
  const itemPaths = new Set<string>();
  for (const item of items) {
    const path = sitePath(text(item.link), baseUrl);
    if (path && text(item['wp:post_type']) !== 'nav_menu_item') itemPaths.add(path);
    links.push(...hrefs(text(item['content:encoded'])));
    const url = meta(item, '_menu_item_url');
    if (url) links.push(url);
  }
  const slugsOf = (nodes: unknown, key: string) =>
    new Set(((nodes as Node[] | undefined) ?? []).map((n) => text(n[key])).filter(Boolean));
  const bases: Record<string, string> = {};
  const category = taxonomyBase(
    links,
    baseUrl,
    slugsOf(channel['wp:category'], 'wp:category_nicename'),
    itemPaths,
  );
  if (category !== null) bases.category = category;
  const tag = taxonomyBase(links, baseUrl, slugsOf(channel['wp:tag'], 'wp:tag_slug'), itemPaths);
  if (tag !== null) bases.tag = tag;
  return { posts, bases };
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    const node = value as Node;
    return '#text' in node ? String(node['#text']) : '';
  }
  return String(value).trim();
}

/** A percent-encoded name, decoded when it can be. */
function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Meta rows (`wp:postmeta`, `wp:termmeta`) by key: the first value of each. */
function metaOf(rows: Node[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = text(row['wp:meta_key']);
    if (key && !(key in out)) out[key] = text(row['wp:meta_value']);
  }
  return out;
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
  // Elementor 4: components and global classes (imported into Fresco, not as content).
  'elementor_component',
  'e_global_class',
  // ACF's own records: given to plugins with their meta (`import.wxrMeta`), not content.
  'acf-field-group',
  'acf-field',
  'acf-post-type',
  'acf-taxonomy',
  'acf-ui-options-page',
  'wpcf7_contact_form',
  'rank_math_schema',
  'scheduled-action',
  // Divi's Library and Theme Builder (imported as Fresco templates, not as content).
  ...DIVI_TYPES,
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
  ...DIVI_TAXONOMIES,
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

/** Yoast SEO's title separators (`wpseo_titles.separator`), by the option's value. */
const YOAST_SEPARATORS: Record<string, string> = {
  'sc-dash': '-',
  'sc-ndash': '–',
  'sc-mdash': '—',
  'sc-colon': ':',
  'sc-middot': '·',
  'sc-bull': '•',
  'sc-star': '*',
  'sc-smstar': '⋆',
  'sc-pipe': '|',
  'sc-tilde': '~',
  'sc-laquo': '«',
  'sc-raquo': '»',
  'sc-lt': '<',
  'sc-gt': '>',
};

/**
 * The variables of Yoast SEO's titles that Cleitext's SEO plugins also know
 * (Vetta and SEO read `%%name%%`), by Yoast's name. The others are dropped.
 */
const SEO_VARIABLES: Record<string, string> = {
  title: 'title',
  sitename: 'sitename',
  sitedesc: 'sitedesc',
  page: 'page',
  primary_category: 'category',
  category: 'category',
  excerpt: 'excerpt',
  currentyear: 'currentyear',
  name: 'name',
};

/** A separator standing between two parts of a title (a hyphen inside a word is not one). */
const SEP_CHARS = '[-–—|:·•*⋆~«»<>]';

/**
 * A title or description of Yoast SEO (or Rank Math, already in `%%name%%`
 * form) as a template of Cleitext's SEO plugins: `%%sep%%` becomes the
 * separator the old site used, the variables both plugins know stay (so the
 * title follows the page), and the others go without leaving a double
 * separator or stray spaces behind.
 */
export function seoTemplate(value: string, separator = '-'): string {
  const sep = YOAST_SEPARATORS[separator] ?? (separator.trim() || '-');
  return (
    value
      .replace(/%%([a-z0-9_]+)%%/gi, (_m, name: string) => {
        const key = name.toLowerCase();
        if (key === 'sep') return ` ${sep} `;
        const known = SEO_VARIABLES[key];
        return known ? `%%${known}%%` : ' ';
      })
      .replace(/\s+/g, ' ')
      // Parts left empty: one separator between the others, none at the ends.
      .replace(new RegExp(`(?:^|\\s)${SEP_CHARS}(?:\\s+${SEP_CHARS})+(?=\\s|$)`, 'g'), (m) =>
        m.replace(/(\S)[\s\S]*/, '$1'),
      )
      .replace(new RegExp(`^\\s*${SEP_CHARS}\\s+|\\s+${SEP_CHARS}\\s*$`, 'g'), '')
      .trim()
  );
}

/** Yoast's and Rank Math's own title, which Cleitext's SEO plugins give anyway: no need to keep it. */
function defaultTitle(template: string): boolean {
  const plain = template
    .replace(/%%page%%/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return new RegExp(`^%%title%% ${SEP_CHARS} %%sitename%%$`).test(plain);
}

/** Search title, description, keyphrase, indexing and canonical from Yoast SEO or Rank Math. */
function seoFields(item: Node, separator?: string): Record<string, unknown> | null {
  // Rank Math writes %title%, Yoast and Cleitext %%title%%.
  const rankVars = (value: string) => value.replace(/(?<!%)%([a-z_]+)%(?!%)/g, '%%$1%%');
  const rawTitle =
    meta(item, '_yoast_wpseo_title') || rankVars(meta(item, 'rank_math_title') ?? '');
  const rawDescription =
    meta(item, '_yoast_wpseo_metadesc') || rankVars(meta(item, 'rank_math_description') ?? '');
  let title = rawTitle ? seoTemplate(decode(rawTitle), separator) : '';
  // The pattern every page has anyway: left empty, the site's own one applies.
  if (defaultTitle(title)) title = '';
  // At most 70 characters, without half a variable at the end.
  title = title.slice(0, 70);
  if ((title.match(/%%/g)?.length ?? 0) % 2 === 1) title = title.slice(0, title.lastIndexOf('%%'));
  title = title.replace(new RegExp(`\\s+${SEP_CHARS}\\s*$`), '').trim();
  let description = rawDescription ? seoTemplate(decode(rawDescription), separator) : '';
  if (description === '%%excerpt%%') description = '';
  const keyphrase =
    meta(item, '_yoast_wpseo_focuskw') ||
    (meta(item, 'rank_math_focus_keyword') ?? '').split(',')[0]!.trim();
  const noindex =
    meta(item, '_yoast_wpseo_meta-robots-noindex') === '1' ||
    /"noindex"/.test(meta(item, 'rank_math_robots') ?? '');
  const canonical = meta(item, '_yoast_wpseo_canonical') || meta(item, 'rank_math_canonical_url');
  const seo: Record<string, unknown> = {
    // In Yoast SEO and Rank Math a page's own title is the whole title: the
    // SEO plugins show it as it is, without adding the site's name again.
    ...(title ? { title, fullTitle: true } : {}),
    ...(description ? { description: description.slice(0, 160) } : {}),
    ...(keyphrase ? { keyphrase: decode(keyphrase).slice(0, 100) } : {}),
    ...(noindex ? { noindex: true } : {}),
    ...(canonical && /^https?:\/\//.test(canonical) ? { canonical } : {}),
  };
  return Object.keys(seo).length > 0 ? seo : null;
}

/** Links to the old site become relative, so they follow the new domain. */
/** An address without the size WordPress gives the copies of an image, nor its host and query. */
function mediaKey(url: string): string {
  return url
    .replace(/[?#].*$/, '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/-(?:\d+x\d+|scaled)(\.[a-z0-9]+)$/i, '$1');
}

/** An item of the export as Divi's parts read it: its content, every meta value and its terms. */
function diviItem(item: Node): DiviItem {
  const metaMap = new Map<string, string[]>();
  for (const row of (item['wp:postmeta'] as Node[] | undefined) ?? []) {
    const key = text(row['wp:meta_key']);
    if (key) metaMap.set(key, [...(metaMap.get(key) ?? []), text(row['wp:meta_value'])]);
  }
  const termMap = new Map<string, string[]>();
  for (const c of (item.category as Node[] | undefined) ?? []) {
    const domain = String(c['@_domain'] ?? '');
    termMap.set(domain, [...(termMap.get(domain) ?? []), String(c['@_nicename'] ?? '')]);
  }
  const gmt = text(item['wp:post_date_gmt']);
  return {
    id: Number(text(item['wp:post_id'])),
    type: text(item['wp:post_type']),
    status: STATUS[text(item['wp:status'])],
    title: texturizeText(decode(text(item.title))),
    slug: decodeURIComponent(text(item['wp:post_name'])),
    content: text(item['content:encoded']),
    author: text(item['dc:creator']),
    ...(gmt && !gmt.startsWith('0000') ? { date: `${gmt.replace(' ', 'T')}Z` } : {}),
    meta: metaMap,
    terms: termMap,
  };
}

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
 * The export's Contact Form 7 forms, found by a shortcode's id, hash or
 * title, in the language of the page when the form was translated.
 */
function cf7Lookup(
  items: Node[],
  detection: LanguageDetection,
  languages: Map<string, string | null>,
  locale: string,
  siteTitle: string,
): Cf7Lookup & {
  forms: number;
  used(): number;
  notes(): Map<string, string[]>;
} {
  const forms: Cf7Form[] = [];
  for (const item of items) {
    if (text(item['wp:post_type']) !== 'wpcf7_contact_form') continue;
    if (text(item['wp:status']) === 'trash') continue;
    const record = (key: string) => {
      const value = metaValue(meta(item, key));
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    };
    forms.push({
      id: Number(text(item['wp:post_id'])) || 0,
      title: decode(text(item.title)),
      hash: meta(item, '_hash') ?? '',
      template: meta(item, '_form') ?? '',
      mail: record('_mail'),
      mail2: record('_mail_2'),
      messages: record('_messages'),
    });
  }
  const localeOf = (form: Cf7Form) => {
    const code = detection.languages.get(form.id);
    return (code ? languages.get(code) : null) ?? locale;
  };
  const groupOf = new Map<number, number[]>();
  for (const ids of detection.groups.values()) for (const id of ids) groupOf.set(id, ids);
  const converted = new Map<number, ConvertedForm>();
  return {
    forms: forms.length,
    find(attrs, wanted) {
      const id = (attrs.id ?? '').trim();
      const title = decode(attrs.title ?? '').trim();
      const form =
        (/^\d+$/.test(id) ? forms.find((f) => f.id === Number(id)) : undefined) ??
        (/^[0-9a-f]{7,40}$/i.test(id)
          ? forms.find((f) => f.hash.toLowerCase().startsWith(id.toLowerCase()))
          : undefined) ??
        (title ? forms.find((f) => f.title === title) : undefined);
      if (!form || localeOf(form) === wanted) return form;
      // WPML shows the translation of the form in the page's language.
      const group = groupOf.get(form.id) ?? [];
      return (
        forms.find((f) => f.id !== form.id && group.includes(f.id) && localeOf(f) === wanted) ??
        form
      );
    },
    convert(form) {
      let done = converted.get(form.id);
      if (!done) {
        done = convertCf7(form, siteTitle);
        converted.set(form.id, done);
      }
      return done;
    },
    used: () => converted.size,
    notes: () =>
      new Map(
        forms
          .filter((f) => converted.get(f.id)?.warnings.length)
          .map((f) => [f.title, converted.get(f.id)!.warnings]),
      ),
  };
}

/** Every item of a menu, children included. */
function walkMenu(items: TransferMenuItem[], visit: (item: TransferMenuItem) => void): void {
  for (const item of items) {
    visit(item);
    walkMenu(item.children ?? [], visit);
  }
}

/** The translation of an entry in a language, when it has one. */
function translationIn(
  entries: NonNullable<TransferDocumentInput['entries']>,
  entry: TransferEntryInput,
  locale: string,
): TransferEntryInput | undefined {
  if (!entry.translationRef) return undefined;
  return entries.find((e) => e.translationRef === entry.translationRef && e.locale === locale);
}

/** What the language detection reads of an item. */
function itemFacts(item: Node): ItemFacts {
  const meta: Record<string, string> = {};
  for (const row of (item['wp:postmeta'] as Node[] | undefined) ?? []) {
    const key = text(row['wp:meta_key']);
    if (META_KEYS.has(key) && !(key in meta)) meta[key] = text(row['wp:meta_value']);
  }
  return {
    id: Number(text(item['wp:post_id'])) || 0,
    type: text(item['wp:post_type']),
    link: text(item.link),
    meta,
    categories: ((item.category as Node[] | undefined) ?? []).map((c) => ({
      domain: String(c['@_domain'] ?? ''),
      nicename: String(c['@_nicename'] ?? ''),
    })),
  };
}

/**
 * The site's language for each WordPress language of the export: the same
 * code or base language, and the export's main language for the content
 * language chosen when the site has no better match. One site language per
 * WordPress language; null for languages the site does not have.
 */
function siteLanguages(
  detection: LanguageDetection,
  locale: string,
  candidates: string[],
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const taken = new Set<string>();
  for (const { code } of detection.found) {
    const match = matchLocale(code, candidates);
    if (match && !taken.has(match)) {
      out.set(code, match);
      taken.add(match);
    } else {
      out.set(code, null);
    }
  }
  const main = detection.main;
  if (main && out.get(main) === null && !taken.has(locale)) out.set(main, locale);
  return out;
}

/**
 * Entries whose language the export says go into it (the site's), as
 * translations of each other when grouped; those in a language the site
 * does not have are left out. Returns the refs decided and left out.
 */
function applyLanguages(
  entries: NonNullable<TransferDocumentInput['entries']>,
  detection: LanguageDetection,
  languages: Map<string, string | null>,
  warnings: string[],
): { kept: Set<string>; dropped: Map<string, string> } {
  const kept = new Set<string>();
  const dropped = new Map<string, string>();
  if (!detection.source) return { kept, dropped };
  const idOf = (ref: string) => (ref.startsWith('post:') ? Number(ref.slice(5)) : NaN);
  let w = 0;
  for (const entry of entries) {
    const code = detection.languages.get(idOf(entry.ref));
    if (code) {
      const target = languages.get(code);
      if (!target) {
        dropped.set(entry.ref, code);
        continue;
      }
      entry.locale = target;
      kept.add(entry.ref);
    }
    entries[w++] = entry;
  }
  entries.length = w;
  const byRef = new Map(entries.map((e) => [e.ref, e]));
  const prefix = detection.source === 'polylang' ? 'pll' : 'wpml';
  let groups = 0;
  for (const [key, ids] of detection.groups) {
    const members = ids
      .map((id) => byRef.get(`post:${id}`))
      .filter((e): e is TransferEntryInput => Boolean(e && kept.has(e.ref)));
    const perLocale = new Map<string, TransferEntryInput>();
    for (const member of members)
      if (!perLocale.has(member.locale)) perLocale.set(member.locale, member);
    if (perLocale.size < 2) continue;
    groups++;
    const main = detection.main ? perLocale.get(languages.get(detection.main) ?? '') : undefined;
    const mainLink = main?.oldPaths?.[0];
    for (const member of perLocale.values()) {
      member.translationRef = `${prefix}:${key}`;
      // Translations exported with the main page's address keep none of their own.
      if (member !== main && mainLink && member.oldPaths?.[0] === mainLink) delete member.oldPaths;
    }
  }
  const counts = new Map<string, number>();
  for (const ref of kept) {
    const lang = byRef.get(ref)!.locale;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const from =
    detection.source === 'polylang'
      ? 'Polylang'
      : detection.source === 'wpml'
        ? 'WPML'
        : 'their addresses (/en/…)';
  if (kept.size > 0) {
    warnings.push(
      `Languages from ${from}: ${[...counts].map(([l, n]) => `${n} in ${l}`).join(', ')}; ${groups} group(s) of translations linked.`,
    );
  }
  const left = new Map<string, number>();
  for (const code of dropped.values()) left.set(code, (left.get(code) ?? 0) + 1);
  for (const [code, n] of left) {
    warnings.push(
      `${n} page(s) or post(s) in "${code}" were not imported: the site has no such language. Add it with the Multilingual plugin and import the same file again (what was imported is kept).`,
    );
  }
  return { kept, dropped };
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
  decided: Set<string> = new Set(),
): number {
  const candidates = [...new Set([main, ...locales])];
  if (candidates.length < 2) return 0;
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    // Entries whose language the export says (WPML, Polylang, addresses).
    if (decided.has(entry.ref)) continue;
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
  /** Entries, terms, taxonomies and types by their WordPress names (template conditions). */
  conditionLookups: Omit<ConditionContext, 'note'>;
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
  defaults: ElementorDefaults = 'auto',
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
        classes: globalClasses(kits[0], items),
        variables: metaValue(meta(kits[0], '_elementor_global_variables')),
      },
      { note, font },
    );
    // The theme's heading fonts (global styles, additional CSS), for headings without their own.
    const theme = items
      .filter((item) => typeOf(item) === 'wp_global_styles')
      .flatMap((item) => (item.category as Node[] | undefined) ?? [])
      .find((c) => c['@_domain'] === 'wp_theme')?.['@_nicename'];
    const css = items
      .filter((item) => typeOf(item) === 'custom_css' && text(item['wp:status']) === 'publish')
      .sort(
        (a, b) =>
          Number(text(b.title) === theme) - Number(text(a.title) === theme) ||
          text(b['wp:post_modified_gmt']).localeCompare(text(a['wp:post_modified_gmt'])),
      )[0];
    const styles = items.find(
      (item) => typeOf(item) === 'wp_global_styles' && text(item['wp:status']) === 'publish',
    );
    let globalStyles: unknown;
    try {
      globalStyles = styles ? JSON.parse(text(styles['content:encoded'])) : null;
    } catch {
      globalStyles = null;
    }
    kit.kit = withHeadingFonts(
      kit.kit,
      themeHeadingFonts(css ? text(css['content:encoded']) : '', globalStyles),
      font,
    );
  }

  // Images as WordPress made them (Elementor's image sizes): dimensions and sizes by attachment.
  const attachments = new Map<number, Node>(
    items.filter((item) => typeOf(item) === 'attachment').map((item) => [idOf(item), item]),
  );
  const imageInfo = (attachment: number): ElementorImageInfo | undefined => {
    const item = attachments.get(attachment);
    const data = item ? asSettings(metaValue(meta(item, '_wp_attachment_metadata'))) : {};
    const width = num(data.width);
    const height = num(data.height);
    if (!width || !height) return undefined;
    const sizes: Record<string, { width: number; height: number }> = {};
    for (const [name, value] of Object.entries(asSettings(data.sizes))) {
      const w = num(asSettings(value).width);
      const h = num(asSettings(value).height);
      if (w && h) sizes[name] = { width: w, height: h };
    }
    return { width, height, sizes };
  };
  // A theme's custom shape divider: an SVG of the media library with its name, when there is one.
  const svgs = new Map<string, number>();
  for (const [id, item] of attachments) {
    const file = text(item['wp:attachment_url']).split('/').pop()?.toLowerCase() ?? '';
    if (file.endsWith('.svg')) svgs.set(file.slice(0, -4), id);
  }
  const shapeFile = (name: string, negative: boolean) => {
    const base = name.toLowerCase();
    for (const candidate of [base, base.replace(/-shape(?=-|$)/, '')]) {
      const id = svgs.get(negative ? `${candidate}-negative` : candidate);
      const ref = id !== undefined ? attachmentRefs.get(id) : undefined;
      if (ref) return { id: ref, url: text(attachments.get(id!)!['wp:attachment_url']) };
    }
    return undefined;
  };

  // Elementor 4 components: what their instances may override (pages need it), then themselves.
  const componentPosts = items.filter(
    (item) => typeOf(item) === 'elementor_component' && text(item['wp:status']) !== 'trash',
  );
  const components = new Map<string, ComponentInfo>(
    componentPosts.map((item) => [
      String(idOf(item)),
      componentInfo(metaValue(meta(item, '_elementor_component_overridable_props'))),
    ]),
  );

  // Hello (the theme made for Elementor): pages had the whole width.
  const hello = items.some(
    (item) =>
      (typeOf(item) === 'custom_css' && /^hello-/.test(text(item.title))) ||
      ((item.category as Node[] | undefined) ?? []).some(
        (c) => c['@_domain'] === 'wp_theme' && /^hello-/.test(String(c['@_nicename'] ?? '')),
      ),
  );

  // Elementor's default colors and fonts, or the theme's (Elementor → Settings, not in the export).
  if (kit) {
    const settings = asSettings(metaValue(meta(kits[0]!, '_elementor_page_settings')));
    const fromTheme = themeDefaults(settings, defaults, hello);
    kit.kit.themeColors = fromTheme;
    kit.kit.themeFonts = fromTheme;
    if (fromTheme) {
      kit.info.themeColors = true;
      kit.info.themeFonts = true;
      warnings.push(
        defaults === 'theme'
          ? "Elementor's default colors and fonts were off, as chosen: widgets without their own take the theme's. The kit's global colors and fonts are kept in Fresco's site settings, not applied by default (Theme's colors / fonts by default)."
          : "Elementor's kit still has Elementor's own colors, so its default colors and fonts were taken to be off (Elementor → Settings → Disable Default Colors and Fonts): widgets without their own take the theme's, and the kit's global colors and fonts are kept in Fresco's site settings, not applied by default. If the widgets used the kit's, import again with “Colors and fonts of Elementor widgets: Elementor’s kit”, or turn off Theme's colors / fonts by default in Fresco's site settings.",
      );
    }
  }

  const origin = text(channel['wp:base_blog_url']) || text(channel.link);
  const context = (warn: (message: string) => void): ElementorContext => ({
    mediaRef,
    warn,
    ...(origin ? { origin } : {}),
    entryRef,
    term,
    typeSlug: (type: string) => ownType(type),
    menuLocation,
    font,
    imageInfo,
    shapeFile,
    ...forms,
    ...(kit ? { kit: kit.info } : {}),
    ...(components.size ? { components } : {}),
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
    const converted = componentPosts
      .map((item) =>
        convertComponent(
          {
            id: idOf(item),
            title: decode(text(item.title)),
            data: meta(item, '_elementor_data') ?? '[]',
            props: metaValue(meta(item, '_elementor_component_overridable_props')),
          },
          context((message) =>
            warnings.push(`Component "${decode(text(item.title))}": ${message}`),
          ),
        ),
      )
      .filter((c) => c !== null);
    if (kit || families.size || converted.length) {
      out.fresco = {
        kit: { ...(kit?.kit ?? {}), googleFonts: [...families].slice(0, 30) },
        ...(converted.length ? { components: converted } : {}),
      };
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

  return {
    hello,
    context,
    menuLocations,
    templates,
    plugins,
    conditionLookups: { entryRef, term, taxonomySlug, typeSlug: (type) => ownType(type) },
  };
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Elementor 4's global classes: kept in the kit (`_elementor_global_classes`),
 * or, since 4.x, one post each (`e_global_class`) with the order in the kit.
 */
function globalClasses(kit: Node, items: Node[]): unknown {
  const legacy = asSettings(metaValue(meta(kit, '_elementor_global_classes')));
  const all: Record<string, unknown> = { ...asSettings(legacy.items) };
  for (const item of items) {
    if (text(item['wp:post_type']) !== 'e_global_class' || text(item['wp:status']) === 'trash')
      continue;
    const data = asSettings(metaValue(meta(item, '_elementor_global_class_data')));
    const id = meta(item, '_elementor_global_class_id') || str(data.id);
    if (id) all[id] = { label: decode(text(item.title)), ...data };
  }
  const order = asSettings(metaValue(meta(kit, '_elementor_global_classes_order'))).order;
  return {
    items: all,
    order: Array.isArray(order) ? order : Array.isArray(legacy.order) ? legacy.order : [],
  };
}
