import { sql } from 'drizzle-orm';
import {
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
import { citext, createdAt, id, siteId } from './columns.js';
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
    /** When TOTP 2FA was confirmed; null while `totp_secret` is only a pending setup. */
    totpConfirmedAt: timestamp('totp_confirmed_at', { withTimezone: true }),
    /** Last accepted TOTP time step: a code cannot be used twice. */
    totpLastStep: integer('totp_last_step'),
    /** Profile picture in the media storage (`avatars/<userId>/<id>.webp`). */
    avatarKey: text('avatar_key'),
    /** Public profile: a few words, a website, and the address of the author page. */
    bio: text('bio').notNull().default(''),
    website: text('website'),
    slug: citext('slug').unique(),
    /** When the person confirmed the address; null while a sign-up waits for it. */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: createdAt(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    check('users_status_check', sql`${t.status} in ('active', 'invited', 'suspended', 'pending')`),
  ],
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

/**
 * Global super admins: every capability on every site. Kept out of `users` so
 * that the application role (read-only here) can never grant itself the flag.
 */
export const superAdmins = pgTable('super_admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token; the token itself is never stored. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** "Remember me": long-lived, persistent cookie. */
    remember: boolean('remember').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/**
 * Single-use tokens (password reset, invitation, the hosting panel's one-time
 * sign-in). Global: they are looked up
 * by hash before any site context exists. Invitation details live in `meta`.
 */
export const userTokens = pgTable(
  'user_tokens',
  {
    /** SHA-256 of the token sent by email. */
    tokenHash: text('token_hash').primaryKey(),
    kind: text('kind').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    meta: jsonb('meta').notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'user_tokens_kind_check',
      sql`${t.kind} in ('password_reset', 'invitation', 'login_2fa', 'email_verify', 'panel_login')`,
    ),
    index('user_tokens_user_idx').on(t.userId),
  ],
);

/** Failed login counters for rate limiting and progressive lockout (RF-USR-09). */
export const loginThrottle = pgTable('login_throttle', {
  /** 'email:<address>' or 'ip:<address>' */
  key: text('key').primaryKey(),
  failures: integer('failures').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  /** First characters of the token, to recognize it in lists. */
  prefix: text('prefix').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  /** Set for tokens issued through OAuth to a connected assistant (MCP). */
  oauthClientId: text('oauth_client_id'),
});

/** OAuth clients (AI assistants) registered on a site for MCP (RFC 7591). */
export const oauthClients = pgTable('oauth_clients', {
  id: id(),
  siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().unique(),
  name: text('name').notNull(),
  redirectUris: text('redirect_uris').array().notNull(),
  createdAt: createdAt(),
});

/** Authorization codes, single use and short-lived, bound to a PKCE challenge. */
export const oauthCodes = pgTable('oauth_codes', {
  id: id(),
  siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  clientId: text('client_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  scopes: text('scopes').array().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** Refresh tokens of connected assistants; each one renews one API token. */
export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: id(),
  siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  clientId: text('client_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  apiTokenId: uuid('api_token_id')
    .notNull()
    .references(() => apiTokens.id, { onDelete: 'cascade' }),
  scopes: text('scopes').array().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** Single-use 2FA recovery codes (RF-USR-04), stored as hashes. */
export const userRecoveryCodes = pgTable(
  'user_recovery_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('user_recovery_codes_user_idx').on(t.userId)],
);

/** WebAuthn credentials (RF-USR-05), bound to the domain they were made on. */
export const userPasskeys = pgTable(
  'user_passkeys',
  {
    /** Credential id, base64url. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** WebAuthn relying party: the host the passkey works on. */
    rpId: text('rp_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports')
      .array()
      .notNull()
      .default(sql`'{}'`),
    name: text('name').notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('user_passkeys_user_idx').on(t.userId)],
);

/** Pending WebAuthn challenges, single use and short-lived. */
export const webauthnChallenges = pgTable('webauthn_challenges', {
  /** SHA-256 of the random id kept by the browser in a cookie. */
  id: text('id').primaryKey(),
  challenge: text('challenge').notNull(),
  kind: text('kind').notNull(),
  /** Set for registrations (the signed-in user). */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * Values of the user fields of a site (field groups for users, plugin API
 * 1.47, 0030): per site, as accounts are shared by sites and groups are not.
 */
export const userFields = pgTable(
  'user_fields',
  {
    siteId: siteId().references(() => sites.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fields: jsonb('fields').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.userId] })],
);
