import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, siteId } from './columns.js';
import { sites } from './sites.js';

export const settings = pgTable(
  'settings',
  {
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    /** 'core' | 'theme' | 'plugin:<slug>' */
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.namespace, t.key] })],
);

export const redirects = pgTable(
  'redirects',
  {
    id: id(),
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    fromPath: text('from_path').notNull(),
    toPath: text('to_path').notNull(),
    status: integer('status').notNull().default(301),
    hits: bigint('hits', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    unique('redirects_site_from_unique').on(t.siteId, t.fromPath),
    check('redirects_status_check', sql`${t.status} in (301, 302, 307, 308, 410)`),
  ],
);

/** Installed plugins (code present on disk). Global, managed by the admin connection. */
export const plugins = pgTable('plugins', {
  slug: text('slug').primaryKey(),
  version: text('version').notNull(),
  apiVersion: text('api_version').notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  manifest: jsonb('manifest').notNull(),
});

/** Per-site plugin activation. */
export const sitePlugins = pgTable(
  'site_plugins',
  {
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    pluginSlug: text('plugin_slug')
      .notNull()
      .references(() => plugins.slug, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(false),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.pluginSlug] })],
);

export const pluginMigrations = pgTable(
  'plugin_migrations',
  {
    pluginSlug: text('plugin_slug').notNull(),
    migration: text('migration').notNull(),
    checksum: text('checksum').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pluginSlug, t.migration] })],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    siteId: uuid('site_id'),
    userId: uuid('user_id'),
    /** e.g. 'entry.publish', 'user.login.failed' */
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    meta: jsonb('meta').notNull().default({}),
    ip: inet('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_site_time_idx').on(t.siteId, t.createdAt.desc())],
);
