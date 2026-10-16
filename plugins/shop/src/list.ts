import type { PluginTerm, PluginTransaction } from '@cleitext/plugin-sdk';
import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { CURRENT_PRICE_SQL, marginOf } from './catalog';
import { products } from './schema';

/**
 * The admin list of products (Cleito's): filters that stack — category
 * (with its subcategories) → brands present there with their counts, status,
 * stock, condition, on sale — sorting and pages.
 */

export const listQuerySchema = z.object({
  locale: z.string().max(20).optional(),
  q: z.string().trim().max(200).optional(),
  category: z.uuid().optional(),
  brand: z.uuid().optional(),
  status: z.enum(['published', 'draft', 'pending', 'private', 'scheduled', 'trashed']).optional(),
  stock: z.enum(['instock', 'outofstock', 'onbackorder', 'low']).optional(),
  condition: z.enum(['new', 'used', 'refurbished']).optional(),
  sale: z.enum(['1']).optional(),
  kind: z.enum(['simple', 'variable']).optional(),
  featured: z.enum(['1']).optional(),
  sort: z.enum(['updated', 'title', 'price', 'stock', 'sku', 'sales']).default('updated'),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(10).max(200).default(50),
});
export type ListQuery = z.output<typeof listQuerySchema>;

export interface ProductListItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  locale: string;
  kind: 'simple' | 'variable';
  sku: string;
  condition: string;
  imageUrl: string | null;
  categoryIds: string[];
  brandId: string | null;
  cost: string | null;
  listPrice: string | null;
  regularPrice: string | null;
  salePrice: string | null;
  /** What it sells for now; the range of the variations for variable products. */
  price: string | null;
  priceMax: string | null;
  onSale: boolean;
  margin: number | null;
  manageStock: boolean;
  stock: number | null;
  stockStatus: string;
  low: boolean;
  featured: boolean;
  totalSales: number;
  updatedAt: string;
}

export interface ProductList {
  items: ProductListItem[];
  total: number;
  /** Products by status, with the other filters. */
  statuses: Record<string, number>;
  /** Brands of the products matching the other filters, with their counts. */
  brands: { id: string; name: string; count: number }[];
}

/** A term and every term below it. */
export function withDescendants(
  id: string,
  terms: Pick<PluginTerm, 'id' | 'parentId'>[],
): string[] {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const term of terms) {
      if (term.parentId && result.has(term.parentId) && !result.has(term.id)) {
        result.add(term.id);
        grew = true;
      }
    }
  }
  return [...result];
}

const variationPrice = (fn: 'min' | 'max') =>
  sql.raw(`(SELECT ${fn}(${CURRENT_PRICE_SQL('v.')}) FROM variations v
    WHERE v.site_id = products.site_id AND v.product_id = products.entry_id AND v.enabled)`);
const ownPrice = sql.raw(CURRENT_PRICE_SQL('products.'));
const priceMin = sql<
  string | null
>`CASE WHEN ${products.kind} = 'variable' THEN ${variationPrice('min')} ELSE ${ownPrice} END`;
const priceMax = sql<
  string | null
>`CASE WHEN ${products.kind} = 'variable' THEN ${variationPrice('max')} ELSE ${ownPrice} END`;
const onSale = sql<boolean>`(CASE WHEN ${products.kind} = 'variable'
  THEN EXISTS (SELECT 1 FROM variations v WHERE v.site_id = products.site_id
    AND v.product_id = products.entry_id AND v.enabled
    AND ${sql.raw(CURRENT_PRICE_SQL('v.'))} < v.regular_price)
  ELSE ${ownPrice} < ${products.regularPrice} END) IS TRUE`;

export async function listProducts(
  tx: PluginTransaction,
  query: ListQuery,
  options: { categories: PluginTerm[]; brands: PluginTerm[]; lowStock: number },
): Promise<ProductList> {
  const low = sql<boolean>`(${products.manageStock} AND ${products.stock} <= coalesce(${products.lowStock}, ${options.lowStock}))`;
  const filters: Record<string, SQL | undefined> = {
    locale: query.locale ? eq(products.locale, query.locale) : undefined,
    q: query.q
      ? or(
          ilike(products.title, `%${escapeLike(query.q)}%`),
          ilike(products.sku, `%${escapeLike(query.q)}%`),
          eq(products.gtin, query.q),
        )
      : undefined,
    category: query.category
      ? sql`${products.categoryIds} && ${sql.param(withDescendants(query.category, options.categories))}::uuid[]`
      : undefined,
    brand: query.brand ? eq(products.brandId, query.brand) : undefined,
    status: query.status ? eq(products.status, query.status) : ne(products.status, 'trashed'),
    stock:
      query.stock === 'low' ? low : query.stock ? eq(products.stockStatus, query.stock) : undefined,
    condition: query.condition ? eq(products.condition, query.condition) : undefined,
    sale: query.sale ? onSale : undefined,
    kind: query.kind ? eq(products.kind, query.kind) : undefined,
    featured: query.featured ? eq(products.featured, true) : undefined,
  };
  const where = (...without: string[]) =>
    and(
      ...Object.entries(filters).flatMap(([key, value]) =>
        without.includes(key) || !value ? [] : [value],
      ),
    );

  const direction =
    (query.dir ?? (query.sort === 'title' || query.sort === 'sku' ? 'asc' : 'desc')) === 'asc'
      ? asc
      : desc;
  const order = {
    updated: products.updatedAt,
    title: products.title,
    price: priceMin,
    stock: products.stock,
    sku: products.sku,
    sales: products.totalSales,
  }[query.sort];

  const rows = await tx
    .select({ row: products, priceMin, priceMax, onSale, low })
    .from(products)
    .where(where())
    .orderBy(sql`${direction(order)} NULLS LAST`, asc(products.entryId))
    .limit(query.perPage)
    .offset((query.page - 1) * query.perPage);
  const [counted] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(where());
  const statusRows = await tx
    .select({ status: products.status, n: sql<number>`count(*)::int` })
    .from(products)
    .where(where('status'))
    .groupBy(products.status);
  const brandRows = await tx
    .select({ id: products.brandId, n: sql<number>`count(*)::int` })
    .from(products)
    .where(and(where('brand'), sql`${products.brandId} IS NOT NULL`))
    .groupBy(products.brandId);

  const brandName = new Map(options.brands.map((b) => [b.id, b.name]));
  return {
    items: rows.map(({ row, priceMin: min, priceMax: max, onSale: sale, low: isLow }) => ({
      id: row.entryId,
      title: row.title,
      slug: row.slug,
      status: row.status,
      locale: row.locale,
      kind: row.kind,
      sku: row.sku,
      condition: row.condition,
      imageUrl: row.imageUrl,
      categoryIds: row.categoryIds,
      brandId: row.brandId,
      cost: row.cost,
      listPrice: row.listPrice,
      regularPrice: row.regularPrice,
      salePrice: row.salePrice,
      price: min,
      priceMax: max,
      onSale: Boolean(sale),
      margin: row.kind === 'simple' ? marginOf(row.cost, min) : null,
      manageStock: row.manageStock,
      stock: row.stock,
      stockStatus: row.stockStatus,
      low: Boolean(isLow),
      featured: row.featured,
      totalSales: row.totalSales,
      updatedAt: row.updatedAt.toISOString(),
    })),
    total: counted?.n ?? 0,
    statuses: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
    brands: brandRows
      .filter((r) => r.id && brandName.has(r.id))
      .map((r) => ({ id: r.id!, name: brandName.get(r.id!)!, count: r.n }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
