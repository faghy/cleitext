import * as adminSdk from '@cleitext/admin-sdk';
import { MENU_ICONS, pluginIcon } from './components/menu-icons';
import type {
  AdminPageDefinition,
  AdminPageProps,
  AdminPluginDefinition,
  EditorDefinition,
  EditorEntry,
  EditorProps,
  ListColumnDefinition,
  ListRow,
} from '@cleitext/admin-sdk';
import { labelText, type ContentTypeView, type PluginAdminInfo } from '@cleitext/shared';
import * as reactQuery from '@tanstack/react-query';
import { queryOptions, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import { useNavigate } from '@tanstack/react-router';
import { api, pluginApi } from './api';
import { useMe } from './auth';

/**
 * Modules shared with plugin admin entries (docs/ARCHITECTURE.md §11.7):
 * `cleitext plugin:build` replaces their imports with these instances, so a
 * plugin uses the admin's React and query client instead of its own copy.
 */
export function exposeSharedModules(): void {
  (globalThis as Record<string, unknown>).__cleitextShared = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react-dom': ReactDOM,
    '@cleitext/admin-sdk': adminSdk,
    '@tanstack/react-query': reactQuery,
  };
}

export interface LoadedAdminPlugin extends PluginAdminInfo {
  definition: AdminPluginDefinition | null;
  /** Set when the admin entry failed to load. */
  error: string | null;
}

/** Admin entries of the plugins active on the site, loaded once per version. */
export const pluginAdminQuery = queryOptions({
  queryKey: ['plugins', 'admin'],
  queryFn: async (): Promise<LoadedAdminPlugin[]> => {
    const infos = await api<PluginAdminInfo[]>('GET', '/plugins/admin');
    return Promise.all(
      infos.map(async (info) => {
        if (!info.adminUrl) return { ...info, definition: null, error: null };
        try {
          const module = (await import(/* @vite-ignore */ info.adminUrl)) as {
            default?: AdminPluginDefinition;
          };
          return { ...info, definition: module.default ?? null, error: null };
        } catch (error) {
          console.error(`Admin entry of ${info.slug} failed to load`, error);
          return { ...info, definition: null, error: String(error) };
        }
      }),
    );
  },
  staleTime: Infinity,
});

export function usePluginAdmin(): LoadedAdminPlugin[] {
  return useQuery(pluginAdminQuery).data ?? [];
}

/** Content types, for lists of plugin types in the sidebar and the editor. */
export const contentTypesQuery = queryOptions({
  queryKey: ['content-types'],
  queryFn: () => api<ContentTypeView[]>('GET', '/content-types'),
  staleTime: 60_000,
});

export interface PluginMenuItem {
  to: string;
  label: string;
  /** SVG path data (components/menu-icons.tsx); none for sub-entries. */
  icon?: string;
  /** The entry it belongs under (a submenu item). */
  parent?: string;
  /** A tab of the screen it opens (menu links). */
  tab?: string;
}

/** Sidebar entries added by plugins: their content types and their pages. */
export function usePluginMenu(): { types: PluginMenuItem[]; pages: PluginMenuItem[] } {
  const me = useMe();
  const canEdit = me.capabilities.includes('edit_entries');
  const types = useQuery({ ...contentTypesQuery, enabled: canEdit });
  const plugins = usePluginAdmin();
  return {
    types: (types.data ?? [])
      // Types of plugins and types made in Content structure.
      .filter(
        (t) =>
          (t.source.startsWith('plugin:') || t.source === 'user') &&
          !t.supports.includes('private'),
      )
      .map((t) => ({
        to: `/content/${t.slug}`,
        label: labelText(t.name, me.user.locale),
        icon: MENU_ICONS.content,
      })),
    pages: plugins.flatMap((plugin) =>
      (plugin.definition?.pages ?? [])
        .filter((page) => page.menu !== false && allowed(page, me.capabilities))
        .map((page) => ({
          ...(page.link ? linkTarget(page.link) : { to: pagePath(plugin.slug, page.path) }),
          label: labelText(page.title, me.user.locale),
          icon: pluginIcon(page.icon),
          ...(page.parent !== undefined
            ? {
                parent: page.parent.startsWith('/')
                  ? page.parent
                  : pagePath(plugin.slug, page.parent),
              }
            : {}),
        })),
    ),
  };
}

/** An admin address of a menu link: its path, and the screen's tab (`?tab=`) when it has one. */
function linkTarget(link: string): { to: string; tab?: string } {
  const [path, query = ''] = link.split('?');
  const tab = new URLSearchParams(query).get('tab');
  return { to: path!.startsWith('/') ? path! : `/${path}`, ...(tab ? { tab } : {}) };
}

export function pagePath(slug: string, path: string): string {
  return `/ext/${slug}${path ? `/${path.replace(/^\/+/, '')}` : ''}`;
}

function allowed(page: AdminPageDefinition, capabilities: readonly string[]): boolean {
  return !page.capability || capabilities.includes(page.capability);
}

