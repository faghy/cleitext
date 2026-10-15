import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, siteId } from './columns.js';
import { entries } from './content.js';
import { users } from './identity.js';
import { sites } from './sites.js';

/**
 * Comments on entries (RF-COM), from signed-in users or guests. Threads go
 * through `parent_id`; `type` leaves room for reviews (shop plugin).
 */
export const comments = pgTable(
  'comments',
  {
    id: id(),
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    type: text('type').notNull().default('comment'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Guests: what they typed. Users: a copy, kept if the account is deleted. */
    authorName: text('author_name').notNull(),
    authorEmail: text('author_email').notNull().default(''),
    authorUrl: text('author_url'),
    content: text('content').notNull(),
    status: text('status')
      .$type<'pending' | 'approved' | 'spam' | 'trash'>()
      .notNull()
      .default('pending'),
    /** Hashed after the retention period (privacy). */
    ip: inet('ip'),
    userAgent: text('user_agent'),
    /** Rating of reviews (1–5), plugin data… */
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    /** Email the commenter when someone replies (asked on the form). */
    notifyReplies: boolean('notify_replies').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('comments_status_check', sql`${t.status} in ('pending', 'approved', 'spam', 'trash')`),
    index('comments_entry_idx').on(t.siteId, t.entryId, t.status, t.createdAt),
    index('comments_status_idx').on(t.siteId, t.status, t.createdAt),
    index('comments_email_idx').on(t.siteId, t.authorEmail),
  ],
);

/** One like per signed-in user, or per browser key for visitors. */
export const entryLikes = pgTable(
  'entry_likes',
  {
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    /** `user:<id>` or `visitor:<sha256 of the browser key>`. */
    liker: text('liker').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('entry_likes_unique').on(t.entryId, t.liker),
    index('entry_likes_site_idx').on(t.siteId),
  ],
);
