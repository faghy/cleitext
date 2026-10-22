/**
 * A read-only API for other plugins (page builders' product widgets and
 * dynamic tags): a product's commercial data as a product page shows it, in
 * the page's language. Installed on `globalThis[Symbol.for('cleitext.shop')]`,
 * as Fresco installs its own; nothing here writes or reads carts.
 */
import type { PluginContext } from '@cleitext/plugin-sdk';
import { asc, eq } from 'drizzle-orm';
import { productTag } from './buy-box';
import { currentPrice, isOnSale } from './pricing';
import { attributes, attributeValues, productAttributes, products, variations } from './schema';
import { textIn } from './texts';

export interface ShopProductInfo {
  id: string;
  kind: 'simple' | 'variable';
  sku: string;
  currency: string;
  /** Simple products: the price now, and the regular one when on sale. */
  price: number | null;
  regularPrice: number | null;
  onSale: boolean;
  /** Variable products: the range of their enabled variations. */
  priceMin: number | null;
  priceMax: number | null;
  availability: 'instock' | 'low' | 'outofstock' | 'onbackorder';
  stock: number | null;
  rating: number;
  ratingCount: number;
  totalSales: number;
  /** With their units, e.g. `1.2 kg` and `20 × 10 × 5 cm`; empty when not set. */
  weight: string;
  dimensions: string;
  /** Attributes shown on the product page ("Additional information"). */
  attributes: { name: string; values: string[] }[];
  gallery: { id: string; url: string; caption: string }[];
}

export interface ShopPublicApi {
  version: 1;
  product(siteId: string, entryId: string, locale: string): Promise<ShopProductInfo | null>;
  /** Page-cache tags of a product: pages showing it refresh when it changes. */
  tags(entryId: string): string[];
}

type Settings = { currency: string; lowStock: number; weightUnit: string; dimensionUnit: string };

export function registerPublicApi(
  ctx: PluginContext,
  settings: (siteId: string) => Promise<Settings>,
): void {
  const api: ShopPublicApi = {
    version: 1,
    tags: (entryId) => [productTag(entryId)],
    async product(siteId, entryId, locale) {
      const values = await settings(siteId);
      return ctx.db.transaction(siteId, async (tx) => {
        const [product] = await tx.select().from(products).where(eq(products.entryId, entryId));
        if (!product) return null;
        const own = await tx
          .select()
          .from(productAttributes)
          .where(eq(productAttributes.productId, entryId))
          .orderBy(asc(productAttributes.position));
        const shared = own.some((a) => a.attributeId) ? await tx.select().from(attributes) : [];
        const sharedValues = shared.length ? await tx.select().from(attributeValues) : [];
        const rows =
          product.kind === 'variable'
            ? (await tx.select().from(variations).where(eq(variations.productId, entryId))).filter(
                (v) => v.enabled && currentPrice(v) !== null,
              )
            : [];
        const prices = rows.map((v) => Number(currentPrice(v)));
        const price = currentPrice(product);
        const availability =
          product.stockStatus === 'outofstock' || product.stockStatus === 'onbackorder'
            ? product.stockStatus
            : product.manageStock && (product.stock ?? 0) <= values.lowStock
              ? 'low'
              : 'instock';
        const size = [product.length, product.width, product.height].filter(
          (v) => v !== null && Number(v) > 0,
        );
        return {
          id: entryId,
          kind: product.kind,
          sku: product.sku,
          currency: values.currency,
          price: price === null ? null : Number(price),
          regularPrice: product.regularPrice === null ? null : Number(product.regularPrice),
          onSale: isOnSale(product),
          priceMin: prices.length ? Math.min(...prices) : null,
          priceMax: prices.length ? Math.max(...prices) : null,
          availability,
          stock: product.manageStock ? product.stock : null,
          rating: Number(product.rating),
          ratingCount: product.ratingCount,
          totalSales: product.totalSales,
          weight:
            product.weight !== null && Number(product.weight) > 0
              ? `${Number(product.weight)} ${values.weightUnit}`
              : '',
          dimensions:
            size.length === 3
              ? `${size.map((v) => Number(v)).join(' × ')} ${values.dimensionUnit}`
              : '',
          attributes: own
            .filter((a) => a.visible)
            .map((a) => {
              if (a.attributeId) {
                const attribute = shared.find((s) => s.id === a.attributeId);
                return {
                  name: attribute
                    ? textIn(attribute.translations, locale, 'name', attribute.name)
                    : '',
                  values: sharedValues
                    .filter((v) => v.attributeId === a.attributeId && a.values.includes(v.slug))
                    .sort((x, y) => x.position - y.position)
                    .map((v) => textIn(v.translations, locale, 'name', v.name)),
                };
              }
              return {
                name: textIn(a.translations, locale, 'name', a.name),
                values: a.values.map((v) => textIn(a.translations, locale, `value:${v}`, v)),
              };
            })
            .filter((a) => a.name && a.values.length > 0),
          gallery: product.gallery,
        };
      });
    },
  };
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('cleitext.shop')] = api;
}
