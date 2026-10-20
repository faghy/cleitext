import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * Environment variables, validated at startup (docs/ARCHITECTURE.md §18.3).
 * The server refuses to start when the configuration is invalid.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  /** Application role connection, subject to RLS. Never the table owner. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /**
   * Owner connection: never used by the web process itself, only handed to
   * the CLI it runs to install uploaded packages (RF-PLG-10).
   */
  DATABASE_ADMIN_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Trust X-Forwarded-* headers (true behind nginx/Plesk). */
  TRUST_PROXY: booleanString.default(false),
  /** Secret for signed links (previews). Required in production, at least 32 characters. */
  APP_SECRET: z.string().min(32).optional(),
  /** Session lifetime without "remember me", and with it. */
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(12),
  SESSION_REMEMBER_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /**
   * Outgoing mail: `smtp://user:pass@host:587`, `smtps://…`, `log://` (print to
   * the log, development) or `memory://` (kept in memory, tests).
   */
  MAIL_URL: z
    .string()
    .regex(/^(smtps?|log|memory):\/\//, 'Use smtp://, smtps://, log:// or memory://')
    .default('log://'),
  MAIL_FROM: z.string().min(3).default('Cleitext <no-reply@localhost>'),
  /** Uploaded files (disk storage driver). Relative paths start from the working directory. */
  MEDIA_PATH: z.string().min(1).default('cleitext-data/media'),
  /** Built admin (apps/admin/dist). Default: next to the server in the release. */
  ADMIN_PATH: z.string().min(1).optional(),
  /** Installed plugins (written by `cleitext plugin:install`). */
  PLUGINS_PATH: z.string().min(1).default('cleitext-data/plugins'),
  THEMES_PATH: z.string().min(1).default('cleitext-data/themes'),
  /** Plugins and themes can be uploaded from the admin (RF-PLG-10/12). */
  PLUGINS_INSTALL_FROM_UI: booleanString.default(true),
  /** Packages not signed by a registry (all uploads, for now) are accepted. */
  PLUGINS_ALLOW_UNSIGNED: booleanString.default(true),
  /** The signed index of the plugin and theme catalog; empty turns the catalog off. */
  CATALOG_URL: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).optional(),
  /** Ed25519 public key of the catalog (SPKI DER, base64). */
  CATALOG_PUBLIC_KEY: z.string().min(40).optional(),
  /** The registry the installation report goes to (catalog/install-report); empty turns it off. */
  INSTALL_REPORT_URL: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).optional(),
  /** Where updates come from (GitHub owner/name); empty turns the update check off. */
  UPDATES_REPO: z
    .string()
    .regex(/^([\w.-]+\/[\w.-]+)?$/)
    .optional(),
  /** SVG uploads, sanitized (RF-MED-09). Off by default, as in WordPress. */
  MEDIA_ALLOW_SVG: booleanString.default(false),
  MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(20 * 1024 * 1024),
  /** Full-page cache for anonymous visitors: maximum pages kept (0 disables it). */
  PAGE_CACHE_MAX_ENTRIES: z.coerce.number().int().min(0).max(1_000_000).default(5_000),
  /** Safety lifetime of cached pages; changes invalidate them immediately anyway. */
  PAGE_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(7 * 86_400)
    .default(3_600),
  /** How often scheduled entries are published; 0 disables it. */
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  database: { url: string; poolMax: number; adminUrl: string | null };
  logLevel: string;
  trustProxy: boolean;
  session: { ttlHours: number; rememberDays: number };
  mail: { url: string; from: string };
  schedulerIntervalSeconds: number;
  media: { path: string; maxBytes: number; allowSvg: boolean };
  plugins: { path: string };
  themes: { path: string };
  packages: { installFromUi: boolean; allowUnsigned: boolean };
  /** Plugins → Add New and Themes → Add New (RF-PLG-07): an index signed with Ed25519. */
  catalog: { url: string; publicKey: string };
  updates: { repo: string };
  installReport: { url: string };
  /** Folder of the built admin, if the server serves it (production). */
  admin: { path: string | null };
  pageCache: { maxEntries: number; ttlSeconds: number };
  appSecret: string;
}

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  const e = parsed.data;
  if (!e.APP_SECRET && e.NODE_ENV === 'production') {
    throw new ConfigError(['APP_SECRET: required in production (at least 32 random characters)']);
  }
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    database: {
      url: e.DATABASE_URL,
      poolMax: e.DATABASE_POOL_MAX,
      adminUrl: e.DATABASE_ADMIN_URL ?? null,
    },
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    session: { ttlHours: e.SESSION_TTL_HOURS, rememberDays: e.SESSION_REMEMBER_DAYS },
    mail: { url: e.MAIL_URL, from: e.MAIL_FROM },
    schedulerIntervalSeconds: e.SCHEDULER_INTERVAL_SECONDS,
    media: {
      path: resolve(e.MEDIA_PATH),
      maxBytes: e.MEDIA_MAX_BYTES,
      allowSvg: e.MEDIA_ALLOW_SVG,
    },
    plugins: { path: resolve(e.PLUGINS_PATH) },
    themes: { path: resolve(e.THEMES_PATH) },
    packages: { installFromUi: e.PLUGINS_INSTALL_FROM_UI, allowUnsigned: e.PLUGINS_ALLOW_UNSIGNED },
    catalog: {
      url: e.CATALOG_URL ?? (e.NODE_ENV === 'test' ? '' : DEFAULT_CATALOG_URL),
      publicKey: e.CATALOG_PUBLIC_KEY ?? DEFAULT_CATALOG_KEY,
    },
    // Tests never ask GitHub unless they say where.
    updates: { repo: e.UPDATES_REPO ?? (e.NODE_ENV === 'test' ? '' : 'faghy/cleitext') },
    installReport: {
      // Only real installations (production) report by default: never tests nor development.
      url: e.INSTALL_REPORT_URL ?? (e.NODE_ENV === 'production' ? DEFAULT_INSTALL_REPORT_URL : ''),
    },
    admin: { path: adminPath(e.ADMIN_PATH) },
    pageCache: { maxEntries: e.PAGE_CACHE_MAX_ENTRIES, ttlSeconds: e.PAGE_CACHE_TTL_SECONDS },
    // Development and tests only: production refuses to start without one.
    appSecret: e.APP_SECRET ?? 'cleitext-development-secret-not-for-production',
  };
}

/** The installation registry of cleitext.com (the Store plugin). */
export const DEFAULT_INSTALL_REPORT_URL = 'https://cleitext.com/api/v1/ext/store/v1/report';

/** The official catalog (github.com/faghy/cleitext-catalog) and its signing key. */
export const DEFAULT_CATALOG_URL =
  'https://github.com/faghy/cleitext-catalog/releases/download/catalog/catalog.json';
export const DEFAULT_CATALOG_KEY = 'MCowBQYDK2VwAyEAqg+tdu3CRzfBy9RInH4I0fcFvfgkppCNihY2uQ+pxXA=';

/** Injection token for the validated configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** The built admin: ADMIN_PATH, or apps/admin/dist next to this server. */
function adminPath(value: string | undefined): string | null {
  const candidate = value
    ? resolve(value)
    : fileURLToPath(new URL('../../../admin/dist', import.meta.url));
  return existsSync(join(candidate, 'index.html')) ? candidate : null;
}
