import { describe, expect, it } from 'vitest';
import { codeChallenge, codeVerifier, randomState, sameText } from '../src/pkce';

describe('PKCE', () => {
  it('makes the S256 challenge of RFC 7636', () => {
    expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('makes verifiers of 43 unreserved characters, each different', () => {
    const a = codeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeVerifier()).not.toBe(a);
    expect(randomState()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('compares states', () => {
    expect(sameText('abc', 'abc')).toBe(true);
    expect(sameText('abc', 'abd')).toBe(false);
    expect(sameText('abc', 'abcd')).toBe(false);
  });
});
