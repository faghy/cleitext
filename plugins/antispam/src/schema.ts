import {
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Who sent a queued message and what it says, for the list (form messages and comments). */
export interface Summary {
  author?: string;
  email?: string;
  text?: string;
}

export const queue = pgTable('queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  /** `comment` (the core's spam comment `ref`), `form` (kept aside) or `refused`. */
  kind: text('kind').notNull(),
  form: text('form').notNull(),
  ref: text('ref'),
  locale: text('locale').notNull().default(''),
  /** The submitted fields of a form message (without tokens), to deliver it later. */
  fields: jsonb('fields').$type<Record<string, unknown>>(),
  summary: jsonb('summary').$type<Summary>().notNull().default({}),
  score: integer('score').notNull().default(0),
  reasons: text('reasons').array().notNull().default([]),
  ipHash: text('ip_hash'),
  fingerprint: text('fingerprint'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fingerprints = pgTable(
  'fingerprints',
  {
    siteId: uuid('site_id').notNull(),
    hash: text('hash').notNull(),
    seen: integer('seen').notNull().default(0),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
    spam: integer('spam').notNull().default(0),
    ham: integer('ham').notNull().default(0),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.hash] })],
);

export const senders = pgTable(
  'senders',
  {
    siteId: uuid('site_id').notNull(),
    hash: text('hash').notNull(),
    spam: integer('spam').notNull().default(0),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.hash] })],
);

export const stats = pgTable(
  'stats',
  {
    siteId: uuid('site_id').notNull(),
    day: date('day').notNull(),
    outcome: text('outcome').notNull(),
    reason: text('reason').notNull(),
    n: integer('n').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day, t.outcome, t.reason] })],
);
