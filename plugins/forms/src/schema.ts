import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  formName: text('form_name').notNull(),
  pagePath: text('page_path').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A message as listed by GET /api/v1/ext/forms/submissions. */
export interface Submission {
  id: string;
  formName: string;
  pagePath: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  createdAt: string;
}
