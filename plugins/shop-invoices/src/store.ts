/** The tables of PDF invoices (see migrations/0001_invoices.sql). */
import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const invoices = pgTable('invoices', {
  siteId: uuid('site_id').notNull(),
  orderId: uuid('order_id').notNull(),
  number: integer('number').notNull(),
  counter: text('counter').notNull(),
  formatted: text('formatted').notNull(),
  date: at('date').notNull().defaultNow(),
  imported: boolean('imported').notNull().default(false),
  createdAt: at('created_at').notNull().defaultNow(),
});

export const counters = pgTable('counters', {
  siteId: uuid('site_id').notNull(),
  counter: text('counter').notNull(),
  last: integer('last').notNull().default(0),
});

export type InvoiceRow = typeof invoices.$inferSelect;
