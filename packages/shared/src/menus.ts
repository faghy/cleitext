import { z } from 'zod';
import { localeSchema } from './api.js';

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

export interface ThemeInfo {
  slug: string;
  name: string;
  version: string;
  menuLocations: Record<string, string>;
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
  kind: 'entry' | 'term' | 'url' | 'custom';
  entryId?: string | undefined;
  termId?: string | undefined;
  url?: string | undefined;
  label?: string | null | undefined;
  target?: '_blank' | null | undefined;
  children?: MenuItemInput[] | undefined;
}

export const menuItemInputSchema: z.ZodType<MenuItemInput> = z.lazy(() =>
  z.object({
    kind: z.enum(['entry', 'term', 'url', 'custom']),
    entryId: z.uuid().optional(),
    termId: z.uuid().optional(),
    url: z.string().trim().max(2_000).optional(),
    label: z.string().trim().max(200).nullable().optional(),
    target: z.literal('_blank').nullable().optional(),
    children: z.array(menuItemInputSchema).max(100).optional(),
  }),
);

export const replaceMenuItemsRequestSchema = z.object({
  items: z.array(menuItemInputSchema).max(200),
});
