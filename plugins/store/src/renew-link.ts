/**
 * The renewal link of a license (1.6.1): the product's renewal address, and
 * with Cleishop's cart link the product of the license's own plan (e.g. the
 * 10-site plan for a 10-site license), the license as the line's `ref`.
 */
import type { PluginContext } from '@cleitext/plugin-sdk';
import { eq } from 'drizzle-orm';
import { renewalProductFor, renewalUrl } from './providers';
import { variants } from './schema';

export async function renewLink(
  ctx: PluginContext,
  siteId: string,
  product: { renewUrl: string | null } | null | undefined,
  license: { id: string; seats: number; productSlug: string },
  /** The reader's language: Italian gets Cleishop's Italian cart. */
  locale?: string | null,
): Promise<string | null> {
  const base = product?.renewUrl ?? null;
  if (!base) return null;
  let cartProduct: string | null = null;
  if (/\/cart\/add\/?(\?|$)/.test(base)) {
    const rows = await ctx.db.transaction(siteId, (tx) =>
      tx.select().from(variants).where(eq(variants.productSlug, license.productSlug)),
    );
    cartProduct = renewalProductFor(rows, license.seats);
  }
  return renewalUrl(base, license.id, cartProduct, locale);
}
