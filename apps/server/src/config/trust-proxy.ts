import { isIP } from 'node:net';

/**
 * Which proxies in front of the server are trusted to report the visitor's
 * address (`X-Forwarded-For`), scheme and host (`TRUST_PROXY`,
 * docs/DEPLOYMENT.md). `X-Forwarded-For` is walked from the right, starting
 * from the address that actually connected: each trusted hop hands over to
 * the address it reports, and the first untrusted one is the visitor. The
 * leftmost entries are written by the client and never trusted as such.
 *
 * - `false`: the headers are ignored, the visitor is whoever connected.
 * - a number: that many hops are trusted, whatever their address. Only for a
 *   server nobody can reach directly (it listens on 127.0.0.1).
 * - a list of addresses, networks (CIDR) and the keywords `loopback`,
 *   `linklocal` and `uniquelocal`.
 */
export type TrustProxy = false | number | string[];

/**
 * `TRUST_PROXY=true`: loopback, link-local and private networks, where nginx
 * (Plesk), HAProxy over WireGuard and similar proxies live. A proxy on a
 * public address must be listed explicitly. `uniquelocal` already covers the
 * RFC 1918 networks and fc00::/7: they are repeated to make the set obvious.
 */
export const PRIVATE_NETWORKS: readonly string[] = [
  'loopback',
  'linklocal',
  'uniquelocal',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
  'fc00::/7',
];

/**
 * Cloudflare's published edge networks (`TRUST_CLOUDFLARE=true`), as of
 * 2026-10-21. To refresh, replace both lists with the output of
 * `curl -s https://www.cloudflare.com/ips-v4` and
 * `curl -s https://www.cloudflare.com/ips-v6`, and update the date.
 */
export const CLOUDFLARE_IPS_DATE = '2026-10-21';
export const CLOUDFLARE_IPV4: readonly string[] = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];
export const CLOUDFLARE_IPV6: readonly string[] = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** Why an entry of a `TRUST_PROXY` list is not an address, a network or a keyword; null when it is. */
export function invalidTrustEntry(entry: string): string | null {
  if (KEYWORDS.has(entry)) return null;
  const [address = '', bits, ...rest] = entry.split('/');
  const kind = isIP(address);
  if (!kind || rest.length > 0) {
    return `"${entry}" is not an IP address, a network (CIDR) or one of loopback, linklocal, uniquelocal`;
  }
  if (bits === undefined) return null;
  const max = kind === 4 ? 32 : 128;
  if (!/^\d{1,3}$/.test(bits) || Number(bits) > max) {
    return `"${entry}": the prefix length must be a number from 0 to ${max}`;
  }
  return null;
}

/**
 * Reads `TRUST_PROXY`: `false`/`0` or empty, `true` (the private networks),
 * a positive number of hops, or a comma-separated list. Returns the setting,
 * or the reason it is invalid.
 */
export function parseTrustProxy(
  value: string | undefined,
): { ok: true; value: TrustProxy } | { ok: false; error: string } {
  const text = (value ?? '').trim();
  const lower = text.toLowerCase();
  if (lower === '' || lower === 'false' || lower === '0') return { ok: true, value: false };
  if (lower === 'true') return { ok: true, value: [...PRIVATE_NETWORKS] };
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    if (hops > 100) return { ok: false, error: 'a number of hops must be from 1 to 100' };
    return { ok: true, value: hops };
  }
  const entries = text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const errors = entries.map(invalidTrustEntry).filter((error) => error !== null);
  if (errors.length > 0) {
    return {
      ok: false,
      error: `use false, true, a number of hops or a comma-separated list of addresses: ${errors.join('; ')}`,
    };
  }
  return { ok: true, value: entries };
}

/** Adds Cloudflare's networks to the trusted set (`TRUST_CLOUDFLARE=true`). */
export function withCloudflare(trust: TrustProxy): TrustProxy {
  if (typeof trust === 'number') {
    throw new Error('TRUST_CLOUDFLARE cannot be combined with a number of hops');
  }
  return [...(trust || []), ...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6];
}

/**
 * The `trustProxy` option of Fastify. A number becomes a function, because
 * Fastify 5 ignores the headers entirely for a bare hop count.
 */
export function fastifyTrustProxy(
  trust: TrustProxy,
): false | string[] | ((address: string, hop: number) => boolean) {
  if (typeof trust === 'number') return (_address, hop) => hop < trust;
  return trust;
}
