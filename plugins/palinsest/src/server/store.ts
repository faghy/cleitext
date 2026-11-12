/** The tables of Palinsest (see migrations/0001_palinsest.sql). */
import { boolean, date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  name: text('name').notNull(),
  cadence: text('cadence').notNull(),
  times: text('times').array().notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  producer: text('producer').notNull(),
  contentType: text('content_type').notNull(),
  locale: text('locale'),
  authorId: uuid('author_id').notNull(),
  autoPublish: boolean('auto_publish').notNull(),
  withTranslations: boolean('with_translations').notNull(),
  enabled: boolean('enabled').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const slots = pgTable('slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  ruleId: uuid('rule_id').notNull(),
  plannedAt: at('planned_at').notNull(),
  at: at('at').notNull(),
  status: text('status').notNull(),
  entryId: uuid('entry_id'),
  error: text('error'),
  startedAt: at('started_at'),
  createdAt: at('created_at').notNull().defaultNow(),
});
