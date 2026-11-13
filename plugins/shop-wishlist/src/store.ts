/** The tables of the Wishlist (see migrations/0001_wishlist.sql). */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const lists = pgTable('lists', {
  siteId: uuid('site_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  userId: uuid('user_id'),
  token: text('token').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const items = pgTable('items', {
  siteId: uuid('site_id').notNull(),
  listId: uuid('list_id').notNull(),
  productId: uuid('product_id').notNull(),
  addedAt: at('added_at').notNull().defaultNow(),
});
