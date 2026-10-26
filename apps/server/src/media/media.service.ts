import { createHash } from 'node:crypto';
import {
  entries,
  media,
  mediaVariants,
  newId,
  revisions,
  users,
  withContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { MediaListResponse, MediaUsageView, MediaView } from '@cleitext/shared';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, ilike, like, lt, or, sql, type SQL } from 'drizzle-orm';
import sharp from 'sharp';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { ALLOWED_TYPES, detectType, looksLikeSvg, RESIZABLE, sanitizeSvg } from './media-types.js';
import { mediaFolder, storageBaseName } from './storage-names.js';
import { DiskStorage, type MediaStorage } from './storage.js';

type MediaRow = typeof media.$inferSelect;
type VariantRow = typeof mediaVariants.$inferSelect;

/** Resized variants (RF-MED-03): width in pixels. `thumb` is always generated. */
export const VARIANT_WIDTHS = { thumb: 300, md: 768, lg: 1280, xl: 1920 } as const;
const VARIANT_FORMATS = ['webp', 'avif'] as const;

/** Media library: uploads, variants, metadata (docs/SPECIFICATIONS.md §4.5). */
@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');
  readonly storage: MediaStorage;
  /** Background variant jobs still running (awaited by tests and on shutdown). */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly cache: PageCacheService,
    private readonly plugins: PluginHost,
  ) {
    this.storage = new DiskStorage(config.media.path);
  }

  async upload(
    siteId: string,
    auth: AuthContext,
    file: { filename: string; data: Buffer },
    ip: string,
    /**
     * `date`: the month whose folder the file goes into (an imported file's
     * upload date on the old site); now by default.
     */
    options: { date?: Date | undefined } = {},
  ): Promise<MediaView> {
    let mime = await detectType(file.data);
    // SVG only when the server allows it, and always sanitized (RF-MED-09).
    if (!mime && this.config.media.allowSvg && looksLikeSvg(file.data)) {
      file = { ...file, data: Buffer.from(sanitizeSvg(file.data.toString('utf8'))) };
      mime = 'image/svg+xml';
    }
    if (!mime) {
      throw new HttpException(
        'This type of file is not allowed. Upload images, PDF or Office documents, MP4 or MP3.',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    // The same file is already in the library: reuse it (RF-MED-08).
    const checksum = createHash('sha256').update(file.data).digest('hex');
    const [existing] = await withContext(this.database.db, { siteId, userId: auth.userId }, (tx) =>
      tx.select({ id: media.id }).from(media).where(eq(media.checksum, checksum)).limit(1),
    );
    if (existing) return { ...(await this.get(siteId, auth, existing.id)), duplicate: true };
    const info = ALLOWED_TYPES[mime]!;
    let width: number | null = null;
    let height: number | null = null;
    if (info.kind === 'image') {
      const metadata = await sharp(file.data).metadata();
      const rotated = (metadata.orientation ?? 1) >= 5;
      width = (rotated ? metadata.height : metadata.width) ?? null;
      height = (rotated ? metadata.width : metadata.height) ?? null;
    }

    const id = newId();
    // The original name made safe, in the folder of the month (core 0.85).
    const storageKey = await this.putNew(
      siteId,
      mediaFolder(siteId, options.date ?? new Date()),
      storageBaseName(file.filename),
      info.ext,
      file.data,
    );

    try {
      await withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
        await tx.insert(media).values({
          id,
          siteId,
          storageKey,
          filename: sanitizeFilename(file.filename),
          mime,
          sizeBytes: file.data.length,
          width,
          height,
          checksum,
          uploadedBy: auth.userId,
        });
        await this.audit.record(tx, {
          siteId,
          userId: auth.userId,
          action: 'media.uploaded',
          targetType: 'media',
          targetId: id,
          ip,
        });
      });
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }

    if (RESIZABLE.has(mime))
      this.track(this.generateVariants(siteId, id, storageKey, file.data, width));
    const view = await this.get(siteId, auth, id);
    await this.plugins.emit(
      'media.uploaded',
      { media: { id: view.id, mime: view.mime, filename: view.filename, url: view.url } },
      siteId,
    );
    return view;
  }

  async list(
    siteId: string,
    auth: AuthContext,
    query: {
      kind?: string | undefined;
      q?: string | undefined;
      limit: number;
      cursor?: string | undefined;
    },
  ): Promise<MediaListResponse> {
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const conditions: SQL[] = [];
      if (query.kind === 'image') conditions.push(like(media.mime, 'image/%'));
      if (query.kind === 'video') conditions.push(like(media.mime, 'video/%'));
      if (query.kind === 'audio') conditions.push(like(media.mime, 'audio/%'));
      if (query.kind === 'document') conditions.push(like(media.mime, 'application/%'));
      if (query.q) {
        const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
        conditions.push(
          or(
            ilike(media.filename, pattern),
            sql`exists (select 1 from jsonb_each_text(${media.alt}) where value ilike ${pattern})`,
            sql`exists (select 1 from jsonb_each_text(${media.caption}) where value ilike ${pattern})`,
          )!,
        );
      }
      if (query.cursor) {
        const [createdAt, id] = decodeCursor(query.cursor);
        if (createdAt && id) {
          conditions.push(
            or(
              lt(media.createdAt, createdAt),
              and(eq(media.createdAt, createdAt), lt(media.id, id)),
            )!,
          );
        }
      }
      const rows = await tx
        .select({ media, uploaderName: users.displayName })
        .from(media)
        .leftJoin(users, eq(users.id, media.uploadedBy))
        .where(and(...conditions))
        .orderBy(desc(media.createdAt), desc(media.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const variants = await this.variantsOf(
        tx,
        page.map((r) => r.media.id),
      );
      const last = page.at(-1);
      return {
        items: page.map((r) =>
          this.toView(r.media, variants.get(r.media.id) ?? [], r.uploaderName),
        ),
        nextCursor:
          rows.length > query.limit && last
            ? Buffer.from(
                JSON.stringify([last.media.createdAt.toISOString(), last.media.id]),
              ).toString('base64url')
            : null,
      };
    });
  }

  async get(siteId: string, auth: AuthContext, id: string): Promise<MediaView> {
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const [row] = await tx
        .select({ media, uploaderName: users.displayName })
        .from(media)
        .leftJoin(users, eq(users.id, media.uploadedBy))
        .where(eq(media.id, id));
      if (!row) throw new NotFoundException('Media not found.');
      const variants = await this.variantsOf(tx, [id]);
      return this.toView(row.media, variants.get(id) ?? [], row.uploaderName);
    });
  }

  /** Alternative text and caption, per language (RF-MED-04). */
  async update(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: {
      alt?: Record<string, string> | undefined;
      caption?: Record<string, string> | undefined;
      focalPoint?: { x: number; y: number } | null | undefined;
    },
  ): Promise<MediaView> {
    await withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const row = await this.load(tx, id);
      this.assertCanManage(auth, row);
      await tx
        .update(media)
        .set({
          ...(input.alt ? { alt: { ...(row.alt as object), ...input.alt } } : {}),
          ...(input.caption ? { caption: { ...(row.caption as object), ...input.caption } } : {}),
          ...(input.focalPoint !== undefined ? { focalPoint: input.focalPoint } : {}),
        })
        .where(eq(media.id, id));
    });
    // Alternative texts are rendered in pages: refresh them.
    await this.cache.invalidate(siteId, ['site']);
    return this.get(siteId, auth, id);
  }

  /**
   * Entries whose latest saved version uses the media item: in their content
   * or as featured image (RF-MED-08).
   */
  async usage(siteId: string, auth: AuthContext, id: string): Promise<MediaUsageView[]> {
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      await this.load(tx, id);
      const rows = await tx
        .select({
          id: entries.id,
          type: entries.typeSlug,
          title: entries.title,
          status: entries.status,
        })
        .from(entries)
        .innerJoin(revisions, eq(revisions.id, entries.currentRevisionId))
        .where(
          or(
            eq(revisions.featuredMediaId, id),
            sql`${revisions.document}::text like ${`%"${id}"%`}`,
          ),
        )
        .orderBy(asc(entries.title))
        .limit(100);
      return rows;
    });
  }

  async remove(siteId: string, auth: AuthContext, id: string, ip: string): Promise<void> {
    const keys = await withContext(
      this.database.db,
      { siteId, userId: auth.userId },
      async (tx) => {
        const row = await this.load(tx, id);
        this.assertCanManage(auth, row);
        const variants = await tx.select().from(mediaVariants).where(eq(mediaVariants.mediaId, id));
        await tx.delete(media).where(eq(media.id, id));
        await this.audit.record(tx, {
          siteId,
          userId: auth.userId,
          action: 'media.deleted',
          targetType: 'media',
          targetId: id,
          ip,
        });
        return [row.storageKey, ...variants.map((v) => v.storageKey)];
      },
    );
    await Promise.all(keys.map((key) => this.storage.delete(key)));
    await this.cache.invalidate(siteId, ['site']);
  }

  /** Waits for background variant generation (tests, graceful shutdown). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  // ---- Internals ----------------------------------------------------------------

  private track(job: Promise<void>): void {
    const tracked = job
      .catch((error: unknown) => this.logger.error(error))
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  }

  /** Resized WebP and AVIF variants, generated after the upload has answered. */
  private async generateVariants(
    siteId: string,
    mediaId: string,
    storageKey: string,
    data: Buffer,
    width: number | null,
  ): Promise<void> {
    const base = storageKey.replace(/\.[a-z0-9]+$/, '');
    const rows: (typeof mediaVariants.$inferInsert)[] = [];
    for (const [variant, target] of Object.entries(VARIANT_WIDTHS)) {
      if (variant !== 'thumb' && width !== null && width <= target) continue;
      for (const format of VARIANT_FORMATS) {
        const pipeline = sharp(data).rotate().resize({ width: target, withoutEnlargement: true });
        const { data: output, info } = await (
          format === 'webp'
            ? pipeline.webp({ quality: 80 })
            : pipeline.avif({ quality: 55, effort: 4 })
        ).toBuffer({ resolveWithObject: true });
        const key = await this.putVariant(`${base}-${variant}`, format, output);
        rows.push({
          siteId,
          mediaId,
          variant,
          format,
          storageKey: key,
          width: info.width,
          height: info.height,
          sizeBytes: output.length,
        });
      }
    }
    await withContext(this.database.db, { siteId }, async (tx) => {
      // The media may have been deleted meanwhile: then drop the files.
      const [exists] = await tx.select({ id: media.id }).from(media).where(eq(media.id, mediaId));
      if (!exists) {
        await Promise.all(rows.map((r) => this.storage.delete(r.storageKey)));
        return;
      }
      if (rows.length > 0) await tx.insert(mediaVariants).values(rows);
    });
  }

  /**
   * Writes a new file as `<folder>/<name>.<ext>`, or `<name>-1`, `<name>-2`…
   * when that name is taken in the folder (as WordPress does): by a media
   * item with any extension (`photo.jpg` takes `photo.png`, so that their
   * variants do not meet) or a variant, or by any file on disk. The disk
   * write never replaces a file (exclusive create), so two uploads at the
   * same time cannot get the same name. Existing files are never touched.
   */
  private async putNew(
    siteId: string,
    folder: string,
    name: string,
    ext: string,
    data: Buffer,
  ): Promise<string> {
    const prefix = `${folder}/${name}`;
    const pattern = `${prefix.replace(/[\\%_]/g, '\\$&')}%`;
    const taken = await withContext(this.database.db, { siteId }, async (tx) => {
      const rows = [
        ...(await tx
          .select({ key: media.storageKey })
          .from(media)
          .where(like(media.storageKey, pattern))),
        ...(await tx
          .select({ key: mediaVariants.storageKey })
          .from(mediaVariants)
          .where(like(mediaVariants.storageKey, pattern))),
      ];
      return new Set(rows.map((r) => r.key.slice(folder.length + 1).replace(/\.[^.]*$/, '')));
    });
    for (let n = 0; n < 1_000; n++) {
      const candidate = n === 0 ? name : `${name}-${n}`;
      if (taken.has(candidate)) continue;
      const key = `${folder}/${candidate}.${ext}`;
      if (await this.tryPut(key, data)) return key;
    }
    // A thousand files of the same name in a month: a generated one.
    const key = `${folder}/${newId()}.${ext}`;
    await this.storage.put(key, data);
    return key;
  }

  /** A variant's file: `<base>-thumb.webp`, or `<base>-thumb-1.webp` when that is taken. */
  private async putVariant(base: string, format: string, data: Buffer): Promise<string> {
    for (let n = 0; n < 100; n++) {
      const key = n === 0 ? `${base}.${format}` : `${base}-${n}.${format}`;
      if (await this.tryPut(key, data)) return key;
    }
    const key = `${base}-${newId()}.${format}`;
    await this.storage.put(key, data);
    return key;
  }

  /** Writes a file that does not exist yet; false when one does. */
  private async tryPut(key: string, data: Buffer): Promise<boolean> {
    try {
      await this.storage.put(key, data);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  }

  private async variantsOf(
    tx: Parameters<Parameters<typeof withContext>[2]>[0],
    ids: string[],
  ): Promise<Map<string, VariantRow[]>> {
    const result = new Map<string, VariantRow[]>();
    if (ids.length === 0) return result;
    const rows = await tx
      .select()
      .from(mediaVariants)
      .where(or(...ids.map((id) => eq(mediaVariants.mediaId, id))));
    for (const row of rows) result.set(row.mediaId, [...(result.get(row.mediaId) ?? []), row]);
    return result;
  }

  private async load(
    tx: Parameters<Parameters<typeof withContext>[2]>[0],
    id: string,
  ): Promise<MediaRow> {
    const [row] = await tx.select().from(media).where(eq(media.id, id));
    if (!row) throw new NotFoundException('Media not found.');
    return row;
  }

  private assertCanManage(auth: AuthContext, row: MediaRow): void {
    const own = row.uploadedBy === auth.userId;
    const allowed = own
      ? auth.capabilities.includes('upload_media')
      : auth.capabilities.includes('edit_others_entries');
    if (!allowed) throw new ForbiddenException('You cannot change this file.');
  }

  private toView(row: MediaRow, variants: VariantRow[], uploaderName: string | null): MediaView {
    return {
      id: row.id,
      url: this.storage.url(row.storageKey),
      filename: row.filename,
      mime: row.mime,
      kind: ALLOWED_TYPES[row.mime]?.kind ?? 'document',
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      alt: row.alt as Record<string, string>,
      caption: row.caption as Record<string, string>,
      focalPoint: (row.focalPoint as { x: number; y: number } | null) ?? null,
      uploadedBy: row.uploadedBy
        ? { id: row.uploadedBy, displayName: uploaderName ?? 'Former member' }
        : null,
      createdAt: row.createdAt.toISOString(),
      variants: variants
        .sort((a, b) => a.width - b.width)
        .map((v) => ({
          variant: v.variant,
          format: v.format,
          url: this.storage.url(v.storageKey),
          width: v.width,
          height: v.height,
        })),
    };
  }
}

/** Original file name, kept only as metadata. */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'file';
}

function decodeCursor(cursor: string): [Date | null, string | null] {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as [
      string,
      string,
    ];
    const date = new Date(createdAt);
    return [Number.isNaN(date.getTime()) ? null : date, typeof id === 'string' ? id : null];
  } catch {
    return [null, null];
  }
}
