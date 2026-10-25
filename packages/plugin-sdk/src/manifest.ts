import { z } from 'zod';

/** Version of the plugin API implemented by this SDK (semver). */
export const SDK_VERSION = '1.52.0';

/** Permissions a plugin can request (docs/SPECIFICATIONS.md §7.3). */
export const PLUGIN_PERMISSIONS = [
  'content:read',
  'content:write',
  'media:read',
  'media:write',
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
  /** Import content from other systems into a site (WordPress exports). */
  'import',
  /** Send requests to other services on the internet (webhooks, mailing lists). */
  'network',
  /** Read comments and post comments of its own type for visitors, e.g. reviews (API 1.19). */
  'comments',
  /**
   * Protect the site's forms against bots, e.g. with a captcha (plugin API
   * 1.38): the `form.challenge` and `form.verify` filters, which can refuse
   * any submission, sign-ins included.
   */
  'forms:protect',
  /**
   * Read the site's members (plugin API 1.42): names, roles, pictures and
   * confirmed email addresses, e.g. to mention people and email them.
   */
  'users:read',
] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export const PLUGIN_SLUG_RE = /^[a-z][a-z0-9-]{1,39}$/;
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RELATIVE_PATH_RE = /^(?!\/)(?!.*\.\.)[\w./-]+\.m?js$/;
/** A folder inside the plugin, e.g. `dist/public`. */
const RELATIVE_DIR_RE = /^(?!\/)(?!.*\.\.)[\w-]+(\/[\w-]+)*$/;

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
  /**
   * Block editor entry point (ESM, plugin API 1.23), e.g. `dist/editor.js`:
   * loaded with the block editor, it registers the plugin's own Gutenberg
   * blocks (`registerBlockType` with an `edit`) with the editor's
   * `@wordpress/*` packages. Their blocks use `schema: 'json'`.
   */
  editor: z.string().regex(RELATIVE_PATH_RE).optional(),
  /**
   * Styles of the `public` folder loaded in the block editor's canvas
   * (plugin API 1.23), e.g. `["blocks.css"]`, so blocks look as on the site.
   */
  editorStyles: z
    .array(
      z
        .string()
        .regex(/^(?!\/)(?!.*\.\.)[\w./-]+\.css$/)
        .max(200),
    )
    .max(20)
    .optional(),
  /**
   * Folder of files for the public site (scripts, styles, fonts), e.g.
   * `dist/public`, served at `/plugin-assets/<slug>/<version>/<file>`.
   * `plugin:build` bundles `src/public` into it.
   */
  /**
   * A paid plugin (RF-CAT-03): where its licenses are activated. It can be
   * installed to try (demo) but activated only with a license for the site.
   */
  paid: z.object({ licenseServer: z.url(), purchaseUrl: z.url().optional() }).optional(),
  public: z
    .string()
    .regex(RELATIVE_DIR_RE, 'A folder inside the plugin, e.g. dist/public')
    .optional(),
  requires: z
    .object({
      cleitext: z.string().max(50).optional(),
      plugins: z.record(z.string().regex(PLUGIN_SLUG_RE), z.string().max(50)).optional(),
    })
    .optional(),
  /**
   * Plugins that cannot be active on the same site (API 1.24), e.g. two SEO
   * plugins writing the same tags. Activating one while the other is active fails.
   */
  conflicts: z.array(z.string().regex(PLUGIN_SLUG_RE)).max(20).optional(),
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

/**
 * Modules a block editor entry gets from the editor (plugin API 1.23): the
 * admin's ones and the block editor's `@wordpress/*` packages, the same
 * instances Gutenberg uses, so plugin blocks register in it.
 */
export const SHARED_EDITOR_MODULES = [
  ...SHARED_ADMIN_MODULES,
  '@wordpress/block-editor',
  '@wordpress/blocks',
  '@wordpress/components',
  '@wordpress/compose',
  '@wordpress/data',
  '@wordpress/element',
  '@wordpress/hooks',
  '@wordpress/i18n',
  '@wordpress/icons',
  '@wordpress/keycodes',
  '@wordpress/primitives',
  '@wordpress/rich-text',
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
