/**
 * WooCommerce products → Cleishop. The products become entries of Cleishop's
 * `product` type (title, description, short description, picture,
 * categories, brand, old address); their commercial data go to Cleishop as
 * its plugin data (`plugins.shop`, plugin API 1.28): prices, SKU, stock,
 * sizes, gallery, attributes and variations, related products. Cleishop saves
 * them when it is active; otherwise the import reports them as not taken.
 */
import { metaValue } from './php.js';

type Node = Record<string, unknown>;

/** WooCommerce taxonomies → Cleishop's (brands of WooCommerce 9.6 and of common plugins). */
export const WOO_TAXONOMIES: Record<string, string> = {
  product_cat: 'product-category',
  product_brand: 'brand',
  'pwb-brand': 'brand',
  yith_product_brand: 'brand',
};

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    const node = value as Node;
    return '#text' in node ? String(node['#text']) : '';
  }
  return String(value).trim();
}

function meta(item: Node, key: string): string | undefined {
  const entry = ((item['wp:postmeta'] as Node[] | undefined) ?? []).find(
    (m) => text(m['wp:meta_key']) === key,
  );
  return entry ? text(entry['wp:meta_value']) : undefined;
}

const number = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const yes = (value: string | undefined) => value === 'yes';
/** A sale date of WooCommerce (a Unix timestamp) as ISO. */
const timestamp = (value: string | undefined): string | null => {
  const n = number(value);
  return n && n > 0 ? new Date(n * 1000).toISOString() : null;
};
const STOCK = new Set(['instock', 'outofstock', 'onbackorder']);
const BACKORDERS = new Set(['no', 'notify', 'yes']);
const TAX = new Set(['taxable', 'shipping', 'none']);

/** Attribute names: `pa_colour` → "Colour". */
const attributeLabel = (taxonomy: string) => {
  const bare = taxonomy.replace(/^pa_/, '').replace(/[-_]+/g, ' ');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
};

export interface WooContext {
  locale: string;
  /** WordPress attachment id → media ref. */
  attachmentRefs: Map<number, string>;
  /** Media ref → its address (media objects in plugin data carry it). */
  attachmentUrl: (ref: string) => string | undefined;
  /** WordPress post id → entry ref. */
  entryRef: (id: number) => string;
  /** Names of the terms of attribute taxonomies (`pa_colour:red` → "Red"). */
  termNames: Map<string, string>;
}

