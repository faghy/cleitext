/**
 * Sliders in the plugin's table (`plg_diorama.sliders`, one row per slider
 * and site, Row Level Security). Every read normalizes the data, so older
 * or imported documents come out complete.
 */
import type { PluginContext, PluginTransaction } from '@cleitext/plugin-sdk';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { aliasOf, cleanTitle, normalizeSlider } from './model/normalize';
import type { SliderData, SliderRecord, SliderSummary } from './model/types';

export const sliders = pgTable('sliders', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  title: text('title').notNull(),
  alias: text('alias').notNull(),
  data: jsonb('data').notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

type Row = typeof sliders.$inferSelect;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recordOf(row: Row): SliderRecord {
  return {
    id: row.id,
    title: row.title,
    alias: row.alias,
    data: normalizeSlider(row.data),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function coverOf(data: SliderData): string {
  const bg = data.slides[0]?.background;
  if (!bg) return '#1f2937';
  if (bg.kind === 'gradient')
    return bg.gradient.type === 'radial'
      ? `radial-gradient(circle at 50% 40%,${bg.gradient.from},${bg.gradient.to})`
      : `linear-gradient(${bg.gradient.angle}deg,${bg.gradient.from},${bg.gradient.to})`;
  return bg.color;
}

export function summaryOf(record: SliderRecord): SliderSummary {
  const first = record.data.slides.find((s) => s.background.image) ?? null;
  return {
    id: record.id,
    title: record.title,
    alias: record.alias,
    type: record.data.type,
    slides: record.data.slides.length,
    thumbnail: first?.background.image ?? null,
    cover: coverOf(record.data),
    updatedAt: record.updatedAt,
  };
}

export interface Store {
  list(siteId: string): Promise<SliderRecord[]>;
  count(siteId: string): Promise<number>;
  get(siteId: string, id: string): Promise<SliderRecord | null>;
  byAlias(siteId: string, alias: string): Promise<SliderRecord | null>;
  create(
    siteId: string,
    input: { id?: string; title: string; alias?: string; data: SliderData; userId?: string | null },
  ): Promise<SliderRecord>;
  update(
    siteId: string,
    id: string,
    input: { title?: string; alias?: string; data?: SliderData },
  ): Promise<SliderRecord | null>;
  remove(siteId: string, id: string): Promise<boolean>;
}

export function databaseStore(ctx: PluginContext): Store {
  const run = <T>(siteId: string, fn: (tx: PluginTransaction) => Promise<T>) =>
    ctx.db.transaction<T>(siteId, fn);

  /** An alias not used by another slider of the site: `home`, `home-2`… */
  async function freeAlias(siteId: string, wanted: string, except?: string): Promise<string> {
    const base = aliasOf(wanted);
    const taken = new Set(
      (
        await run(siteId, (tx) =>
          tx
            .select({ alias: sliders.alias })
            .from(sliders)
            .where(
              except
                ? and(eq(sliders.siteId, siteId), ne(sliders.id, except))
                : eq(sliders.siteId, siteId),
            ),
        )
      ).map((r) => r.alias),
    );
    let alias = base;
    for (let n = 2; taken.has(alias); n++) alias = `${base.slice(0, 56)}-${n}`;
    return alias;
  }

  return {
    async list(siteId) {
      const rows = await run(siteId, (tx) =>
        tx.select().from(sliders).where(eq(sliders.siteId, siteId)).orderBy(asc(sliders.createdAt)),
      );
      return rows.map(recordOf);
    },
    async count(siteId) {
      const [row] = await run(siteId, (tx) =>
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(sliders)
          .where(eq(sliders.siteId, siteId)),
      );
      return row?.n ?? 0;
    },
    async get(siteId, id) {
      if (!UUID.test(id)) return null;
      const [row] = await run(siteId, (tx) =>
        tx
          .select()
          .from(sliders)
          .where(and(eq(sliders.siteId, siteId), eq(sliders.id, id))),
      );
      return row ? recordOf(row) : null;
    },
    async byAlias(siteId, alias) {
      const [row] = await run(siteId, (tx) =>
        tx
          .select()
          .from(sliders)
          .where(and(eq(sliders.siteId, siteId), eq(sliders.alias, aliasOf(alias)))),
      );
      return row ? recordOf(row) : null;
    },
    async create(siteId, input) {
      const title = cleanTitle(input.title);
      const alias = await freeAlias(siteId, input.alias || title);
      const [row] = await run(siteId, (tx) =>
        tx
          .insert(sliders)
          .values({
            ...(input.id && UUID.test(input.id) ? { id: input.id } : {}),
            siteId,
            title,
            alias,
            data: normalizeSlider(input.data),
            createdBy: input.userId ?? null,
          })
          .returning(),
      );
      return recordOf(row!);
    },
    async update(siteId, id, input) {
      if (!UUID.test(id)) return null;
      const set: Partial<typeof sliders.$inferInsert> = { updatedAt: new Date() };
      if (input.title !== undefined) set.title = cleanTitle(input.title);
      if (input.alias !== undefined) set.alias = await freeAlias(siteId, input.alias, id);
      if (input.data !== undefined) set.data = normalizeSlider(input.data);
      const [row] = await run(siteId, (tx) =>
        tx
          .update(sliders)
          .set(set)
          .where(and(eq(sliders.siteId, siteId), eq(sliders.id, id)))
          .returning(),
      );
      return row ? recordOf(row) : null;
    },
    async remove(siteId, id) {
      if (!UUID.test(id)) return false;
      const rows = await run(siteId, (tx) =>
        tx
          .delete(sliders)
          .where(and(eq(sliders.siteId, siteId), eq(sliders.id, id)))
          .returning({ id: sliders.id }),
      );
      return rows.length > 0;
    },
  };
}
