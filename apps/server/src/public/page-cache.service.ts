import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseClient } from '@cleitext/db';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';

export interface CachedPage {
  status: number;
  html: string;
  contentType: string;
  etag: string;
  tags: string[];
  /** Extra headers sent with the page, e.g. X-Robots-Tag. */
  headers?: Record<string, string>;
  storedAt: number;
  expiresAt: number;
  /** Compressed bodies, made on first use. */
  br?: Buffer;
  gzip?: Buffer;
}

const CHANNEL = 'cleitext_cache';

/**
 * Full-page cache for anonymous visitors (docs/ARCHITECTURE.md §15).
 *
 * Pages are tagged with what they show (`entry:<id>`, `type:article`,
 * `menus:<locale>`, `term:<id>`, `site`…). Changes invalidate the matching
 * tags; the invalidation is broadcast to every process with PostgreSQL
 * NOTIFY, so each process keeps an in-memory cache and stays consistent.
 */
@Injectable()
export class PageCacheService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('PageCache');
  /** Insertion-ordered: the first keys are the least recently used. */
  private readonly pages = new Map<string, CachedPage>();
  private readonly byTag = new Map<string, Set<string>>();
  private readonly processId = randomUUID();
  private unlisten: (() => Promise<void>) | null = null;
  private readonly siteListeners = new Set<() => void>();
  private readonly invalidateListeners = new Set<(siteId: string, tags: string[]) => void>();
  private readonly pluginListeners = new Set<() => void>();
  private readonly themeListeners = new Set<() => void>();
  readonly stats = { hits: 0, misses: 0, invalidations: 0 };

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Pages currently cached in this process. */
  get size(): number {
    return this.pages.size;
  }

  get enabled(): boolean {
    return this.config.pageCache.maxEntries > 0;
  }

  async onApplicationBootstrap(): Promise<void> {
    // Always listen: site and plugin changes travel on the same channel.
    try {
      this.unlisten = await this.database.listen(CHANNEL, (payload) =>
        this.onNotification(payload),
      );
    } catch (error) {
      // Without notifications a process could serve stale pages: disable caching.
      this.logger.error(`LISTEN failed, page cache disabled: ${String(error)}`);
      this.config.pageCache.maxEntries = 0;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.unlisten?.().catch(() => {});
  }

  key(siteId: string, host: string, pathAndQuery: string): string {
    return `${siteId}|${host.toLowerCase()}|${pathAndQuery}`;
  }

  get(key: string): CachedPage | null {
    const page = this.pages.get(key);
    if (!page) {
      this.stats.misses++;
      return null;
    }
    if (page.expiresAt <= Date.now()) {
      this.drop(key);
      this.stats.misses++;
      return null;
    }
    // Refresh recency.
    this.pages.delete(key);
    this.pages.set(key, page);
    this.stats.hits++;
    return page;
  }

  set(
    key: string,
    siteId: string,
    page: {
      status: number;
      html: string;
      contentType: string;
      tags: string[];
      headers?: Record<string, string>;
    },
  ): CachedPage {
    const ttl = page.status === 200 ? this.config.pageCache.ttlSeconds : 60;
    const entry: CachedPage = {
      ...page,
      etag: `"${createHash('sha1').update(page.html).digest('base64url')}"`,
      storedAt: Date.now(),
      expiresAt: Date.now() + ttl * 1000,
    };
    if (!this.enabled) return entry;
    this.drop(key);
    this.pages.set(key, entry);
    for (const tag of page.tags) {
      const scoped = `${siteId}:${tag}`;
      let keys = this.byTag.get(scoped);
      if (!keys) this.byTag.set(scoped, (keys = new Set()));
      keys.add(key);
    }
    while (this.pages.size > this.config.pageCache.maxEntries) {
      const oldest = this.pages.keys().next().value;
      if (oldest === undefined) break;
      this.drop(oldest);
    }
    return entry;
  }

  /**
   * Invalidates pages of a site showing any of the tags, in every process.
   * `sites: true` also tells other processes that the site's configuration
   * changed (status, domains, active plugins).
   */
  async invalidate(
    siteId: string,
    tags: string[],
    options: { sites?: boolean } = {},
  ): Promise<void> {
    if (tags.length === 0) return;
    this.invalidateLocal(siteId, tags);
    // Caches in front of Cleitext, once per change (not on NOTIFY from other processes).
    for (const listener of this.invalidateListeners) listener(siteId, [...new Set(tags)]);
    // Other processes hear it through NOTIFY; this one at once.
    if (options.sites) for (const listener of this.siteListeners) listener();
    if (!this.enabled && !options.sites) return;
    try {
      await this.database.notify(
        CHANNEL,
        JSON.stringify({
          siteId,
          tags: [...new Set(tags)],
          from: this.processId,
          ...(options.sites ? { sites: true } : {}),
        }),
      );
    } catch (error) {
      this.logger.error(`NOTIFY failed: ${String(error)}`);
    }
  }

  /** Called when this process invalidates pages of a site (the `cache.invalidated` action). */
  onInvalidate(listener: (siteId: string, tags: string[]) => void): void {
    this.invalidateListeners.add(listener);
  }

  /** Called when a site's settings changed outside this process (status, domains). */
  onSiteChange(listener: () => void): void {
    this.siteListeners.add(listener);
  }

  /** Called when plugins were installed, updated or removed (by the CLI). */
  onPluginsChange(listener: () => void): void {
    this.pluginListeners.add(listener);
  }

  /** Called when themes were installed, updated or removed (by the CLI). */
  onThemesChange(listener: () => void): void {
    this.themeListeners.add(listener);
  }

  /** Drops every cached page of this process. */
  clearLocal(): void {
    this.pages.clear();
    this.byTag.clear();
  }

  private onNotification(payload: string): void {
    try {
      const message = JSON.parse(payload) as {
        siteId?: string;
        tags?: string[];
        from?: string;
        sites?: boolean;
        plugins?: boolean;
        themes?: boolean;
      };
      if (message.plugins === true) for (const listener of this.pluginListeners) listener();
      if (message.themes === true) for (const listener of this.themeListeners) listener();
      if (message.from === this.processId) return; // already applied locally
      if (message.sites === true) for (const listener of this.siteListeners) listener();
      if (typeof message.siteId === 'string' && Array.isArray(message.tags)) {
        this.invalidateLocal(
          message.siteId,
          message.tags.filter((t) => typeof t === 'string'),
        );
      }
    } catch {
      // Ignore malformed notifications.
    }
  }

  private invalidateLocal(siteId: string, tags: string[]): void {
    this.stats.invalidations++;
    for (const tag of tags) {
      const scoped = `${siteId}:${tag}`;
      for (const key of this.byTag.get(scoped) ?? []) this.drop(key);
      this.byTag.delete(scoped);
    }
  }

  private drop(key: string): void {
    const page = this.pages.get(key);
    if (!page) return;
    this.pages.delete(key);
    const siteId = key.slice(0, key.indexOf('|'));
    for (const tag of page.tags) this.byTag.get(`${siteId}:${tag}`)?.delete(key);
  }
}
