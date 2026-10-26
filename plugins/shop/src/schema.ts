import type { Address, Invoice } from './address';
import type { MethodSettings } from './shipping';
import type { Texts } from './texts';
import {
  bigint,
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
  /** Translations share a group (the entry first translated): prices, codes, stock (0007). */
  groupId: uuid('group_id'),
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
  /** The texts in other languages (0008). */
  translations: jsonb('translations').$type<Texts>().notNull().default({}),
});

export const attributeValues = pgTable('attribute_values', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  attributeId: uuid('attribute_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  position: integer('position').notNull().default(0),
  /** The texts in other languages (0008). */
  translations: jsonb('translations').$type<Texts>().notNull().default({}),
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
  /** The texts in other languages (0008). */
  translations: jsonb('translations').$type<Texts>().notNull().default({}),
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
  /** The same variation in the product's translations (0007). */
  groupId: uuid('group_id'),
});

export type ProductRow = typeof products.$inferSelect;
export type VariationRow = typeof variations.$inferSelect;

// ---- Carts and orders (migrations/0002_orders.sql) ------------------------------------

export interface CartItem {
  product: string;
  variation: string | null;
  quantity: number;
}

export const carts = pgTable('carts', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  tokenHash: text('token_hash').notNull(),
  userId: uuid('user_id'),
  items: jsonb('items').$type<CartItem[]>().notNull().default([]),
  coupons: jsonb('coupons').$type<string[]>().notNull().default([]),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});

export const counters = pgTable('counters', {
  siteId: uuid('site_id').notNull(),
  name: text('name').notNull(),
  value: bigint('value', { mode: 'number' }).notNull().default(0),
});

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed';

const amount = (name: string) => numeric(name, { precision: 14, scale: 2 });

export const orders = pgTable('orders', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  number: bigint('number', { mode: 'number' }).notNull(),
  key: text('key').notNull(),
  status: text('status').$type<OrderStatus>().notNull().default('pending'),
  locale: text('locale').notNull().default('en'),
  currency: text('currency').notNull(),
  pricesIncludeTax: boolean('prices_include_tax').notNull(),
  subtotal: amount('subtotal').notNull().default('0'),
  discountTotal: amount('discount_total').notNull().default('0'),
  shippingTotal: amount('shipping_total').notNull().default('0'),
  shippingTax: amount('shipping_tax').notNull().default('0'),
  feeTotal: amount('fee_total').notNull().default('0'),
  taxTotal: amount('tax_total').notNull().default('0'),
  total: amount('total').notNull().default('0'),
  taxes: jsonb('taxes').$type<{ rate: number; amount: string }[]>().notNull().default([]),
  paymentMethod: text('payment_method').notNull().default(''),
  paymentTitle: text('payment_title').notNull().default(''),
  transactionId: text('transaction_id').notNull().default(''),
  paymentRef: text('payment_ref').notNull().default(''),
  shippingMethod: text('shipping_method').notNull().default(''),
  shippingRate: text('shipping_rate').notNull().default(''),
  coupons: jsonb('coupons').$type<{ code: string; discount: string }[]>().notNull().default([]),
  customerId: uuid('customer_id'),
  email: text('email').notNull(),
  billing: jsonb('billing').$type<Address>().notNull(),
  shipping: jsonb('shipping').$type<Address>().notNull(),
  invoice: jsonb('invoice').$type<Invoice | null>(),
  customerNote: text('customer_note').notNull().default(''),
  ip: text('ip'),
  userAgent: text('user_agent'),
  /** Referral codes by capturing plugin (plugin API 1.58), for the order's conversion. */
  referrals: jsonb('referrals').$type<Record<string, string>>().notNull().default({}),
  stockReduced: boolean('stock_reduced').notNull().default(false),
  paidAt: time('paid_at'),
  completedAt: time('completed_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});

export const orderItems = pgTable('order_items', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  position: integer('position').notNull().default(0),
  kind: text('kind').$type<'product' | 'shipping' | 'fee'>().notNull().default('product'),
  productId: uuid('product_id'),
  variationId: uuid('variation_id'),
  name: text('name').notNull(),
  sku: text('sku').notNull().default(''),
  attributes: jsonb('attributes').$type<{ name: string; value: string }[]>().notNull().default([]),
  quantity: integer('quantity').notNull().default(1),
  subtotal: amount('subtotal').notNull().default('0'),
  subtotalTax: amount('subtotal_tax').notNull().default('0'),
  total: amount('total').notNull().default('0'),
  tax: amount('tax').notNull().default('0'),
  taxRate: numeric('tax_rate', { precision: 6, scale: 3 }).notNull().default('0'),
  stockReduced: integer('stock_reduced').notNull().default(0),
});

export const orderNotes = pgTable('order_notes', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  note: text('note').notNull(),
  customer: boolean('customer').notNull().default(false),
  author: text('author').notNull().default(''),
  createdAt: time('created_at').notNull().defaultNow(),
});

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

