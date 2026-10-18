import type { PluginContext } from '@cleitext/plugin-sdk';

/**
 * The time check against spam: each form carries the moment it was drawn,
 * signed with a key of the site, so that a message sent a moment after the
 * page was fetched (a bot) is refused. Web Crypto only: this file is also
 * part of the editor's bundle.
 */

/** Messages sent sooner than this after the form was drawn are refused. */
export const MIN_FILL_MS = 3000;

const SECRET = 'form-key';
const keys = new Map<string, Promise<CryptoKey>>();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(raw),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** The site's signing key, made on first use and kept with the plugin's secrets. */
export function formKey(ctx: PluginContext, siteId: string): Promise<CryptoKey> {
  let key = keys.get(siteId);
  if (!key) {
    key = (async () => {
      let raw = await ctx.secrets.get(siteId, SECRET);
      if (!raw) {
        raw = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
        await ctx.secrets.set(siteId, SECRET, raw);
      }
      return importKey(raw);
    })();
    // A failure is not kept: the next form tries again.
    key.catch(() => keys.delete(siteId));
    keys.set(siteId, key);
  }
  return key;
}

async function sign(key: CryptoKey, scope: string, time: number): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${scope}.${time}`));
  return toBase64Url(new Uint8Array(mac)).slice(0, 32);
}

/** `<time>.<signature>`: when the form was drawn. */
export async function makeToken(key: CryptoKey, scope: string, now = Date.now()): Promise<string> {
  return `${now}.${await sign(key, scope, now)}`;
}

/**
 * When the form was drawn, from its token, or null when the token is
 * missing, forged or from another page.
 */
export async function tokenTime(
  key: CryptoKey,
  scope: string,
  token: unknown,
): Promise<number | null> {
  if (typeof token !== 'string') return null;
  const match = /^(\d{10,16})\.([\w-]{32})$/.exec(token);
  if (!match) return null;
  const time = Number(match[1]);
  return (await sign(key, scope, time)) === match[2] ? time : null;
}
