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
    /** Language of the entry: the site's default unless a language plugin adds others. */
    locale: text('locale').notNull(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    title: text('title').notNull().default(''),
    /** Page template offered by the theme (`pageTemplates`); null for the default (0030). */
    template: text('template'),
    status: text('status')
      .$type<'draft' | 'pending' | 'scheduled' | 'published' | 'private' | 'trashed'>()
      .notNull()
      .default('draft'),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** Latest saved revision. */
    currentRevisionId: uuid('current_revision_id'),
    /** Revision visible to the public. */
    publishedRevisionId: uuid('published_revision_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    position: integer('position').notNull().default(0),
    /** Visitors may comment (`open`) or not; set from the type's `comments` support. */
    commentStatus: text('comment_status').$type<'open' | 'closed'>().notNull().default('closed'),
    /** Approved comments, kept up to date by the comments service. */
    commentCount: integer('comment_count').notNull().default(0),
    likeCount: integer('like_count').notNull().default(0),
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
    // Orders of the admin lists (RNF-03): latest changes, title, publication date.
    index('entries_admin_updated_idx').on(
      t.siteId,
      t.typeSlug,
      t.updatedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index('entries_admin_title_idx').on(t.siteId, t.typeSlug, t.title, t.id.desc().nullsFirst()),
    // Latest published entries of every type (dashboard).
    index('entries_admin_published_idx').on(t.siteId, t.status, t.publishedAt.desc().nullsFirst()),
    index('entries_admin_date_idx').on(
      t.siteId,
      t.typeSlug,
      t.publishedAt.desc().nullsLast(),
      t.id.desc().nullsFirst(),
    ),
    index('entries_search_idx').using('gin', t.search),
    // Author archives, and authors readable by the site (RF-THM-11).
    index('entries_author_idx').on(t.siteId, t.authorId),
  ],
);

export const revisions = pgTable(
  'revisions',
  {
    id: id(),
    siteId: siteId(),
    entryId: uuid('entry_id').notNull(),
    kind: text('kind')
      .$type<'manual' | 'autosave' | 'import' | 'restore'>()
      .notNull()
      .default('manual'),
    title: text('title').notNull(),
    /** Custom field values, validated against the content type schema. */
    fields: jsonb('fields').notNull().default({}),
    /** Summary shown in listings and as meta description (RF-CNT-12). */
    excerpt: text('excerpt'),
    /** Featured image, a media item of the site (RF-CNT-12). */
    featuredMediaId: uuid('featured_media_id'),
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

/** Who is editing an entry (RF-CNT-15); refreshed while the editor is open. */
export const entryLocks = pgTable('entry_locks', {
  entryId: uuid('entry_id')
    .primaryKey()
    .references(() => entries.id, { onDelete: 'cascade' }),
  siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * Block patterns (RF-EDT-07): saved selections of blocks, inserted as copies
 * or, when synced, as a reference rendered from the pattern everywhere.
 */
export const patterns = pgTable('patterns', {
  id: id(),
  siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  document: jsonb('document').notNull(),
  synced: boolean('synced').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