// ---- Refunds (migrations/0003_refunds.sql) -------------------------------------------

export const refunds = pgTable('refunds', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  amount: amount('amount').notNull(),
  reason: text('reason').notNull().default(''),
  restocked: jsonb('restocked').$type<{ item: string; quantity: number }[]>().notNull().default([]),
  gatewayRef: text('gateway_ref').notNull().default(''),
  author: text('author').notNull().default(''),
  createdAt: time('created_at').notNull().defaultNow(),
});

export type RefundRow = typeof refunds.$inferSelect;
export type OrderNoteRow = typeof orderNotes.$inferSelect;

// ---- Shipping, taxes, coupons (migrations/0004_shipping_taxes_coupons.sql) ----------

export const shippingZones = pgTable('shipping_zones', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  regions: jsonb('regions').$type<{ country: string; province: string }[]>().notNull().default([]),
  postcodes: jsonb('postcodes').$type<string[]>().notNull().default([]),
});

export const shippingMethods = pgTable('shipping_methods', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  zoneId: uuid('zone_id'),
  position: integer('position').notNull().default(0),
  title: text('title').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  taxable: boolean('taxable').notNull().default(true),
  settings: jsonb('settings').$type<MethodSettings>().notNull(),
  /** The texts in other languages (0008). */
  translations: jsonb('translations').$type<Texts>().notNull().default({}),
});

export const taxRates = pgTable('tax_rates', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  country: text('country').notNull().default(''),
  province: text('province').notNull().default(''),
  taxClass: text('tax_class').notNull().default(''),
  rate: numeric('rate', { precision: 6, scale: 3 }).notNull(),
  name: text('name').notNull().default(''),
  position: integer('position').notNull().default(0),
  /** The texts in other languages (0008). */
  translations: jsonb('translations').$type<Texts>().notNull().default({}),
});

export const coupons = pgTable('coupons', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  code: text('code').notNull(),
  kind: text('kind')
    .$type<'percent' | 'fixed_cart' | 'fixed_product'>()
    .notNull()
    .default('percent'),
  amount: amount('amount').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  expiresAt: time('expires_at'),
  usageLimit: integer('usage_limit'),
  usageCount: integer('usage_count').notNull().default(0),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});

export const couponUses = pgTable('coupon_uses', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  couponId: uuid('coupon_id').notNull(),
  orderId: uuid('order_id').notNull(),
  email: text('email').notNull(),
  userId: uuid('user_id'),
  createdAt: time('created_at').notNull().defaultNow(),
});

export type ShippingZoneRow = typeof shippingZones.$inferSelect;
export type ShippingMethodRow = typeof shippingMethods.$inferSelect;
export type TaxRateRow = typeof taxRates.$inferSelect;
export type CouponRow = typeof coupons.$inferSelect;

// ---- Customers (migrations/0005_customers.sql) ---------------------------------------

export const customers = pgTable('customers', {
  siteId: uuid('site_id').notNull(),
  userId: uuid('user_id').notNull(),
  email: text('email').notNull().default(''),
  billing: jsonb('billing').$type<Address | null>(),
  shipping: jsonb('shipping').$type<Address | null>(),
  invoice: jsonb('invoice').$type<Invoice | null>(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});
export type CustomerRow = typeof customers.$inferSelect;
