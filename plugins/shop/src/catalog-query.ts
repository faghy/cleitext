import type { PluginTerm, PluginTransaction } from '@cleitext/plugin-sdk';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { onSale, priceMax, priceMin, variationStatus, withDescendants } from './list';
import { attributes, attributeValues, productAttributes, products } from './schema';

/**
 * The public catalog (WooCommerce's shop page): published, visible products
 * of a language, filtered by category, brand, price, attributes, sale and
 * stock, sorted and paginated, with the counts the filters show.
 */

export const SORTS = [
  'default',
  'popularity',
  'rating',
  'date',
  'price',
  'price-desc',
  'title',
] as const;
export type Sort = (typeof SORTS)[number];

export interface CatalogQuery {
  locale: string;
  /** Category and brand term ids (the page's own, or chosen in the filters). */
  categoryId?: string | null;
  brandIds?: string[];
  /** As entered, e.g. 10 or 49.90. */
  minPrice?: number | null;
  maxPrice?: number | null;
  onSale?: boolean;
  inStock?: boolean;
  /** Attribute slug → value slugs (any of them). */
  attributes?: Record<string, string[]>;
  ids?: string[];
  featured?: boolean;
  sort: Sort;
  page: number;
  perPage: number;
}

export interface ProductCard {
  id: string;
  title: string;
  slug: string;
  kind: 'simple' | 'variable';
  imageUrl: string | null;
  price: string | null;
  priceMax: string | null;
  regularPrice: string | null;
  onSale: boolean;
  stockStatus: string;
  rating: number;
  ratingCount: number;
  featured: boolean;
}

export interface CatalogResult {
  cards: ProductCard[];
  total: number;
  /** Brands of the products matching the other filters, with counts. */
  brands: { id: string; count: number }[];
  /** Direct subcategories of the category (or top categories), with counts. */
  categories: { id: string; count: number }[];
  /** Values of shared attributes present in the matching products. */
  attributeFacets: { slug: string; name: string; values: { slug: string; name: string }[] }[];
  /** The lowest and highest price of the matching products, ignoring the price filter. */
  priceRange: { min: number; max: number } | null;
}

