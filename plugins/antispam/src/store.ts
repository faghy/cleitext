/**
 * The plugin's tables: fingerprints of texts, senders of spam (salted
 * hashes), the queue and the statistics. Every function takes the site.
 */
import type { PluginContext } from '@cleitext/plugin-sdk';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Outcome, Stats } from './options';
import { fingerprints, queue, senders, stats, type Summary } from './schema';

type Db = PluginContext['db'];

/** What the site knows of a text: how often it came in the last day, and what people decided. */
export async function textFacts(
  db: Db,
  siteId: string,
  hash: string,
): Promise<{ seen: number; spam: number; ham: number }> {
  const [row] = await db.transaction(siteId, (tx) =>
    tx
      .select({
        seen: sql<number>`CASE WHEN ${fingerprints.windowStart} > now() - interval '1 day' THEN ${fingerprints.seen} ELSE 0 END`,
        spam: fingerprints.spam,
        ham: fingerprints.ham,
      })
      .from(fingerprints)
      .where(eq(fingerprints.hash, hash)),
  );
  return row
    ? { seen: Number(row.seen), spam: row.spam, ham: row.ham }
    : { seen: 0, spam: 0, ham: 0 };
}

/** One more time this text came (a day's window). */
export async function sawText(db: Db, siteId: string, hash: string): Promise<void> {
  await db.transaction(siteId, (tx) =>
    tx
      .insert(fingerprints)
      .values({ siteId, hash, seen: 1 })
      .onConflictDoUpdate({
        target: [fingerprints.siteId, fingerprints.hash],
        set: {
          seen: sql`CASE WHEN ${fingerprints.windowStart} > now() - interval '1 day' THEN ${fingerprints.seen} + 1 ELSE 1 END`,
          windowStart: sql`CASE WHEN ${fingerprints.windowStart} > now() - interval '1 day' THEN ${fingerprints.windowStart} ELSE now() END`,
          lastSeen: sql`now()`,
        },
      }),
  );
}

/** Spam sent before from this address (hash), within the days kept. */
export async function senderSpam(
  db: Db,
  siteId: string,
  hash: string,
  days: number,
): Promise<number> {
  const [row] = await db.transaction(siteId, (tx) =>
    tx
      .select({ spam: senders.spam })
      .from(senders)
      .where(
        and(
          eq(senders.hash, hash),
          gte(senders.lastSeen, sql`now() - make_interval(days => ${days})`),
        ),
      ),
  );
  return row?.spam ?? 0;
}

/**
 * A decision about a text and its sender: spam adds to both; not spam
 * marks the text as good and forgets the sender's past spam.
 */
export async function learn(
  db: Db,
  siteId: string,
  input: { fingerprint?: string | null; ipHash?: string | null },
  verdict: 'spam' | 'ham',
): Promise<void> {
  await db.transaction(siteId, async (tx) => {
    if (input.fingerprint) {
      const column = verdict === 'spam' ? fingerprints.spam : fingerprints.ham;
      await tx
        .insert(fingerprints)
        .values({ siteId, hash: input.fingerprint, [verdict]: 1 })
        .onConflictDoUpdate({
          target: [fingerprints.siteId, fingerprints.hash],
          set: { [verdict]: sql`${column} + 1`, lastSeen: sql`now()` },
        });
    }
    if (input.ipHash) {
      if (verdict === 'spam')
        await tx
          .insert(senders)
          .values({ siteId, hash: input.ipHash, spam: 1 })
          .onConflictDoUpdate({
            target: [senders.siteId, senders.hash],
            set: { spam: sql`${senders.spam} + 1`, lastSeen: sql`now()` },
          });
      else await tx.delete(senders).where(eq(senders.hash, input.ipHash));
    }
  });
}

