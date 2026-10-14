import { request } from 'node:http';
import { request as requestTls } from 'node:https';
import { banRegex, chunks, cloudflareTag } from './protocol';

export interface PurgeResult {
  target: 'varnish' | 'cloudflare';
  ok: boolean;
  /** What was purged: the host, or the number of tags. */
  detail: string;
  error?: string;
}

/**
 * A BAN to Varnish for one host of the site: the pages with these tags, or
 * all of them (`tags` null). Through node:http: fetch cannot set `Host`.
 */
export function varnishBan(
  base: string,
  host: string,
  tags: string[] | null,
): Promise<PurgeResult> {
  const detail = tags ? `${host}: ${tags.join(' ')}` : `${host}: all`;
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      resolve({ target: 'varnish', ok: false, detail, error: 'Invalid Varnish address' });
      return;
    }
    const send = url.protocol === 'https:' ? requestTls : request;
    const req = send(
      url,
      {
        method: 'BAN',
        headers: { host, ...(tags ? { 'x-cleitext-ban': banRegex(tags) } : {}) },
        timeout: 5000,
      },
      (res) => {
        res.resume();
        const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
        resolve({
          target: 'varnish',
          ok,
          detail,
          ...(ok ? {} : { error: `Varnish answered ${res.statusCode}` }),
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('no answer in 5 seconds')));
    req.on('error', (error) =>
      resolve({ target: 'varnish', ok: false, detail, error: error.message }),
    );
    req.end();
  });
}

/** The Cloudflare API (another address in tests). */
function cloudflareApi(): string {
  return (process.env.EDGE_CACHE_CLOUDFLARE_API || 'https://api.cloudflare.com/client/v4').replace(
    /\/+$/,
    '',
  );
}

/** Purges the site's pages with these tags from a Cloudflare zone, 30 tags per call. */
export async function cloudflarePurge(
  zone: string,
  token: string,
  siteId: string,
  tags: string[],
): Promise<PurgeResult> {
  const all = [...new Set(tags)].map((t) => cloudflareTag(siteId, t));
  const detail = `${all.length} tag${all.length === 1 ? '' : 's'}`;
  try {
    for (const group of chunks(all, 30)) {
      const res = await fetch(`${cloudflareApi()}/zones/${encodeURIComponent(zone)}/purge_cache`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tags: group }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        errors?: { code?: number; message?: string }[];
      };
      if (!res.ok || body.success === false) {
        const message = body.errors
          ?.map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim())
          .join('; ');
        return {
          target: 'cloudflare',
          ok: false,
          detail,
          error: message || `Cloudflare answered ${res.status}`,
        };
      }
    }
    return { target: 'cloudflare', ok: true, detail };
  } catch (error) {
    return { target: 'cloudflare', ok: false, detail, error: (error as Error).message };
  }
}

/**
 * Checks that a Cloudflare token is valid and active, without purging
 * anything (a token limited to "Cache Purge" cannot read the zone).
 */
export async function cloudflareCheck(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${cloudflareApi()}/user/tokens/verify`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      result?: { status?: string };
      errors?: { message?: string }[];
    };
    if (res.ok && body.success !== false && (body.result?.status ?? 'active') === 'active') {
      return null;
    }
    return body.errors?.map((e) => e.message).join('; ') || `Cloudflare answered ${res.status}`;
  } catch (error) {
    return (error as Error).message;
  }
}
