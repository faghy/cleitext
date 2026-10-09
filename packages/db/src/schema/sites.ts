import { boolean, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { citext, createdAt, id } from './columns.js';

export const sites = pgTable(
  'sites',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    defaultLocale: text('default_locale').notNull().default('en'),
    timezone: text('timezone').notNull().default('UTC'),
    themeSlug: text('theme_slug'),
    createdAt: createdAt(),
  },
  (t) => [check('sites_status_check', sql`${t.status} in ('active', 'maintenance', 'archived')`)],
);

export const siteDomains = pgTable('site_domains', {
  id: id(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  host: citext('host').notNull().unique(),
  isPrimary: boolean('is_primary').notNull().default(false),
  forceHttps: boolean('force_https').notNull().default(true),
});

export const siteLocales = pgTable(
  'site_locales',
  {
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    position: integer('position').notNull().default(0),
    urlPrefix: text('url_prefix'),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.code] })],
);
