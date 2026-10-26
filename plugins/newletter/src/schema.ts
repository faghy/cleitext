/** The plugin's table (migrations/0001_log.sql). */
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { TABLE_PREFIX } from './config';
import type { ConsentRecord } from './model/form';

export const LOG_TABLE = `${TABLE_PREFIX}log`;

export const log = pgTable(LOG_TABLE, {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  source: text('source').notNull(),
  provider: text('provider').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  emailHash: text('email_hash').notNull(),
  emailHint: text('email_hint').notNull(),
  listIds: text('list_ids').array().notNull().default([]),
  locale: text('locale').notNull().default(''),
  consent: jsonb('consent').$type<ConsentRecord | null>(),
  notes: text('notes'),
});

export type LogStatus = 'queued' | 'subscribed' | 'pending' | 'already' | 'error' | 'spam';

export interface LogEntry {
  id: string;
  createdAt: string;
  source: string;
  provider: string;
  status: LogStatus;
  error: string | null;
  emailHint: string;
  listIds: string[];
  locale: string;
  consent: ConsentRecord | null;
  notes: string | null;
}
