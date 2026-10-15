import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  siteId: uuid('site_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  updatesMonths: integer('updates_months').notNull().default(12),
  demo: boolean('demo').notNull().default(true),
  renewUrl: text('renew_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const variants = pgTable('variants', {
  siteId: uuid('site_id').notNull(),
  provider: text('provider').notNull(),
  variantId: text('variant_id').notNull(),
  productSlug: text('product_slug').notNull(),
  seats: integer('seats').notNull().default(1),
  kind: text('kind').$type<'new' | 'renewal'>().notNull().default('new'),
});

export const licenses = pgTable('licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  keyHash: text('key_hash').notNull(),
  keyHint: text('key_hint').notNull(),
  productSlug: text('product_slug').notNull(),
  email: text('email').notNull(),
  seats: integer('seats').notNull().default(1),
  updatesUntil: timestamp('updates_until', { withTimezone: true }),
  status: text('status').$type<'active' | 'revoked'>().notNull().default('active'),
  source: text('source').notNull().default('manual'),
  orderRef: text('order_ref'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const activations = pgTable('activations', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  licenseId: uuid('license_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  siteOrigin: text('site_origin').notNull(),
  clientSiteId: text('client_site_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
});

export const downloads = pgTable('downloads', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  productSlug: text('product_slug').notNull(),
  version: text('version').notNull(),
  licenseId: uuid('license_id'),
  siteOrigin: text('site_origin'),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Variant = typeof variants.$inferSelect;
export type License = typeof licenses.$inferSelect;
export type Activation = typeof activations.$inferSelect;