/** The commercial data of one product, for Cleishop's import. */
export function wooProduct(
  item: Node,
  ref: string,
  variations: Node[],
  ctx: WooContext,
): Record<string, unknown> {
  const categories = ((item.category as Node[] | undefined) ?? []).map((c) => ({
    domain: String(c['@_domain'] ?? ''),
    slug: String(c['@_nicename'] ?? ''),
  }));
  const kind = categories.find((c) => c.domain === 'product_type')?.slug ?? 'simple';
  const visibility = new Set(
    categories.filter((c) => c.domain === 'product_visibility').map((c) => c.slug),
  );
  const media = (id: number) => {
    const mediaRef = ctx.attachmentRefs.get(id);
    const url = mediaRef ? ctx.attachmentUrl(mediaRef) : undefined;
    return mediaRef && url ? { id: mediaRef, url } : null;
  };
  const gallery = (meta(item, '_product_image_gallery') ?? '')
    .split(',')
    .map((id) => media(Number(id)))
    .filter((m): m is { id: string; url: string } => m !== null)
    .map((m) => ({ ...m, caption: '' }));
  const related = (key: string) => {
    const value = metaValue(meta(item, key));
    const ids = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? Object.values(value)
        : [];
    return ids
      .map((id) => Number(id))
      .filter((id) => id > 0)
      .map((id) => ({ $entry: ctx.entryRef(id) }));
  };
  const stockStatus = meta(item, '_stock_status') ?? 'instock';
  const backorders = meta(item, '_backorders') ?? 'no';
  const taxStatus = meta(item, '_tax_status') ?? 'taxable';
  const product: Record<string, unknown> = {
    kind: kind === 'variable' ? 'variable' : 'simple',
    sku: meta(item, '_sku') ?? '',
    ...(/^(\d{8}|\d{12,14})$/.test(meta(item, '_global_unique_id') ?? '')
      ? { gtin: meta(item, '_global_unique_id') }
      : {}),
    regularPrice: meta(item, '_regular_price') || null,
    salePrice: meta(item, '_sale_price') || null,
    saleFrom: timestamp(meta(item, '_sale_price_dates_from')),
    saleTo: timestamp(meta(item, '_sale_price_dates_to')),
    manageStock: yes(meta(item, '_manage_stock')),
    stock: number(meta(item, '_stock')) === null ? null : Math.round(number(meta(item, '_stock'))!),
    stockStatus: STOCK.has(stockStatus) ? stockStatus : 'instock',
    backorders: BACKORDERS.has(backorders) ? backorders : 'no',
    lowStock: number(meta(item, '_low_stock_amount')),
    soldIndividually: yes(meta(item, '_sold_individually')),
    taxStatus: TAX.has(taxStatus) ? taxStatus : 'taxable',
    taxClass: meta(item, '_tax_class') ?? '',
    weight: number(meta(item, '_weight')),
    length: number(meta(item, '_length')),
    width: number(meta(item, '_width')),
    height: number(meta(item, '_height')),
    virtual: yes(meta(item, '_virtual')),
    downloadable: yes(meta(item, '_downloadable')),
    purchaseNote: meta(item, '_purchase_note') ?? '',
    featured: visibility.has('featured'),
    visibility:
      visibility.has('exclude-from-catalog') && visibility.has('exclude-from-search')
        ? 'hidden'
        : visibility.has('exclude-from-catalog')
          ? 'search'
          : visibility.has('exclude-from-search')
            ? 'catalog'
            : 'visible',
    gallery,
  };
  if (product.salePrice === product.regularPrice) product.salePrice = null;
  if (product.lowStock !== null) product.lowStock = Math.round(product.lowStock as number);

  // Attributes: global ones (pa_…) with their term names, and the product's own.
  const attributes: Record<string, unknown>[] = [];
  const names = new Map<string, string>();
  const raw = metaValue(meta(item, '_product_attributes'));
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const a = value as Record<string, unknown>;
      const taxonomy = Number(a.is_taxonomy) === 1;
      const name = taxonomy ? attributeLabel(String(a.name ?? key)) : String(a.name ?? key);
      const values = taxonomy
        ? categories
            .filter((c) => c.domain === String(a.name ?? key))
            .map((c) => ctx.termNames.get(`${c.domain}:${c.slug}`) ?? c.slug)
        : String(a.value ?? '')
            .split('|')
            .map((v) => v.trim())
            .filter(Boolean);
      if (!name.trim() || values.length === 0) continue;
      names.set(key, name);
      attributes.push({
        name,
        values,
        visible: Number(a.is_visible ?? 1) === 1,
        variation: Number(a.is_variation ?? 0) === 1,
      });
    }
  }

  // Variations: their attribute values, prices, code, stock and picture.
  const ownVariations = variations.map((v) => {
    const values: Record<string, string> = {};
    for (const m of (v['wp:postmeta'] as Node[] | undefined) ?? []) {
      const key = text(m['wp:meta_key']);
      if (!key.startsWith('attribute_')) continue;
      const attribute = key.slice('attribute_'.length);
      const name = names.get(attribute) ?? attributeLabel(attribute);
      const slug = text(m['wp:meta_value']);
      // Empty: "any value" of WooCommerce, which Cleishop has not.
      if (slug) values[name] = ctx.termNames.get(`${attribute}:${slug}`) ?? slug;
    }
    const image = media(Number(meta(v, '_thumbnail_id') ?? NaN));
    const status = meta(v, '_stock_status') ?? 'instock';
    return {
      attributes: values,
      enabled: text(v['wp:status']) === 'publish',
      sku: meta(v, '_sku') ?? '',
      regularPrice: meta(v, '_regular_price') || null,
      salePrice: meta(v, '_sale_price') || null,
      saleFrom: timestamp(meta(v, '_sale_price_dates_from')),
      saleTo: timestamp(meta(v, '_sale_price_dates_to')),
      manageStock: yes(meta(v, '_manage_stock')),
      stock: number(meta(v, '_stock')) === null ? null : Math.round(number(meta(v, '_stock'))!),
      stockStatus: STOCK.has(status) ? status : 'instock',
      weight: number(meta(v, '_weight')),
      length: number(meta(v, '_length')),
      width: number(meta(v, '_width')),
      height: number(meta(v, '_height')),
      ...(image ? { image } : {}),
      description: meta(v, '_variation_description') ?? '',
    };
  });

  return {
    entry: { $entry: ref },
    product,
    ...(attributes.length ? { attributes } : {}),
    ...(kind === 'variable' && ownVariations.length ? { variations: ownVariations } : {}),
    upsells: related('_upsell_ids'),
    crossSells: related('_crosssell_ids'),
  };
}
