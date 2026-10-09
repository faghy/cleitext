import { resolveHost, type DatabaseClient, type HostResolution } from '@cleitext/db';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../database/database.module.js';

interface CacheEntry {
  value: HostResolution | null;
  expiresAt: number;
}

/**
 * Host → site resolution (RF-SIT-05), cached in memory. Domain changes are
 * picked up within `TTL_MS`. Unknown hosts are cached briefly too.
 */
@Injectable()
export class SiteResolverService {
  private static readonly TTL_MS = 30_000;
  private static readonly NEGATIVE_TTL_MS = 5_000;
  private static readonly MAX_ENTRIES = 10_000;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  async resolve(host: string): Promise<HostResolution | null> {
    const key = host.toLowerCase();
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = await resolveHost(this.database.db, key);
    if (this.cache.size >= SiteResolverService.MAX_ENTRIES) this.cache.clear();
    this.cache.set(key, {
      value,
      expiresAt: now + (value ? SiteResolverService.TTL_MS : SiteResolverService.NEGATIVE_TTL_MS),
    });
    return value;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
