import { sql } from 'drizzle-orm';
import {
  check,
  inet,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, createdAt, id } from './columns.js';
import { sites } from './sites.js';

/** Users are global; access to a site is granted through `site_members`. */
export const users = pgTable(
  'users',
  {
    id: id(),
    email: citext('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    /** argon2id hash; null when the user signs in only with passkeys or SSO. */
    passwordHash: text('password_hash'),
    status: text('status').notNull().default('active'),
    /** Encrypted at the application level. */
    totpSecret: text('totp_secret'),
    locale: text('locale').notNull().default('en'),
    createdAt: createdAt(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [check('users_status_check', sql`${t.status} in ('active', 'invited', 'suspended')`)],
);

export const roles = pgTable(
  'roles',
  {
    id: id(),
    /** Null for system roles shared by every site. */
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    capabilities: text('capabilities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [unique('roles_site_slug_unique').on(t.siteId, t.slug).nullsNotDistinct()],
);

export const siteMembers = pgTable(
  'site_members',
  {
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.userId] })],
);

export const sessions = pgTable('sessions', {
  /** SHA-256 of the session token; the token itself is never stored. */
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
});

export const apiTokens = pgTable('api_tokens', {
  id: id(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scopes: text('scopes').array().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});
