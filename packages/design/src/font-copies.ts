/**
 * Google Fonts kept on the site, on the server (shared by Fresco and
 * Prisma): the first time a page needs a family, its stylesheet and font
 * files are downloaded once from Google (fonts.googleapis.com and
 * fonts.gstatic.com only, with limits and timeouts), kept in the plugin's
 * own `font_files` table and served by the site at the plugin's route with
 * a long cache. Until a family's copy is ready (or when its download
 * failed: it is tried again later) pages get no link for it, never Google's.
 *
 * Each plugin has its own table (in its own schema: a plugin cannot read
 * another's) and its own route; pages never get the same family twice, as
 * the links carry the family (`fontLink`, `pageFamilies`).
 */
import type { PluginContext, PluginLogger } from '@cleitext/plugin-sdk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { customType, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  BROWSER_AGENT,
  FONT_LIMITS,
  base64Head,
  base64Size,
  cssFileUrls,
  fontFileCheck,
  fontType,
  hashName,
  isBunnyCssUrl,
  rewriteCss,
  servedFile,
  woff2Only,
} from './fonts.js';

export type HttpSend = PluginContext['http']['send'];

/** Where the copies are kept: the plugin's table and storage on the server, maps in tests. */
export interface FontStore {
  /** The stylesheet (file name) of a family's copy, by the key of its Google address. */
  getSet(siteId: string, key: string): Promise<string | null>;
  setSet(siteId: string, key: string, css: string): Promise<void>;
  /** Which of these files are kept already. */
  existing(siteId: string, names: string[]): Promise<Set<string>>;
  put(
    siteId: string,
    name: string,
    mime: string,
    data: { base64: string } | { text: string },
  ): Promise<void>;
  get(siteId: string, name: string): Promise<{ mime: string; bytes: Uint8Array } | null>;
}

/**
 * Downloads one family's stylesheet (the Google address of that family, or
 * its Bunny Fonts one) and its files, keeps them and returns the name of
 * the site's stylesheet, whose files are served under `route`. Throws,
 * keeping nothing usable, when anything is not as expected.
 */
export async function copyFamily(
  http: HttpSend,
  store: FontStore,
  siteId: string,
  url: string,
  route: string,
): Promise<string> {
  const isFile = fontFileCheck(url);
  if (!isFile) throw new Error('Not a Google Fonts or Bunny Fonts stylesheet.');
  const res = await http({ url, method: 'GET', userAgent: BROWSER_AGENT, timeoutMs: 15_000 });
  const service = isBunnyCssUrl(url) ? 'Bunny Fonts' : 'Google Fonts';
  if (res.status !== 200 || !/css/.test(res.type)) {
    throw new Error(`${service} answered ${res.status} (${res.type || 'no type'}).`);
  }
  // Bunny Fonts lists WOFF files beside the WOFF2 ones: only these are kept.
  const sheet = isBunnyCssUrl(url) ? woff2Only(res.text) : res.text;
  const files = cssFileUrls(sheet, isFile);
  if (!files) throw new Error(`The stylesheet names files outside ${service}, or too many.`);
  const names = new Map<string, string>();
  for (const file of files) {
    const ext = /\.(woff2|woff|ttf|otf)$/.exec(new URL(file).pathname)?.[1];
    if (!ext) throw new Error(`Not a font file: ${file}`);
    names.set(file, `${await hashName(file)}.${ext}`);
  }
  const kept = await store.existing(siteId, [...names.values()]);
  const missing = files.filter((file) => !kept.has(names.get(file)!));
  let total = 0;
  // A few at a time.
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (file) => {
        const name = names.get(file)!;
        const got = await http({ url: file, method: 'GET', binary: true, timeoutMs: 20_000 });
        if (got.status !== 200 || !got.base64) throw new Error(`${file} answered ${got.status}.`);
        const size = base64Size(got.base64);
        total += size;
        if (size === 0 || size > FONT_LIMITS.fileBytes || total > FONT_LIMITS.totalBytes) {
          throw new Error(`${file} is too large.`);
        }
        const type = fontType(base64Head(got.base64));
        if (!type || !name.endsWith(`.${type.ext}`)) throw new Error(`${file} is not a font.`);
        await store.put(siteId, name, type.mime, { base64: got.base64 });
      }),
    );
  }
  const css = rewriteCss(sheet, names, route);
  if (!css) throw new Error('The stylesheet could not be rewritten.');
  const cssName = `${await hashName(css)}.css`;
  await store.put(siteId, cssName, 'text/css; charset=utf-8', { text: css });
  await store.setSet(siteId, await hashName(url), cssName);
  return cssName;
}

