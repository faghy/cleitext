import { definePlugin } from '@cleitext/plugin-sdk';
import { sql } from 'drizzle-orm';

/**
 * Announces conversions from public routes: `/seller/buy?id=…` (inside its
 * transaction), `/seller/fail?id=…` (a transaction that rolls back),
 * `/seller/bad` (an invalid one), `/seller/refund?id=…`, and tells the
 * referral codes a request has (`/seller/whoami`).
 */
export default definePlugin({
  setup(ctx) {
    const conversion = (id: string, referrals?: Record<string, string>) => ({
      kind: 'order' as const,
      id,
      amount: '49.90',
      currency: 'eur',
      customer: { email: 'Buyer@Example.test' },
      items: [{ id: 'p1', name: 'Mug', amount: '49.90' }],
      label: `Order ${id}`,
      ...(referrals ? { referrals } : {}),
    });

    ctx.routes.public({
      method: 'GET',
      path: '/seller/buy',
      async handler(request) {
        const id = request.query.id ?? 'x';
        await ctx.db.transaction(request.siteId, async (tx) => {
          await tx.execute(sql`select 1`);
          ctx.conversions.paid(request.siteId, conversion(id, request.referrals));
        });
        return { body: { ok: true } };
      },
    });

    ctx.routes.public({
      method: 'GET',
      path: '/seller/fail',
      async handler(request) {
        try {
          await ctx.db.transaction(request.siteId, async () => {
            ctx.conversions.paid(request.siteId, conversion(request.query.id ?? 'y'));
            throw new Error('payment refused');
          });
        } catch {
          // Rolled back.
        }
        return { body: { ok: false } };
      },
    });

    ctx.routes.public({
      method: 'GET',
      path: '/seller/bad',
      handler(request) {
        ctx.conversions.paid(request.siteId, { ...conversion('bad'), amount: 'lots' });
        return { body: { ok: true } };
      },
    });

    ctx.routes.public({
      method: 'GET',
      path: '/seller/refund',
      handler(request) {
        ctx.conversions.reversed(request.siteId, {
          id: request.query.id ?? 'x',
          ...(request.query.amount ? { amount: request.query.amount } : {}),
        });
        return { body: { ok: true } };
      },
    });

    ctx.routes.public({
      method: 'GET',
      path: '/seller/whoami',
      handler(request) {
        return { body: { referrals: request.referrals ?? null, query: request.query } };
      },
    });
  },
});
