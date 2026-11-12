import {
  definePlugin,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { cleanTiming, slotsOf, zonedDay, type Cadence } from './model/cadence';
import { rules, slots } from './server/store';

/**
 * Palinsest (official plugin): the site's editorial calendar. Rules give
 * slots (once a day, every 7 days…); a slot is written by hand, or filled
 * by a producer of another plugin (Tell me more) shortly before its time,
 * then published at that time when the rule says so. Slots can be moved
 * or removed one by one.
 */

/** How far ahead slots are placed. */
const HORIZON_DAYS = 35;
/** A producer is asked this long before the slot, so the entry is ready on time. */
const LEAD_MS = 30 * 60_000;
/** Slots older than this that were never produced are given up. */
const MISSED_MS = 6 * 3_600_000;
/** A production that has not answered by then has stopped. */
const STALE_MS = 30 * 60_000;
/** Productions started per site at each tick (each may take minutes). */
const PER_TICK = 2;
const CAPABILITY = 'manage_palinsest';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Rule = typeof rules.$inferSelect;

export default definePlugin({
  setup(ctx: PluginContext) {
    ctx.access.defineCapability(CAPABILITY, {
      label: { en: 'Manage the editorial calendar', it: 'Gestire il calendario editoriale' },
      roles: ['administrator', 'editor'],
    });

    const tx = <T>(siteId: string, fn: Parameters<typeof ctx.db.transaction<T>>[1]) =>
      ctx.db.transaction<T>(siteId, fn);

    const timeZoneOf = async (siteId: string) => (await ctx.site(siteId)).timezone || 'UTC';

    /** Slots of the enabled rules up to the horizon (existing ones are kept as they are). */
    async function place(siteId: string, only?: string): Promise<void> {
      const timeZone = await timeZoneOf(siteId);
      const today = zonedDay(new Date(), timeZone);
      const list = await tx(siteId, (t) =>
        t
          .select()
          .from(rules)
          .where(only ? eq(rules.id, only) : eq(rules.enabled, true)),
      );
      const now = Date.now();
      for (const rule of list) {
        if (!rule.enabled) continue;
        const timing = cleanTiming(
          { cadence: rule.cadence as Cadence, times: rule.times, startsOn: rule.startsOn },
          today,
        );
        const values = slotsOf(timing, today, HORIZON_DAYS, timeZone)
          .filter((d) => d.getTime() > now)
          .map((d) => ({
            siteId,
            ruleId: rule.id,
            plannedAt: d,
            at: d,
            status: 'planned',
          }));
        if (values.length === 0) continue;
        await tx(siteId, (t) => t.insert(slots).values(values).onConflictDoNothing());
      }
    }

    /** A rule changed: its future slots that nobody touched are placed again. */
    async function replace(siteId: string, ruleId: string): Promise<void> {
      await tx(siteId, (t) =>
        t
          .delete(slots)
          .where(
            and(
              eq(slots.ruleId, ruleId),
              eq(slots.status, 'planned'),
              sql`${slots.at} = ${slots.plannedAt}`,
              gte(slots.at, new Date()),
            ),
          ),
      );
      await place(siteId, ruleId);
    }

    const setSlot = (siteId: string, id: string, changes: Partial<typeof slots.$inferInsert>) =>
      tx(siteId, (t) => t.update(slots).set(changes).where(eq(slots.id, id)));

    /** One slot: the producer writes the entry, then it is published or left as a draft. */
    async function produce(siteId: string, slot: typeof slots.$inferSelect, rule: Rule) {
      try {
        if (!ctx.content.produce || !ctx.content.publish) {
          throw new Error('This version of Cleitext cannot produce entries: update it.');
        }
        const result = await ctx.content.produce(siteId, rule.producer, {
          userId: rule.authorId,
          slotAt: slot.at.toISOString(),
          type: rule.contentType,
          ...(rule.locale ? { locale: rule.locale } : {}),
        });
        if (!result) {
          await setSlot(siteId, slot.id, { status: 'empty', error: null });
          return;
        }
        await setSlot(siteId, slot.id, { status: 'draft', entryId: result.entryId, error: null });
        if (!rule.autoPublish) return;
        const entry = await ctx.content.publish(siteId, result.entryId, {
          userId: rule.authorId,
          at: slot.at.toISOString(),
        });
        await setSlot(siteId, slot.id, {
          status: entry.status === 'scheduled' ? 'scheduled' : 'published',
        });
        if (rule.withTranslations)
          await publishTranslations(siteId, result.entryId, slot.at.toISOString(), rule);
      } catch (error) {
        await setSlot(siteId, slot.id, {
          status: 'failed',
          error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        });
      }
    }

    /** The translations already made of an entry, out at the same time (drafts only). */
    async function publishTranslations(siteId: string, id: string, at: string, rule: Rule) {
      for (const link of await ctx.content.translations(siteId, id)) {
        const entry = await ctx.content.get(siteId, link.id);
        if (!entry || !['draft', 'pending'].includes(entry.status)) continue;
        try {
          await ctx.content.publish!(siteId, link.id, { userId: rule.authorId, at });
        } catch {
          // A translation that cannot be published yet stays a draft.
        }
      }
    }

    /** Every few minutes: place slots, give up old ones, start those due. */
    async function tick(siteId: string): Promise<void> {
      await place(siteId);
      const now = Date.now();
      await tx(siteId, (t) =>
        t
          .update(slots)
          .set({ status: 'failed', error: 'The production stopped without an answer.' })
          .where(and(eq(slots.status, 'producing'), lt(slots.startedAt, new Date(now - STALE_MS)))),
      );
      const due = await tx(siteId, (t) =>
        t
          .select({ slot: slots, rule: rules })
          .from(slots)
          .innerJoin(rules, eq(rules.id, slots.ruleId))
          .where(
            and(
              eq(slots.status, 'planned'),
              eq(rules.enabled, true),
              sql`${rules.producer} <> ''`,
              lte(slots.at, new Date(now + LEAD_MS)),
            ),
          )
          .orderBy(asc(slots.at))
          .limit(20),
      );
      let started = 0;
      for (const { slot, rule } of due) {
        if (slot.at.getTime() < now - MISSED_MS) {
          await setSlot(siteId, slot.id, { status: 'missed' });
          continue;
        }
        if (started >= PER_TICK) break;
        started++;
        await setSlot(siteId, slot.id, {
          status: 'producing',
          startedAt: new Date(),
        });
        // Not awaited: a producer may write for minutes, longer than a scheduled task lasts.
        void produce(siteId, slot, rule);
      }
    }

    ctx.schedule.every('tick', 5, tick);

    // ---- Routes -----------------------------------------------------------------------

    const route = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      handler: (request: RouteRequest) => Promise<RouteResponse['body']>,
    ) =>
      ctx.routes.api({
        method,
        path,
        capability: CAPABILITY,
        handler: async (request) => {
          try {
            return { body: await handler(request) };
          } catch (error) {
            if (error instanceof HttpError) {
              return { status: error.status, body: { error: error.message } };
            }
            throw error;
          }
        },
      });

    const body = (request: RouteRequest) => (request.body ?? {}) as Record<string, unknown>;
    const idOf = (request: RouteRequest) => {
      const id = request.params.id ?? '';
      if (!UUID_RE.test(id)) throw new HttpError(404, 'Not found.');
      return id;
    };
    const text = (value: unknown, max: number) =>
      typeof value === 'string' ? value.trim().slice(0, max) : '';

    /** A rule from the admin's form, checked. */
    async function ruleValues(request: RouteRequest) {
      const b = body(request);
      const timeZone = await timeZoneOf(request.siteId);
      const timing = cleanTiming(
        {
          cadence: b.cadence as Cadence,
          times: Array.isArray(b.times) ? (b.times as string[]) : [],
          startsOn: typeof b.startsOn === 'string' ? b.startsOn : '',
        },
        zonedDay(new Date(), timeZone),
      );
      const producer = text(b.producer, 100);
      if (producer) {
        const known = (await ctx.content.producers?.(request.siteId)) ?? [];
        if (!known.some((p) => p.id === producer)) {
          throw new HttpError(400, 'That service is not active on this site.');
        }
      }
      const site = await ctx.site(request.siteId);
      const locale = text(b.locale, 20);
      return {
        name: text(b.name, 120) || 'Palinsest',
        cadence: timing.cadence,
        times: timing.times,
        startsOn: timing.startsOn,
        producer,
        contentType: text(b.contentType, 60) || 'article',
        locale: locale && site.locales.includes(locale) ? locale : null,
        autoPublish: b.autoPublish === true && producer !== '',
        withTranslations: b.withTranslations === true,
        enabled: b.enabled !== false,
      };
    }

    // The week (or any range) of the calendar: rules, slots and the services that fill them.
    route('GET', '/state', async (request) => {
      const siteId = request.siteId;
      const from = Date.parse(String(request.query.from ?? ''));
      const to = Date.parse(String(request.query.to ?? ''));
      const start = Number.isNaN(from) ? Date.now() - 86_400_000 : from;
      const end = Number.isNaN(to) ? start + 8 * 86_400_000 : Math.min(to, start + 62 * 86_400_000);
      await place(siteId);
      const [list, inRange, site] = await Promise.all([
        tx(siteId, (t) => t.select().from(rules).orderBy(asc(rules.createdAt))),
        tx(siteId, (t) =>
          t
            .select()
            .from(slots)
            .where(and(gte(slots.at, new Date(start)), lt(slots.at, new Date(end))))
            .orderBy(asc(slots.at)),
        ),
        ctx.site(siteId),
      ]);
      // The titles of the entries of the slots.
      const ids = inRange.map((s) => s.entryId).filter((id): id is string => Boolean(id));
      const entries = ids.length
        ? await ctx.content.find(siteId, { ids, status: 'any', limit: ids.length })
        : [];
      return {
        rules: list,
        slots: inRange.map((s) => ({
          ...s,
          entry: entries.find((e) => e.id === s.entryId)
            ? { id: s.entryId, title: entries.find((e) => e.id === s.entryId)!.title }
            : null,
        })),
        producers: (await ctx.content.producers?.(siteId)) ?? [],
        supported: Boolean(ctx.content.produce && ctx.content.publish),
        timeZone: site.timezone || 'UTC',
        locales: site.locales,
        defaultLocale: site.defaultLocale,
      };
    });

    route('POST', '/rules', async (request) => {
      const values = await ruleValues(request);
      const [rule] = await tx(request.siteId, (t) =>
        t
          .insert(rules)
          .values({ siteId: request.siteId, authorId: request.user!.id, ...values })
          .returning(),
      );
      await place(request.siteId, rule!.id);
      return rule!;
    });

    route('PUT', '/rules/:id', async (request) => {
      const id = idOf(request);
      const values = await ruleValues(request);
      // Whoever saves the rule becomes the one its entries are written and published as.
      const [rule] = await tx(request.siteId, (t) =>
        t
          .update(rules)
          .set({ ...values, authorId: request.user!.id, updatedAt: new Date() })
          .where(eq(rules.id, id))
          .returning(),
      );
      if (!rule) throw new HttpError(404, 'Not found.');
      await replace(request.siteId, id);
      return rule;
    });

    route('DELETE', '/rules/:id', async (request) => {
      const id = idOf(request);
      // Its entries stay; the slots go with it.
      await tx(request.siteId, (t) => t.delete(rules).where(eq(rules.id, id)));
      return { ok: true };
    });

    // A slot moved, removed (skipped) or put back.
    route('PATCH', '/slots/:id', async (request) => {
      const id = idOf(request);
      const b = body(request);
      const [slot] = await tx(request.siteId, (t) =>
        t.select().from(slots).where(eq(slots.id, id)),
      );
      if (!slot) throw new HttpError(404, 'Not found.');
      const changes: Partial<typeof slots.$inferInsert> = {};
      if (typeof b.at === 'string') {
        const at = Date.parse(b.at);
        if (Number.isNaN(at) || at < Date.now()) {
          throw new HttpError(400, 'Choose a time in the future.');
        }
        if (slot.status !== 'planned') {
          throw new HttpError(409, 'Only slots not written yet can be moved.');
        }
        changes.at = new Date(at);
      }
      if (b.status === 'skipped' || b.status === 'planned') {
        if (b.status === 'skipped' && slot.status !== 'planned') {
          throw new HttpError(409, 'Only slots not written yet can be removed.');
        }
        if (
          b.status === 'planned' &&
          !['skipped', 'failed', 'empty', 'missed'].includes(slot.status)
        ) {
          throw new HttpError(409, 'This slot is already in the calendar.');
        }
        changes.status = b.status;
        changes.error = null;
      }
      const [saved] = await tx(request.siteId, (t) =>
        t.update(slots).set(changes).where(eq(slots.id, id)).returning(),
      );
      return saved!;
    });

    // "Write it now": the slot's producer, without waiting for its time.
    route('POST', '/slots/:id/produce', async (request) => {
      const id = idOf(request);
      const [row] = await tx(request.siteId, (t) =>
        t
          .select({ slot: slots, rule: rules })
          .from(slots)
          .innerJoin(rules, eq(rules.id, slots.ruleId))
          .where(eq(slots.id, id)),
      );
      if (!row) throw new HttpError(404, 'Not found.');
      if (!row.rule.producer) throw new HttpError(400, 'This slot is written by hand.');
      if (!['planned', 'failed', 'empty', 'missed'].includes(row.slot.status)) {
        throw new HttpError(409, 'This slot is already written.');
      }
      await setSlot(request.siteId, id, {
        status: 'producing',
        startedAt: new Date(),
        error: null,
      });
      // A slot written late comes out now (publishing in the past is publishing now).
      const at = row.slot.at.getTime() > Date.now() ? row.slot.at : new Date();
      void produce(request.siteId, { ...row.slot, at }, row.rule);
      return { ok: true };
    });
  },
});
