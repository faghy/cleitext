/**
 * What Cleitext says to the caches in front of it, and how it asks them to
 * forget pages. Pure functions, shared by the server entry and the tests.
 *
 * Varnish (rules in the VCL of the server, see the README):
 * - every cached page carries `x-cleitext-tags: site entry:… type:…`;
 * - a `BAN` request with the site's `Host` and `x-cleitext-ban: <regex>`
 *   forgets the pages with those tags; without the header, the whole site.
 *
 * Cloudflare: `Cache-Tag` with tags prefixed by the site (a zone may serve
 * several sites), purged through the API (by tag: every plan since 2025).
 */

/** Varnish's default limit for a response header is 8 KB: keep well under it. */
const VARNISH_MAX = 6000;
/** Cloudflare reads at most 16 KB of Cache-Tag. */
const CLOUDFLARE_MAX = 15000;

/** `site` first, so a cut list still lets the whole site be purged. */
function ordered(tags: string[]): string[] {
  const unique = [...new Set(tags.filter((t) => t && !/\s/.test(t)))];
  return unique.includes('site') ? ['site', ...unique.filter((t) => t !== 'site')] : unique;
}

function joinWithin(items: string[], separator: string, max: number): string {
  let out = '';
  for (const item of items) {
    const next = out ? `${out}${separator}${item}` : item;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

export function varnishTags(tags: string[]): string {
  return joinWithin(ordered(tags), ' ', VARNISH_MAX);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The regex of a BAN: pages whose tag list contains any of the tags. */
export function banRegex(tags: string[]): string {
  return `(^| )(${ordered(tags).map(escapeRegex).join('|')})( |$)`;
}

/** A Cloudflare tag of a site: printable, without spaces or commas, case-insensitive. */
export function cloudflareTag(siteId: string, tag: string): string {
  return `cx-${siteId.replace(/-/g, '').slice(0, 12)}-${tag}`
    .toLowerCase()
    .replace(/[^a-z0-9:._-]/g, '-')
    .slice(0, 1024);
}

export function cloudflareTags(siteId: string, tags: string[]): string {
  return joinWithin(
    ordered(tags).map((t) => cloudflareTag(siteId, t)),
    ',',
    CLOUDFLARE_MAX,
  );
}

export interface EdgeOptions {
  varnish: boolean;
  cloudflare: boolean;
  /** Seconds the caches keep a page (pages are purged when they change anyway). */
  ttl: number;
}

/** The headers of a page going into the caches. */
export function edgeHeaders(
  options: EdgeOptions,
  siteId: string,
  status: number,
  tags: string[],
): Record<string, string> {
  if (!options.varnish && !options.cloudflare) return {};
  // A missing page is kept briefly: it may be published in a minute.
  const ttl = status === 200 ? options.ttl : Math.min(options.ttl, 60);
  // Browsers still ask every time (and get a 304): only shared caches keep the page.
  const headers: Record<string, string> = {
    'cache-control': `public, max-age=0, s-maxage=${ttl}, must-revalidate`,
  };
  if (options.varnish) headers['x-cleitext-tags'] = varnishTags(tags);
  if (options.cloudflare) {
    headers['cdn-cache-control'] = `max-age=${ttl}`;
    headers['cache-tag'] = cloudflareTags(siteId, tags);
  }
  return headers;
}

/** Groups of at most `size`: the Cloudflare API takes a limited number of tags per call. */
export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The rules of a Cloudflare Cache Rule for the site: what may be cached. */
export function cloudflareRule(hosts: string[]): string {
  const host =
    hosts.length === 1
      ? `http.host eq "${hosts[0]}"`
      : `http.host in {${hosts.map((h) => `"${h}"`).join(' ')}}`;
  return `(${host} and not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/admin") and not starts_with(http.request.uri.path, "/cl-admin") and not starts_with(http.request.uri.path, "/__preview") and not http.cookie contains "cleitext_session")`;
}
