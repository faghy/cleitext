import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, siteId } from './columns.js';
import { entries } from './content.js';
import { sites } from './sites.js';
import { terms } from './taxonomy.js';

export const menus = pgTable(
  'menus',
  {
    id: id(),
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    locale: text('locale').notNull(),
    /** Theme menu location, e.g. 'primary' or 'footer'. */
    location: text('location'),
  },
  (t) => [
    unique('menus_site_id_unique').on(t.siteId, t.id),
    unique('menus_site_slug_locale_unique').on(t.siteId, t.slug, t.locale),
  ],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: id(),
    siteId: siteId(),
    menuId: uuid('menu_id').notNull(),
    parentId: uuid('parent_id'),
    position: integer('position').notNull().default(0),
    kind: text('kind').notNull(),
    entryId: uuid('entry_id'),
    termId: uuid('term_id'),
    url: text('url'),
    /** When null, the title of the linked entry or term is used. */
    label: text('label'),
    target: text('target'),
    attrs: jsonb('attrs').notNull().default({}),
    /**
     * Values of the theme's menu item options (plugin API 1.34), by field
     * name; values of options no longer declared are kept.
     */
    data: jsonb('data').notNull().default({}),
  },
  (t) => [
    unique('menu_items_site_id_unique').on(t.siteId, t.id),
    foreignKey({
      name: 'menu_items_menu_fk',
      columns: [t.siteId, t.menuId],
      foreignColumns: [menus.siteId, menus.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'menu_items_parent_fk',
      columns: [t.siteId, t.parentId],
      foreignColumns: [t.siteId, t.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'menu_items_entry_fk',
      columns: [t.siteId, t.entryId],
      foreignColumns: [entries.siteId, entries.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'menu_items_term_fk',
      columns: [t.siteId, t.termId],
      foreignColumns: [terms.siteId, terms.id],
    }).onDelete('cascade'),
    check('menu_items_kind_check', sql`${t.kind} in ('entry', 'term', 'url', 'custom')`),
  ],
);
