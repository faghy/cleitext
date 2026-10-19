import type { CxdDocument } from '@cleitext/blocks';
import type { Label } from '@cleitext/shared';
import type { ComponentType } from 'react';
import type { Method } from './api.js';

/** What a plugin admin page receives. */
export interface AdminPageProps {
  plugin: { slug: string; version: string };
  site: {
    id: string;
    name: string;
    defaultLocale: string;
    locales: { code: string; name: string }[];
  };
  user: { id: string; displayName: string; locale: string; capabilities: string[] };
  /** Calls the plugin's endpoints (`/api/v1/ext/<slug>…`), with session and CSRF handled. */
  api: <T>(method: Method, path: string, body?: unknown) => Promise<T>;
  /**
   * The editors of the site (API 1.26; absent on older sites): the block
   * editor first, then those of the active plugins the user may use, for a
   * content type when given. Their converters let a plugin move content
   * from one editor to another.
   */
  editors?: (type?: string) => SiteEditor[];
}

/**
 * An editor of the site, as plugins see it (API 1.26): the block editor
 * (`id: 'blocks'`, `plugin: null`) or an editor added by a plugin.
 */
export interface SiteEditor {
  /**
   * `document.editor.id` of the documents it makes; `blocks` for the block
   * editor, whose documents have no `editor` (or `editor.id: 'blocks'`).
   */
  id: string;
  title: Label;
  /** Slug of the plugin that adds it; null for the block editor. */
  plugin: string | null;
  /** Content types it can edit (all when omitted). */
  types?: string[];
  /** Block editor content as this editor's (the block editor returns it as it is). */
  fromBlocks?: (document: CxdDocument) => CxdDocument;
  /** This editor's content as block editor content (the block editor returns it as it is). */
  toBlocks?: (document: CxdDocument) => CxdDocument;
}

export interface AdminPageDefinition {
  /** Address under `/cl-admin/ext/<slug>/`, e.g. `rsvps` (empty for the plugin's main page). */
  path: string;
  title: Label;
  /** Shown in the sidebar (default `true`). */
  menu?: boolean;
  /**
   * Shown as a submenu item (API 1.25): under another page of the plugin
   * (its `path`, e.g. `''` for the main page), or under a section of the
   * admin (`/appearance`, `/settings`, `/users`, `/posts`, `/pages`, `/media`,
   * `/plugins`, and `/tools` from API 1.26). As in WordPress, submenus open
   * on hover beside the sidebar.
   */
  parent?: string;
  /**
   * What the page is for, in a sentence (API 1.26): shown on its card in
   * Tools when `parent` is `/tools`.
   */
  description?: Label;
  /**
   * A top-level entry right after an admin section instead of at the end of
   * the sidebar (API 1.25), e.g. `'/appearance'` for a theme's own menu.
   */
  after?: string;
  /**
   * Sidebar icon: SVG path data on a 24×24 grid, drawn as an outline
   * (stroke 1.75, round ends, no fill), e.g. `'M4 6h16v12H4z M4 7l8 6 8-6'`.
   * Without it, or when it is not path data, a puzzle piece.
   */
  icon?: string;
  /** Required capability; pages are hidden from users without it. */
  capability?: string;
  /**
   * A menu entry that opens an admin address instead of a page of the
   * plugin (API 1.25), e.g. `'/appearance?tab=customize'`; `component` is
   * then not needed.
   */
  link?: string;
  component?: ComponentType<AdminPageProps>;
}

/**
 * Admin entry of a plugin (docs/SPECIFICATIONS.md §7.5), the default export
 * of the module named `admin` in `cleitext.plugin.json`.
 */
/** A box on the Dashboard (RF-ADM-02). */
export interface DashboardWidgetDefinition {
  id: string;
  title: Label;
  capability?: string;
  component: ComponentType<AdminPageProps>;
}

/** The entry open in the editor, as panels see it. */
export interface EditorEntry {
  id: string;
  type: string;
  locale: string;
  title: string;
  slug: string;
  status: string;
  /** Changes on every save: use it in query keys to refresh after saving. */
  updatedAt: string;
}

export interface EditorPanelProps extends AdminPageProps {
  entry: EditorEntry;
  /** Opens an admin address, e.g. `/entries/<id>`, without reloading the page. */
  navigate: (to: string) => void;
  /**
   * The entry as it is being edited, before it is saved: the panel renders
   * again a moment after each change (API 1.24; absent on older sites).
   */
  draft?: EditorDraft;
  /**
   * Changes the values of one of the entry's field groups (e.g. the plugin's
   * own), saved with the entry like the fields of the sidebar (API 1.24).
   */
  setFields?: (group: string, values: Record<string, unknown>) => void;
}

