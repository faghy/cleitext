import type { FieldDefinition, Label } from '@cleitext/shared';
import type { CxdDocument } from '@cleitext/blocks';
import type { BlockRenderer, RenderMedia } from '@cleitext/renderer';
import type { ComponentType, ReactNode } from 'react';

/**
 * Theme contract (docs/ARCHITECTURE.md §12). Templates are React components
 * rendered on the server only; they receive everything as props and never
 * query the database.
 */

export interface SiteInfo {
  id: string;
  title: string;
  tagline: string;
  /** Absolute origin of the site, e.g. https://example.com */
  origin: string;
  /** IANA time zone and date style chosen in the settings. */
  timezone: string;
  dateStyle: 'long' | 'medium' | 'short';
}

export interface LocaleLink {
  code: string;
  name: string;
  /** URL of the current page in this language (or its home). */
  url: string;
  current: boolean;
}

export interface MenuItemView {
  id: string;
  label: string;
  url: string;
  target?: '_blank';
  /** The item points to the current page or one of its ancestors. */
  current: boolean;
  children: MenuItemView[];
}

export interface TermLink {
  name: string;
  slug: string;
  url: string;
}

/** The author of an entry, with the address of their author page. */
export interface EntryAuthor {
  displayName: string;
  /** Author archive (`/author/<slug>`), when the person has one. */
  url?: string;
  bio?: string;
  website?: string | null;
  /** A picture (Gravatar), or null to show the initials. */
  avatarUrl?: string | null;
}

/** The comments of an entry and how visitors can add theirs (RF-COM). */
export interface EntryComments {
  /** Visitors may comment now. */
  open: boolean;
  /** Approved comments. */
  count: number;
  /** Top-level comments of this page, with their replies. */
  items: PublicComment[];
  page: number;
  pages: number;
  /** Only signed-in people can comment. */
  registrationRequired: boolean;
  requireNameEmail: boolean;
  threadDepth: number;
  /** Address the comment form posts to. */
  action: string;
  /** After posting: `pending` (waiting for approval), `posted`, or an error to show. */
  notice?: { kind: 'pending' | 'posted' | 'error'; text?: string };
  /** The comment being answered (`?replyto=<id>`), for forms without JavaScript. */
  replyTo?: { id: string; authorName: string };
}

export interface PublicComment {
  id: string;
  parentId: string | null;
  authorName: string;
  authorUrl: string | null;
  avatar: { initials: string; url: string | null };
  /** Plain text: themes show it with `CommentText` (paragraphs and links). */
  content: string;
  createdAt: string;
  /** Visible only to its author while it waits for approval. */
  pending: boolean;
  byPostAuthor: boolean;
  replies: PublicComment[];
}

/** The signed-in visitor (null on pages served from the cache: visitors there are anonymous). */
export interface Viewer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  capabilities: readonly string[];
}

export interface PublicEntrySummary {
  id: string;
  type: string;
  locale: string;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
  author: EntryAuthor | null;
  image: RenderMedia | null;
  /** Categories, tags… by taxonomy, for themes with `listTerms`. */
  terms?: Record<string, TermLink[]>;
  /** Search results: a fragment of the text with the matching words marked (RF-THM-10). */
  highlight?: { text: string; match: boolean }[];
}

export interface PublicEntry extends PublicEntrySummary {
  slug: string;
  document: CxdDocument;
  terms: Record<string, TermLink[]>;
  /** The same content in other languages. */
  translations: { locale: string; url: string; title: string }[];
  /** Custom field values (content type fields and plugin field groups). */
  fields: Record<string, unknown>;
  /** Featured image chosen by the author, if any (RF-CNT-12). */
  featuredImage: RenderMedia | null;
  /**
   * Entries of the same type sharing its categories (then its tags), newest
   * first: only for themes that ask for them (`relatedEntries`).
   */
  related?: PublicEntrySummary[];
  /** The previous and next entries of the same type, by date (themes with `adjacentEntries`). */
  adjacent?: { prev?: PublicEntrySummary; next?: PublicEntrySummary };
  /** Comments, for types that have them. */
  comments?: EntryComments;
  /** Likes, when the site has them on. */
  likes?: { count: number; liked: boolean; action: string; usersOnly: boolean };
}

