/**
 * Web fonts kept on the site (Settings → Privacy → Web fonts), for every
 * theme: the Google Fonts and Bunny Fonts stylesheets pages link are
 * downloaded once by the server (fonts.googleapis.com, fonts.gstatic.com and
 * fonts.bunny.net only, with the limits, timeouts and retries Fresco and
 * Prisma use: `@cleitext/design/font-copies`), kept in the core's
 * `web_font_files` and `web_font_sheets` tables, and served at
 * `/_fonts/<name>` with a one-year cache.
 *
 * A page waits at most 2.5 seconds for a family's first copy; without one
 * it goes without that family (never with the service's link), is tagged
 * `fonts`, and the cached pages with that tag are made again once the copy
 * is ready.
 */
import {
  detached,
  webFontFiles,
  webFontSheets,
  withContext,
  type DatabaseClient,
} from '@cleitext/db';
import { LocalFonts, type FontStore, type HttpSend } from '@cleitext/design/font-copies';
import { base64Size, isFontServiceCssUrl, servedFile } from '@cleitext/design/fonts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { sendPublic } from '../common/public-fetch.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from './page-cache.service.js';
import { rewriteWebFonts, WEB_FONTS_ROUTE, type WebFontsMode } from './web-fonts.js';

/** The cache tag of pages that went without a family whose copy was not ready. */
export const FONTS_TAG = 'fonts';

/** How long a page waits for copies it has never had (as Fresco and Prisma). */
const PAGE_WAIT_MS = 2500;

@Injectable()
export class WebFontsService {
  private readonly logger = new Logger('WebFonts');
  private readonly fonts: LocalFonts;

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
  ) {
    this.fonts = new LocalFonts({
      http: (request) => this.download(request),
      store: this.store(),
      log: {
        debug: () => {},
        info: () => {},
        warn: (message, data) => this.logger.warn(`${message}: ${JSON.stringify(data ?? {})}`),
        error: (message, data) => this.logger.error(`${message}: ${JSON.stringify(data ?? {})}`),
      },
      onReady: (siteId) =>
        detached(() => {
          // Again a little later: a page made without the font may be stored after the first.
          setTimeout(
            () => void this.cache.invalidate(siteId, [FONTS_TAG]).catch(() => {}),
            10_000,
          ).unref();
          return this.cache.invalidate(siteId, [FONTS_TAG]);
        }),
      route: WEB_FONTS_ROUTE,
      // The addresses are the family stylesheets of the page (`familyStylesheets`).
      cssUrl: (url) => (isFontServiceCssUrl(url) ? url : null),
      label: 'Cleitext',
    });
  }

  /** A request to a font service (replaced by a fake one in tests). */
  async download(request: Parameters<HttpSend>[0]): ReturnType<HttpSend> {
    const res = await sendPublic(request.url, {
      method: 'GET',
      maxBytes: request.binary ? 5 * 1024 * 1024 : 1024 * 1024,
      timeoutMs: request.timeoutMs ?? 15_000,
      userAgent: request.userAgent ?? 'Cleitext',
    });
    if (request.binary) {
      return { status: res.status, type: res.type, text: '', base64: res.data.toString('base64') };
    }
    return { status: res.status, type: res.type, text: res.data.toString('utf8') };
  }

  /**
   * A rendered page with its web fonts as the site wants them. `tag` marks
   * a page that went without a family whose copy was not ready.
   */
  async page(
    siteId: string,
    html: string,
    mode: WebFontsMode,
    tag: (name: string) => void,
  ): Promise<string> {
    if (mode === 'theme') return html;
    try {
      const result = await rewriteWebFonts(html, {
        mode,
        resolve: (urls) => this.resolve(siteId, urls, PAGE_WAIT_MS),
      });
      if (result.missing) tag(FONTS_TAG);
      return result.text;
    } catch (error) {
      this.logger.warn(`Web fonts could not be read on a page: ${String(error)}`);
      return html;
    }
  }

  /**
   * The CSS of the theme for the block editor's canvas: its `@import`s of
   * font services become the site's copies (the admin's policy allows no
   * other origin anyway); without a copy yet, the import is left out.
   */
  async editorCss(siteId: string, css: string, mode: WebFontsMode): Promise<string> {
    if (mode !== 'local') return css;
    try {
      const result = await rewriteWebFonts(css, {
        mode,
        css: true,
        resolve: (urls) => this.resolve(siteId, urls, 1500),
      });
      return result.text;
    } catch {
      return css;
    }
  }

  /** A file of the site's copies, or null. */
  async file(siteId: string, file: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
    const served = servedFile(file);
    if (!served) return null;
    const found = await this.store().get(siteId, served.name);
    return found ? { mime: served.mime, bytes: found.bytes } : null;
  }

  private async resolve(
    siteId: string,
    urls: string[],
    waitMs: number,
  ): Promise<ReadonlyMap<string, string>> {
    const sheets = await this.fonts.sheets(siteId, urls.slice(0, 30), waitMs);
    return new Map(sheets.map((sheet) => [sheet.family, sheet.href]));
  }

  /**
   * The copies in the core's tables. Lookups share the page's transaction;
   * downloads, which may end after it, take connections of their own.
   */
  private store(): FontStore {
    const db = this.database.db;
    const own = <T>(siteId: string, fn: Parameters<typeof withContext<T>>[2]) =>
      detached(() => withContext(db, { siteId }, fn));
    return {
      async getSet(siteId, key) {
        const [row] = await withContext(db, { siteId }, (tx) =>
          tx
            .select({ css: webFontSheets.css })
            .from(webFontSheets)
            .where(and(eq(webFontSheets.siteId, siteId), eq(webFontSheets.key, key)))
            .limit(1),
        );
        return row && servedFile(row.css) ? row.css : null;
      },
      async setSet(siteId, key, css) {
        await own(siteId, (tx) =>
          tx
            .insert(webFontSheets)
            .values({ siteId, key, css })
            .onConflictDoUpdate({
              target: [webFontSheets.siteId, webFontSheets.key],
              set: { css },
            }),
        );
      },
      async existing(siteId, names) {
        if (names.length === 0) return new Set();
        const rows = await own(siteId, (tx) =>
          tx
            .select({ name: webFontFiles.name })
            .from(webFontFiles)
            .where(and(eq(webFontFiles.siteId, siteId), inArray(webFontFiles.name, names))),
        );
        return new Set(rows.map((row) => row.name));
      },
      async put(siteId, name, mime, data) {
        // Decoded by PostgreSQL.
        const bytes =
          'base64' in data
            ? sql`decode(${data.base64}, 'base64')`
            : sql`convert_to(${data.text}, 'UTF8')`;
        const size =
          'base64' in data ? base64Size(data.base64) : new TextEncoder().encode(data.text).length;
        await own(siteId, (tx) =>
          tx
            .insert(webFontFiles)
            .values({ siteId, name, mime, bytes, size })
            .onConflictDoNothing({ target: [webFontFiles.siteId, webFontFiles.name] }),
        );
      },
      async get(siteId, name) {
        const [row] = await withContext(db, { siteId }, (tx) =>
          tx
            .select({ mime: webFontFiles.mime, bytes: webFontFiles.bytes })
            .from(webFontFiles)
            .where(and(eq(webFontFiles.siteId, siteId), eq(webFontFiles.name, name)))
            .limit(1),
        );
        return row ?? null;
      },
    };
  }
}
