import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import type { Label } from '@cleitext/shared';
import type { HeadData, PublicEntry, ThemeLocation } from '@cleitext/theme-sdk';

/**
 * Hook catalog (docs/SPECIFICATIONS.md §8). Plugins add their own hooks with
 * declaration merging:
 *
 * ```ts
 * declare module '@cleitext/plugin-sdk' {
 *   interface Actions { 'events.rsvp': { eventId: string; email: string } }
 * }
 * ```
 */

/** An entry as hooks see it. */
export interface EntryEvent {
  id: string;
  siteId: string;
  type: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  fields: Record<string, unknown>;
  /** Ids of its terms by taxonomy slug, when known (plugin API 1.13). */
  terms?: Record<string, string[]>;
  /** Its featured image, when known (plugin API 1.13). */
  featuredMediaId?: string | null;
}

/** A taxonomy term as hooks see it. */
export interface TermEvent {
  id: string;
  siteId: string;
  taxonomy: string;
  locale: string;
  slug: string;
  name: string;
}

/** Actions (events): payload by name. Handlers run after the change is saved. */
export interface Actions {
  'entry.created': { entry: EntryEvent };
  'entry.saved': { entry: EntryEvent };
  'entry.published': { entry: EntryEvent };
  'entry.unpublished': { entry: EntryEvent };
  'entry.trashed': { entry: EntryEvent };
  'entry.deleted': { entry: EntryEvent };
  'term.created': { term: TermEvent };
  'term.deleted': { term: TermEvent };
  /** Languages and translations were imported for the site: see `ctx.languages.pending`. */
  'languages.pending': Record<string, never>;
  'media.uploaded': { media: { id: string; mime: string; filename: string; url: string } };
  'plugin.activated': { plugin: string };
  'plugin.deactivated': { plugin: string };
  /**
   * Pages of the site showing any of these tags changed (plugin API 1.9),
   * e.g. to purge them from a cache in front of Cleitext (Varnish, a CDN).
   * Emitted once per change, by the process that made it; `site` means
   * every page of the site.
   */
  'cache.invalidated': { tags: string[] };
  /** Someone created an account on the site (plugin API 1.12). */
  'user.registered': { user: { id: string; email: string; displayName: string } };
  /** A comment was posted, whatever its status (plugin API 1.12). */
  'comment.created': { comment: CommentEvent };
  /** A comment changed status: approved, spam, trash… (plugin API 1.12). */
  'comment.status': { comment: CommentEvent; from: string };
}

export interface CommentEvent {
  id: string;
  entryId: string;
  parentId: string | null;
  type: string;
  status: 'pending' | 'approved' | 'spam' | 'trash';
  userId: string | null;
  authorName: string;
  authorEmail: string;
  content: string;
}

/** Context of the `cache.headers` filter: a public response going into the page cache. */
export interface CacheHeadersContext {
  siteId: string;
  /** Host name of the request, without the port. */
  host: string;
  path: string;
  status: number;
  /** Its page-cache tags, e.g. `site`, `entry:<id>`, `type:article`. */
  tags: string[];
}

/** Context of the public-rendering filters. */
export interface RenderHookContext {
  siteId: string;
  locale: string;
  route: 'entry' | 'archive' | 'search' | '404' | 'maintenance';
  path: string;
  /** Set on single entries. */
  entry?: PublicEntry;
  /** Adds a page-cache tag, so the page refreshes when that data changes. */
  tag(tag: string): void;
  /** The page is shown inside a visual editor (`PageContext.editorFrame`). */
  editorFrame?: boolean;
  /** Entries: the entry is the site's home page. */
  isFrontPage?: boolean;
  /** Archives: the term (taxonomy and slug) or the content type listed; `home` for the latest posts on the home page. */
  archive?: { taxonomy?: string; term?: string; type?: string; home?: boolean };
}

