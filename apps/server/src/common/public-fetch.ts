import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/**
 * Downloads a file from an address that someone else chose (an AI assistant,
 * a WordPress export), without letting them reach the server's own network:
 * every address a name resolves to is checked when connecting, so a DNS
 * answer cannot change between the check and the download. Redirects are
 * followed and checked the same way; size and time are limited.
 */

export class PublicFetchError extends Error {}

const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE.addSubnet(net, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  // IPv4 inside IPv6 (::ffff:10.0.0.1) is checked as the IPv4 address it is.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]!);
  const family = isIP(address);
  if (family === 0) return false;
  return !PRIVATE.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** DNS lookup that refuses names resolving to private addresses. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 4);
    const list = addresses as unknown as LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || list.length === 0) {
      return callback(new PublicFetchError(`${hostname} is not a public address.`), '', 4);
    }
    if ((options as { all?: boolean }).all)
      return (callback as unknown as (e: null, all: LookupAddress[]) => void)(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
};

export interface PublicFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  /** Also plain http (old WordPress sites); https only otherwise. */
  allowHttp?: boolean;
  accept?: string;
  userAgent?: string;
  /** GET when left out. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Buffer;
}

interface Answer {
  status: number;
  type: string;
  location?: string | undefined;
  data: Buffer;
}

const MAX_REDIRECTS = 3;

function get(url: URL, options: PublicFetchOptions): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const http = url.protocol === 'http:';
    if (url.protocol !== 'https:' && !(http && options.allowHttp)) {
      return reject(
        new PublicFetchError(
          options.allowHttp
            ? 'Only http and https addresses are accepted.'
            : 'Only https addresses are accepted.',
        ),
      );
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !isPublicAddress(host)) {
      return reject(new PublicFetchError('This address is not public.'));
    }
    const tooLarge = () =>
      new PublicFetchError(
        `The file is larger than ${Math.round(options.maxBytes / 1024 / 1024)} MB.`,
      );
    const onResponse = (res: IncomingMessage) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return resolve({ status, type: '', location: res.headers.location, data: Buffer.alloc(0) });
      }
      if (Number(res.headers['content-length'] ?? 0) > options.maxBytes) {
        res.destroy();
        return reject(tooLarge());
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > options.maxBytes) {
          res.destroy();
          reject(tooLarge());
        } else chunks.push(chunk);
      });
      res.on('end', () =>
        resolve({
          status,
          type: String(res.headers['content-type'] ?? ''),
          data: Buffer.concat(chunks),
        }),
      );
      res.on('error', reject);
    };
    const req = (http ? httpRequest : httpsRequest)(
      url,
      {
        lookup: safeLookup,
        timeout: options.timeoutMs ?? 20_000,
        method: options.method ?? 'GET',
        headers: {
          ...options.headers,
          'user-agent': options.userAgent ?? 'Cleitext/1.0',
          accept: options.accept ?? options.headers?.accept ?? '*/*',
          ...(options.body !== undefined
            ? { 'content-length': String(Buffer.byteLength(options.body)) }
            : {}),
        },
      },
      onResponse,
    );
    req.on('timeout', () => req.destroy(new PublicFetchError('The download took too long.')));
    req.on('error', (error) =>
      reject(
        error instanceof PublicFetchError
          ? error
          : new PublicFetchError(`Download failed: ${error.message}`),
      ),
    );
    req.end(options.body);
  });
}

/** The file at a public address: its final address, content type and bytes. */
export async function fetchPublic(
  address: string,
  options: PublicFetchOptions,
): Promise<{ url: URL; type: string; data: Buffer }> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new PublicFetchError('Not a valid address.');
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await get(url, options);
    if (res.location) {
      url = new URL(res.location, url);
      continue;
    }
    if (res.status !== 200) throw new PublicFetchError(`The address answered ${res.status}.`);
    return { url, type: res.type.split(';')[0]!.trim().toLowerCase(), data: res.data };
  }
  throw new PublicFetchError('Too many redirects.');
}

/**
 * Sends a request to a public address (webhooks, mailing services) with the
 * same protection as `fetchPublic`. Redirects are not followed; the answer
 * is returned whatever its status.
 */
export async function sendPublic(
  address: string,
  options: PublicFetchOptions,
): Promise<{ status: number; type: string; data: Buffer }> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new PublicFetchError('Not a valid address.');
  }
  const res = await get(url, options);
  return { status: res.status, type: res.type.split(';')[0]!.trim().toLowerCase(), data: res.data };
}
