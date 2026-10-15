import { isLicenseKey } from '@cleitext/shared';
import { describe, expect, it } from 'vitest';
import { addMonths, isKey, keyHash, newKey, signDownload, verifyDownload } from './keys';

describe('license keys', () => {
  it('makes keys Cleitext accepts, and spots mistyped ones', () => {
    for (let i = 0; i < 200; i++) {
      const key = newKey();
      expect(key).toMatch(/^(?:[0-9A-HJKMNP-TV-Z]{5}-){4}[0-9A-HJKMNP-TV-Z]{5}$/);
      expect(isKey(key)).toBe(true);
      expect(isLicenseKey(key)).toBe(true);
      const typo = key.replace(/^./, (c) => (c === '7' ? '8' : '7'));
      expect(isKey(typo)).toBe(false);
    }
  });

  it('hashes the same key the same way, however it is written', () => {
    const key = newKey();
    expect(keyHash(key.toLowerCase().replace(/-/g, ' '))).toBe(keyHash(key));
  });
});

describe('download addresses', () => {
  const secret = 'test-secret';
  const now = Date.UTC(2026, 9, 15);
  const parse = (url: string) => {
    const u = new URL(url, 'https://store.test/v1/');
    const [, , slug, version] = u.pathname.split('/').slice(1);
    return {
      slug: slug!,
      version: version!,
      ref: u.searchParams.get('ref')!,
      exp: u.searchParams.get('exp')!,
      sig: u.searchParams.get('sig')!,
    };
  };

  it('are valid for five minutes, for that theme, version and license only', () => {
    const signed = parse(
      signDownload(secret, { slug: 'vitality', version: '1.0.0', ref: 'demo' }, now),
    );
    expect(signed).toMatchObject({ slug: 'vitality', version: '1.0.0', ref: 'demo' });
    expect(verifyDownload(secret, signed, now)).toBe(true);
    expect(verifyDownload(secret, signed, now + 299_000)).toBe(true);
    expect(verifyDownload(secret, signed, now + 301_000)).toBe(false);
    expect(verifyDownload(secret, { ...signed, version: '2.0.0' }, now)).toBe(false);
    expect(verifyDownload(secret, { ...signed, ref: 'other' }, now)).toBe(false);
    expect(verifyDownload(secret, { ...signed, exp: String(Number(signed.exp) + 3600) }, now)).toBe(
      false,
    );
    expect(verifyDownload('another-secret', signed, now)).toBe(false);
  });
});

describe('addMonths', () => {
  it('keeps the day, or the end of a shorter month', () => {
    expect(addMonths(new Date('2026-10-15T10:00:00Z'), 12).toISOString()).toBe(
      '2027-10-15T10:00:00.000Z',
    );
    expect(addMonths(new Date('2027-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
    expect(addMonths(new Date('2027-11-30T00:00:00Z'), 3).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });
});