/** The unsaved state of an entry, as editor panels see it. */
export interface EditorDraft {
  title: string;
  /** The saved address part (changed in the sidebar, it is saved at once). */
  slug: string;
  excerpt: string | null;
  featuredMediaId: string | null;
  document: CxdDocument;
  /** Custom fields: `{ <group id>: { <name>: value } }` and the type's own fields. */
  fields: Record<string, unknown>;
}

/** A section of the editor sidebar, under the core ones. */
export interface EditorPanelDefinition {
  id: string;
  title: Label;
  /** Content types that show it (all when omitted). */
  types?: string[];
  capability?: string;
  /** Shown only when this returns true, e.g. when the site has several languages. */
  visible?: (props: AdminPageProps) => boolean;
  component: ComponentType<EditorPanelProps>;
}

/** A file of the media library, as editors see it. */
export interface EditorMedia {
  id: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  mime: string;
  /** Small preview, when available. */
  thumbnailUrl?: string;
}

/** What an editor receives (`editors`). */
export interface EditorProps extends AdminPageProps {
  entry: EditorEntry;
  /**
   * The content when the editor opens. After a revision or an autosave is
   * restored, the editor is mounted again with the new content.
   */
  document: CxdDocument;
  /** To be called with the whole document after every change; keep `document.editor`. */
  onChange: (document: CxdDocument) => void;
  /** True when the user may only look (no permission, or someone else is editing). */
  readOnly: boolean;
  /**
   * A signed address (valid for one hour) of the page in the site's own
   * layout, for an iframe: the theme leaves an empty `[data-cx-editor-canvas]`
   * element where the content goes, for the editor to fill.
   */
  frameUrl: () => Promise<string>;
  /** The media library. */
  media: {
    upload: (file: File) => Promise<EditorMedia>;
    list: (query: { kind?: 'image'; search?: string }) => Promise<EditorMedia[]>;
  };
  /** Opens the entry's settings (status, custom fields, revisions…) over the editor. */
  openSettings: () => void;
  navigate: (to: string) => void;
}

/**
 * An editor for entries instead of the block editor, e.g. a page builder.
 * It takes the whole screen under the editor's top bar (title, save,
 * publish). Documents it saves carry `editor: { id }`, so they always open
 * with it.
 */
export interface EditorDefinition {
  /** Stored as `document.editor.id`, e.g. `fresco`. */
  id: string;
  /** Shown in "Edit with …". */
  title: Label;
  /** Content types it can edit (all when omitted). */
  types?: string[];
  capability?: string;
  /**
   * Converts a block editor document when switching to this editor. Without
   * it, the page starts empty (earlier revisions keep the old content).
   */
  fromBlocks?: (document: CxdDocument) => CxdDocument;
  /**
   * Converts back when switching to the block editor. Without it, the page
   * starts empty (earlier revisions keep the old content).
   */
  toBlocks?: (document: CxdDocument) => CxdDocument;
  component: ComponentType<EditorProps>;
}

/** A row of a list, as columns see it. */
export interface ListRow {
  id: string;
  locale: string;
  title: string;
  status?: string;
}

export interface ListCellProps<D = unknown> extends AdminPageProps {
  row: ListRow;
  /** What `load` returned for this row. */
  data: D | undefined;
  navigate: (to: string) => void;
  /** Reloads the column data, e.g. after the cell changed something. */
  refresh: () => void;
}

/**
 * A column of the entries or terms lists. `load` runs once per page of
 * rows, so cells do not each call the server.
 */
export interface ListColumnDefinition<D = unknown> {
  id: string;
  title: Label;
  /** Content types (entries) or taxonomies (terms) that show it (all when omitted). */
  types?: string[];
  capability?: string;
  /** Shown only when this returns true, e.g. when the site has several languages. */
  visible?: (props: AdminPageProps) => boolean;
  load?: (rows: ListRow[], props: AdminPageProps & { type: string }) => Promise<Record<string, D>>;
  cell: ComponentType<ListCellProps<D>>;
}

export interface AdminPluginDefinition {
  pages?: AdminPageDefinition[];
  dashboardWidgets?: DashboardWidgetDefinition[];
  editorPanels?: EditorPanelDefinition[];
  /** Editors for entries instead of the block editor (page builders). */
  editors?: EditorDefinition[];
  /** Columns of the posts, pages and other content type lists. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each column has its own data type
  entryColumns?: ListColumnDefinition<any>[];
  /** Columns of the category, tag and other taxonomy screens. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each column has its own data type
  termColumns?: ListColumnDefinition<any>[];
}

export function defineAdminPlugin(definition: AdminPluginDefinition): AdminPluginDefinition {
  return definition;
}
