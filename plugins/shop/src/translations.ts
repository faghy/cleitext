/**
 * Products in several languages (with a language plugin), as shops do it:
 * the versions of a product share its prices, codes, stock, shipping data,
 * pictures, attributes and variations; titles, texts, categories, purchase
 * notes, variation descriptions and reviews stay in each language. A change
 * of the shared data goes to the whole group, and stock moves in one
 * statement for all of it, so an order in any language takes from the same
 * stock.
 *
 * A product's group is the entry first translated (`group_id`, itself
 * included once it has translations); a variation's is the variation it was
 * copied from.
 */
import type { PluginContext, PluginTransaction } from '@cleitext/plugin-sdk';
import { and, eq, inArray, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import {
  productAttributes,
  products,
  variations,
  type ProductRow,
  type VariationRow,
} from './schema';

/** What the versions of a product share. */
const SHARED = [
  'kind',
  'sku',
  'gtin',
  'condition',
  'cost',
  'listPrice',
  'regularPrice',
  'salePrice',
  'saleFrom',
  'saleTo',
  'taxStatus',
  'taxClass',
  'manageStock',
  'stock',
  'stockStatus',
  'backorders',
  'lowStock',
  'soldIndividually',
  'weight',
  'length',
  'width',
  'height',
  'shippingClass',
  'virtual',
  'downloadable',
  'gallery',
  'featured',
  'visibility',
  'totalSales',
] as const satisfies readonly (keyof ProductRow)[];

/** What the versions of a variation share: all but its description. */
const SHARED_VARIATION = [
  'position',
  'attributes',
  'enabled',
  'sku',
  'gtin',
  'cost',
  'regularPrice',
  'salePrice',
  'saleFrom',
  'saleTo',
  'manageStock',
  'stock',
  'stockStatus',
  'backorders',
  'weight',
  'length',
  'width',
  'height',
  'imageId',
  'imageUrl',
] as const satisfies readonly (keyof VariationRow)[];

const pick = <T extends object, K extends keyof T>(row: T, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, row[k]])) as Pick<T, K>;

/** The products of the group of an entry (itself included), as a condition. */
export const sameProductGroup = (entryId: string): SQL =>
  sql`coalesce(${products.groupId}, ${products.entryId}) = (SELECT coalesce(p.group_id, p.entry_id) FROM products p WHERE p.site_id = ${products.siteId} AND p.entry_id = ${entryId})`;

/** The variations of the group of a variation (itself included), as a condition. */
export const sameVariationGroup = (variationId: string): SQL =>
  sql`coalesce(${variations.groupId}, ${variations.id}) = (SELECT coalesce(v.group_id, v.id) FROM variations v WHERE v.site_id = ${variations.siteId} AND v.id = ${variationId})`;

/** Up-sells and cross-sells in a language: each product's version there, when it has one. */
async function inLocale(tx: PluginTransaction, ids: string[], locale: string): Promise<string[]> {
  if (ids.length === 0) return ids;
  const groupKey = sql<string>`coalesce(${products.groupId}, ${products.entryId})`;
  const groups = await tx
    .select({ id: products.entryId, group: groupKey })
    .from(products)
    .where(inArray(products.entryId, ids));
  const keys = [...new Set(groups.map((g) => g.group))];
  if (keys.length === 0) return ids;
  const there = await tx
    .select({ id: products.entryId, group: groupKey })
    .from(products)
    .where(and(eq(products.locale, locale), sql`${groupKey} = ANY(${sql.param(keys)}::uuid[])`));
  const byGroup = new Map(there.map((r) => [r.group, r.id]));
  const groupOf = new Map(groups.map((g) => [g.id, g.group]));
  return ids.map((id) => byGroup.get(groupOf.get(id) ?? id) ?? id);
}

/** Gives a product's variations a group (themselves), so that copies can follow them. */
async function groupVariations(tx: PluginTransaction, productId: string): Promise<VariationRow[]> {
  await tx
    .update(variations)
    .set({ groupId: sql`${variations.id}` })
    .where(and(eq(variations.productId, productId), sql`${variations.groupId} IS NULL`));
  return tx.select().from(variations).where(eq(variations.productId, productId));
}

