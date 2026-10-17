import type { PluginTerm, PluginTransaction } from '@cleitext/plugin-sdk';
import { inArray, sql } from 'drizzle-orm';
import { EXPORT_COLUMNS, toCsv, type Column } from './csv';
import { listProducts, type ListQuery } from './list';
import { products, type ProductRow } from './schema';

/** Every product matching the list's filters, as CSV (WooCommerce's columns and ours). */
export async function exportProducts(
  tx: PluginTransaction,
  query: ListQuery,
  options: { categories: PluginTerm[]; brands: PluginTerm[]; lowStock: number },
): Promise<string> {
  const byId = new Map(options.categories.map((c) => [c.id, c]));
  const path = (id: string) => {
    const names: string[] = [];
    let term = byId.get(id);
    for (let depth = 0; term && depth < 20; depth++) {
      names.unshift(term.name.replace(/,/g, '\\,'));
      term = term.parentId ? byId.get(term.parentId) : undefined;
    }
    return names.join(' > ');
  };
  const brandName = new Map(options.brands.map((b) => [b.id, b.name]));
  const amount = (value: string | null) => (value === null ? '' : String(Number(value)));
  const date = (value: Date | null) =>
    value ? value.toISOString().slice(0, 19).replace('T', ' ') : '';
  const value = (row: ProductRow, column: Column): string | number | boolean | null => {
    switch (column) {
      case 'id':
        return row.entryId;
      case 'kind':
        return row.kind;
      case 'published':
        return row.status === 'published' ? 1 : row.status === 'private' ? 0 : -1;
      case 'saleFrom':
        return date(row.saleFrom);
      case 'saleTo':
        return date(row.saleTo);
      case 'inStock':
        return row.stockStatus === 'onbackorder'
          ? 'backorder'
          : row.stockStatus === 'instock'
            ? 1
            : 0;
      case 'backorders':
        return row.backorders === 'notify' ? 'notify' : row.backorders === 'yes' ? 1 : 0;
      case 'stock':
        return row.manageStock ? row.stock : null;
      case 'salePrice':
      case 'regularPrice':
      case 'cost':
      case 'listPrice':
        return amount(row[column]);
      case 'weight':
      case 'length':
      case 'width':
      case 'height':
        return amount(row[column]);
      case 'categories':
        return row.categoryIds.map(path).filter(Boolean).join(', ');
      case 'brand':
        return row.brandId ? (brandName.get(row.brandId) ?? '') : '';
      case 'images':
        return [row.imageUrl, ...row.gallery.map((g) => g.url)].filter(Boolean).join(', ');
      case 'excerpt':
      case 'description':
        return null;
      default:
        return row[column as keyof ProductRow] as string | number | boolean | null;
    }
  };

  const rows: (string | number | boolean | null)[][] = [EXPORT_COLUMNS.map((c) => c.header)];
  for (let page = 1; page < 1000; page++) {
    const list = await listProducts(tx, { ...query, page, perPage: 200 }, options);
    if (list.items.length === 0) break;
    const full = await tx
      .select()
      .from(products)
      .where(
        inArray(
          products.entryId,
          list.items.map((i) => i.id),
        ),
      );
    const order = new Map(list.items.map((item, index) => [item.id, index]));
    full.sort((a, b) => order.get(a.entryId)! - order.get(b.entryId)!);
    for (const row of full) rows.push(EXPORT_COLUMNS.map(({ column }) => value(row, column)));
    if (list.items.length < 200) break;
  }
  return toCsv(rows);
}

/** Products already in the shop, by id and by code (case-insensitive), for the import. */
export async function matchProducts(
  tx: PluginTransaction,
  ids: string[],
  skus: string[],
): Promise<{ ids: string[]; skus: Record<string, string> }> {
  const found = ids.length
    ? await tx.select({ id: products.entryId }).from(products).where(inArray(products.entryId, ids))
    : [];
  const lower = skus.map((s) => s.toLowerCase());
  const bySku = lower.length
    ? await tx
        .select({ id: products.entryId, sku: products.sku })
        .from(products)
        .where(
          sql`lower(${products.sku}) = ANY(${sql.param(lower)}::text[]) AND (${products.groupId} IS NULL OR ${products.groupId} = ${products.entryId})`,
        )
    : [];
  return {
    ids: found.map((f) => f.id),
    skus: Object.fromEntries(bySku.map((r) => [r.sku.toLowerCase(), r.id])),
  };
}
