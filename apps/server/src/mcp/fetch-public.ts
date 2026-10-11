import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { ToolError } from './errors.js';

/**
 * Downloads an image an assistant pointed to (tool `upload_image`), without
 * letting it reach the server's own network: https only, and every address
 * the name resolves to is checked when connecting (so a DNS answer cannot
 * change between the check and the download). Redirects are followed and
 * checked the same way; size and time are limited.
 */

const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

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
      return callback(new ToolError(`${hostname} is not a public address.`), '', 4);
    }
    if ((options as { all?: boolean }).all)
      return (callback as unknown as (e: null, all: LookupAddress[]) => void)(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
};

function get(url: URL): Promise<{ status: number; type: string; location?: string; data: Buffer }> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== 'https:')
      return reject(new ToolError('Only https addresses are accepted.'));
    if (
      isIP(url.hostname.replace(/^\[|\]$/g, '')) &&
      !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ''))
    ) {
      return reject(new ToolError('This address is not public.'));
    }
    const req = request(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: { 'user-agent': 'Cleitext-MCP/1.0', accept: 'image/*' },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({
            status,
            type: '',
            location: res.headers.location,
            data: Buffer.alloc(0),
          });
        }
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > MAX_BYTES) {
          res.destroy();
          return reject(new ToolError('The image is larger than 15 MB.'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            reject(new ToolError('The image is larger than 15 MB.'));
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
      },
    );
    req.on('timeout', () => req.destroy(new ToolError('The download took too long.')));
    req.on('error', (error) =>
      reject(
        error instanceof ToolError ? error : new ToolError(`Download failed: ${error.message}`),
      ),
    );
    req.end();
  });
}

export async function fetchPublicFile(
  address: string,
): Promise<{ filename: string; data: Buffer }> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new ToolError('Not a valid address.');
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await get(url);
    if (res.location) {
      url = new URL(res.location, url);
      continue;
    }
    if (res.status !== 200) throw new ToolError(`The address answered ${res.status}.`);
    const type = res.type.split(';')[0]!.trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!ext) throw new ToolError('This address is not an image (JPEG, PNG, WebP, GIF or AVIF).');
    const base = (url.pathname.split('/').pop() ?? 'image')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^\w.-]+/g, '-');
    return { filename: `${base.slice(0, 80) || 'image'}.${ext}`, data: res.data };
  }
  throw new ToolError('Too many redirects.');
}