/** What every plugin component receives. */
function usePageProps(plugin: { slug: string; version: string }): AdminPageProps {
  return pagePropsFor(plugin, useMe());
}

function shown(
  item: { types?: string[]; capability?: string; visible?: (props: AdminPageProps) => boolean },
  type: string,
  props: AdminPageProps,
): boolean {
  if (item.types && !item.types.includes(type)) return false;
  if (item.capability && !props.user.capabilities.includes(item.capability)) return false;
  try {
    return item.visible ? item.visible(props) : true;
  } catch {
    return false;
  }
}

/** Sidebar sections of the editor added by plugins, under the core ones. */
export function PluginEditorPanels({
  entry,
  draft,
  setFields,
}: {
  entry: EditorEntry;
  draft: adminSdk.EditorDraft;
  setFields: (group: string, values: Record<string, unknown>) => void;
}) {
  const plugins = usePluginAdmin();
  return (
    <>
      {plugins.flatMap((plugin) =>
        (plugin.definition?.editorPanels ?? []).map((panel) => (
          <PluginEditorPanel
            key={`${plugin.slug}:${panel.id}`}
            plugin={plugin}
            panel={panel}
            entry={entry}
            draft={draft}
            setFields={setFields}
          />
        )),
      )}
    </>
  );
}

function PluginEditorPanel({
  plugin,
  panel,
  entry,
  draft,
  setFields,
}: {
  plugin: LoadedAdminPlugin;
  panel: adminSdk.EditorPanelDefinition;
  entry: EditorEntry;
  draft: adminSdk.EditorDraft;
  setFields: (group: string, values: Record<string, unknown>) => void;
}) {
  const props = usePageProps(plugin);
  const me = useMe();
  const navigate = useNavigate();
  if (!shown(panel, entry.type, props)) return null;
  const Component = panel.component;
  return (
    <section
      className="border-t border-slate-200 p-4"
      aria-label={labelText(panel.title, me.user.locale)}
    >
      <h3 className="mb-2 text-sm font-semibold">{labelText(panel.title, me.user.locale)}</h3>
      <PluginErrorBoundary name={plugin.name}>
        <Component
          {...props}
          entry={entry}
          navigate={(to) => void navigate({ to })}
          draft={draft}
          setFields={setFields}
        />
      </PluginErrorBoundary>
    </section>
  );
}

/** An editor offered by an active plugin (`editors` in its admin entry). */
export interface AvailableEditor {
  plugin: LoadedAdminPlugin;
  definition: EditorDefinition;
}

/**
 * Editors of the active plugins for a content type. `loading` stays true
 * until the plugins' admin entries are loaded, so a document made with a
 * plugin editor is never opened in the block editor meanwhile.
 */
export function usePluginEditors(type: string): { editors: AvailableEditor[]; loading: boolean } {
  const me = useMe();
  const plugins = useQuery(pluginAdminQuery);
  const editors = (plugins.data ?? []).flatMap((plugin) =>
    (plugin.definition?.editors ?? [])
      .filter(
        (definition) =>
          (!definition.types || definition.types.includes(type)) &&
          (!definition.capability || me.capabilities.includes(definition.capability)),
      )
      .map((definition) => ({ plugin, definition })),
  );
  return { editors, loading: plugins.isPending };
}

/** Renders a plugin editor in the entry editor, with the props every plugin component gets. */
export function PluginEditor({
  editor,
  ...props
}: { editor: AvailableEditor } & Omit<EditorProps, keyof AdminPageProps | 'navigate'>) {
  const pageProps = usePageProps(editor.plugin);
  const navigate = useNavigate();
  const Component = editor.definition.component;
  return (
    <PluginErrorBoundary name={editor.plugin.name}>
      <Component {...pageProps} {...props} navigate={(to) => void navigate({ to })} />
    </PluginErrorBoundary>
  );
}

export interface PluginColumn {
  key: string;
  title: string;
  plugin: LoadedAdminPlugin;
  definition: ListColumnDefinition<unknown>;
  props: AdminPageProps;
}

/** Columns added by plugins to a list of entries (of a type) or terms (of a taxonomy). */
export function usePluginColumns(kind: 'entry' | 'term', type: string): PluginColumn[] {
  const me = useMe();
  const plugins = usePluginAdmin();
  const result: PluginColumn[] = [];
  for (const plugin of plugins) {
    const columns =
      kind === 'entry' ? plugin.definition?.entryColumns : plugin.definition?.termColumns;
    for (const definition of columns ?? []) {
      const props = pagePropsFor(plugin, me);
      if (!shown(definition, type, props)) continue;
      result.push({
        key: `${plugin.slug}:${definition.id}`,
        title: labelText(definition.title, me.user.locale),
        plugin,
        definition,
        props,
      });
    }
  }
  return result;
}

