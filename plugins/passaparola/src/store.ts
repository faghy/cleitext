import type { ConversionEvent, PluginContext, PluginTransaction } from '@cleitext/plugin-sdk';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { toCents } from './model/money';
import {
  codeFrom,
  freeCode,
  reversalPlan,
  type AffiliateLite,
  type AffiliateStatus,
  type ReferralStatus,
} from './model/rules';
import { normalizeSettings, type Settings } from './model/settings';
import {
  affiliates,
  missed,
  payouts,
  referrals,
  visits,
  type AffiliateRow,
  type PayoutRow,
  type ReferralRow,
} from './schema';

/** Passaparola's data: every query of the plugin, each in its own transaction. */

const SETTINGS_KEY = 'settings';
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const lite = (row: AffiliateRow): AffiliateLite => ({
  id: row.id,
  userId: row.userId,
  email: row.email,
  code: row.code,
  status: row.status,
  rate: row.rate === null ? null : Number(row.rate),
});

export interface ApplyInput {
  userId: string;
  name: string;
  email: string;
  locale: string;
  code: string;
  website: string;
  promotion: string;
  paypalEmail: string;
  iban: string;
  status: AffiliateStatus;
}

export interface AffiliateQuery {
  status?: AffiliateStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ReferralQuery {
  status?: ReferralStatus;
  affiliateId?: string;
  source?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Money of one currency, by status. */
export type Totals = Record<string, { pending: number; approved: number; paid: number }>;

export function databaseStore(ctx: PluginContext) {
  const run = <T>(siteId: string, fn: (tx: PluginTransaction) => Promise<T>) =>
    ctx.db.transaction(siteId, fn);

  async function totalsBy(
    tx: PluginTransaction,
    where: SQL | undefined,
  ): Promise<Map<string, Totals>> {
    const rows = await tx
      .select({
        affiliateId: referrals.affiliateId,
        status: referrals.status,
        currency: referrals.currency,
        cents: sql<number>`coalesce(sum(${referrals.amountCents}), 0)::bigint`,
      })
      .from(referrals)
      .where(and(where, sql`${referrals.status} <> 'rejected'`))
      .groupBy(referrals.affiliateId, referrals.status, referrals.currency);
    const result = new Map<string, Totals>();
    for (const row of rows) {
      const totals = result.get(row.affiliateId) ?? {};
      const line = (totals[row.currency] ??= { pending: 0, approved: 0, paid: 0 });
      if (row.status !== 'rejected') line[row.status] += Number(row.cents);
      result.set(row.affiliateId, totals);
    }
    return result;
  }

  return {
    // ---- Settings ------------------------------------------------------------------------

    async settings(siteId: string): Promise<Settings> {
      return normalizeSettings(await ctx.storage.get(siteId, SETTINGS_KEY));
    },
    async saveSettings(siteId: string, input: unknown): Promise<Settings> {
      const settings = normalizeSettings(input);
      await ctx.storage.set(siteId, SETTINGS_KEY, settings);
      return settings;
    },

    // ---- Affiliates ----------------------------------------------------------------------

    async affiliateByUser(siteId: string, userId: string): Promise<AffiliateRow | null> {
      if (!UUID_RE.test(userId)) return null;
      const [row] = await run(siteId, (tx) =>
        tx.select().from(affiliates).where(eq(affiliates.userId, userId)),
      );
      return row ?? null;
    },
    async affiliateByCode(siteId: string, code: string): Promise<AffiliateRow | null> {
      const [row] = await run(siteId, (tx) =>
        tx.select().from(affiliates).where(eq(affiliates.code, code.trim().toLowerCase())),
      );
      return row ?? null;
    },
    async affiliate(siteId: string, id: string): Promise<AffiliateRow | null> {
      if (!UUID_RE.test(id)) return null;
      const [row] = await run(siteId, (tx) =>
        tx.select().from(affiliates).where(eq(affiliates.id, id)),
      );
      return row ?? null;
    },
    async codeTaken(siteId: string, code: string): Promise<boolean> {
      const [row] = await run(siteId, (tx) =>
        tx.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.code, code)),
      );
      return !!row;
    },

    /** A new affiliate, with a free code (the wanted one, or one made from the name). */
    async apply(siteId: string, input: ApplyInput): Promise<AffiliateRow> {
      return run(siteId, async (tx) => {
        const base =
          codeFrom(input.code) ||
          codeFrom(input.name) ||
          codeFrom(input.email.split('@')[0] ?? '') ||
          'partner';
        // Codes starting like this one: the free one is found among them.
        const near = await tx
          .select({ code: affiliates.code })
          .from(affiliates)
          .where(ilike(affiliates.code, `${base.slice(0, 20)}%`));
        const taken = new Set(near.map((r) => r.code));
        const code = freeCode(base, (c) => taken.has(c));
        const now = new Date();
        const [row] = await tx
          .insert(affiliates)
          .values({
            siteId,
            userId: input.userId,
            code,
            status: input.status,
            name: input.name,
            email: input.email.toLowerCase(),
            locale: input.locale,
            website: input.website,
            promotion: input.promotion,
            paypalEmail: input.paypalEmail,
            iban: input.iban,
            termsAcceptedAt: now,
            approvedAt: input.status === 'active' ? now : null,
          })
          .returning();
        return row!;
      });
    },

    async setStatus(
      siteId: string,
      id: string,
      status: AffiliateStatus,
    ): Promise<{ row: AffiliateRow; previous: AffiliateStatus } | null> {
      if (!UUID_RE.test(id)) return null;
      return run(siteId, async (tx) => {
        const [current] = await tx
          .select()
          .from(affiliates)
          .where(eq(affiliates.id, id))
          .for('update');
        if (!current) return null;
        const [row] = await tx
          .update(affiliates)
          .set({
            status,
            updatedAt: new Date(),
            ...(status === 'active' && !current.approvedAt ? { approvedAt: new Date() } : {}),
          })
          .where(eq(affiliates.id, id))
          .returning();
        return { row: row!, previous: current.status };
      });
    },

    async updateAffiliate(
      siteId: string,
      id: string,
      changes: { rate?: number | null; code?: string; note?: string },
    ): Promise<AffiliateRow | null> {
      if (!UUID_RE.test(id)) return null;
      const [row] = await run(siteId, (tx) =>
        tx
          .update(affiliates)
          .set({
            ...(changes.rate !== undefined
              ? { rate: changes.rate === null ? null : String(changes.rate) }
              : {}),
            ...(changes.code ? { code: changes.code } : {}),
            ...(changes.note !== undefined ? { note: changes.note } : {}),
            updatedAt: new Date(),
          })
          .where(eq(affiliates.id, id))
          .returning(),
      );
      return row ?? null;
    },

    async savePayoutDetails(
      siteId: string,
      id: string,
      details: { paypalEmail: string; iban: string },
    ): Promise<void> {
      await run(siteId, (tx) =>
        tx
          .update(affiliates)
          .set({ ...details, updatedAt: new Date() })
          .where(eq(affiliates.id, id)),
      );
    },

    async listAffiliates(siteId: string, query: AffiliateQuery = {}) {
      return run(siteId, async (tx) => {
        const search = query.search?.trim().replace(/[%_\\]/g, '');
        const where = and(
          query.status ? eq(affiliates.status, query.status) : undefined,
          search
            ? or(
                ilike(affiliates.name, `%${search}%`),
                ilike(affiliates.email, `%${search}%`),
                ilike(affiliates.code, `%${search}%`),
              )
            : undefined,
        );
        const rows = await tx
          .select()
          .from(affiliates)
          .where(where)
          .orderBy(desc(affiliates.createdAt))
          .limit(Math.min(query.limit ?? 50, 500))
          .offset(query.offset ?? 0);
        const [counted] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(affiliates)
          .where(where);
        const ids = rows.map((r) => r.id);
        const visitRows = ids.length
          ? await tx
              .select({
                affiliateId: visits.affiliateId,
                n: sql<number>`coalesce(sum(${visits.count}), 0)::int`,
              })
              .from(visits)
              .where(inArray(visits.affiliateId, ids))
              .groupBy(visits.affiliateId)
          : [];
        const conversionRows = ids.length
          ? await tx
              .select({
                affiliateId: referrals.affiliateId,
                n: sql<number>`count(*)::int`,
              })
              .from(referrals)
              .where(
                and(
                  inArray(referrals.affiliateId, ids),
                  eq(referrals.kind, 'conversion'),
                  sql`${referrals.status} <> 'rejected'`,
                ),
              )
              .groupBy(referrals.affiliateId)
          : [];
        const totals = ids.length
          ? await totalsBy(tx, inArray(referrals.affiliateId, ids))
          : new Map();
        return {
          total: counted?.n ?? 0,
          affiliates: rows.map((row) => ({
            ...row,
            visits: visitRows.find((v) => v.affiliateId === row.id)?.n ?? 0,
            conversions: conversionRows.find((c) => c.affiliateId === row.id)?.n ?? 0,
            totals: (totals.get(row.id) ?? {}) as Totals,
          })),
        };
      });
    },

    // ---- Visits and conversions ------------------------------------------------------------

    async recordVisit(siteId: string, affiliateId: string, day: string): Promise<void> {
      await run(siteId, (tx) =>
        tx
          .insert(visits)
          .values({ siteId, affiliateId, day, count: 1 })
          .onConflictDoUpdate({
            target: [visits.siteId, visits.affiliateId, visits.day],
            set: { count: sql`${visits.count} + 1` },
          }),
      );
    },

    async recordMissed(siteId: string, source: string, month: string): Promise<void> {
      await run(siteId, (tx) =>
        tx
          .insert(missed)
          .values({ siteId, source, month, count: 1 })
          .onConflictDoUpdate({
            target: [missed.siteId, missed.source, missed.month],
            set: { count: sql`${missed.count} + 1` },
          }),
      );
    },

    async missedCount(siteId: string, since: string): Promise<Record<string, number>> {
      const rows = await run(siteId, (tx) =>
        tx
          .select({ source: missed.source, n: sql<number>`sum(${missed.count})::int` })
          .from(missed)
          .where(gte(missed.month, since))
          .groupBy(missed.source),
      );
      return Object.fromEntries(rows.map((r) => [r.source, r.n]));
    },

    /** A conversion credited to an affiliate; null when it was already recorded. */
    async recordConversion(
      siteId: string,
      event: ConversionEvent,
      affiliateId: string,
      commission: { cents: number; currency: string },
    ): Promise<ReferralRow | null> {
      const [row] = await run(siteId, (tx) =>
        tx
          .insert(referrals)
          .values({
            siteId,
            affiliateId,
            source: event.source,
            conversionKind: event.kind,
            conversionId: event.id,
            label: event.label ?? '',
            customerEmail: event.customer.email,
            status: 'pending',
            amountCents: commission.cents,
            originalCents: commission.cents,
            currency: commission.currency,
            conversionCents: toCents(event.amount),
            convertedAt: new Date(event.at),
          })
          .onConflictDoNothing()
          .returning(),
      );
      return row ?? null;
    },

    /**
     * A refund or cancellation of a conversion: the commission shrinks or is
     * rejected; a paid one gets a negative adjustment. Null when the
     * conversion was not credited to anyone.
     */
    async reverse(
      siteId: string,
      source: string,
      conversionId: string,
      takeCents: number | null,
    ): Promise<{ referral: ReferralRow; adjustment: ReferralRow | null } | null> {
      return run(siteId, async (tx) => {
        const [current] = await tx
          .select()
          .from(referrals)
          .where(
            and(
              eq(referrals.source, source),
              eq(referrals.conversionId, conversionId),
              eq(referrals.kind, 'conversion'),
            ),
          )
          .for('update');
        if (!current) return null;
        const plan = reversalPlan(
          {
            status: current.status,
            amountCents: current.amountCents,
            originalCents: current.originalCents,
            adjustedCents: current.adjustedCents,
            conversionCents: current.conversionCents,
            reversedCents: current.reversedCents,
          },
          takeCents,
        );
        const [referral] = await tx
          .update(referrals)
          .set({
            status: plan.status,
            amountCents: plan.amountCents,
            reversedCents: plan.reversedCents,
            adjustedCents: plan.adjustedCents,
            updatedAt: new Date(),
          })
          .where(eq(referrals.id, current.id))
          .returning();
        let adjustment: ReferralRow | null = null;
        if (plan.adjustmentCents < 0) {
          [adjustment] = (await tx
            .insert(referrals)
            .values({
              siteId,
              affiliateId: current.affiliateId,
              kind: 'adjustment',
              parentId: current.id,
              source: current.source,
              conversionKind: current.conversionKind,
              conversionId: current.conversionId,
              label: current.label,
              customerEmail: current.customerEmail,
              status: 'approved',
              amountCents: plan.adjustmentCents,
              originalCents: plan.adjustmentCents,
              currency: current.currency,
              approvedAt: new Date(),
            })
            .returning()) as [ReferralRow];
        }
        return { referral: referral!, adjustment };
      });
    },

    /** Pending commissions older than the refund window become approved; how many. */
    async approveDue(siteId: string, refundDays: number, now = new Date()): Promise<number> {
      const before = new Date(now.getTime() - refundDays * 86_400_000);
      const rows = await run(siteId, (tx) =>
        tx
          .update(referrals)
          .set({ status: 'approved', approvedAt: now, updatedAt: now })
          .where(and(eq(referrals.status, 'pending'), lte(referrals.createdAt, before)))
          .returning({ id: referrals.id }),
      );
      return rows.length;
    },

    async setReferralStatus(
      siteId: string,
      id: string,
      status: 'approved' | 'rejected' | 'pending',
    ): Promise<ReferralRow | null> {
      if (!UUID_RE.test(id)) return null;
      const [row] = await run(siteId, (tx) =>
        tx
          .update(referrals)
          .set({
            status,
            updatedAt: new Date(),
            ...(status === 'approved' ? { approvedAt: new Date() } : {}),
          })
          // Paid ones stay paid.
          .where(and(eq(referrals.id, id), sql`${referrals.status} <> 'paid'`))
          .returning(),
      );
      return row ?? null;
    },

    async listReferrals(siteId: string, query: ReferralQuery = {}) {
      return run(siteId, async (tx) => {
        const where = and(
          query.status ? eq(referrals.status, query.status) : undefined,
          query.affiliateId && UUID_RE.test(query.affiliateId)
            ? eq(referrals.affiliateId, query.affiliateId)
            : undefined,
          query.source ? eq(referrals.source, query.source) : undefined,
          query.from ? gte(referrals.createdAt, new Date(`${query.from}T00:00:00Z`)) : undefined,
          query.to ? lte(referrals.createdAt, new Date(`${query.to}T23:59:59.999Z`)) : undefined,
        );
        const rows = await tx
          .select({
            referral: referrals,
            affiliate: { id: affiliates.id, name: affiliates.name, code: affiliates.code },
          })
          .from(referrals)
          .innerJoin(affiliates, eq(affiliates.id, referrals.affiliateId))
          .where(where)
          .orderBy(desc(referrals.createdAt))
          .limit(Math.min(query.limit ?? 50, 5000))
          .offset(query.offset ?? 0);
        const [counted] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(referrals)
          .where(where);
        return { total: counted?.n ?? 0, rows };
      });
    },

    // ---- Payouts -------------------------------------------------------------------------

    /** Approved commissions and adjustments not paid yet, with their affiliate. */
    async payable(siteId: string) {
      return run(siteId, async (tx) => {
        const rows = await tx
          .select({
            affiliateId: referrals.affiliateId,
            currency: referrals.currency,
            amountCents: referrals.amountCents,
          })
          .from(referrals)
          .where(and(eq(referrals.status, 'approved'), isNull(referrals.payoutId)));
        const ids = [...new Set(rows.map((r) => r.affiliateId))];
        const people = ids.length
          ? await tx.select().from(affiliates).where(inArray(affiliates.id, ids))
          : [];
        return { rows: rows.map((r) => ({ ...r, amountCents: Number(r.amountCents) })), people };
      });
    },

    /**
     * Records a payout of everything approved and not paid for an affiliate
     * in a currency; null when there is nothing to pay.
     */
    async markPaid(
      siteId: string,
      affiliateId: string,
      currency: string,
      input: { note: string; paidAt: Date },
    ): Promise<{ payout: PayoutRow; count: number } | null> {
      if (!UUID_RE.test(affiliateId)) return null;
      return run(siteId, async (tx) => {
        const [person] = await tx
          .select()
          .from(affiliates)
          .where(eq(affiliates.id, affiliateId))
          .for('update');
        if (!person) return null;
        const rows = await tx
          .select()
          .from(referrals)
          .where(
            and(
              eq(referrals.affiliateId, affiliateId),
              eq(referrals.currency, currency),
              eq(referrals.status, 'approved'),
              isNull(referrals.payoutId),
            ),
          )
          .for('update');
        const amountCents = rows.reduce((sum, r) => sum + Number(r.amountCents), 0);
        if (rows.length === 0 || amountCents <= 0) return null;
        const method = person.paypalEmail ? 'paypal' : person.iban ? 'bank' : '';
        const [payout] = await tx
          .insert(payouts)
          .values({
            siteId,
            affiliateId,
            amountCents,
            currency,
            method,
            details: person.paypalEmail || person.iban,
            note: input.note,
            paidAt: input.paidAt,
          })
          .returning();
        await tx
          .update(referrals)
          .set({ status: 'paid', payoutId: payout!.id, updatedAt: new Date() })
          .where(
            inArray(
              referrals.id,
              rows.map((r) => r.id),
            ),
          );
        return { payout: payout!, count: rows.length };
      });
    },

    async listPayouts(siteId: string, affiliateId?: string) {
      return run(siteId, (tx) =>
        tx
          .select({
            payout: payouts,
            affiliate: { id: affiliates.id, name: affiliates.name, code: affiliates.code },
          })
          .from(payouts)
          .innerJoin(affiliates, eq(affiliates.id, payouts.affiliateId))
          .where(affiliateId ? eq(payouts.affiliateId, affiliateId) : undefined)
          .orderBy(desc(payouts.paidAt))
          .limit(500),
      );
    },

    // ---- The affiliate area ----------------------------------------------------------------

    async dashboard(siteId: string, affiliateId: string) {
      return run(siteId, async (tx) => {
        const [visited] = await tx
          .select({ n: sql<number>`coalesce(sum(${visits.count}), 0)::int` })
          .from(visits)
          .where(eq(visits.affiliateId, affiliateId));
        const [converted] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(referrals)
          .where(
            and(
              eq(referrals.affiliateId, affiliateId),
              eq(referrals.kind, 'conversion'),
              sql`${referrals.status} <> 'rejected'`,
            ),
          );
        const totals = (await totalsBy(tx, eq(referrals.affiliateId, affiliateId))).get(
          affiliateId,
        );
        const latest = await tx
          .select()
          .from(referrals)
          .where(eq(referrals.affiliateId, affiliateId))
          .orderBy(desc(referrals.createdAt))
          .limit(20);
        const paid = await tx
          .select()
          .from(payouts)
          .where(eq(payouts.affiliateId, affiliateId))
          .orderBy(desc(payouts.paidAt))
          .limit(20);
        return {
          visits: visited?.n ?? 0,
          conversions: converted?.n ?? 0,
          totals: totals ?? {},
          latest,
          payouts: paid,
        };
      });
    },

    // ---- Personal data ---------------------------------------------------------------------

    async personalData(siteId: string, email: string) {
      return run(siteId, async (tx) => {
        const people = await tx.select().from(affiliates).where(eq(affiliates.email, email));
        const ids = people.map((p) => p.id);
        const paid = ids.length
          ? await tx
              .select()
              .from(payouts)
              .where(inArray(payouts.affiliateId, ids))
              .orderBy(asc(payouts.paidAt))
          : [];
        const asCustomer = await tx
          .select({ label: referrals.label, source: referrals.source, at: referrals.createdAt })
          .from(referrals)
          .where(and(eq(referrals.customerEmail, email), eq(referrals.kind, 'conversion')));
        return { people, payouts: paid, asCustomer };
      });
    },

    /**
     * Erases an email: an affiliate's details are blanked (payouts stay, as
     * accounting records, without the payment details) and the account is
     * suspended; as a customer, the email is removed from referrals.
     */
    async erase(siteId: string, email: string): Promise<{ removed: number; retained: number }> {
      return run(siteId, async (tx) => {
        const people = await tx
          .update(affiliates)
          .set({
            name: '',
            email: '',
            website: '',
            promotion: '',
            paypalEmail: '',
            iban: '',
            note: '',
            status: 'suspended',
            updatedAt: new Date(),
          })
          .where(eq(affiliates.email, email))
          .returning({ id: affiliates.id });
        const ids = people.map((p) => p.id);
        const paid = ids.length
          ? await tx
              .update(payouts)
              .set({ details: '' })
              .where(inArray(payouts.affiliateId, ids))
              .returning({ id: payouts.id })
          : [];
        const customers = await tx
          .update(referrals)
          .set({ customerEmail: '' })
          .where(eq(referrals.customerEmail, email))
          .returning({ id: referrals.id });
        return { removed: people.length + customers.length, retained: paid.length };
      });
    },
  };
}

export type Store = ReturnType<typeof databaseStore>;