/** Time between two attempts at a family whose download failed: 10 minutes, doubling up to 6 hours. */
export function retryDelay(attempts: number): number {
  return Math.min(10 * 60_000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60_000);
}

export interface LocalFontsOptions {
  http: HttpSend;
  store: FontStore;
  log: PluginLogger;
  /** A family's copy became ready after a page went without it: refresh the cached pages. */
  onReady(siteId: string): void | Promise<void>;
  now?: () => number;
  /** Where the plugin serves its copies, e.g. `/_prisma/gfonts`. */
  route: string;
  /** The Google address of one family as the plugin asks for it (its styles), or null. */
  cssUrl(family: string): string | null;
  /** The plugin's name, in the log. */
  label: string;
}

/** The copies of a server: what is known of each site's families, downloads under way, failures. */
export class LocalFonts {
  private readonly known = new Map<string, { css: string | null; at: number }>();
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly failures = new Map<string, { attempts: number; retryAt: number }>();
  private running = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly options: LocalFontsOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /**
   * The site's stylesheets of these families, in order, for those whose
   * copy is ready. Others are downloaded (waiting at most `waitMs` for them)
   * unless they failed lately; they are left out meanwhile.
   */
  async stylesheets(siteId: string, families: readonly string[], waitMs = 0): Promise<string[]> {
    return (await this.sheets(siteId, families, waitMs)).map((sheet) => sheet.href);
  }

  /** As `stylesheets`, with the family of each stylesheet (for `fontLink`). */
  async sheets(
    siteId: string,
    families: readonly string[],
    waitMs = 0,
  ): Promise<{ family: string; href: string }[]> {
    const lookups = await Promise.all(
      families.map(async (family) => {
        const url = this.options.cssUrl(family);
        if (!url) return null;
        const key = await hashName(url);
        const css = await this.lookup(siteId, key);
        return { family, url, key, css };
      }),
    );
    const started: Promise<unknown>[] = [];
    for (const item of lookups) {
      if (!item || item.css) continue;
      const job = this.start(siteId, item.key, item.url);
      if (job) started.push(job);
    }
    if (started.length && waitMs > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled(started),
        new Promise((resolve) => (timer = setTimeout(resolve, waitMs))),
      ]);
      clearTimeout(timer);
    }
    const out: { family: string; href: string }[] = [];
    for (const item of lookups) {
      if (!item) continue;
      const css = item.css ?? this.known.get(`${siteId}|${item.key}`)?.css ?? null;
      if (css) out.push({ family: item.family, href: `${this.options.route}/${css}` });
    }
    return out;
  }

  /** Families that failed are tried again on the next page. */
  retryNow(siteId: string): void {
    for (const id of [...this.failures.keys()]) {
      if (id.startsWith(`${siteId}|`)) this.failures.delete(id);
    }
    for (const id of [...this.known.keys()]) {
      if (id.startsWith(`${siteId}|`) && !this.known.get(id)?.css) this.known.delete(id);
    }
  }

  private async lookup(siteId: string, key: string): Promise<string | null> {
    const id = `${siteId}|${key}`;
    const hit = this.known.get(id);
    // A copy never changes; a missing one is looked for again after half a minute.
    if (hit && (hit.css || this.now() - hit.at < 30_000)) return hit.css;
    const css = await this.options.store.getSet(siteId, key).catch(() => null);
    this.known.set(id, { css, at: this.now() });
    return css;
  }

  private start(siteId: string, key: string, url: string): Promise<string | null> | null {
    const id = `${siteId}|${key}`;
    const running = this.pending.get(id);
    if (running) return running;
    const failed = this.failures.get(id);
    if (failed && failed.retryAt > this.now()) return null;
    const job = this.limit(() =>
      copyFamily(this.options.http, this.options.store, siteId, url, this.options.route),
    ).then(
      async (css) => {
        this.failures.delete(id);
        this.known.set(id, { css, at: this.now() });
        await this.options.onReady(siteId);
        return css;
      },
      (error: unknown) => {
        const attempts = (failed?.attempts ?? 0) + 1;
        this.failures.set(id, { attempts, retryAt: this.now() + retryDelay(attempts) });
        this.options.log.warn(`${this.options.label} could not keep a Google font on the site`, {
          url,
          attempts,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      },
    );
    const done = job.finally(() => this.pending.delete(id));
    this.pending.set(id, done);
    return done;
  }

  /** Two families downloaded at a time on the server. */
  private async limit<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= 2) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}