/** Filters (transformations): `[value, context]` by name. */
export interface Filters {
  /** Title, meta tags and extra `<head>` tags of a public page (needs `theme:hooks`). */
  'render.head': [head: HeadData, context: RenderHookContext];
  /** Blocks of an entry before rendering, e.g. to add a details box (needs `theme:hooks`). */
  'render.blocks': [blocks: CxdBlock[], context: RenderHookContext & { entry: PublicEntry }];
  /**
   * Content for the theme's locations (header, footer, single, archive),
   * replacing what the theme shows there, e.g. templates of a theme builder
   * (needs `theme:hooks`). Themes mark them with `<Location>`.
   */
  'render.locations': [
    locations: Partial<Record<ThemeLocation, CxdDocument>>,
    context: RenderHookContext,
  ];
  /** Final HTML of a public page; use sparingly (needs `theme:hooks`). */
  'render.html': [html: string, context: RenderHookContext];
  /** Template names tried in order, e.g. `entry-event` (needs `theme:hooks`). */
  'theme.templateCandidates': [candidates: string[], context: RenderHookContext];
  /**
   * Site title and tagline in a language other than the default one, e.g.
   * translated by the language plugin (needs `languages`). Never called for
   * the default language.
   */
  'site.strings': [
    strings: { title: string; tagline: string },
    context: { siteId: string; locale: string },
  ];
  /**
   * What entries are for, shown next to their title in the admin, e.g. a
   * plugin's own pages: `states[id].push({ key: 'privacy', label: { en: 'Privacy policy' } })`.
   * The core already marks the front, posts and 404 pages. No permission needed.
   */
  'entry.states': [
    states: Record<string, { key: string; label: Label }[]>,
    context: { siteId: string; ids: string[] },
  ];
  /**
   * Extra headers of public responses that the page cache keeps (plugin API
   * 1.9, needs `theme:hooks`), e.g. for a cache in front of Cleitext: a
   * `Cache-Control` with `s-maxage`, `CDN-Cache-Control`, the tags of the
   * page. Signed-in visitors never get them: their pages are not cached.
   */
  'cache.headers': [headers: Record<string, string>, context: CacheHeadersContext];
  /** Content types and taxonomies that get an XML sitemap (all by default). */
  'sitemap.sources': [sources: SitemapSource[], context: { siteId: string }];
  /** The addresses of one XML sitemap: remove pages kept out of search, add images… */
  'sitemap.urls': [
    urls: SitemapUrl[],
    context: { siteId: string; kind: SitemapSource['kind']; slug: string; locale: string },
  ];
}

/** What can have an XML sitemap: a content type or a taxonomy. */
export interface SitemapSource {
  kind: 'type' | 'taxonomy';
  slug: string;
}

/** An address of an XML sitemap, as the `sitemap.urls` filter sees it. */
export interface SitemapUrl {
  /** Absolute address. */
  loc: string;
  /** ISO date of the last change, or null. */
  lastmod: string | null;
  /** Absolute addresses of the images of the page. */
  images: string[];
  /** The same page in other languages (hreflang). */
  alternates: { hreflang: string; href: string }[];
  /** The entry, for content type sitemaps. */
  entry?: { id: string; type: string; fields: Record<string, unknown> };
  /** The term, for taxonomy sitemaps. */
  term?: { id: string; taxonomy: string };
}

/** Context of action handlers. */
export interface HookContext {
  siteId: string;
  /** The user whose change emitted the action, when there is one. */
  userId?: string;
}

export interface HookOptions {
  /** Lower runs first. Default 10, as in WordPress. */
  priority?: number;
}

export type ActionHandler<K extends keyof Actions> = (
  payload: Actions[K],
  context: HookContext,
) => void | Promise<void>;

export type FilterHandler<K extends keyof Filters> = (
  value: Filters[K][0],
  context: Filters[K][1],
) => Filters[K][0] | Promise<Filters[K][0]>;

/**
 * Hook bus as seen by a plugin. Handlers only run on sites where the plugin
 * is active. An error in a handler is logged and does not stop the others.
 */
export interface HookApi {
  on<K extends keyof Actions>(name: K, handler: ActionHandler<K>, options?: HookOptions): void;
  filter<K extends keyof Filters>(name: K, handler: FilterHandler<K>, options?: HookOptions): void;
  /** Emits an action declared by this plugin (its name must start with `<slug>.`). */
  emit<K extends keyof Actions>(name: K, payload: Actions[K], context: HookContext): Promise<void>;
}