export async function queryCatalog(
  tx: PluginTransaction,
  query: CatalogQuery,
  categories: Pick<PluginTerm, 'id' | 'parentId'>[],
): Promise<CatalogResult> {
  const sharedAttributes = await tx.select().from(attributes).orderBy(asc(attributes.position));
  const bySlug = new Map(sharedAttributes.map((a) => [a.slug, a]));
  const attributeFilters = Object.entries(query.attributes ?? {}).flatMap(([slug, values]) => {
    const attribute = bySlug.get(slug);
    if (!attribute || values.length === 0) return [];
    return [
      sql`EXISTS (SELECT 1 FROM product_attributes pa WHERE pa.site_id = products.site_id
        AND pa.product_id = products.entry_id AND pa.attribute_id = ${attribute.id}
        AND pa.values && ${sql.param(values)}::text[])`,
    ];
  });
  const filters: Record<string, SQL | undefined> = {
    base: and(
      eq(products.locale, query.locale),
      eq(products.status, 'published'),
      inArray(products.visibility, ['visible', 'catalog']),
    ),
    category: query.categoryId
      ? sql`${products.categoryIds} && ${sql.param(withDescendants(query.categoryId, categories))}::uuid[]`
      : undefined,
    brand: query.brandIds?.length ? inArray(products.brandId, query.brandIds) : undefined,
    price:
      query.minPrice != null || query.maxPrice != null
        ? and(
            query.minPrice != null ? sql`${priceMax} >= ${query.minPrice}` : undefined,
            query.maxPrice != null ? sql`${priceMin} <= ${query.maxPrice}` : undefined,
          )
        : undefined,
    sale: query.onSale ? onSale : undefined,
    stock: query.inStock
      ? sql`(CASE WHEN ${products.kind} = 'variable' THEN ${variationStatus}
          ELSE ${products.stockStatus} END) <> 'outofstock'`
      : undefined,
    attributes: attributeFilters.length ? and(...attributeFilters) : undefined,
    ids: query.ids
      ? inArray(
          products.entryId,
          query.ids.length ? query.ids : ['00000000-0000-0000-0000-000000000000'],
        )
      : undefined,
    featured: query.featured ? eq(products.featured, true) : undefined,
  };
  const where = (...without: string[]) =>
    and(
      ...Object.entries(filters).flatMap(([key, value]) =>
        without.includes(key) || !value ? [] : [value],
      ),
    );

  const order: SQL[] = {
    default: [desc(products.featured), desc(products.createdAt)],
    popularity: [desc(products.totalSales)],
    rating: [desc(products.rating), desc(products.ratingCount)],
    date: [desc(products.createdAt)],
    price: [sql`${priceMin} ASC NULLS LAST`],
    'price-desc': [sql`${priceMax} DESC NULLS LAST`],
    title: [asc(products.title)],
  }[query.sort];

  const rows = await tx
    .select({ row: products, priceMin, priceMax, onSale, variationStatus })
    .from(products)
    .where(where())
    .orderBy(...order, asc(products.entryId))
    .limit(query.perPage)
    .offset((query.page - 1) * query.perPage);
  const [counted] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(where());
  const brandRows = await tx
    .select({ id: products.brandId, n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(where('brand'), sql`${products.brandId} IS NOT NULL`))
    .groupBy(products.brandId);
  const [range] = await tx
    .select({
      min: sql<string | null>`min(${priceMin})`,
      max: sql<string | null>`max(${priceMax})`,
    })
    .from(products)
    .where(where('price'));

  // Subcategories with products: each counts its own and its descendants'.
  const children = categories.filter((c) => (c.parentId ?? null) === (query.categoryId ?? null));
  const categoryCounts = await Promise.all(
    children.map(async (child) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(products)
        .where(
          and(
            where('category'),
            sql`${products.categoryIds} && ${sql.param(withDescendants(child.id, categories))}::uuid[]`,
          ),
        );
      return { id: child.id, count: row?.n ?? 0 };
    }),
  );

  // Attribute values of the matching products (ignoring that attribute's own filter).
  const attributeFacets: CatalogResult['attributeFacets'] = [];
  const used = sharedAttributes.length
    ? await tx
        .select({ attributeId: productAttributes.attributeId, values: productAttributes.values })
        .from(productAttributes)
        .innerJoin(
          products,
          and(
            eq(products.siteId, productAttributes.siteId),
            eq(products.entryId, productAttributes.productId),
          ),
        )
        .where(and(where('attributes'), eq(productAttributes.visible, true)))
    : [];
  if (used.length) {
    const values = await tx.select().from(attributeValues).orderBy(asc(attributeValues.position));
    for (const attribute of sharedAttributes) {
      const present = new Set(
        used.filter((u) => u.attributeId === attribute.id).flatMap((u) => u.values),
      );
      const list = values
        .filter((v) => v.attributeId === attribute.id && present.has(v.slug))
        .sort((a, b) =>
          attribute.sort === 'name' ? a.name.localeCompare(b.name) : a.position - b.position,
        )
        .map((v) => ({ slug: v.slug, name: v.name }));
      if (list.length)
        attributeFacets.push({ slug: attribute.slug, name: attribute.name, values: list });
    }
  }

  return {
    cards: rows.map(({ row, priceMin: min, priceMax: max, onSale: sale, variationStatus: vs }) => ({
      id: row.entryId,
      title: row.title,
      slug: row.slug,
      kind: row.kind,
      imageUrl: row.imageUrl,
      price: min,
      priceMax: max,
      regularPrice: row.regularPrice,
      onSale: Boolean(sale),
      stockStatus: row.kind === 'variable' ? (vs ?? 'outofstock') : row.stockStatus,
      rating: Number(row.rating),
      ratingCount: row.ratingCount,
      featured: row.featured,
    })),
    total: counted?.n ?? 0,
    brands: brandRows.filter((r) => r.id).map((r) => ({ id: r.id!, count: r.n })),
    categories: categoryCounts.filter((c) => c.count > 0),
    attributeFacets,
    priceRange:
      range?.min != null && range.max != null
        ? { min: Math.floor(Number(range.min)), max: Math.ceil(Number(range.max)) }
        : null,
  };
}
