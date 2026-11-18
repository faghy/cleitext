import { describe, expect, it } from 'vitest';
import {
  classify,
  classifyOrigin,
  DEFAULT_INTERNAL_HOSTS,
  hostMatches,
  ipMatches,
  parsePatterns,
} from './internal';

const defaults = parsePatterns(DEFAULT_INTERNAL_HOSTS);

describe('internal domains and servers', () => {
  it('reads one pattern per line, skipping comments and what is not a pattern', () => {
    expect(
      parsePatterns(
        '*.2clic.it\n# our servers\nSitoup.it.\n\n203.0.113.7\n10.0.0.0/8\nnot a host!',
      ),
    ).toEqual([
      { kind: 'suffix', value: '2clic.it' },
      { kind: 'host', value: 'sitoup.it' },
      { kind: 'ip', value: '203.0.113.7' },
      { kind: 'cidr', value: '10.0.0.0', bits: 8 },
    ]);
    // No setting yet: the default list.
    expect(parsePatterns(undefined)).toEqual(defaults);
  });

  it('matches subdomains with *. and the exact name without', () => {
    expect(hostMatches(defaults, 'server1.2clic.it')).toBe(true);
    expect(hostMatches(defaults, 'pratonevoso.staging.2clic.it')).toBe(true);
    expect(hostMatches(defaults, '2clic.it')).toBe(true);
    expect(hostMatches(defaults, 'www.sitoup.it')).toBe(true);
    expect(hostMatches(defaults, 'dnsbazar.com')).toBe(true);
    expect(hostMatches(defaults, 'not2clic.it')).toBe(false);
    expect(hostMatches(defaults, '2clic.it.evil.com')).toBe(false);
    expect(hostMatches(parsePatterns('sitoup.it'), 'www.sitoup.it')).toBe(false);
    expect(hostMatches(defaults, null)).toBe(false);
  });

  it('matches server addresses and networks', () => {
    const patterns = parsePatterns('203.0.113.7\n198.51.100.0/24\n2001:db8::1');
    expect(ipMatches(patterns, '203.0.113.7')).toBe(true);
    expect(ipMatches(patterns, '::ffff:203.0.113.7')).toBe(true);
    expect(ipMatches(patterns, '198.51.100.200')).toBe(true);
    expect(ipMatches(patterns, '198.51.101.1')).toBe(false);
    expect(ipMatches(patterns, '2001:DB8::1')).toBe(true);
    expect(ipMatches(defaults, '203.0.113.7')).toBe(false);
  });

  it('classifies by site, server name, address, installation, or by hand', () => {
    const patterns = parsePatterns(`${DEFAULT_INTERNAL_HOSTS}\n203.0.113.7`);
    const result = classify(patterns, [
      { origin: 'https://demo.2clic.it', installId: 'a' },
      { origin: 'https://client-on-server1.com', installId: 'a' },
      { origin: 'https://hosted.example.com', installId: 'b', serverHost: 'server3.2clic.it' },
      { origin: 'https://by-ip.example.com', installId: 'c', serverIp: '203.0.113.7' },
      { origin: 'https://customer.example.com', installId: 'd', serverIp: '192.0.2.1' },
      { origin: 'https://marked.example.com', installId: 'd', internal: true },
      { origin: 'https://www.sitoup.it', installId: 'e', internal: false },
      { origin: 'https://other-e.example.com', installId: 'e' },
    ]);
    expect(Object.fromEntries(result)).toEqual({
      'https://demo.2clic.it': { internal: true, reason: 'origin' },
      'https://client-on-server1.com': { internal: true, reason: 'installation' },
      'https://hosted.example.com': { internal: true, reason: 'server' },
      'https://by-ip.example.com': { internal: true, reason: 'address' },
      // Marked internal by hand: its installation is ours too.
      'https://customer.example.com': { internal: true, reason: 'installation' },
      'https://marked.example.com': { internal: true, reason: 'manual' },
      // Marked external by hand: it does not make its installation internal.
      'https://www.sitoup.it': { internal: false, reason: 'manual' },
      'https://other-e.example.com': { internal: false, reason: null },
    });
  });

  it('follows an edited list', () => {
    const rows = [{ origin: 'https://shop.example.com', installId: 'x' }];
    expect(classify(defaults, rows).get('https://shop.example.com')?.internal).toBe(false);
    const edited = parsePatterns('*.example.com');
    expect(classify(edited, rows).get('https://shop.example.com')?.internal).toBe(true);
    expect(classifyOrigin(edited, 'https://example.com').internal).toBe(false);
    expect(classifyOrigin(defaults, 'https://x.dnsbazar.com:8443')).toEqual({
      internal: true,
      reason: 'origin',
    });
  });
});
