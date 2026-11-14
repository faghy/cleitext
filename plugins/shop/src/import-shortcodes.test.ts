import { describe, expect, it } from 'vitest';
import { productsFromShortcode } from './import-shortcodes';
import { sameText } from './sync';

const attrsOf = (tag: string, attrs: Record<string, string>) =>
  productsFromShortcode(tag, attrs)?.map((b) => ({ type: b.type, attrs: b.attrs })) ?? null;

describe("WooCommerce's shortcodes on import", () => {
  it('become Products blocks', () => {
    expect(attrsOf('recent_products', { per_page: '4', columns: '2' })).toEqual([
      { type: 'shop/products', attrs: { show: 'latest', limit: 4 } },
    ]);
    expect(attrsOf('best_selling_products', {})).toEqual([
      { type: 'shop/products', attrs: { show: 'popular', limit: 8 } },
    ]);
    expect(attrsOf('product_category', { category: 'women,men', per_page: '4' })).toEqual([
      { type: 'shop/products', attrs: { show: 'latest', category: 'women', limit: 4 } },
    ]);
    expect(attrsOf('products', { on_sale: 'true', limit: '3' })![0]!.attrs.show).toBe('sale');
    expect(attrsOf('products', { visibility: 'featured' })![0]!.attrs.show).toBe('featured');
  });

  it('choose products by their codes, never by old ids', () => {
    expect(attrsOf('products', { skus: 'A-1, B-2', columns: '1' })).toEqual([
      { type: 'shop/products', attrs: { show: 'latest', skus: 'A-1, B-2', limit: 2 } },
    ]);
    expect(attrsOf('add_to_cart', { sku: 'A-1' })![0]!.attrs).toEqual({
      show: 'latest',
      skus: 'A-1',
      limit: 1,
    });
    expect(attrsOf('products', { ids: '809' })).toBeNull();
    expect(attrsOf('add_to_cart', { id: '809' })).toBeNull();
    expect(attrsOf('woocommerce_order_tracking', {})).toBeNull();
  });

  it('compares short descriptions by their words', () => {
    expect(sameText('<p>Soft <strong>notes</strong> &amp; wood</p>', 'Soft notes & wood')).toBe(
      true,
    );
    expect(sameText('<p>Soft notes</p>', 'Other notes')).toBe(false);
  });
});
