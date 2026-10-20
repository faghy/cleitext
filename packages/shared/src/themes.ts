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
  /** Bundle built by `cleitext theme:build`, default export `defineTheme(…)`. */
  entry: z.string().min(1).default('dist/index.js'),
});
export type ThemeManifest = z.infer<typeof themeManifestSchema>;

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
}
