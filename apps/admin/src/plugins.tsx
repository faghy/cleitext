import * as adminSdk from '@cleitext/admin-sdk';
import type { AdminPageDefinition, AdminPluginDefinition } from '@cleitext/admin-sdk';
import { labelText, type ContentTypeView, type PluginAdminInfo } from '@cleitext/shared';
import * as reactQuery from '@tanstack/react-query';
import { queryOptions, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
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
}

/** Sidebar entries added by plugins: their content types and their pages. */
export function usePluginMenu(): { types: PluginMenuItem[]; pages: PluginMenuItem[] } {
  const me = useMe();
  const canEdit = me.capabilities.includes('edit_entries');
  const types = useQuery({ ...contentTypesQuery, enabled: canEdit });
  const plugins = usePluginAdmin();
  return {
    types: (types.data ?? [])
      .filter((t) => t.source.startsWith('plugin:'))
      .map((t) => ({ to: `/content/${t.slug}`, label: labelText(t.name, me.user.locale) })),
    pages: plugins.flatMap((plugin) =>
      (plugin.definition?.pages ?? [])
        .filter((page) => page.menu !== false && allowed(page, me.capabilities))
        .map((page) => ({
          to: pagePath(plugin.slug, page.path),
          label: labelText(page.title, me.user.locale),
        })),
    ),
  };
}

export function pagePath(slug: string, path: string): string {
  return `/ext/${slug}${path ? `/${path.replace(/^\/+/, '')}` : ''}`;
}

function allowed(page: AdminPageDefinition, capabilities: readonly string[]): boolean {
  return !page.capability || capabilities.includes(page.capability);
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
