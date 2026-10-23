/**
 * Add-to-cart links (Cleishop 1.8): `GET /cart/add?product=<id>&quantity=2`
 * adds a product to the visitor's cart and goes to the cart (or back to the
 * product with `&to=product`), as WooCommerce's `?add-to-cart=<id>` links do;
 * `/cart?add-to-cart=<id>` is read the same way. A GET that changes something
 * can be opened from any site, so these links do as little as they can:
 *
 * - simple products only: a product with options goes to its page, where the
 *   visitor chooses them, and nothing is added;
 * - at most `LINK_MAX_QUANTITY` pieces per link, with the cart's stock rules;
 * - a few links per visitor in a while (`linkLimit`);
 * - only a page the visitor opens: a picture, a script, a prefetch or a
 *   search engine's visit from another page adds nothing (`linkRefusal`);
 * - never cached, `noindex`, and nothing else changes: no coupons, no
 *   checkout, no other cart, only the visitor's own one.
 */

/** The most pieces one link adds; the cart page allows more. */
export const LINK_MAX_QUANTITY = 10;

/** Headers of every answer of the links: never cached, never in search engines. */
export const LINK_HEADERS = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
} as const;

const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX = /^\/[a-z]{2}(?:-[a-z]{2,4})?$/i;

/** A language prefix of the site's own addresses (`/it`), '' for anything else. */
export const safePrefix = (prefix: string) => (PREFIX.test(prefix) ? prefix : '');

export interface CartLinkOptions {
  /** 1 by default, at most `LINK_MAX_QUANTITY`. */
  quantity?: number;
  /** Where the visitor goes after: the cart (default) or back to the product. */
  to?: 'cart' | 'product';
}

/**
 * The address of a link that adds a product to the cart, in a language
 * (`/it`, or '' for the default one); '' when the id is not a product's.
 */
export function cartAddUrl(
  prefix: string,
  productId: string,
  options: CartLinkOptions = {},
): string {
  if (!ENTRY_ID.test(productId)) return '';
  const params = new URLSearchParams({ product: productId.toLowerCase() });
  const quantity = linkQuantity(options.quantity);
  if (quantity !== 1) params.set('quantity', String(quantity));
  if (options.to === 'product') params.set('to', 'product');
  return `${safePrefix(prefix)}/cart/add?${params}`;
}

/** The quantity of a link: a whole number from 1 to `LINK_MAX_QUANTITY`, 1 when it is not one. */
export function linkQuantity(raw: unknown): number {
  const n = Math.floor(Number(typeof raw === 'string' && raw.trim() === '' ? 1 : (raw ?? 1)));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, LINK_MAX_QUANTITY) : 1;
}

export interface CartLink {
  productId: string;
  quantity: number;
  to: 'cart' | 'product';
}

/**
 * What a link asks for, from its query: `product` (or WooCommerce's
 * `add-to-cart`), `quantity` and `to`. null without a product id.
 */
export function readCartLink(query: Record<string, string | undefined>): CartLink | null {
  const productId = (query.product ?? query['add-to-cart'] ?? '').trim();
  if (!ENTRY_ID.test(productId)) return null;
  return {
    productId: productId.toLowerCase(),
    quantity: linkQuantity(query.quantity),
    to: query.to === 'product' ? 'product' : 'cart',
  };
}

const BOT =
  /bot\b|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|python-|curl\/|wget\//i;

/**
 * Why a link adds nothing, or null when it may: only a GET of a page the
 * visitor opens. Browsers tell what a request is for (`Sec-Fetch-*`): from
 * another site, only a navigation to a page; never a prefetch. Search
 * engines and link previews only see the redirect.
 */
export function linkRefusal(
  method: string,
  headers: Record<string, string | undefined>,
): 'method' | 'prefetch' | 'cross-site' | 'bot' | null {
  if (method !== 'GET') return 'method';
  const purpose = `${headers['sec-purpose'] ?? ''} ${headers.purpose ?? ''} ${headers['x-moz'] ?? ''}`;
  if (/prefetch|prerender/i.test(purpose)) return 'prefetch';
  const site = headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') {
    const mode = headers['sec-fetch-mode'];
    const dest = headers['sec-fetch-dest'];
    if ((mode && mode !== 'navigate') || (dest && dest !== 'document')) return 'cross-site';
  }
  if (BOT.test(headers['user-agent'] ?? '')) return 'bot';
  return null;
}

/** Per-process limiter, as in Forms: enough against casual abuse on one server. */
export function limiter(max: number, windowMs: number, now: () => number = Date.now) {
  const recent = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const times = (recent.get(key) ?? []).filter((at) => t - at < windowMs);
    if (times.length >= max) {
      recent.set(key, times);
      return false;
    }
    times.push(t);
    recent.set(key, times);
    if (recent.size > 10_000) recent.clear();
    return true;
  };
}

/** Links one visitor (site and IP address) may open: 30 every 10 minutes. */
export const LINK_LIMIT = { max: 30, windowMs: 10 * 60_000 };
