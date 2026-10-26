import { sql } from 'drizzle-orm';
import {
  bigint,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, siteId } from './columns.js';
import { users } from './identity.js';
import { sites } from './sites.js';

export const media = pgTable(
  'media',
  {
    id: id(),
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    /**
     * Path inside the storage driver, `<siteId>/<yyyy>/<mm>/<name>.<ext>`:
     * `<name>` is the original file name made safe (core 0.85; a uuid before).
     */
    storageKey: text('storage_key').notNull(),
    /** Original file name, kept only as metadata. */
    filename: text('filename').notNull(),
    /** Verified from the file's magic bytes. */
    mime: text('mime').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    /** SHA-256 of the file content, used for de-duplication. */
    checksum: text('checksum').notNull(),
    alt: jsonb('alt').notNull().default({}),
    caption: jsonb('caption').notNull().default({}),
    focalPoint: jsonb('focal_point'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [unique('media_site_id_unique').on(t.siteId, t.id)],
);

export const mediaVariants = pgTable(
  'media_variants',
  {
    siteId: siteId(),
    mediaId: uuid('media_id').notNull(),
    /** 'thumb' | 'md' | 'lg' | 'xl' | theme-defined sizes */
    variant: text('variant').notNull(),
    /** 'avif' | 'webp' | 'jpeg' | 'png' */
    format: text('format').notNull(),
    storageKey: text('storage_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.mediaId, t.variant, t.format] }),
    foreignKey({
      name: 'media_variants_media_fk',
      columns: [t.siteId, t.mediaId],
      foreignColumns: [media.siteId, media.id],
    }).onDelete('cascade'),
  ],
);

/**
 * Media files given another name by `cleitext media:rename-imported`
 * (core 0.86, 0035): files of old WordPress imports stored under a uuid
 * (`<site>/2026/10/<uuid>.jpg`) moved to WordPress's name and month. A
 * request for `/media/<oldKey>` whose file is gone answers 301 to
 * `/media/<newKey>`. The old file stays until `deleteAfter`, then
 * `media:purge-renamed` removes it (`purgedAt`); the row stays for the
 * redirect. `mediaId` is informative: no foreign key, so that the old file
 * of a media item deleted meanwhile is still purged.
 */
export const mediaRenames = pgTable(
  'media_renames',
  {
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    oldKey: text('old_key').notNull(),
    newKey: text('new_key').notNull(),
    mediaId: uuid('media_id'),
    deleteAfter: timestamp('delete_after', { withTimezone: true }).notNull(),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.oldKey] }),
    index('media_renames_purge_idx')
      .on(t.siteId, t.deleteAfter)
      .where(sql`${t.purgedAt} IS NULL`),
  ],
);

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
});

/**
 * Web fonts kept on the site (Settings → Privacy → Web fonts): the files of
 * the Google Fonts and Bunny Fonts stylesheets that pages link, downloaded
 * once by the server and served at `/_fonts/<name>`. Names are hashes of
 * the content (`<32 hex>.css`, `.woff2`…): a file never changes.
 */
export const webFontFiles = pgTable(
  'web_font_files',
  {
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    bytes: bytea('bytes').notNull(),
    size: integer('size').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.name] })],
);

/** The site's stylesheet (a file of `web_font_files`) of each font service address, by its hash. */
export const webFontSheets = pgTable(
  'web_font_sheets',
  {
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    css: text('css').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.key] })],
);
