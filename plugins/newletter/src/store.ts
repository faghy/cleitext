/** The log of subscriptions, in the plugin's table (or in memory, for tests). */
import type { PluginContext } from '@cleitext/plugin-sdk';
import { desc, eq, lt } from 'drizzle-orm';
import type { ConsentRecord } from './model/form';
import { log, type LogEntry, type LogStatus } from './schema';

export interface NewLogRow {
  source: string;
  provider: string;
  status: LogStatus;
  emailHash: string;
  emailHint: string;
  listIds?: string[];
  locale: string;
  consent?: ConsentRecord | null;
  notes?: string | null;
}

export interface LogStore {
  /** Adds a line; its id. */
  add(siteId: string, row: NewLogRow): Promise<string>;
  finish(
    siteId: string,
    id: string,
    patch: { status: LogStatus; error: string | null; notes: string | null },
  ): Promise<void>;
  /** The latest first. */
  latest(siteId: string, limit: number): Promise<LogEntry[]>;
  byEmailHash(siteId: string, hash: string): Promise<LogEntry[]>;
  eraseEmailHash(siteId: string, hash: string): Promise<number>;
  olderThan(siteId: string, before: Date): Promise<number>;
  clear(siteId: string): Promise<void>;
}

const entryOf = (r: typeof log.$inferSelect): LogEntry => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  source: r.source,
  provider: r.provider,
  status: r.status as LogStatus,
  error: r.error,
  emailHint: r.emailHint,
  listIds: r.listIds,
  locale: r.locale,
  consent: r.consent ?? null,
  notes: r.notes,
});

export function databaseLogStore(ctx: Pick<PluginContext, 'db'>): LogStore {
  const run = <T>(siteId: string, work: Parameters<PluginContext['db']['transaction']>[1]) =>
    ctx.db.transaction(siteId, work) as Promise<T>;
  return {
    async add(siteId, row) {
      const [made] = await run<{ id: string }[]>(siteId, (tx) =>
        tx
          .insert(log)
          .values({
            siteId,
            source: row.source,
            provider: row.provider,
            status: row.status,
            emailHash: row.emailHash,
            emailHint: row.emailHint,
            listIds: row.listIds ?? [],
            locale: row.locale,
            consent: row.consent ?? null,
            notes: row.notes ?? null,
          })
          .returning({ id: log.id }),
      );
      return made?.id ?? '';
    },
    async finish(siteId, id, patch) {
      if (!id) return;
      await run(siteId, (tx) => tx.update(log).set(patch).where(eq(log.id, id)));
    },
    async latest(siteId, limit) {
      const rows = await run<(typeof log.$inferSelect)[]>(siteId, (tx) =>
        tx.select().from(log).orderBy(desc(log.createdAt)).limit(limit),
      );
      return rows.map(entryOf);
    },
    async byEmailHash(siteId, hash) {
      const rows = await run<(typeof log.$inferSelect)[]>(siteId, (tx) =>
        tx.select().from(log).where(eq(log.emailHash, hash)).orderBy(desc(log.createdAt)),
      );
      return rows.map(entryOf);
    },
    async eraseEmailHash(siteId, hash) {
      const gone = await run<{ id: string }[]>(siteId, (tx) =>
        tx.delete(log).where(eq(log.emailHash, hash)).returning({ id: log.id }),
      );
      return gone.length;
    },
    async olderThan(siteId, before) {
      const gone = await run<{ id: string }[]>(siteId, (tx) =>
        tx.delete(log).where(lt(log.createdAt, before)).returning({ id: log.id }),
      );
      return gone.length;
    },
    async clear(siteId) {
      await run(siteId, (tx) => tx.delete(log).where(eq(log.siteId, siteId)));
    },
  };
}
