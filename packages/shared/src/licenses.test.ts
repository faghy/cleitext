import { describe, expect, it } from 'vitest';
import {
  formatLicenseKey,
  isLicenseKey,
  LICENSE_KEY_ALPHABET,
  licenseKeyCheck,
  normalizeLicenseKey,
} from './licenses.js';

const BODY = '7KQ2MXV9RT4HZC8PDA3WNEJB';
const KEY = BODY + licenseKeyCheck(BODY);

describe('license keys', () => {
  it('accepts a key with its check character, in any reasonable spelling', () => {
    expect(isLicenseKey(KEY)).toBe(true);
    expect(isLicenseKey(formatLicenseKey(KEY).toLowerCase())).toBe(true);
    expect(formatLicenseKey(KEY)).toMatch(/^(?:[0-9A-Z]{5}-){4}[0-9A-Z]{5}$/);
    expect(normalizeLicenseKey('o1-il')).toBe('0111');
  });

  it('spots every single mistyped character', () => {
    for (let i = 0; i < KEY.length; i++) {
      for (const c of LICENSE_KEY_ALPHABET) {
        if (c === KEY[i]) continue;
        expect(isLicenseKey(KEY.slice(0, i) + c + KEY.slice(i + 1))).toBe(false);
      }
    }
  });

  it('refuses wrong lengths and characters', () => {
    expect(isLicenseKey(KEY.slice(1))).toBe(false);
    expect(isLicenseKey(`${KEY}0`)).toBe(false);
    expect(isLicenseKey(KEY.replace(/.$/, 'U'))).toBe(false);
    expect(isLicenseKey('')).toBe(false);
  });
});
