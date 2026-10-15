import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * License keys (the same format Cleitext checks before asking, see
 * `@cleitext/shared` licenses.ts): 24 random Crockford base32 characters and
 * a Luhn mod 32 check character, shown in five groups of five.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const N = ALPHABET.length;

function luhn(codes: number[], withCheck: boolean): number {
  let factor = withCheck ? 1 : 2;
  let sum = 0;
  for (let i = codes.length - 1; i >= 0; i--) {
    let addend = factor * codes[i]!;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / N) + (addend % N);
    sum += addend;
  }
  return sum % N;
}

export function normalizeKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function isKey(input: string): boolean {
  const key = normalizeKey(input);
  if (key.length !== 25) return false;
  const codes = [...key].map((c) => ALPHABET.indexOf(c));
  return !codes.includes(-1) && luhn(codes, true) === 0;
}

/** A new key, as people read it. */
export function newKey(): string {
  // 24 × 5 bits = 120 bits of randomness (each byte keeps its low 5 bits).
  const codes = [...randomBytes(24)].map((b) => b & 31);
  codes.push((N - luhn(codes, false)) % N);
  return codes
    .map((c) => ALPHABET[c])
    .join('')
    .replace(/(.{5})(?=.)/g, '$1-');
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const keyHash = (key: string) => sha256(normalizeKey(key));
export const keyHint = (key: string) => normalizeKey(key).slice(-5);
export const newToken = () => randomBytes(32).toString('base64url');

/** Download addresses live this long. */
export const DOWNLOAD_TTL_S = 5 * 60;

function signature(secret: string, parts: string[]): string {
  return createHmac('sha256', secret).update(parts.join('|')).digest('base64url');
}

/** `download/<slug>/<version>?…`, relative to the license server, valid for 5 minutes. */
export function signDownload(
  secret: string,
  input: { slug: string; version: string; ref: string },
  now = Date.now(),
): string {
  const exp = String(Math.floor(now / 1000) + DOWNLOAD_TTL_S);
  const sig = signature(secret, [input.slug, input.version, input.ref, exp]);
  const query = new URLSearchParams({ ref: input.ref, exp, sig });
  return `download/${encodeURIComponent(input.slug)}/${encodeURIComponent(input.version)}?${query}`;
}

export function verifyDownload(
  secret: string,
  input: { slug: string; version: string; ref: string; exp: string; sig: string },
  now = Date.now(),
): boolean {
  if (!/^\d{1,12}$/.test(input.exp) || Number(input.exp) * 1000 < now) return false;
  const expected = Buffer.from(
    signature(secret, [input.slug, input.version, input.ref, input.exp]),
  );
  const given = Buffer.from(input.sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Per-process limiter, as in Forms: enough against casual abuse on one server. */
export function limiter(max: number, windowMs: number) {
  const recent = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const times = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
    if (times.length >= max) return false;
    times.push(now);
    recent.set(key, times);
    if (recent.size > 10_000) recent.clear();
    return true;
  };
}

/** `from` plus whole months (end of month kept: 31 Jan + 1 → 28/29 Feb). */
export function addMonths(from: Date, months: number): Date {
  const date = new Date(from);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
}
