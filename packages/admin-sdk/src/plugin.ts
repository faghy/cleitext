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
export interface AdminPluginDefinition {
  pages?: AdminPageDefinition[];
}

export function defineAdminPlugin(definition: AdminPluginDefinition): AdminPluginDefinition {
  return definition;
}
