import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Table created by migrations/0001_rsvps.sql, in the plugin's own schema. */
export const rsvps = pgTable('rsvps', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  eventId: uuid('event_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** RSVP list as returned by GET /api/v1/ext/events/rsvps. */
export interface RsvpRow {
  eventId: string;
  eventTitle: string;
  name: string;
  email: string;
  createdAt: string;
}