export interface Pagination {
  page: number;
  totalPages: number;
  prevUrl: string | null;
  nextUrl: string | null;
}

export type TemplateProps =
  | { kind: 'entry'; entry: PublicEntry; isFrontPage: boolean }
  | {
      kind: 'archive';
      title: string;
      description?: string;
      /** Set for category/tag archives. */
      term?: { taxonomy: string; slug: string; name: string; description: string | null };
      /** Set for the archive of a content type (e.g. the posts). */
      contentType?: string;
      /** Set for an author's archive (`/author/<slug>`). */
      author?: EntryAuthor & { slug: string; website?: string | null };
      entries: PublicEntrySummary[];
      pagination: Pagination;
      isHome: boolean;
    }
  | { kind: 'search'; query: string; entries: PublicEntrySummary[]; pagination: Pagination }
  | { kind: '404' }
  | { kind: 'maintenance' };

export type TemplateComponent = ComponentType<TemplateProps>;

export interface HeadData {
  title: string;
  description: string;
  canonical: string | null;
  /** hreflang alternates (including x-default). */
  alternates: { hreflang: string; href: string }[];
  /** Open Graph / social metadata. */
  og: Record<string, string>;
  robots?: string;
  /** Extra tags added by plugins (`render.head` filter). Layouts render them with `<HeadTags>`. */
  tags?: HeadTag[];
}

export type HeadTag =
  | { tag: 'meta'; attrs: Record<string, string> }
  | { tag: 'link'; attrs: Record<string, string> }
  /** Structured data, serialized safely. */
  | { tag: 'json-ld'; data: unknown };

export interface LayoutProps {
  head: HeadData;
  /** CSS inlined in the page (theme stylesheet). */
  css: string;
  children: ReactNode;
}

/** A tab of a theme's options panel. */
export interface ThemeSettingsSection {
  id: string;
  label: Label;
  description?: Label;
  /** A simple icon name (e.g. `palette`, `layout`, `header`) shown before the label. */
  icon?: string;
  /**
   * The section this one belongs to (the settings of a header element under
   * the header): listed under it, only while it or a sibling is open.
   */
  parent?: string;
  /** Tabs of the section (e.g. General and Design); a field goes in one with `tab`. */
  tabs?: { id: string; label: Label }[];
}

