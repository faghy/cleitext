import {
  bigint,
  customType,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
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
    /** Path inside the storage driver; never derived from the original file name. */
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
