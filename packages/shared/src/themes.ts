import { z } from 'zod';
import type { FieldDefinition } from './fields.js';
import type { LicenseView } from './licenses.js';

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
  /** Paid themes: where to buy a license, and this site's license (null without). */
  paid: { purchaseUrl: string | null; license: LicenseView | null } | null;
  /** Set when an installed theme could not be loaded. */
  error: string | null;
}
