import { z } from 'zod';
import { paidSchema, type LicenseView } from './licenses.js';

/** An item of the plugin and theme catalog (RF-PLG-07), as listed in catalog.json. */
export const catalogItemSchema = z.object({
  type: z.enum(['plugin', 'theme']),
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  name: z.string().min(1).max(100),
  /** Short description by language. */
  summary: z.record(z.string(), z.string().max(1000)),
  tags: z.array(z.string().max(40)).max(20).default([]),
  /** Plugins: the group of the catalog they are listed under (`editor`, `seo`, `analytics`, `shop`, `tools`). */
  category: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,39}$/)
    .optional(),
  icon: z.url().nullable().default(null),
  screenshots: z.array(z.url()).max(10).default([]),
  version: z.string().max(40),
  /** Plugins: the plugin API range they need. */
  apiVersion: z.string().max(40).optional(),
  /** Themes: the Cleitext versions they need, e.g. `>=0.9.0`. */
  requires: z.string().max(40).optional(),
  license: z.string().max(60),
  author: z.string().max(200),
  download: z.url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().positive(),
  homepage: z.url().optional(),
  updatedAt: z.string().max(40),
  /** Paid items (RF-CAT-03): the download needs a license for the site. */
  paid: paidSchema.optional(),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const catalogSchema = z.object({
  schema: z.literal(1),
  generatedAt: z.string(),
  items: z.array(catalogItemSchema).max(2000),
});

/** A catalog item for this site: what is installed and whether it can be. */
export interface CatalogEntryView extends CatalogItem {
  /** Installed version, or null. */
  installed: string | null;
  /** A newer version than the installed one. */
  update: boolean;
  /** Works with this Cleitext. */
  compatible: boolean;
  /** Paid items: this site's license key, activated (null without). */
  siteLicense: LicenseView | null;
  /** Paid items: the update is newer than the updates the license includes. */
  renew: boolean;
}

export interface CatalogView {
  /** False when the server has no catalog (CATALOG_URL empty). */
  enabled: boolean;
  items: CatalogEntryView[];
  /** Why the catalog could not be read, if so. */
  error: string | null;
  checkedAt: string | null;
}

// ---- Automatic updates (RF-SYS-UPD) ---------------------------------------------------

/** Core releases updated automatically: none, fix releases (x.y.Z), or all. */
export type CorePolicy = 'off' | 'patch' | 'all';

export interface AutoUpdateItem {
  type: 'plugin' | 'theme';
  slug: string;
}

export interface AutoUpdateResult {
  at: string;
  type: 'plugin' | 'theme' | 'core';
  slug: string;
  name: string;
  from: string;
  to: string;
  ok: boolean;
  error?: string;
}

export interface AutoUpdatesView {
  core: CorePolicy;
  /** Plugins and themes updated automatically. */
  items: AutoUpdateItem[];
  lastRun: string | null;
  nextRun: string | null;
  /** The latest automatic updates, newest first. */
  log: AutoUpdateResult[];
}

export const autoUpdatesRequestSchema = z
  .object({
    core: z.enum(['off', 'patch', 'all']).optional(),
    item: z
      .object({
        type: z.enum(['plugin', 'theme']),
        slug: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
        enabled: z.boolean(),
      })
      .optional(),
  })
  .refine((v) => v.core !== undefined || v.item !== undefined, 'Nothing to change.');
