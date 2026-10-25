import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, siteId } from './columns.js';
import { entries } from './content.js';
import { media } from './media.js';

/**
 * What each record of an import became (core 0.82, 0033): the source's
 * `ref` (a WordPress post id, `post:42`) and the entry or media item made of
 * it. An import of the same source again recognises its records by `ref`, so
 * two posts with the same title and a similar address are never taken for
 * one, and media already imported are not downloaded again. `source` names
 * the site the document comes from (`wordpress:https://example.com`).
 */
export const importRefs = pgTable(
  'import_refs',
  {
    siteId: siteId(),
    source: text('source').notNull(),
    ref: text('ref').notNull(),
    entryId: uuid('entry_id'),
    mediaId: uuid('media_id'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.source, t.ref] }),
    foreignKey({
      name: 'import_refs_entry_fk',
      columns: [t.siteId, t.entryId],
      foreignColumns: [entries.siteId, entries.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'import_refs_media_fk',
      columns: [t.siteId, t.mediaId],
      foreignColumns: [media.siteId, media.id],
    }).onDelete('cascade'),
    check('import_refs_target_check', sql`num_nonnulls(${t.entryId}, ${t.mediaId}) = 1`),
    index('import_refs_entry_idx').on(t.siteId, t.entryId),
    index('import_refs_media_idx').on(t.siteId, t.mediaId),
  ],
);
