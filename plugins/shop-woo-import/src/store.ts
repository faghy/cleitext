/** The table of WooCommerce Import (see migrations/0001_imported.sql). */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const imported = pgTable('imported', {
  siteId: uuid('site_id').notNull(),
  kind: text('kind').notNull(),
  ref: text('ref').notNull(),
  targetId: uuid('target_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
