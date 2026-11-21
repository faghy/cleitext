import type { PluginContext } from '@cleitext/plugin-sdk';
import { and, eq, isNull } from 'drizzle-orm';
import { newToken } from './keys';
import { classify, classifyOrigin, parsePatterns } from './internal';
import { coversSlug, seatsInUse, type ActiveActivation, type InternalOf } from './licensing';
import type { PackageSource } from './packages';
import { activations, installs, products, type License, type Product } from './schema';

/** What the license server and the portal share. */

export const GITHUB_TOKEN = 'githubToken';
export const LEMON_SECRET = 'lemonSqueezySecret';
export const SIGNING_KEY = 'downloadSigningKey';
/** Encrypts keys kept for the portal (Store 1.4.0). */
export const SEAL_KEY = 'keySealKey';

export const SLUG_RE = /^[a-z][a-z0-9-]{1,39}$/;
export const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
export const fail = (status: number, message: string, extra: Record<string, unknown> = {}) => ({
  status,
  body: { message, ...extra },
});
export const iso = (date: Date | null) => (date ? date.toISOString() : null);

export async function source(ctx: PluginContext, siteId: string): Promise<PackageSource | null> {
  const s = await ctx.settings.get(siteId);
  const repo = text(s.github_repo, 200);
  const token = await ctx.secrets.get(siteId, GITHUB_TOKEN);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return null;
  const api = text(s.github_api, 200).replace(/\/+$/, '') || 'https://api.github.com';
  return { api, repo, token };
}

/** A secret of the store made on first use (download signatures, key sealing). */
export async function ownSecret(ctx: PluginContext, siteId: string, name: string): Promise<string> {
  let key = await ctx.secrets.get(siteId, name);
  if (!key) {
    key = newToken();
    await ctx.secrets.set(siteId, name, key);
  }
  return key;
}

export async function productOf(ctx: PluginContext, siteId: string, slug: string) {
  const [product] = await ctx.db.transaction(siteId, (tx) =>
    tx.select().from(products).where(eq(products.slug, slug)),
  );
  return product ?? null;
}

/** The active activations of a license. */
export async function activeOf(
  ctx: PluginContext,
  siteId: string,
  licenseId: string,
): Promise<(ActiveActivation & { id: string })[]> {
  return ctx.db.transaction(siteId, (tx) =>
    tx
      .select({
        id: activations.id,
        siteOrigin: activations.siteOrigin,
        productSlug: activations.productSlug,
      })
      .from(activations)
      .where(and(eq(activations.licenseId, licenseId), isNull(activations.deactivatedAt))),
  );
}

/** Internal or external, for every site (Store 1.6): by hand, by report, or by the list. */
export async function classifier(ctx: PluginContext, siteId: string) {
  const patterns = parsePatterns((await ctx.settings.get(siteId)).internal_hosts);
  const rows = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select({
        origin: installs.origin,
        installId: installs.installId,
        serverHost: installs.serverHost,
        serverIp: installs.serverIp,
        internal: installs.internal,
      })
      .from(installs),
  );
  const map = classify(patterns, rows);
  return (origin: string) => map.get(origin) ?? classifyOrigin(patterns, origin);
}

/** Our own sites, which take no seat. */
export async function internalOf(ctx: PluginContext, siteId: string): Promise<InternalOf> {
  const kind = await classifier(ctx, siteId);
  return (origin) => kind(origin).internal;
}

/** Seats in use: sites, whatever the number of products each one activated. */
export async function seatsUsed(ctx: PluginContext, siteId: string, licenseId: string) {
  return seatsInUse(await activeOf(ctx, siteId, licenseId), await internalOf(ctx, siteId));
}

/** Whether `license` is valid for the product `slug` (itself, or covered by its bundle). */
export async function licenseCovers(
  ctx: PluginContext,
  siteId: string,
  license: License,
  slug: string,
  licensed?: Product | null,
): Promise<boolean> {
  if (license.productSlug === slug) return true;
  const product =
    licensed === undefined ? await productOf(ctx, siteId, license.productSlug) : licensed;
  if (!product?.bundle) return false;
  return coversSlug(product, slug, await productOf(ctx, siteId, slug));
}

/** The products a bundle covers now (every product that is not a bundle for "all"). */
export function coveredProducts(bundle: Product, all: Product[]): Product[] {
  if (!bundle.bundle) return [bundle];
  return all.filter((p) => p.slug !== bundle.slug && coversSlug(bundle, p.slug, p));
}
