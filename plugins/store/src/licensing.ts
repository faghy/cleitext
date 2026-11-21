import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Rules of licenses that do not need the database: what a bundle covers,
 * seats counted per site, who sees a license in the portal, partner prices.
 */

export interface ProductLike {
  slug: string;
  bundle: boolean;
  /** Bundles: the products covered; null for every product that is not a bundle. */
  covers: string[] | null;
  /** Free products (public downloads only) are not part of "every product". */
  free?: boolean;
}

/**
 * Whether a license of `product` is valid for `slug`. `target` is the product
 * sold as `slug` (null when the store does not sell it): a bundle of "every
 * product" covers the products that exist and are not bundles themselves.
 */
export function coversSlug(
  product: ProductLike,
  slug: string,
  target: ProductLike | null,
): boolean {
  if (product.slug === slug) return true;
  if (!product.bundle) return false;
  if (product.covers === null) return target !== null && !target.bundle && !target.free;
  return product.covers.includes(slug);
}

export interface ActiveActivation {
  siteOrigin: string;
  /** Null for activations made before bundles: the license's own product. */
  productSlug: string | null;
}

/** Test sites that never take a seat, per license. */
export const FREE_TEST_SITES = 2;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(test|local|localhost)$/;
const TEST_LABELS = new Set(['staging', 'stage', 'dev', 'test']);

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}
const withoutWww = (host: string) => host.replace(/^www\./, '');

/**
 * Whether `origin` is a test copy among the sites of a license: a local
 * address, or a staging./stage./dev./test. subdomain of another site of the
 * same license (staging.example.com next to example.com or www.example.com).
 */
export function testSiteKind(
  origin: string,
  origins: Iterable<string>,
): 'local' | 'staging' | null {
  const host = hostOf(origin);
  if (!host) return null;
  if (LOCAL_HOST.test(host)) return 'local';
  const [label, ...rest] = host.split('.');
  if (!label || !TEST_LABELS.has(label) || rest.length < 2) return null;
  const parent = rest.join('.');
  for (const other of origins) {
    const h = hostOf(other);
    if (h && h !== host && withoutWww(h) === parent) return 'staging';
  }
  return null;
}

/** Whether a site is one of ours (Store 1.6 internal sites): it never takes a seat. */
export type InternalOf = (origin: string) => boolean;
const noneInternal: InternalOf = () => false;

/** The sites of a license that are test copies, up to FREE_TEST_SITES (the oldest first). */
export function freeTestSites(
  active: ActiveActivation[],
  internal: InternalOf = noneInternal,
): Set<string> {
  const origins = [...new Set(active.map((a) => a.siteOrigin))];
  return new Set(
    origins
      .filter((o) => !internal(o) && testSiteKind(o, origins) !== null)
      .slice(0, FREE_TEST_SITES),
  );
}

/**
 * Seats in use: sites, not products (one site using 3 products of a bundle is
 * 1 seat). Our own sites and test copies of a site of the license take none.
 */
export function seatsInUse(
  active: ActiveActivation[],
  internal: InternalOf = noneInternal,
): number {
  const origins = [...new Set(active.map((a) => a.siteOrigin))].filter((o) => !internal(o));
  return origins.length - freeTestSites(active, internal).size;
}

export type ActivationDecision =
  /** This site already activated this product: the same row, a new token. */
  | { kind: 'reuse'; index: number }
  /** A new row; `newSeat` is false when the site already holds a seat. */
  | { kind: 'add'; newSeat: boolean }
  | { kind: 'full' };

/** What activating `slug` on `origin` does to a license with `seats` (0: no limit). */
export function decideActivation(input: {
  active: ActiveActivation[];
  licenseSlug: string;
  origin: string;
  slug: string;
  seats: number;
  /** Our own sites: no seat. */
  internal?: InternalOf;
}): ActivationDecision {
  const index = input.active.findIndex(
    (a) => a.siteOrigin === input.origin && (a.productSlug ?? input.licenseSlug) === input.slug,
  );
  if (index !== -1) return { kind: 'reuse', index };
  if (input.active.some((a) => a.siteOrigin === input.origin)) {
    return { kind: 'add', newSeat: false };
  }
  // Counted with the new site: a staging copy is free, and the real site frees its staging copy.
  const after = seatsInUse(
    [...input.active, { siteOrigin: input.origin, productSlug: input.slug }],
    input.internal,
  );
  if (input.seats > 0 && after > input.seats) return { kind: 'full' };
  return { kind: 'add', newSeat: after > seatsInUse(input.active, input.internal) };
}

/**
 * What an email address may do with a license in the portal: the agency that
 * owns it manages it; the customer manages it too when there is no owner,
 * and only sees it when an agency manages it. Anyone else gets nothing.
 */
export function portalRole(
  license: { email: string; ownerEmail: string | null },
  email: string,
): 'manager' | 'viewer' | null {
  const who = email.trim().toLowerCase();
  if (!who) return null;
  const owner = license.ownerEmail?.toLowerCase() ?? null;
  if (owner === who) return 'manager';
  if (license.email.toLowerCase() === who) return owner ? 'viewer' : 'manager';
  return null;
}

/** A price after a partner's discount, in cents, rounded to the cent. */
export function discounted(listCents: number, percent: number): number {
  const p = Math.min(100, Math.max(0, percent));
  return Math.round((listCents * (100 - p)) / 100);
}

/** A key as the portal shows it before "Show": the last group only. */
export function maskKey(hint: string): string {
  return `•••••-•••••-•••••-•••••-${hint}`;
}

// ---- Keys kept for the portal: AES-256-GCM with a secret of the store ----------------

const keyOf = (secret: string) => createHash('sha256').update(`store-key-seal|${secret}`).digest();

export function sealKey(secret: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function unsealKey(secret: string, sealed: string | null): string | null {
  if (!sealed) return null;
  const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
