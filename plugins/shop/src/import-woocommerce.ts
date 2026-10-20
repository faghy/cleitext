import type { PluginContext } from '@cleitext/plugin-sdk';
import { saveProduct, saveProductSchema } from './products';
import { PRODUCT, syncProduct } from './sync';

/** An id of the new site; pictures that could not be downloaded keep their old reference. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/**
 * Products of a WooCommerce site, from the WordPress importer (its
 * `plugins.shop` data, plugin API 1.28): the entries exist already, here
 * their commercial data are saved. Entry references and pictures arrive
 * remapped: `entry` is the product's id, pictures are `{ id, url }` of the
 * new library.
 */
export function registerWooImport(ctx: PluginContext): void {
  ctx.hooks.filter('import.pluginData', async (result, { siteId, slug, data }) => {
    if (slug !== 'shop') return result;
    const products = (data as { products?: unknown } | null)?.products;
    if (!Array.isArray(products)) return result;
    const warnings: string[] = [...(result?.warnings ?? [])];
    let saved = 0;
    for (const raw of products as Record<string, unknown>[]) {
      const id = isId(raw.entry) ? raw.entry : null;
      if (!id) continue; // Its entry was not imported (reported by the import).
      const product = { ...(raw.product as Record<string, unknown>) };
      product.gallery = (Array.isArray(product.gallery) ? product.gallery : [])
        .filter((g): g is { id: string; caption?: string } => isId(g?.id))
        .map((g) => ({ id: g.id, caption: g.caption ?? '' }));
      const related = (list: unknown) => (Array.isArray(list) ? list : []).filter(isId);
      product.upsellIds = related(raw.upsells);
      product.crossSellIds = related(raw.crossSells);
      const variations = Array.isArray(raw.variations)
        ? (raw.variations as Record<string, unknown>[]).map(({ image, ...v }) => ({
            ...v,
            imageId: isId((image as { id?: unknown } | undefined)?.id)
              ? (image as { id: string }).id
              : null,
          }))
        : undefined;
      const parsed = saveProductSchema.safeParse({
        product,
        ...(Array.isArray(raw.attributes) ? { attributes: raw.attributes } : {}),
        ...(variations ? { variations } : {}),
      });
      if (!parsed.success) {
        warnings.push(
          `Cleishop: the data of product ${id} were not valid (${parsed.error.issues[0]?.message ?? 'invalid'}).`,
        );
        continue;
      }
      try {
        // Its row in the shop, as when a product is opened for the first time.
        const entry = await ctx.content.get(siteId, id);
        if (!entry || entry.type !== PRODUCT) continue;
        await syncProduct(ctx, siteId, entry);
        await saveProduct(ctx, siteId, id, parsed.data);
        saved++;
      } catch (error) {
        warnings.push(
          `Cleishop: product ${id} not saved: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    warnings.push(`Cleishop: prices, codes, stock and pictures of ${saved} product(s) saved.`);
    return { warnings };
  });
}
