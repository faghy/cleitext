import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Pages not found, one row per address (migrations/0001_logs.sql). */
export const notFound = pgTable('not_found', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  path: text('path').notNull(),
  hits: integer('hits').notNull().default(1),
  referrer: text('referrer'),
  userAgent: text('user_agent'),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});

/** Addresses sent with IndexNow. */
export const indexnowLog = pgTable('indexnow_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  urls: text('urls').array().notNull(),
  status: integer('status').notNull(),
  manual: boolean('manual').notNull().default(false),
  message: text('message').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
