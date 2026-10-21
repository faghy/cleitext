/**
 * Copies of the feed's pictures on the site. Meta's picture addresses are
 * signed and expire after some days, and every visitor loading them talks
 * to Meta: the copies are served by the site at
 * `/social-feed/media/<key>.<ext>`, kept in the plugin's own table, with
 * limits on the size of each picture and on their number.
 */
import { createHash } from 'node:crypto';
import type { PluginContext } from '@cleitext/plugin-sdk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { customType, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { HttpSend } from './meta';

/** Largest picture copied (Instagram's are about 1080 px wide, a few hundred KB). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/** Most pictures kept per site: two full feeds and the profile pictures. */
export const MAX_IMAGES = 120;
/** Pictures no post uses any more stay this long (pages cached elsewhere may still show them). */
export const KEEP_UNUSED_MS = 24 * 60 * 60 * 1000;

export const MEDIA_ROUTE = '/social-feed/media';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** The key of a picture: stable for a post (Meta's address changes at each fetch). */
export function imageKey(owner: string, role: string): string {
  return createHash('sha256').update(`${owner}|${role}`).digest('hex').slice(0, 32);
}

/** The type of a picture, from its first bytes; null when it is not a picture we serve. */
export function sniffImage(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'image/png';
  if (
    b.length > 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  return null;
}

export function localPath(key: string, mime: string): string {
  return `${MEDIA_ROUTE}/${key}.${MIME_EXT[mime] ?? 'jpg'}`;
}

/** `<key>.<ext>` of a served address → the key, or null. */
export function keyOfFile(file: string): string | null {
  const match = /^([a-f0-9]{32})\.(jpg|png|webp|gif)$/.exec(file);
  return match ? match[1]! : null;
}

export interface StoredImage {
  key: string;
  mime: string;
  size: number;
  createdAt: Date;
}

/** Where copies are kept: the plugin's table on the server, a map in tests. */
export interface ImageStore {
  list(siteId: string): Promise<StoredImage[]>;
  get(siteId: string, key: string): Promise<{ mime: string; bytes: Buffer } | null>;
  put(siteId: string, key: string, mime: string, bytes: Buffer): Promise<void>;
  remove(siteId: string, keys: string[]): Promise<void>;
}

/** Downloads a picture through `ctx.http` (public https addresses only) and checks it. */
export async function download(
  http: HttpSend,
  url: string,
): Promise<{ mime: string; bytes: Buffer } | null> {
  const res = await http({ url, method: 'GET', binary: true, timeoutMs: 20_000 });
  if (res.status !== 200 || !res.base64) return null;
  const bytes = Buffer.from(res.base64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  const mime = sniffImage(bytes);
  return mime ? { mime, bytes } : null;
}

// ---- The table -------------------------------------------------------------------------

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

const images = pgTable('images', {
  siteId: uuid('site_id').notNull(),
  key: text('key').notNull(),
  mime: text('mime').notNull(),
  bytes: bytea('bytes').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export function databaseImages(ctx: PluginContext): ImageStore {
  return {
    list: (siteId) =>
      ctx.db.transaction(siteId, (tx) =>
        tx
          .select({
            key: images.key,
            mime: images.mime,
            size: images.size,
            createdAt: images.createdAt,
          })
          .from(images),
      ),
    async get(siteId, key) {
      const [row] = await ctx.db.transaction(siteId, (tx) =>
        tx
          .select({ mime: images.mime, bytes: images.bytes })
          .from(images)
          .where(eq(images.key, key))
          .limit(1),
      );
      return row ? { mime: row.mime, bytes: Buffer.from(row.bytes) } : null;
    },
    async put(siteId, key, mime, bytes) {
      await ctx.db.transaction(siteId, (tx) =>
        tx
          .insert(images)
          .values({ siteId, key, mime, bytes, size: bytes.length })
          .onConflictDoUpdate({
            target: [images.siteId, images.key],
            set: { mime, bytes, size: bytes.length, createdAt: sql`now()` },
          }),
      );
    },
    async remove(siteId, keys) {
      if (keys.length === 0) return;
      await ctx.db.transaction(siteId, (tx) =>
        tx.delete(images).where(and(eq(images.siteId, siteId), inArray(images.key, keys))),
      );
    },
  };
}
