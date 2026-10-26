import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const products = pgTable('products', {
  siteId: uuid('site_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  updatesMonths: integer('updates_months').notNull().default(12),
  demo: boolean('demo').notNull().default(true),
  renewUrl: text('renew_url'),
  /** Its licenses are valid for other products (Store 1.4.0). */
  bundle: boolean('bundle').notNull().default(false),
  /** Bundles: the products covered; null for every product that is not a bundle. */
  covers: text('covers').array(),
  /** Public downloads only: never covered by "every product". */
  free: boolean('free').notNull().default(false),
  priceCents: integer('price_cents'),
  currency: text('currency').notNull().default('EUR'),
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
  /** The agency that manages the license, when it is not the customer. */
  ownerEmail: text('owner_email'),
  listPriceCents: integer('list_price_cents'),
  discountPercent: integer('discount_percent'),
  priceCents: integer('price_cents'),
  currency: text('currency'),
  /** The key, encrypted, for the portal; null for licenses made before 1.4.0. */
  keySealed: text('key_sealed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const activations = pgTable('activations', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  licenseId: uuid('license_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  siteOrigin: text('site_origin').notNull(),
  clientSiteId: text('client_site_id'),
  /** The product activated; null before 1.4.0 (the license's own product). */
  productSlug: text('product_slug'),
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

export interface ReportedPlugin {
  slug: string;
  version: string;
  active: boolean;
}

export const installs = pgTable('installs', {
  siteId: uuid('site_id').notNull(),
  origin: text('origin').notNull(),
  installId: text('install_id').notNull(),
  coreVersion: text('core_version').notNull(),
  themeSlug: text('theme_slug'),
  themeVersion: text('theme_version'),
  plugins: jsonb('plugins').$type<ReportedPlugin[]>().notNull().default([]),
  themes: jsonb('themes').$type<{ slug: string; version: string }[]>().notNull().default([]),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Public downloads of a product, one per version. */
export const files = pgTable('files', {
  siteId: uuid('site_id').notNull(),
  productSlug: text('product_slug').notNull(),
  version: text('version').notNull(),
  filename: text('filename').notNull(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  data: bytea('data').notNull(),
  downloads: integer('downloads').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Anonymous, opt-in reports of servers running a product (the Toolkit for Plesk). */
export const serverReports = pgTable('server_reports', {
  siteId: uuid('site_id').notNull(),
  productSlug: text('product_slug').notNull(),
  serverHash: text('server_hash').notNull(),
  productVersion: text('product_version').notNull(),
  panel: text('panel').notNull(),
  panelVersion: text('panel_version').notNull(),
  installations: integer('installations').notNull().default(0),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Agencies and resellers (record keeping: no payment is processed here). */
export const partners = pgTable('partners', {
  siteId: uuid('site_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  discountPercent: integer('discount_percent').notNull().default(0),
  code: text('code'),
  lsDiscountCode: text('ls_discount_code'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Sign-in links and sessions of the customer portal, as SHA-256. */
export const portalTokens = pgTable('portal_tokens', {
  siteId: uuid('site_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  email: text('email').notNull(),
  kind: text('kind').$type<'link' | 'session'>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Partner = typeof partners.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Variant = typeof variants.$inferSelect;
export type License = typeof licenses.$inferSelect;
export type Activation = typeof activations.$inferSelect;
