import { z } from 'zod';

/** Version of the plugin API implemented by this SDK (semver). */
export const SDK_VERSION = '1.5.0';

/** Permissions a plugin can request (docs/SPECIFICATIONS.md §7.3). */
export const PLUGIN_PERMISSIONS = [
  'content:read',
  'content:write',
  'media:read',
  'settings:own',
  'routes:public',
  'routes:admin',
  'blocks',
  'theme:hooks',
  'mail:send',
  /** Provide the site's languages and translations (one plugin per site). */
  'languages',
  /** Export and erase the personal data of anyone, gathered from the core and every plugin. */
  'privacy',
] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export const PLUGIN_SLUG_RE = /^[a-z][a-z0-9-]{1,39}$/;
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RELATIVE_PATH_RE = /^(?!\/)(?!.*\.\.)[\w./-]+\.m?js$/;

/** Licenses accepted for plugins: GPL-compatible (ARCHITECTURE §11.10). */
export const GPL_COMPATIBLE_LICENSES = [
  'GPL-2.0-or-later',
  'GPL-2.0-only',
  'GPL-3.0-or-later',
  'GPL-3.0-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-or-later',
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
] as const;

/** `cleitext.plugin.json` (docs/SPECIFICATIONS.md §7.1). */
export const pluginManifestSchema = z.object({
  slug: z.string().regex(PLUGIN_SLUG_RE, 'Lowercase letters, digits and dashes, 2–40 characters'),
  name: z.string().trim().min(1).max(100),
  version: z.string().regex(SEMVER_RE, 'Use semantic versioning, e.g. 1.2.0'),
  /** Supported plugin API versions, a semver range such as `^1.0`. */
  apiVersion: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  author: z.string().max(200).optional(),
  homepage: z.url().optional(),
  license: z.enum(GPL_COMPATIBLE_LICENSES, {
    error: 'Plugins must use a GPL-compatible license (SPDX identifier)',
  }),
  /** Server entry point (ESM), relative to the plugin folder. */
  server: z.string().regex(RELATIVE_PATH_RE).optional(),
  /** Admin entry point (ESM), relative to the plugin folder. */
  admin: z.string().regex(RELATIVE_PATH_RE).optional(),
  requires: z
    .object({
      cleitext: z.string().max(50).optional(),
      plugins: z.record(z.string().regex(PLUGIN_SLUG_RE), z.string().max(50)).optional(),
    })
    .optional(),
  permissions: z.array(z.enum(PLUGIN_PERMISSIONS)).max(PLUGIN_PERMISSIONS.length).default([]),
  /** Capabilities defined by the plugin (must also be declared in code). */
  capabilities: z
    .array(z.string().regex(/^[a-z][a-z0-9_]{1,63}$/))
    .max(50)
    .default([]),
});
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginManifestInput = z.input<typeof pluginManifestSchema>;

/** Thrown by the context when a plugin uses something it did not request. */
export class PluginPermissionError extends Error {
  constructor(
    readonly plugin: string,
    readonly permission: PluginPermission,
  ) {
    super(`Plugin "${plugin}" needs the "${permission}" permission in cleitext.plugin.json`);
    this.name = 'PluginPermissionError';
  }
}

/**
 * Modules provided by Cleitext at runtime: plugins must not bundle their own
 * copy (one React, one Drizzle). `cleitext plugin:build` replaces imports of
 * these modules with the host's instance, read from `globalThis[SHARED_MODULES_GLOBAL]`.
 */
export const SHARED_MODULES_GLOBAL = '__cleitextShared';
export const SHARED_SERVER_MODULES = [
  '@cleitext/plugin-sdk',
  'react',
  'react/jsx-runtime',
  'zod',
  'drizzle-orm',
  'drizzle-orm/pg-core',
] as const;
export const SHARED_ADMIN_MODULES = [
  '@cleitext/admin-sdk',
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@tanstack/react-query',
] as const;

/** PostgreSQL schema of a plugin's tables. */
export function pluginSchemaName(slug: string): string {
  return `plg_${slug.replace(/-/g, '_')}`;
}

/*
 * The PostgreSQL role a plugin's queries run as (it cannot see core tables) is
 * named by the database function cleitext_plugin_role(slug): roles are shared
 * by every database of a server, so the name carries a tag of the database.
 */
