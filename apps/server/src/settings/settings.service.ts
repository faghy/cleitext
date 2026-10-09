import { settings, withContext, type DatabaseClient, type SiteTransaction } from '@cleitext/db';
import { CORE_SETTINGS_DEFAULTS, coreSettingsSchema, type CoreSettings } from '@cleitext/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';

const NAMESPACE = 'core';

/** Typed site settings, stored as JSON values by namespace and key. */
@Injectable()
export class SettingsService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  /** Core settings: stored values, defaults for missing or invalid ones. */
  async core(tx: SiteTransaction): Promise<CoreSettings> {
    const rows = await tx.select().from(settings).where(eq(settings.namespace, NAMESPACE));
    const result: Record<string, unknown> = { ...CORE_SETTINGS_DEFAULTS };
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
    return withContext(this.database.db, { siteId, userId }, async (tx) => {
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
  }
}
