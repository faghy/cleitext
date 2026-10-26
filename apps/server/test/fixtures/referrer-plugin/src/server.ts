import { definePlugin } from '@cleitext/plugin-sdk';

/**
 * Captures `?ref=` (marketing, 30 days) and records what it hears on
 * `globalThis.__referrerSeen`. A first listener always throws: the others
 * still run and the emitter never notices.
 */
const store = globalThis as unknown as { __referrerSeen?: unknown[] };
const seen = (store.__referrerSeen ??= []);

export default definePlugin({
  setup(ctx) {
    ctx.referrals.capture(async () => ({ param: 'ref', category: 'marketing', days: 30 }));
    ctx.hooks.on(
      'conversion.paid',
      () => {
        throw new Error('A broken listener');
      },
      { priority: 1 },
    );
    ctx.hooks.on('conversion.paid', (event, context) => {
      seen.push({ name: 'paid', event, siteId: context.siteId });
    });
    ctx.hooks.on('conversion.reversed', (event) => {
      seen.push({ name: 'reversed', event });
    });
    ctx.hooks.on('referral.visit', (event) => {
      seen.push({ name: 'visit', event });
    });
  },
});
