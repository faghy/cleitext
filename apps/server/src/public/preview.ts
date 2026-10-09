import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed preview links (RF-CNT-09): `/__preview/<entryId>?token=…`, valid for
 * one hour, verifiable by every server process sharing APP_SECRET.
 */
const TTL_SECONDS = 3_600;

export function createPreviewToken(secret: string, entryId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + TTL_SECONDS;
  return `${expires}.${sign(secret, entryId, expires)}`;
}

export function verifyPreviewToken(
  secret: string,
  entryId: string,
  token: string,
  now = Date.now(),
): boolean {
  const [expiresRaw, signature] = token.split('.');
  const expires = Number(expiresRaw);
  if (!Number.isInteger(expires) || !signature || expires < Math.floor(now / 1000)) return false;
  const expected = Buffer.from(sign(secret, entryId, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function sign(secret: string, entryId: string, expires: number): string {
  return createHmac('sha256', secret).update(`preview:${entryId}:${expires}`).digest('base64url');
}
