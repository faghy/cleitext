import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Tables of migrations/0001_catalog.sql, for queries (the SQL files are the source). */

export type StockStatus = 'instock' | 'outofstock' | 'onbackorder';
export type Backorders = 'no' | 'notify' | 'yes';
export type Condition = 'new' | 'used' | 'refurbished';
export type Visibility = 'visible' | 'catalog' | 'search' | 'hidden';
export interface GalleryImage {
  id: string;
  url: string;
  caption: string;
}

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });
const time = (name: string) => timestamp(name, { withTimezone: true });

export const products = pgTable('products', {
  siteId: uuid('site_id').notNull(),
  entryId: uuid('entry_id').notNull(),
  locale: text('locale').notNull().default('en'),
  title: text('title').notNull().default(''),
  slug: text('slug').notNull().default(''),
  status: text('status').notNull().default('draft'),
  categoryIds: uuid('category_ids').array().notNull().default([]),
  brandId: uuid('brand_id'),
  imageId: uuid('image_id'),
  imageUrl: text('image_url'),
  kind: text('kind').$type<'simple' | 'variable'>().notNull().default('simple'),
  sku: text('sku').notNull().default(''),
  gtin: text('gtin').notNull().default(''),
  condition: text('condition').$type<Condition>().notNull().default('new'),
  cost: money('cost'),
  listPrice: money('list_price'),
  regularPrice: money('regular_price'),
  salePrice: money('sale_price'),
  saleFrom: time('sale_from'),
  saleTo: time('sale_to'),
  taxStatus: text('tax_status')
    .$type<'taxable' | 'shipping' | 'none'>()
    .notNull()
    .default('taxable'),
  taxClass: text('tax_class').notNull().default(''),
  manageStock: boolean('manage_stock').notNull().default(false),
  stock: integer('stock'),
  stockStatus: text('stock_status').$type<StockStatus>().notNull().default('instock'),
  backorders: text('backorders').$type<Backorders>().notNull().default('no'),
  lowStock: integer('low_stock'),
  soldIndividually: boolean('sold_individually').notNull().default(false),
  weight: numeric('weight', { precision: 12, scale: 3 }),
  length: numeric('length', { precision: 12, scale: 2 }),
  width: numeric('width', { precision: 12, scale: 2 }),
  height: numeric('height', { precision: 12, scale: 2 }),
  shippingClass: text('shipping_class').notNull().default(''),
  virtual: boolean('virtual').notNull().default(false),
  downloadable: boolean('downloadable').notNull().default(false),
  purchaseNote: text('purchase_note').notNull().default(''),
  gallery: jsonb('gallery').$type<GalleryImage[]>().notNull().default([]),
  upsellIds: uuid('upsell_ids').array().notNull().default([]),
  crossSellIds: uuid('cross_sell_ids').array().notNull().default([]),
  featured: boolean('featured').notNull().default(false),
  visibility: text('visibility').$type<Visibility>().notNull().default('visible'),
  totalSales: integer('total_sales').notNull().default(0),
  rating: numeric('rating', { precision: 3, scale: 2 }).notNull().default('0'),
  ratingCount: integer('rating_count').notNull().default(0),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});

export const attributes = pgTable('attributes', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  kind: text('kind').$type<'select' | 'color'>().notNull().default('select'),
  sort: text('sort').$type<'position' | 'name'>().notNull().default('position'),
  position: integer('position').notNull().default(0),
});

export const attributeValues = pgTable('attribute_values', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  attributeId: uuid('attribute_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  position: integer('position').notNull().default(0),
});

export const productAttributes = pgTable('product_attributes', {
  siteId: uuid('site_id').notNull(),
  productId: uuid('product_id').notNull(),
  position: integer('position').notNull().default(0),
  attributeId: uuid('attribute_id'),
  name: text('name').notNull().default(''),
  values: text('values').array().notNull().default([]),
  visible: boolean('visible').notNull().default(true),
  variation: boolean('variation').notNull().default(false),
});

export const variations = pgTable('variations', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  productId: uuid('product_id').notNull(),
  position: integer('position').notNull().default(0),
  attributes: jsonb('attributes').$type<Record<string, string>>().notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  sku: text('sku').notNull().default(''),
  gtin: text('gtin').notNull().default(''),
  cost: money('cost'),
  regularPrice: money('regular_price'),
  salePrice: money('sale_price'),
  saleFrom: time('sale_from'),
  saleTo: time('sale_to'),
  manageStock: boolean('manage_stock').notNull().default(false),
  stock: integer('stock'),
  stockStatus: text('stock_status').$type<StockStatus>().notNull().default('instock'),
  backorders: text('backorders').$type<Backorders>().notNull().default('no'),
  weight: numeric('weight', { precision: 12, scale: 3 }),
  length: numeric('length', { precision: 12, scale: 2 }),
  width: numeric('width', { precision: 12, scale: 2 }),
  height: numeric('height', { precision: 12, scale: 2 }),
  imageId: uuid('image_id'),
  imageUrl: text('image_url'),
  description: text('description').notNull().default(''),
});

export type ProductRow = typeof products.$inferSelect;
export type VariationRow = typeof variations.$inferSelect;