/** Makes `target` look like `source` in everything shared (product, attributes, variations). */
async function mirror(
  tx: PluginTransaction,
  source: ProductRow,
  sourceVariations: VariationRow[],
  target: ProductRow,
  first: boolean,
): Promise<void> {
  await tx
    .update(products)
    .set({
      ...pick(source, SHARED),
      upsellIds: await inLocale(tx, source.upsellIds, target.locale),
      crossSellIds: await inLocale(tx, source.crossSellIds, target.locale),
      // The purchase note starts as the original's, then it is the translation's.
      ...(first ? { purchaseNote: source.purchaseNote } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.entryId, target.entryId));

  const attributeRows = await tx
    .select()
    .from(productAttributes)
    .where(eq(productAttributes.productId, source.entryId));
  await tx.delete(productAttributes).where(eq(productAttributes.productId, target.entryId));
  if (attributeRows.length > 0)
    await tx
      .insert(productAttributes)
      .values(attributeRows.map((a) => ({ ...a, productId: target.entryId })));

  const groups = sourceVariations.map((v) => v.groupId ?? v.id);
  await tx
    .delete(variations)
    .where(
      and(
        eq(variations.productId, target.entryId),
        groups.length > 0
          ? sql`(${variations.groupId} IS NULL OR ${notInArray(variations.groupId, groups)})`
          : undefined,
      ),
    );
  for (const v of sourceVariations) {
    const group = v.groupId ?? v.id;
    const updated = await tx
      .update(variations)
      .set(pick(v, SHARED_VARIATION))
      .where(and(eq(variations.productId, target.entryId), eq(variations.groupId, group)))
      .returning({ id: variations.id });
    if (updated.length === 0)
      await tx.insert(variations).values({
        ...pick(v, SHARED_VARIATION),
        siteId: v.siteId,
        productId: target.entryId,
        description: v.description,
        groupId: group,
      });
  }
}

/** A translation of a product: it joins the original's group, with all the shared data. */
export async function joinGroup(tx: PluginTransaction, from: string, to: string): Promise<void> {
  const [source] = await tx.select().from(products).where(eq(products.entryId, from));
  const [target] = await tx.select().from(products).where(eq(products.entryId, to));
  if (!source || !target || from === to) return;
  const group = source.groupId ?? source.entryId;
  if (!source.groupId)
    await tx.update(products).set({ groupId: group }).where(eq(products.entryId, from));
  await tx.update(products).set({ groupId: group }).where(eq(products.entryId, to));
  await mirror(tx, source, await groupVariations(tx, from), { ...target, groupId: group }, true);
}

/** After a change of a product's shared data: the same in all its versions. */
export async function shareProduct(tx: PluginTransaction, entryId: string): Promise<void> {
  const [source] = await tx.select().from(products).where(eq(products.entryId, entryId));
  if (!source?.groupId) return;
  const others = await tx
    .select()
    .from(products)
    .where(and(eq(products.groupId, source.groupId), ne(products.entryId, entryId)));
  if (others.length === 0) return;
  const own = await groupVariations(tx, entryId);
  for (const target of others) await mirror(tx, source, own, target, false);
}

/** The ids of the versions of some products (themselves included). */
export async function versionsOf(tx: PluginTransaction, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return ids;
  const rows = await tx
    .select({ id: products.entryId })
    .from(products)
    .where(
      sql`coalesce(${products.groupId}, ${products.entryId}) IN (SELECT coalesce(p.group_id, p.entry_id) FROM products p WHERE p.site_id = ${products.siteId} AND ${inArray(sql`p.entry_id`, ids)})`,
    );
  return [...new Set([...ids, ...rows.map((r) => r.id)])];
}

/**
 * Products translated before the shop kept groups: each group of
 * translations (from the language plugin) shares the data of its version
 * with the most data, the one with a price or variations.
 */
export async function groupTranslations(
  ctx: PluginContext,
  siteId: string,
  entryIds: string[],
): Promise<number> {
  let joined = 0;
  const seen = new Set<string>();
  for (const id of entryIds) {
    if (seen.has(id)) continue;
    const links = await ctx.content.translations(siteId, id).catch(() => []);
    if (links.length === 0) continue;
    const ids = [id, ...links.map((l) => l.id)];
    for (const x of ids) seen.add(x);
    await ctx.db.transaction(siteId, async (tx) => {
      const rows = await tx.select().from(products).where(inArray(products.entryId, ids));
      if (rows.length < 2 || rows.every((r) => r.groupId && r.groupId === rows[0]!.groupId)) return;
      const counts = await tx
        .select({ id: variations.productId, n: sql<number>`count(*)::int` })
        .from(variations)
        .where(inArray(variations.productId, ids))
        .groupBy(variations.productId);
      const score = (r: ProductRow) =>
        (counts.find((c) => c.id === r.entryId)?.n ?? 0) * 10 +
        (r.regularPrice !== null ? 5 : 0) +
        (r.sku ? 1 : 0);
      const source = [...rows].sort((a, b) => score(b) - score(a))[0]!;
      for (const row of rows) {
        if (row.entryId === source.entryId) continue;
        await joinGroup(tx, source.entryId, row.entryId);
        joined++;
      }
    });
  }
  return joined;
}
