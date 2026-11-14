import { randomBytes } from 'node:crypto';
import type { CxdBlock } from '@cleitext/plugin-sdk';

/** WooCommerce's grids by their shortcode → what Cleishop's Products block shows. */
const GRIDS: Record<string, string> = {
  products: 'latest',
  recent_products: 'latest',
  featured_products: 'featured',
  sale_products: 'sale',
  best_selling_products: 'popular',
  top_rated_products: 'rated',
  product_category: 'latest',
};

const truthy = (value: string | undefined) => value === 'true' || value === '1' || value === 'yes';

/**
 * WooCommerce's product shortcodes of an imported WordPress page
 * (`import.shortcode`) → Cleishop's Products block: which products
 * (latest, featured, on sale, best sellers, top rated), how many, the
 * category, and chosen products by their codes (`skus`; the WordPress
 * importer writes the codes of `ids`). `add_to_cart` shows its product.
 * Null for other shortcodes.
 */
export function productsFromShortcode(
  tag: string,
  attrs: Record<string, string>,
): CxdBlock[] | null {
  const name = tag.toLowerCase();
  if (name === 'add_to_cart' || name === 'product') {
    const sku = (attrs.sku ?? '').trim();
    return sku ? [block({ show: 'latest', skus: sku, limit: 1 })] : null;
  }
  if (!(name in GRIDS)) return null;
  // `[products]` chooses with its own attributes.
  let show = GRIDS[name]!;
  if (name === 'products') {
    if (truthy(attrs.on_sale)) show = 'sale';
    else if (truthy(attrs.best_selling)) show = 'popular';
    else if (truthy(attrs.top_rated)) show = 'rated';
    else if (attrs.visibility === 'featured') show = 'featured';
  }
  const skus = (attrs.skus ?? attrs.sku ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Chosen by ids that have no code: not the same products, so it stays a shortcode.
  if (name === 'products' && attrs.ids && !skus.length) return null;
  const limit = Number(attrs.limit ?? attrs.per_page);
  const category = (attrs.category ?? '').split(',')[0]?.trim() ?? '';
  return [
    block({
      show,
      ...(category ? { category } : {}),
      ...(skus.length ? { skus: skus.join(', ') } : {}),
      limit: Math.min(
        48,
        Math.max(1, Number.isFinite(limit) && limit > 0 ? limit : skus.length || 8),
      ),
    }),
  ];
}

const block = (attrs: Record<string, unknown>): CxdBlock => ({
  id: `b_${randomBytes(8).toString('hex')}`,
  type: 'shop/products',
  v: 1,
  attrs,
});
