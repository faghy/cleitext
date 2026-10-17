import type {
  EntryEvent,
  PluginContext,
  PluginEntry,
  PluginTransaction,
} from '@cleitext/plugin-sdk';
import { and, eq } from 'drizzle-orm';
import { copyProduct } from './products';
import { products } from './schema';
import { groupTranslations, joinGroup } from './translations';

/** Content type and taxonomies of the shop. */
export const PRODUCT = 'product';
export const CATEGORY = 'product-category';
export const BRAND = 'brand';

type Source = Pick<EntryEvent, 'id' | 'locale' | 'title' | 'slug' | 'status'> & {
  terms?: Record<string, string[]> | undefined;
  featuredMediaId?: string | null | undefined;
};

/**
 * Keeps the shop's copy of a product entry (title, status, categories,
 * brand, image) in step with the entry, creating the product's row the
 * first time. Commercial data is left alone.
 */
export async function syncProduct(
  ctx: PluginContext,
  siteId: string,
  entry: Source,
  tx?: PluginTransaction,
): Promise<void> {
  const copy: Partial<typeof products.$inferInsert> = {
    locale: entry.locale,
    title: entry.title,
    slug: entry.slug,
    status: entry.status,
    updatedAt: new Date(),
  };
  if (entry.terms) {
    copy.categoryIds = entry.terms[CATEGORY] ?? [];
    copy.brandId = entry.terms[BRAND]?.[0] ?? null;
  }
  if (entry.featuredMediaId !== undefined) {
    copy.imageId = entry.featuredMediaId;
    copy.imageUrl = entry.featuredMediaId
      ? ((await ctx.media.get(siteId, entry.featuredMediaId))?.url ?? null)
      : null;
  }
  const run = (t: PluginTransaction) =>
    t
      .insert(products)
      .values({ siteId, entryId: entry.id, ...copy })
      .onConflictDoUpdate({ target: [products.siteId, products.entryId], set: copy });
  await (tx ? run(tx) : ctx.db.transaction(siteId, run));
}

export async function forgetProduct(ctx: PluginContext, siteId: string, id: string) {
  await ctx.db.transaction(siteId, (tx) =>
    tx.delete(products).where(and(eq(products.siteId, siteId), eq(products.entryId, id))),
  );
}

/** Rows for products made before the shop was active on the site. */
export async function backfill(ctx: PluginContext, siteId: string): Promise<number> {
  const entries: PluginEntry[] = await ctx.content.find(siteId, {
    type: PRODUCT,
    status: 'any',
    limit: 200,
  });
  for (const entry of entries) await syncProduct(ctx, siteId, entry);
  await groupTranslations(
    ctx,
    siteId,
    entries.map((e) => e.id),
  );
  return entries.length;
}

/** The hooks that keep the copy up to date. */
export function watchEntries(ctx: PluginContext): void {
  const sync = ({ entry }: { entry: EntryEvent }) =>
    entry.type === PRODUCT ? syncProduct(ctx, entry.siteId, entry) : undefined;
  ctx.hooks.on('entry.created', sync);
  ctx.hooks.on('entry.saved', sync);
  ctx.hooks.on('entry.published', sync);
  ctx.hooks.on('entry.unpublished', sync);
  ctx.hooks.on('entry.trashed', sync);
  ctx.hooks.on('entry.deleted', ({ entry }) =>
    entry.type === PRODUCT ? forgetProduct(ctx, entry.siteId, entry.id) : undefined,
  );
  // A copy of a product: a translation shares the original's data, a duplicate gets a copy.
  ctx.hooks.on('entry.copied', async ({ entry, from }) => {
    if (entry.type !== PRODUCT) return;
    await syncProduct(ctx, entry.siteId, entry);
    await ctx.db.transaction(entry.siteId, (tx) =>
      entry.locale !== from.locale
        ? joinGroup(tx, from.id, entry.id)
        : copyProduct(tx, from.id, entry.id),
    );
  });
}
