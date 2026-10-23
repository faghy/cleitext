import { describe, expect, it } from 'vitest';
import { ConfigError, defaultMailUrl, loadConfig } from '../src/config/config.js';
import {
  CLOUDFLARE_IPV4,
  CLOUDFLARE_IPV6,
  invalidTrustEntry,
  PRIVATE_NETWORKS,
} from '../src/config/trust-proxy.js';

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

  it('sends with the server sendmail in production when MAIL_URL is not set, as WordPress', () => {
    expect(defaultMailUrl('development', () => true)).toBe('log://');
    expect(defaultMailUrl('test', () => true)).toBe('log://');
    expect(defaultMailUrl('production', () => true)).toBe('sendmail://');
    expect(defaultMailUrl('production', (f) => f === '/usr/lib/sendmail')).toBe(
      'sendmail:///usr/lib/sendmail',
    );
    expect(defaultMailUrl('production', () => false)).toBe('log://');
    const config = loadConfig({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });
    expect(config.mail).toEqual({ url: 'log://', from: null });
    const set = loadConfig({
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      MAIL_URL: 'smtp://mail.example.com:587',
      MAIL_FROM: 'Example <no-reply@example.com>',
    });
    expect(set.mail).toEqual({
      url: 'smtp://mail.example.com:587',
      from: 'Example <no-reply@example.com>',
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

  describe('TRUST_PROXY', () => {
    const url = 'postgres://u:p@h/db';
    const trust = (env: Record<string, string>) =>
      loadConfig({ DATABASE_URL: url, ...env }).trustProxy;
    const issues = (env: Record<string, string>) => {
      try {
        loadConfig({ DATABASE_URL: url, ...env });
      } catch (error) {
        return (error as ConfigError).issues.join('\n');
      }
      throw new Error('expected an invalid configuration');
    };

    it('turns it off with false, 0 or nothing', () => {
      expect(trust({})).toBe(false);
      expect(trust({ TRUST_PROXY: 'false' })).toBe(false);
      expect(trust({ TRUST_PROXY: '0' })).toBe(false);
      expect(trust({ TRUST_PROXY: '' })).toBe(false);
    });

    it('reads true as loopback and the private networks only', () => {
      expect(trust({ TRUST_PROXY: 'true' })).toEqual([...PRIVATE_NETWORKS]);
      expect(trust({ TRUST_PROXY: 'TRUE' })).toEqual([...PRIVATE_NETWORKS]);
      expect(PRIVATE_NETWORKS).toEqual(
        expect.arrayContaining(['loopback', 'linklocal', 'uniquelocal', '100.64.0.0/10']),
      );
    });

    it('reads a number of hops', () => {
      expect(trust({ TRUST_PROXY: '2' })).toBe(2);
      expect(issues({ TRUST_PROXY: '1000' })).toMatch(/TRUST_PROXY: a number of hops/);
    });

    it('reads a list of addresses, networks and keywords', () => {
      expect(
        trust({ TRUST_PROXY: ' loopback, 10.0.0.200 ,203.0.113.0/24, 2001:db8::/32' }),
      ).toEqual(['loopback', '10.0.0.200', '203.0.113.0/24', '2001:db8::/32']);
    });

    it('refuses what is not an address, with a clear message', () => {
      expect(issues({ TRUST_PROXY: 'yes' })).toMatch(/TRUST_PROXY: .*"yes" is not an IP address/);
      expect(issues({ TRUST_PROXY: 'loopback,10.0.0.0/33' })).toMatch(/"10\.0\.0\.0\/33".*0 to 32/);
      expect(issues({ TRUST_PROXY: '2001:db8::/129' })).toMatch(/0 to 128/);
      expect(issues({ TRUST_PROXY: '10.0.0.0/8/8' })).toMatch(/not an IP address/);
      expect(issues({ TRUST_PROXY: 'example.com' })).toMatch(/not an IP address/);
    });

    it('adds Cloudflare with TRUST_CLOUDFLARE', () => {
      const withProxies = trust({ TRUST_PROXY: 'true', TRUST_CLOUDFLARE: 'true' });
      expect(withProxies).toEqual([...PRIVATE_NETWORKS, ...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6]);
      // Cloudflare straight to the server, no proxy of its own.
      expect(trust({ TRUST_CLOUDFLARE: 'true' })).toEqual([...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6]);
      expect(issues({ TRUST_PROXY: '2', TRUST_CLOUDFLARE: 'true' })).toMatch(
        /TRUST_CLOUDFLARE: cannot be combined with a number of hops/,
      );
      expect(issues({ TRUST_CLOUDFLARE: 'maybe' })).toMatch(/TRUST_CLOUDFLARE/);
    });

    it('bundles valid Cloudflare networks', () => {
      for (const network of [...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6]) {
        expect(invalidTrustEntry(network)).toBeNull();
      }
    });
  });
});
