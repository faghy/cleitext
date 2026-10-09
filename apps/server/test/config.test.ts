import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/config.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });
    expect(config).toMatchObject({
      env: 'development',
      host: '127.0.0.1',
      port: 3000,
      trustProxy: false,
      database: { poolMax: 10 },
    });
  });

  it('fails with a readable list of problems', () => {
    expect(() => loadConfig({ PORT: 'abc', DATABASE_URL: 'mysql://x' })).toThrow(ConfigError);
    try {
      loadConfig({ PORT: 'abc' });
    } catch (error) {
      expect((error as ConfigError).issues.join('\n')).toMatch(/DATABASE_URL/);
      expect((error as ConfigError).issues.join('\n')).toMatch(/PORT/);
    }
  });

  it('parses TRUST_PROXY', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://u:p@h/db', TRUST_PROXY: 'true' });
    expect(config.trustProxy).toBe(true);
  });
});
