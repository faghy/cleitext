import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type DeliveryStatus = 'queued' | 'retrying' | 'sent' | 'failed';

/** Deliveries of form messages to webhooks: the queue and the log. */
export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  webhookId: text('webhook_id').notNull(),
  webhookLabel: text('webhook_label').notNull(),
  formName: text('form_name').notNull(),
  messageId: text('message_id'),
  status: text('status').$type<DeliveryStatus>().notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  nextAt: timestamp('next_at', { withTimezone: true }).notNull().defaultNow(),
  httpStatus: integer('http_status'),
  error: text('error'),
  fieldNames: jsonb('field_names').$type<string[]>().notNull().default([]),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