/** Counts a blocked submission for the statistics: once in total, once per reason. */
export async function count(
  db: Db,
  siteId: string,
  outcome: Outcome,
  reasons: string[],
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await db.transaction(siteId, async (tx) => {
    for (const reason of ['*', ...new Set(reasons)]) {
      await tx
        .insert(stats)
        .values({ siteId, day, outcome, reason, n: 1 })
        .onConflictDoUpdate({
          target: [stats.siteId, stats.day, stats.outcome, stats.reason],
          set: { n: sql`${stats.n} + 1` },
        });
    }
  });
}

/** The statistics of the last `days` days, the oldest day first. */
export async function readStats(db: Db, siteId: string, days: number): Promise<Stats> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.transaction(siteId, (tx) =>
    tx.select().from(stats).where(gte(stats.day, since)),
  );
  const byDay = new Map<string, Stats['days'][number]>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(day, { day, held: 0, refused: 0, rejected: 0, challenged: 0 });
  }
  const reasons = new Map<string, number>();
  for (const row of rows) {
    if (row.reason === '*') {
      const day = byDay.get(row.day);
      if (day && row.outcome in day) day[row.outcome as 'held'] += row.n;
    } else reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + row.n);
  }
  return {
    days: [...byDay.values()],
    reasons: [...reasons]
      .map(([reason, n]) => ({ reason, n }))
      .sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason)),
  };
}

export interface NewQueueItem {
  kind: 'comment' | 'form' | 'refused';
  form: string;
  ref?: string | null;
  locale: string;
  fields?: Record<string, unknown> | null;
  summary: Summary;
  score: number;
  reasons: string[];
  ipHash: string | null;
  fingerprint: string | null;
}

export async function enqueue(db: Db, siteId: string, item: NewQueueItem): Promise<void> {
  await db.transaction(siteId, (tx) =>
    tx.insert(queue).values({
      siteId,
      kind: item.kind,
      form: item.form,
      ref: item.ref ?? null,
      locale: item.locale,
      fields: item.fields ?? null,
      summary: item.summary,
      score: item.score,
      reasons: item.reasons,
      ipHash: item.ipHash,
      fingerprint: item.fingerprint,
    }),
  );
}

export async function queueRows(db: Db, siteId: string, limit = 500) {
  return db.transaction(siteId, (tx) =>
    tx.select().from(queue).orderBy(desc(queue.createdAt)).limit(limit),
  );
}

export async function rowsById(db: Db, siteId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.transaction(siteId, (tx) => tx.select().from(queue).where(inArray(queue.id, ids)));
}

export async function rowsByRef(db: Db, siteId: string, refs: string[]) {
  if (refs.length === 0) return [];
  return db.transaction(siteId, (tx) => tx.select().from(queue).where(inArray(queue.ref, refs)));
}

export async function removeRows(db: Db, siteId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction(siteId, (tx) => tx.delete(queue).where(inArray(queue.id, ids)));
}

export async function removeAllRows(db: Db, siteId: string): Promise<void> {
  await db.transaction(siteId, (tx) => tx.delete(queue));
}

/** Forgets what is older than the days kept: queue, senders; old fingerprints and statistics. */
export async function purge(db: Db, siteId: string, days: number): Promise<void> {
  const cutoff = sql`now() - make_interval(days => ${days})`;
  await db.transaction(siteId, async (tx) => {
    await tx.delete(queue).where(lt(queue.createdAt, cutoff));
    await tx.delete(senders).where(lt(senders.lastSeen, cutoff));
    await tx
      .delete(fingerprints)
      .where(lt(fingerprints.lastSeen, sql`now() - interval '180 days'`));
    await tx
      .delete(stats)
      .where(lt(stats.day, new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)));
  });
}

/** Queue items sent with an email address (GDPR requests). */
export async function rowsByEmail(db: Db, siteId: string, email: string) {
  return db.transaction(siteId, (tx) =>
    tx
      .select()
      .from(queue)
      .where(sql`lower(${queue.summary}->>'email') = ${email.trim().toLowerCase()}`)
      .orderBy(desc(queue.createdAt)),
  );
}
