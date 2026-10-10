import {
  settings,
  sites,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { CORE_SETTINGS_DEFAULTS, coreSettingsSchema, type CoreSettings } from '@cleitext/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';

const NAMESPACE = 'core';

/** Typed site settings, stored as JSON values by namespace and key. */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
  ) {}

  /** Core settings: stored values, defaults for missing or invalid ones. */
  async core(tx: SiteTransaction): Promise<CoreSettings> {
    const rows = await tx.select().from(settings).where(eq(settings.namespace, NAMESPACE));
    // The time zone chosen at installation, until one is set here.
    const [site] = await tx.select({ timezone: sites.timezone }).from(sites);
    const result: Record<string, unknown> = {
      ...CORE_SETTINGS_DEFAULTS,
      ...(site?.timezone ? { timezone: site.timezone } : {}),
    };
    for (const row of rows) {
      const field = coreSettingsSchema.shape[row.key as keyof CoreSettings];
      const parsed = field?.safeParse(row.value);
      if (parsed?.success) result[row.key] = parsed.data;
    }
    return result as CoreSettings;
  }

  getCore(siteId: string): Promise<CoreSettings> {
    return withContext(this.database.db, { siteId }, (tx) => this.core(tx));
  }

  /** Updates the given keys; `null` removes the value (back to the default). */
  async updateCore(
    siteId: string,
    userId: string,
    changes: Partial<CoreSettings>,
  ): Promise<CoreSettings> {
    const result = await withContext(this.database.db, { siteId, userId }, async (tx) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) continue;
        if (value === null) {
          await tx
            .delete(settings)
            .where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, key)));
          continue;
        }
        await tx
          .insert(settings)
          .values({ siteId, namespace: NAMESPACE, key, value })
          .onConflictDoUpdate({
            target: [settings.siteId, settings.namespace, settings.key],
            set: { value },
          });
      }
      return this.core(tx);
    });
    await this.cache.invalidate(siteId, ['site']);
    return result;
  }
}
