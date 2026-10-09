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
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  database: { url: string; poolMax: number };
  logLevel: string;
  trustProxy: boolean;
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
  };
}

/** Injection token for the validated configuration. */
export const APP_CONFIG = Symbol('APP_CONFIG');
