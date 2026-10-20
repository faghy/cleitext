import {
  settings,
  sites,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { CORE_SETTINGS_DEFAULTS, coreSettingsSchema, type CoreSettings } from '@cleitext/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';

const NAMESPACE = 'core';

/** Typed site settings, stored as JSON values by namespace and key. */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
    private readonly audit: AuditService,
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

  /** Maintenance mode (RF-SIT-06): visitors get a 503 page, signed-in users see the site. */
  maintenance(siteId: string): Promise<boolean> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const [site] = await tx.select({ status: sites.status }).from(sites);
      return site?.status === 'maintenance';
    });
  }

  /** Turns maintenance mode on or off, as `cleitext site:maintenance` does. */
  async setMaintenance(
    siteId: string,
    userId: string,
    enabled: boolean,
    ip: string | null,
  ): Promise<boolean> {
    const status = enabled ? 'maintenance' : 'active';
    const result = await withContext(this.database.db, { siteId, userId }, async (tx) => {
      const [site] = await tx.select({ status: sites.status }).from(sites);
      if (site && site.status !== status) {
        await tx.execute(sql`select cleitext_app_set_site_status(${status})`);
        await this.audit.record(tx, {
          siteId,
          userId,
          action: enabled ? 'site.maintenance.on' : 'site.maintenance.off',
          targetType: 'site',
          targetId: siteId,
          ip,
        });
      }
      const [after] = await tx.select({ status: sites.status }).from(sites);
      return after?.status === 'maintenance';
    });
    // Every process re-reads the site's status; no page stays cached.
    await this.cache.invalidate(siteId, ['site'], { sites: true });
    return result;
  }
}