/** Data of the plugin columns for the rows shown, one load per column. */
export function usePluginColumnData(columns: PluginColumn[], type: string, rows: ListRow[]) {
  const ids = rows.map((r) => r.id).join(',');
  return useQuery({
    queryKey: ['plugin-columns', type, columns.map((c) => c.key).join('|'), ids],
    enabled: columns.length > 0 && rows.length > 0,
    queryFn: async () => {
      const data: Record<string, Record<string, unknown>> = {};
      await Promise.all(
        columns.map(async (column) => {
          if (!column.definition.load) return;
          try {
            data[column.key] = await column.definition.load(rows, { ...column.props, type });
          } catch (error) {
            console.error(`Column ${column.key} failed to load`, error);
          }
        }),
      );
      return data;
    },
  });
}

/** One cell of a plugin column. */
export function PluginCell({
  column,
  row,
  data,
  refresh,
}: {
  column: PluginColumn;
  row: ListRow;
  data: unknown;
  refresh: () => void;
}) {
  const navigate = useNavigate();
  const Cell = column.definition.cell;
  return (
    <PluginErrorBoundary name={column.plugin.name}>
      <Cell
        {...column.props}
        row={row}
        data={data}
        refresh={refresh}
        navigate={(to) => void navigate({ to })}
      />
    </PluginErrorBoundary>
  );
}

function pagePropsFor(
  plugin: { slug: string; version: string },
  me: ReturnType<typeof useMe>,
): AdminPageProps {
  return {
    plugin: { slug: plugin.slug, version: plugin.version },
    site: {
      id: me.site.id,
      name: me.site.name,
      defaultLocale: me.site.defaultLocale,
      locales: me.site.locales,
    },
    user: {
      id: me.user.id,
      displayName: me.user.displayName,
      locale: me.user.locale,
      capabilities: me.capabilities,
    },
    api: pluginApi(plugin.slug),
  };
}

/** Renders a plugin admin page (route `/ext/$plugin/$`). */
export function PluginPage({ slug, path }: { slug: string; path: string }) {
  const me = useMe();
  const { t } = adminSdk.useT();
  const plugins = useQuery(pluginAdminQuery);
  if (plugins.isPending) return <p className="text-sm text-slate-600">{t('Loading…')}</p>;
  const plugin = plugins.data?.find((p) => p.slug === slug);
  const page = plugin?.definition?.pages?.find((p) => p.path.replace(/^\/+/, '') === path);
  if (plugin?.error) {
    return (
      <adminSdk.Alert>
        {t('The admin pages of {plugin} could not be loaded. Check the browser console.', {
          plugin: plugin.name,
        })}
      </adminSdk.Alert>
    );
  }
  if (!plugin || !page) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{t('Not found')}</h1>
        <p className="mt-2 text-slate-600">
          {t('This page does not exist or its plugin is inactive.')}
        </p>
      </div>
    );
  }
  if (!allowed(page, me.capabilities)) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">{t('Access denied')}</h1>
        <p className="mt-2 text-slate-600">{t('You do not have permission to open this page.')}</p>
      </div>
    );
  }
  const Component = page.component;
  // A menu link has no page of its own: its address is the one to open.
  if (!Component) {
    if (page.link)
      window.location.replace(`/cl-admin${page.link.startsWith('/') ? '' : '/'}${page.link}`);
    return null;
  }
  return (
    <PluginErrorBoundary name={plugin.name}>
      <Component
        plugin={{ slug: plugin.slug, version: plugin.version }}
        site={{
          id: me.site.id,
          name: me.site.name,
          defaultLocale: me.site.defaultLocale,
          locales: me.site.locales,
        }}
        user={{
          id: me.user.id,
          displayName: me.user.displayName,
          locale: me.user.locale,
          capabilities: me.capabilities,
        }}
        api={pluginApi(plugin.slug)}
      />
    </PluginErrorBoundary>
  );
}

/** A Dashboard widget of a plugin (RF-ADM-02), isolated like its pages. */
export function PluginWidget({
  plugin,
  widget,
}: {
  plugin: LoadedAdminPlugin;
  widget: adminSdk.DashboardWidgetDefinition;
}) {
  const me = useMe();
  const Component = widget.component;
  return (
    <PluginErrorBoundary name={plugin.name}>
      <Component
        plugin={{ slug: plugin.slug, version: plugin.version }}
        site={{
          id: me.site.id,
          name: me.site.name,
          defaultLocale: me.site.defaultLocale,
          locales: me.site.locales,
        }}
        user={{
          id: me.user.id,
          displayName: me.user.displayName,
          locale: me.user.locale,
          capabilities: me.capabilities,
        }}
        api={pluginApi(plugin.slug)}
      />
    </PluginErrorBoundary>
  );
}

/** A crashing plugin page shows an error instead of breaking the admin. */
class PluginErrorBoundary extends React.Component<
  { name: string; children: React.ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <adminSdk.Alert>
          {adminSdk.t('{plugin} failed to display this page: {error}', {
            plugin: this.props.name,
            error: this.state.error.message,
          })}
        </adminSdk.Alert>
      );
    }
    return this.props.children;
  }
}
