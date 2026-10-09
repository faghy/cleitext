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
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Trust X-Forwarded-* headers (true behind nginx/Plesk). */
  TRUST_PROXY: booleanString.default(false),
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
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  database: { url: string; poolMax: number };
  logLevel: string;
  trustProxy: boolean;
  session: { ttlHours: number; rememberDays: number };
  mail: { url: string; from: string };
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
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    database: { url: e.DATABASE_URL, poolMax: e.DATABASE_POOL_MAX },
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    session: { ttlHours: e.SESSION_TTL_HOURS, rememberDays: e.SESSION_REMEMBER_DAYS },
    mail: { url: e.MAIL_URL, from: e.MAIL_FROM },
  };
}

/** Injection token for the validated configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');
