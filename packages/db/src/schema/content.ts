import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, siteId, tsvector } from './columns.js';
import { users } from './identity.js';
import { sites } from './sites.js';

/*
 * Cross-tenant integrity: child rows reference parents through composite
 * foreign keys (site_id, id). Foreign-key checks bypass RLS, so a plain FK on
 * `id` alone would let a row of site A point to a row of site B.
 */

export const contentTypes = pgTable(
  'content_types',
  {
    id: id(),
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    /** Labels per locale, e.g. { "en": "Pages", "it": "Pagine" }. */
    name: jsonb('name').notNull(),
    /** 'core' | 'user' | 'plugin:<slug>' */
    source: text('source').notNull().default('core'),
    hierarchical: boolean('hierarchical').notNull().default(false),
    supports: text('supports')
      .array()
      .notNull()
      .default(sql`'{title,blocks,revisions}'::text[]`),
    fieldsSchema: jsonb('fields_schema').notNull().default({}),
    permalink: text('permalink').notNull().default('/{slug}'),
  },
  (t) => [unique('content_types_site_slug_unique').on(t.siteId, t.slug)],
);

export const entries = pgTable(
  'entries',
  {
    id: id(),
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    typeSlug: text('type_slug').notNull(),
    locale: text('locale').notNull(),
    /** Entries that are translations of each other share this value. */
    translationGroup: uuid('translation_group').notNull(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    title: text('title').notNull().default(''),
    status: text('status').notNull().default('draft'),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** Latest saved revision. */
    currentRevisionId: uuid('current_revision_id'),
    /** Revision visible to the public. */
    publishedRevisionId: uuid('published_revision_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    position: integer('position').notNull().default(0),
    search: tsvector('search'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
  },
  (t) => [
    unique('entries_site_id_unique').on(t.siteId, t.id),
    unique('entries_site_type_locale_slug_unique').on(t.siteId, t.typeSlug, t.locale, t.slug),
    foreignKey({
      name: 'entries_type_fk',
      columns: [t.siteId, t.typeSlug],
      foreignColumns: [contentTypes.siteId, contentTypes.slug],
    }).onUpdate('cascade'),
    foreignKey({
      name: 'entries_parent_fk',
      columns: [t.siteId, t.parentId],
      foreignColumns: [t.siteId, t.id],
    }),
    check(
      'entries_status_check',
      sql`${t.status} in ('draft', 'pending', 'scheduled', 'published', 'private', 'trashed')`,
    ),
    index('entries_list_idx').on(t.siteId, t.typeSlug, t.status, t.publishedAt.desc()),
    index('entries_translation_group_idx').on(t.translationGroup),
    index('entries_search_idx').using('gin', t.search),
  ],
);

export const revisions = pgTable(
  'revisions',
  {
    id: id(),
    siteId: siteId(),
    entryId: uuid('entry_id').notNull(),
    kind: text('kind').notNull().default('manual'),
    title: text('title').notNull(),
    /** Custom field values, validated against the content type schema. */
    fields: jsonb('fields').notNull().default({}),
    /** Cleitext Document (CXD). */
    document: jsonb('document').notNull(),
    /** Version of the CXD document format. */
    schemaVersion: integer('schema_version').notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('revisions_site_id_unique').on(t.siteId, t.id),
    foreignKey({
      name: 'revisions_entry_fk',
      columns: [t.siteId, t.entryId],
      foreignColumns: [entries.siteId, entries.id],
    }).onDelete('cascade'),
    check('revisions_kind_check', sql`${t.kind} in ('manual', 'autosave', 'import', 'restore')`),
    index('revisions_entry_idx').on(t.entryId, t.createdAt.desc()),
  ],
);
