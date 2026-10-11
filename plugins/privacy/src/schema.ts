import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  consentId: text('consent_id').notNull(),
  categories: text('categories').array().notNull(),
  version: integer('version').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const requests = pgTable('requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  kind: text('kind').notNull(),
  email: text('email').notNull(),
  handledBy: text('handled_by').notNull(),
  result: jsonb('result').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