// ---- The table and the storage --------------------------------------------------------

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
});

/** The plugin's `font_files` table (each plugin creates it in a migration of its own). */
const fontFiles = pgTable('font_files', {
  siteId: uuid('site_id').notNull(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  bytes: bytea('bytes').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The copies in the plugin's `font_files` table, their stylesheets by family in its storage. */
export function databaseFonts(ctx: PluginContext): FontStore {
  const setKey = (key: string) => `gfont:${key}`;
  return {
    async getSet(siteId, key) {
      const value = await ctx.storage.get<{ css?: unknown }>(siteId, setKey(key));
      return typeof value?.css === 'string' && servedFile(value.css) ? value.css : null;
    },
    async setSet(siteId, key, css) {
      await ctx.storage.set(siteId, setKey(key), { css, at: new Date().toISOString() });
    },
    async existing(siteId, names) {
      if (names.length === 0) return new Set();
      const rows = await ctx.db.transaction(siteId, (tx) =>
        tx
          .select({ name: fontFiles.name })
          .from(fontFiles)
          .where(and(eq(fontFiles.siteId, siteId), inArray(fontFiles.name, names))),
      );
      return new Set(rows.map((row) => row.name));
    },
    async put(siteId, name, mime, data) {
      // Decoded by PostgreSQL: the bytes never need Node's Buffer here.
      const bytes =
        'base64' in data
          ? sql`decode(${data.base64}, 'base64')`
          : sql`convert_to(${data.text}, 'UTF8')`;
      const size =
        'base64' in data ? base64Size(data.base64) : new TextEncoder().encode(data.text).length;
      await ctx.db.transaction(siteId, (tx) =>
        tx
          .insert(fontFiles)
          .values({ siteId, name, mime, bytes, size })
          .onConflictDoNothing({ target: [fontFiles.siteId, fontFiles.name] }),
      );
    },
    async get(siteId, name) {
      const [row] = await ctx.db.transaction(siteId, (tx) =>
        tx
          .select({ mime: fontFiles.mime, bytes: fontFiles.bytes })
          .from(fontFiles)
          .where(and(eq(fontFiles.siteId, siteId), eq(fontFiles.name, name)))
          .limit(1),
      );
      return row ?? null;
    },
  };
}

/** The site's copies at `<route>/<name>`, cached for a year (names change with content). */
export function registerFontRoute(ctx: PluginContext, store: FontStore, route: string): void {
  ctx.routes.public({
    method: 'GET',
    path: `${route}/:file`,
    async handler(request) {
      const file = servedFile(request.params.file ?? '');
      const found = file ? await store.get(request.siteId, file.name) : null;
      if (!file || !found) return { status: 404, body: 'Not found', contentType: 'text/plain' };
      return {
        // The driver's Buffer, sent as is.
        body: found.bytes,
        contentType: file.mime,
        headers: {
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
          'access-control-allow-origin': '*',
        },
      };
    },
  });
}
