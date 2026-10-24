/**
 * The time token and the salted hashes. Pages are cached, so the form
 * cannot carry the moment it was drawn: the plugin's script asks
 * `GET /_antispam/token` when the visitor starts filling a form (or at the
 * latest when sending it) and puts `<time>.<signature>` in a hidden field.
 * The server then knows when the visitor started, signed with a key of the
 * site, and refuses submissions sooner than a few seconds after it.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { TokenState } from './rules';

/** Tokens older than this are stale. */
export const TOKEN_MAX_AGE_MS = 24 * 3600_000;
/** A token from the future is forged (clock differences between processes aside). */
const SKEW_MS = 60_000;

/** A new random secret of a site. */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Keys derived from the site's secret, one per use. */
export interface Keys {
  token: Buffer;
  ip: Buffer;
  text: Buffer;
}

export function deriveKeys(secret: string): Keys {
  const derive = (label: string) => createHmac('sha256', secret).update(label).digest();
  return { token: derive('token'), ip: derive('ip'), text: derive('text') };
}

const mac = (key: Buffer, value: string) =>
  createHmac('sha256', key).update(value).digest('base64url').slice(0, 32);

/** `<time>.<signature>`: the moment the visitor started. */
export function makeToken(keys: Keys, now = Date.now()): string {
  return `${now}.${mac(keys.token, String(now))}`;
}

/** What a submitted token says, for a minimum fill time in seconds. */
export function checkToken(
  keys: Keys,
  token: unknown,
  minSeconds: number,
  now = Date.now(),
): Exclude<TokenState, 'unmarked'> {
  if (typeof token !== 'string' || token === '') return 'missing';
  const match = /^(\d{10,16})\.([\w-]{32})$/.exec(token);
  if (!match) return 'invalid';
  const expected = Buffer.from(mac(keys.token, match[1]!));
  const given = Buffer.from(match[2]!);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
  const time = Number(match[1]);
  if (time > now + SKEW_MS) return 'invalid';
  if (now - time > TOKEN_MAX_AGE_MS) return 'stale';
  if (now - time < minSeconds * 1000) return 'too-fast';
  return 'ok';
}

/** A visitor's address as a salted hash: never stored in clear. */
export function ipHash(keys: Keys, ip: string): string {
  return mac(keys.ip, ip.trim().toLowerCase());
}

/** A text's fingerprint, salted: the text cannot be read back from it. */
export function textHash(keys: Keys, normalized: string): string {
  return mac(keys.text, normalized);
}