export interface ThemeDefinition {
  slug: string;
  name: string;
  version: string;
  description?: string;
  /** Menu locations offered by the theme: key → label. */
  menuLocations: Record<string, string>;
  /**
   * Settings shown in Appearance → Customize (RF-THM-03): logo, colors,
   * texts… Values reach templates through `useThemeSettings()`.
   */
  settings?: FieldDefinition[];
  /**
   * The tabs of the theme's options, in order: fields name theirs in
   * `section`. Without sections, the settings are one list.
   */
  settingsSections?: ThemeSettingsSection[];
  /**
   * Ready-made sets of settings (skins): applied from the options panel,
   * over the current values.
   */
  presets?: { id: string; label: Label; values: Record<string, unknown> }[];
  /**
   * Options of each page or post (layout, sidebar, header…), shown in the
   * editor's sidebar for these content types and stored in the document's
   * `editor.data`, where templates read them.
   */
  entryFields?: { types?: string[]; fields: FieldDefinition[] };
  /**
   * How many related entries the theme may show under an entry (at most 12):
   * Cleitext gives them in `entry.related`. Without it, none are looked up.
   */
  relatedEntries?: number;
  /**
   * Turns settings exported from another system (a file the site owner
   * imports in Customize) into this theme's setting values, or null when the
   * file is not one it knows.
   */
  importSettings?(data: unknown): Record<string, unknown> | null;
  /** Give the categories and tags of the entries in lists (`entries[].terms`). */
  listTerms?: boolean;
  /** Give the previous and next entries of posts (`entry.adjacent`), for "Previous / Next" links. */
  adjacentEntries?: boolean;
  /**
   * Areas made of blocks (RF-THM-04), e.g. `{ footer: 'Footer' }`, edited in
   * Appearance → Areas and rendered with `<BlockArea name="footer" />`.
   */
  areas?: Record<string, string>;
  /**
   * What an area shows until it is edited (e.g. a shop plugin's cart block in
   * a header area): blocks of any installed plugin, loaded like the others.
   */
  areaDefaults?: Record<string, CxdDocument>;
  /**
   * CSS for the block editor's canvas, so that content looks like the site;
   * a function gets the settings' values (the chosen colors and fonts).
   */
  editorCss?: string | ((settings: Record<string, unknown>) => string);
  /**
   * How to build pages with this theme, for AI assistants connected through
   * MCP (Markdown): its sections, classes and when to use them.
   */
  aiGuide?: string;
  /** Template components by name; `index` is required. */
  templates: { index: TemplateComponent } & Partial<Record<string, TemplateComponent>>;
  Layout: ComponentType<LayoutProps>;
  /** Stylesheet inlined in every page. Keep it small. */
  css: string;
  /**
   * `manual`: the theme places `<EntryCommunity />` (or `<Comments />`)
   * itself; otherwise `EntryContent` adds them after the entry.
   */
  comments?: 'auto' | 'manual';
}

/** Everything a template can read through `usePage()`. */
/**
 * Parts of a page a theme builder can replace: the header, the footer, the
 * content of single entries, and the content of archives and search results.
 * `overlay` (popups, off-canvas panels) is added by Cleitext at the end of
 * the page, whatever the theme.
 */
export type ThemeLocation = 'header' | 'footer' | 'single' | 'archive' | 'overlay';

export interface PageContext {
  site: SiteInfo;
  locale: string;
  locales: LocaleLink[];
  menus: Record<string, MenuItemView[]>;
  /** URL helpers bound to the current language. */
  urls: {
    home: string;
    search: string;
    /** Sign in, sign up and the visitor's account (RF-USR-11). */
    login?: string;
    register?: string;
    account?: string;
    logout?: string;
  };
  /** The signed-in visitor, if any. */
  viewer?: Viewer | null;
  /** The entry being shown, on entry pages. */
  entry?: PublicEntry;
  /**
   * What the page shows: the template's props (entry, archive, search, 404),
   * for layouts that change with it (body classes, sidebars).
   */
  view?: TemplateProps;
  /** Sharing links under entries (Settings → Discussion). */
  share?: boolean;
  /** `EntryContent` adds likes, sharing and comments after the entry (themes without `comments: 'manual'`). */
  autoCommunity?: boolean;
  /** Media preloaded for the page, by id. */
  media: ReadonlyMap<string, RenderMedia>;
  /** Renderers of plugin blocks available on this site. */
  blockRenderers?: ReadonlyMap<string, BlockRenderer>;
  /** Values of the theme settings, defaults included. */
  themeSettings?: Readonly<Record<string, unknown>>;
  /** Block areas in the page's language, by name. */
  areas?: Readonly<Record<string, CxdDocument>>;
  /** Synced patterns used by the page (RF-EDT-07), by id. */
  patterns?: ReadonlyMap<string, CxdDocument>;
  /** Content of the theme's locations given by plugins (theme builders). */
  locations?: Partial<Record<ThemeLocation, CxdDocument>>;
  /**
   * The page is shown inside a visual editor: `EntryContent` renders an
   * empty `[data-cx-editor-canvas]` element that the editor fills.
   */
  editorFrame?: boolean;
}
