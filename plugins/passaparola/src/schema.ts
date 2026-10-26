import {
  bigint,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AffiliateStatus, ReferralStatus } from './model/rules';

/** The tables of `migrations/0001_passaparola.sql`. */

const time = (name: string) => timestamp(name, { withTimezone: true });
const cents = (name: string) => bigint(name, { mode: 'number' });

export const affiliates = pgTable('affiliates', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  userId: uuid('user_id').notNull(),
  code: text('code').notNull(),
  status: text('status').$type<AffiliateStatus>().notNull().default('pending'),
  name: text('name').notNull().default(''),
  email: text('email').notNull().default(''),
  locale: text('locale').notNull().default(''),
  rate: numeric('rate', { precision: 12, scale: 2 }),
  website: text('website').notNull().default(''),
  promotion: text('promotion').notNull().default(''),
  paypalEmail: text('paypal_email').notNull().default(''),
  iban: text('iban').notNull().default(''),
  note: text('note').notNull().default(''),
  termsAcceptedAt: time('terms_accepted_at'),
  approvedAt: time('approved_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});
export type AffiliateRow = typeof affiliates.$inferSelect;

export const visits = pgTable('visits', {
  siteId: uuid('site_id').notNull(),
  affiliateId: uuid('affiliate_id').notNull(),
  day: date('day').notNull(),
  count: integer('count').notNull().default(0),
});

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  affiliateId: uuid('affiliate_id').notNull(),
  amountCents: cents('amount_cents').notNull(),
  currency: text('currency').notNull(),
  method: text('method').notNull().default(''),
  details: text('details').notNull().default(''),
  note: text('note').notNull().default(''),
  paidAt: time('paid_at').notNull().defaultNow(),
  createdAt: time('created_at').notNull().defaultNow(),
});
export type PayoutRow = typeof payouts.$inferSelect;

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  affiliateId: uuid('affiliate_id').notNull(),
  kind: text('kind').$type<'conversion' | 'adjustment'>().notNull().default('conversion'),
  parentId: uuid('parent_id'),
  source: text('source').notNull(),
  conversionKind: text('conversion_kind').notNull().default(''),
  conversionId: text('conversion_id').notNull(),
  label: text('label').notNull().default(''),
  customerEmail: text('customer_email').notNull().default(''),
  status: text('status').$type<ReferralStatus>().notNull().default('pending'),
  amountCents: cents('amount_cents').notNull().default(0),
  originalCents: cents('original_cents').notNull().default(0),
  adjustedCents: cents('adjusted_cents').notNull().default(0),
  currency: text('currency').notNull().default(''),
  conversionCents: cents('conversion_cents').notNull().default(0),
  reversedCents: cents('reversed_cents').notNull().default(0),
  payoutId: uuid('payout_id'),
  convertedAt: time('converted_at').notNull().defaultNow(),
  approvedAt: time('approved_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});
export type ReferralRow = typeof referrals.$inferSelect;

export const missed = pgTable('missed', {
  siteId: uuid('site_id').notNull(),
  source: text('source').notNull(),
  month: date('month').notNull(),
  count: integer('count').notNull().default(0),
});
