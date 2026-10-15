import type { FieldDefinition } from '@cleitext/shared';
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

export interface PublicEntrySummary {
  id: string;
  type: string;
  locale: string;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
  author: { displayName: string } | null;
  image: RenderMedia | null;
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
      term?: { taxonomy: string; name: string; description: string | null };
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
   * Areas made of blocks (RF-THM-04), e.g. `{ footer: 'Footer' }`, edited in
   * Appearance → Areas and rendered with `<BlockArea name="footer" />`.
   */
  areas?: Record<string, string>;
  /** CSS for the block editor's canvas, so that content looks like the site. */
  editorCss?: string;
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
}

/** Everything a template can read through `usePage()`. */
export interface PageContext {
  site: SiteInfo;
  locale: string;
  locales: LocaleLink[];
  menus: Record<string, MenuItemView[]>;
  /** URL helpers bound to the current language. */
  urls: { home: string; search: string };
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
  /**
   * The page is shown inside a visual editor: `EntryContent` renders an
   * empty `[data-cx-editor-canvas]` element that the editor fills.
   */
  editorFrame?: boolean;
}
