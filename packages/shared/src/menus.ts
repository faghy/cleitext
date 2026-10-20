import { z } from 'zod';
import { localeSchema } from './api.js';
import type { FieldDefinition } from './fields.js';

/** Menus (RF-NAV-01/02, docs/SPECIFICATIONS.md §6.3). */

export interface MenuItemNode {
  id: string;
  kind: 'entry' | 'term' | 'url' | 'custom';
  entryId: string | null;
  termId: string | null;
  url: string | null;
  /** Custom label; the entry or term title when null. */
  label: string | null;
  target: '_blank' | null;
  /** Label shown in the admin (resolved from the entry or term). */
  displayLabel: string;
  /**
   * Values of the theme's menu item options (plugin API 1.34), as stored:
   * values of options no longer declared are kept too.
   */
  data: Record<string, unknown>;
  children: MenuItemNode[];
}

export interface MenuView {
  id: string;
  slug: string;
  name: string;
  locale: string;
  location: string | null;
  items: MenuItemNode[];
}

/**
 * An option of menu items declared by a theme (or a plugin extending it),
 * plugin API 1.34, e.g. a mega menu's columns. `levels`: `top` only for
 * first-level items, `nested` only for sub-items, `all` (default) for every item.
 */
export interface MenuItemField {
  field: FieldDefinition;
  levels?: 'top' | 'nested' | 'all';
}

/** Whether a menu item option applies at a depth (0: first level). */
export function menuItemFieldApplies(item: MenuItemField, depth: number): boolean {
  const levels = item.levels ?? 'all';
  return levels === 'all' || (levels === 'top' ? depth === 0 : depth > 0);
}

export interface ThemeInfo {
  slug: string;
  name: string;
  version: string;
  menuLocations: Record<string, string>;
  /** Options of menu items of the active theme and its active plugins (plugin API 1.34). */
  menuItemFields: MenuItemField[];
}

export const createMenuRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  locale: localeSchema.optional(),
  location: z.string().min(1).max(64).nullable().optional(),
});

export const updateMenuRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  location: z.string().min(1).max(64).nullable().optional(),
});

export interface MenuItemInput {
  /**
   * The item's id when it is already saved: values of theme options no
   * longer declared (a theme or plugin inactive) are carried over from it.
   */
  id?: string | undefined;
  kind: 'entry' | 'term' | 'url' | 'custom';
  entryId?: string | undefined;
  termId?: string | undefined;
  url?: string | undefined;
  label?: string | null | undefined;
  target?: '_blank' | null | undefined;
  /** Values of the theme's menu item options (plugin API 1.34). */
  data?: Record<string, unknown> | undefined;
  children?: MenuItemInput[] | undefined;
}

export const menuItemInputSchema: z.ZodType<MenuItemInput> = z.lazy(() =>
  z.object({
    id: z.uuid().optional(),
    kind: z.enum(['entry', 'term', 'url', 'custom']),
    entryId: z.uuid().optional(),
    termId: z.uuid().optional(),
    url: z.string().trim().max(2_000).optional(),
    label: z.string().trim().max(200).nullable().optional(),
    target: z.literal('_blank').nullable().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    children: z.array(menuItemInputSchema).max(100).optional(),
  }),
);

export const replaceMenuItemsRequestSchema = z.object({
  items: z.array(menuItemInputSchema).max(200),
});
