import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from '../src/auth/totp.js';

// RFC 6238 test secret ("12345678901234567890"), SHA-1.
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    // 59 s → 94287082, 1111111109 s → 07081804 (8 digits); we use the last 6.
    expect(totpCode(SECRET, Math.floor(59 / 30))).toBe('287082');
    expect(totpCode(SECRET, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpCode(SECRET, Math.floor(2000000000 / 30))).toBe('279037');
  });

  it('accepts one step of drift and refuses reused codes', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(SECRET, totpCode(SECRET, step), null, now)).toBe(step);
    expect(verifyTotp(SECRET, totpCode(SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(SECRET, totpCode(SECRET, step - 2), null, now)).toBeNull();
    expect(verifyTotp(SECRET, totpCode(SECRET, step), step, now)).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', null, now)).toBeNull();
  });

  it('round-trips base32 and builds otpauth addresses', () => {
    expect(base32Decode(SECRET).toString()).toBe('12345678901234567890');
    expect(otpauthUrl('My Site', 'ada@example.com', SECRET)).toBe(
      `otpauth://totp/My%20Site%3Aada%40example.com?secret=${SECRET}&issuer=My+Site&algorithm=SHA1&digits=6&period=30`,
    );
  });

  it('makes distinct recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    expect(normalizeRecoveryCode(' K3M7Q-7XW2P ')).toBe('k3m7q7xw2p');
  });
});
