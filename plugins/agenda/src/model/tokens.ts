/**
 * Signed links for customers, without an account: the appointment's id,
 * its version (`sequence`, raised when it is moved, so older links stop
 * working) and an expiry, signed with HMAC-SHA256 and a key of the site.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface LinkClaims {
  /** The appointment. */
  id: string;
  /** Its sequence when the link was made. */
  seq: number;
  /** Expiry, in seconds since 1970. */
  exp: number;
}

const b64 = (data: Buffer | string) => Buffer.from(data).toString('base64url');

function signature(key: string, payload: string): string {
  return b64(createHmac('sha256', key).update(payload).digest());
}

export function signLink(key: string, claims: LinkClaims): string {
  const payload = b64(JSON.stringify({ i: claims.id, s: claims.seq, e: claims.exp }));
  return `${payload}.${signature(key, payload)}`;
}

/** The claims of a valid, unexpired link; null otherwise. */
export function readLink(key: string, token: unknown, nowMs = Date.now()): LinkClaims | null {
  if (typeof token !== 'string' || token.length > 400) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(signature(key, payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const o = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (typeof o.i !== 'string' || typeof o.s !== 'number' || typeof o.e !== 'number') return null;
    if (o.e * 1000 < nowMs) return null;
    return { id: o.i, seq: o.s, exp: o.e };
  } catch {
    return null;
  }
}

/** Links work until a week after the appointment (its calendar file stays reachable). */
export function linkExpiry(endMs: number): number {
  return Math.floor(endMs / 1000) + 7 * 86400;
}
