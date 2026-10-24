import { describe, expect, it } from 'vitest';
import {
  checkToken,
  deriveKeys,
  ipHash,
  makeToken,
  newSecret,
  textHash,
  TOKEN_MAX_AGE_MS,
} from './token';

const keys = deriveKeys('a-secret-of-the-site');
const now = 1_790_000_000_000;

describe('the time token', () => {
  it('passes after the minimum time', () => {
    expect(checkToken(keys, makeToken(keys, now - 5000), 3, now)).toBe('ok');
  });

  it('refuses a submission sooner than the minimum time', () => {
    expect(checkToken(keys, makeToken(keys, now - 1000), 3, now)).toBe('too-fast');
    expect(checkToken(keys, makeToken(keys, now - 1000), 0, now)).toBe('ok');
  });

  it('tells missing, forged, future and stale tokens apart', () => {
    expect(checkToken(keys, '', 3, now)).toBe('missing');
    expect(checkToken(keys, undefined, 3, now)).toBe('missing');
    expect(checkToken(keys, 'garbage', 3, now)).toBe('invalid');
    const token = makeToken(keys, now - 5000);
    expect(
      checkToken(keys, `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, 3, now),
    ).toBe('invalid');
    // Another site's key.
    expect(checkToken(deriveKeys('other'), token, 3, now)).toBe('invalid');
    // A time changed by hand.
    expect(checkToken(keys, token.replace(/^\d+/, String(now - 9000)), 3, now)).toBe('invalid');
    expect(checkToken(keys, makeToken(keys, now + 120_000), 3, now)).toBe('invalid');
    expect(checkToken(keys, makeToken(keys, now - TOKEN_MAX_AGE_MS - 1), 3, now)).toBe('stale');
  });
});

describe('hashes', () => {
  it('are salted per site and never give the address back', () => {
    const a = ipHash(keys, '203.0.113.5');
    expect(a).toHaveLength(32);
    expect(a).not.toContain('203');
    expect(ipHash(keys, '203.0.113.5')).toBe(a);
    expect(ipHash(deriveKeys('other'), '203.0.113.5')).not.toBe(a);
    expect(textHash(keys, 'hello world')).not.toBe(ipHash(keys, 'hello world'));
  });

  it('come from a random secret', () => {
    expect(newSecret()).not.toBe(newSecret());
    expect(newSecret()).toMatch(/^[\w-]{43}$/);
  });
});
