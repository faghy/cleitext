import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/** A secret stored in the database, encrypted with a key derived from APP_SECRET. */
export interface SealedSecret {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

const keys = new Map<string, Buffer>();

function keyOf(appSecret: string): Buffer {
  let key = keys.get(appSecret);
  if (!key) keys.set(appSecret, (key = scryptSync(appSecret, 'cleitext:secrets:v1', 32)));
  return key;
}

/** AES-256-GCM (docs/ARCHITECTURE.md §14: secrets in the database are encrypted). */
export function seal(appSecret: string, value: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(appSecret), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/** The value, or null when it cannot be decrypted (e.g. APP_SECRET changed). */
export function unseal(appSecret: string, sealed: unknown): string | null {
  const s = sealed as Partial<SealedSecret> | null;
  if (!s || s.v !== 1 || !s.iv || !s.tag || !s.data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOf(appSecret), Buffer.from(s.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(s.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(s.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
