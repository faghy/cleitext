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
}

export interface AdminPageDefinition {
  /** Address under `/admin/ext/<slug>/`, e.g. `rsvps` (empty for the plugin's main page). */
  path: string;
  title: Label;
  /** Shown in the sidebar (default `true`). */
  menu?: boolean;
  /** Required capability; pages are hidden from users without it. */
  capability?: string;
  component: ComponentType<AdminPageProps>;
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
}

export interface EditorPanelProps extends AdminPageProps {
  entry: EditorEntry;
  /** Opens an admin address, e.g. `/entries/<id>`, without reloading the page. */
  navigate: (to: string) => void;
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
