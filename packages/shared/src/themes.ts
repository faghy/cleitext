import { z } from 'zod';
import type { FieldDefinition, Label } from './fields.js';
import type { LicenseView } from './licenses.js';
import type { MenuItemField } from './menus.js';

/** `theme.json` of an installable theme package (RF-THM-01). */
export const themeManifestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/),
  description: z.string().max(500).optional(),
  author: z.string().max(200).optional(),
  license: z.string().max(100).default('GPL-2.0-or-later'),
  homepage: z.url().optional(),
  /**
   * Paid themes (RF-CAT-03): activating them on a site needs a license for
   * that site, activated with this license server.
   */
  paid: z.object({ licenseServer: z.url(), purchaseUrl: z.url().optional() }).optional(),
  /**
   * Plugins that come with the theme (e.g. its page builder), built, in the
   * package under `plugins/<slug>/`: installed with the theme, activated on a
   * site when the theme is, deactivated (data kept) when another theme is.
   */
  plugins: z
    .array(z.string().regex(/^[a-z][a-z0-9-]{1,39}$/))
    .max(10)
    .optional(),
  /**
   * Child themes (core 0.79): the slug of the theme this one is built on.
   * The child inherits everything from it and overrides only what it gives.
   * One level only: a parent cannot be a child itself.
   */
  parent: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
    .optional(),
  /** Versions of the parent the child works with, as a semver range (e.g. `^1.2.0`). */
  parentVersion: z.string().min(1).max(100).optional(),
  /**
   * Bundle built by `cleitext theme:build`, default export `defineTheme(…)`
   * (`defineChildTheme(…)` for a child). Default `dist/index.js`; a child
   * without one is only CSS (`style.css`) on its parent.
   */
  entry: z.string().min(1).optional(),
});
export type ThemeManifest = z.infer<typeof themeManifestSchema>;

/**
 * The bundle of a theme, relative to its folder: the manifest's `entry`, or
 * `dist/index.js`. Null for a child without code (only its `style.css`).
 */
export function themeEntry(
  manifest: Pick<ThemeManifest, 'entry' | 'parent'>,
  exists: (file: string) => boolean,
): string | null {
  if (manifest.entry) return manifest.entry;
  if (!manifest.parent) return 'dist/index.js';
  return exists('dist/index.js') || exists('src/index.tsx') || exists('src/index.ts')
    ? 'dist/index.js'
    : null;
}

/** The stylesheet of a child theme, printed after its parent's CSS. */
export const CHILD_THEME_STYLE = 'style.css';
/** Its CSS for the block editor, after the parent's `editorCss`. */
export const CHILD_THEME_EDITOR_STYLE = 'editor.css';
/** Largest `style.css` / `editor.css` of a child theme. */
export const MAX_CHILD_STYLE_BYTES = 512 * 1024;

/**
 * Additional CSS (core 0.79): CSS written by the site owner in Customize,
 * kept per site (and, optionally, for one theme), printed last in `<head>`.
 */
export const ADDITIONAL_CSS_MAX = 100_000;

/** Why some Additional CSS cannot be saved, or null when it can. */
export function additionalCssProblem(css: string): string | null {
  if (css.length > ADDITIONAL_CSS_MAX) {
    return `Additional CSS is limited to ${ADDITIONAL_CSS_MAX.toLocaleString('en')} characters.`;
  }
  // It goes inside <style>: nothing may close the element or open another.
  if (/<\/?\s*style/i.test(css)) return 'The CSS cannot contain <style> or </style>.';
  if (/<\/?\s*script/i.test(css)) return 'The CSS cannot contain <script>.';
  if (css.includes('\u0000')) return 'The CSS cannot contain NUL characters.';
  return null;
}

/** CSS safe to print inside a `<style>` element, whatever it holds. */
export function styleText(css: string): string {
  return css.replaceAll('\u0000', '').replace(/<(\/?\s*(?:style|script))/gi, '\\3C $1');
}

export const additionalCssSchema = z
  .string()
  .max(ADDITIONAL_CSS_MAX)
  .superRefine((css, ctx) => {
    const problem = additionalCssProblem(css);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** Additional CSS of a site: for every theme, and for the active theme only. */
export interface AdditionalCssView {
  site: string;
  theme: string;
  /** The theme `theme` belongs to (the active one). */
  themeSlug: string;
  max: number;
}

/** Modules provided by the host to theme bundles (never bundled with a theme). */
export const SHARED_THEME_MODULES = ['react', 'react/jsx-runtime', '@cleitext/theme-sdk'] as const;

export interface ThemeView {
  slug: string;
  name: string;
  version: string;
  description: string | null;
  /** Shipped with Cleitext, or installed with the CLI. */
  bundled: boolean;
  active: boolean;
  menuLocations: Record<string, string>;
  areas: Record<string, string>;
  settings: FieldDefinition[];
  /** Tabs of the options panel (fields name theirs in `section`). */
  settingsSections: {
    id: string;
    label: Label;
    description?: Label;
    icon?: string;
    parent?: string;
    tabs?: { id: string; label: Label }[];
  }[];
  /** Ready-made sets of settings. */
  presets: { id: string; label: Label; values: Record<string, unknown> }[];
  /** Options of each page or post, shown in the editor (stored in `editor.data`). */
  entryFields: { types?: string[]; fields: FieldDefinition[] } | null;
  /** Options of menu items, shown in Appearance → Menus (plugin API 1.34). */
  menuItemFields: MenuItemField[];
  /** Paid themes: where to buy a license, and this site's license (null without). */
  paid: { purchaseUrl: string | null; license: LicenseView | null } | null;
  /** Set when an installed theme could not be loaded. */
  error: string | null;
  /** Child themes (core 0.79): the theme it is built on. */
  parent?: { slug: string; name: string; version: string } | null;
  /** The installed child themes of this one (slugs). */
  children?: string[];
  /**
   * A child of a paid theme: activating it needs the parent's license for
   * this site (`true` while it is missing).
   */
  needsParentLicense?: boolean;
}
