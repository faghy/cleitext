/**
 * Proof Key for Code Exchange (RFC 7636, S256) and the sign-in's state: the
 * server gives the token only to whoever holds the verifier of the challenge
 * sent with the sign-in.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 43 characters of the unreserved set (32 random bytes, base64url). */
export function codeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function randomState(): string {
  return randomBytes(24).toString('base64url');
}

/** Compares two texts in constant time. */
export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
