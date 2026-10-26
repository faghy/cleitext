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

/** Seats in use: sites, not products (one site using 3 products of a bundle is 1 seat). */
export function seatsInUse(active: ActiveActivation[]): number {
  return new Set(active.map((a) => a.siteOrigin)).size;
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
}): ActivationDecision {
  const index = input.active.findIndex(
    (a) => a.siteOrigin === input.origin && (a.productSlug ?? input.licenseSlug) === input.slug,
  );
  if (index !== -1) return { kind: 'reuse', index };
  if (input.active.some((a) => a.siteOrigin === input.origin)) {
    return { kind: 'add', newSeat: false };
  }
  if (input.seats > 0 && seatsInUse(input.active) >= input.seats) return { kind: 'full' };
  return { kind: 'add', newSeat: true };
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
