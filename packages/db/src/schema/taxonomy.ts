import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, siteId } from './columns.js';
import { entries } from './content.js';
import { sites } from './sites.js';

export const taxonomies = pgTable(
  'taxonomies',
  {
    id: id(),
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: jsonb('name').notNull(),
    hierarchical: boolean('hierarchical').notNull().default(false),
    contentTypes: text('content_types')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    unique('taxonomies_site_id_unique').on(t.siteId, t.id),
    unique('taxonomies_site_slug_unique').on(t.siteId, t.slug),
  ],
);

export const terms = pgTable(
  'terms',
  {
    id: id(),
    siteId: siteId(),
    taxonomyId: uuid('taxonomy_id').notNull(),
    locale: text('locale').notNull(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    fields: jsonb('fields').notNull().default({}),
  },
  (t) => [
    unique('terms_site_id_unique').on(t.siteId, t.id),
    unique('terms_taxonomy_locale_slug_unique').on(t.taxonomyId, t.locale, t.slug),
    foreignKey({
      name: 'terms_taxonomy_fk',
      columns: [t.siteId, t.taxonomyId],
      foreignColumns: [taxonomies.siteId, taxonomies.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'terms_parent_fk',
      columns: [t.siteId, t.parentId],
      foreignColumns: [t.siteId, t.id],
    }),
  ],
);

export const entryTerms = pgTable(
  'entry_terms',
  {
    siteId: siteId(),
    entryId: uuid('entry_id').notNull(),
    termId: uuid('term_id').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.termId] }),
    foreignKey({
      name: 'entry_terms_entry_fk',
      columns: [t.siteId, t.entryId],
      foreignColumns: [entries.siteId, entries.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'entry_terms_term_fk',
      columns: [t.siteId, t.termId],
      foreignColumns: [terms.siteId, terms.id],
    }).onDelete('cascade'),
  ],
);
