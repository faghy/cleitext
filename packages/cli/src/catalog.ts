/**
 * The signed plugin and theme catalog, read by `cleitext doctor` to tell
 * which installed plugins and themes have a newer compatible version. The
 * admin installs them (Plugins / Themes, or automatic updates).
 */
import { createPublicKey, verify } from 'node:crypto';
import { SDK_VERSION } from '@cleitext/plugin-sdk';
import {
  catalogSchema,
  DEFAULT_CATALOG_KEY,
  DEFAULT_CATALOG_URL,
  type CatalogItem,
} from '@cleitext/shared';
import semver from 'semver';
import { OperationError } from './operations.js';

type Fetch = typeof fetch;

export async function readCatalog(
  options: { url?: string; publicKey?: string; fetchImpl?: Fetch } = {},
): Promise<CatalogItem[]> {
  const url = options.url ?? process.env.CATALOG_URL ?? DEFAULT_CATALOG_URL;
  if (!url) return [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const get = async (address: string) => {
    const response = await fetchImpl(address, {
      headers: { 'user-agent': 'cleitext-cli' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new OperationError(`The catalog answered ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  };
  const [body, signature] = await Promise.all([get(url), get(`${url}.sig`)]);
  const key = createPublicKey({
    key: Buffer.from(
      options.publicKey ?? process.env.CATALOG_PUBLIC_KEY ?? DEFAULT_CATALOG_KEY,
      'base64',
    ),
    format: 'der',
    type: 'spki',
  });
  if (!verify(null, body, key, Buffer.from(signature.toString('utf8').trim(), 'base64'))) {
    throw new OperationError('The signature of the catalog does not match.');
  }
  return catalogSchema.parse(JSON.parse(body.toString('utf8'))).items;
}

export interface AvailableUpdate {
  type: 'plugin' | 'theme';
  slug: string;
  installed: string;
  available: string;
  paid: boolean;
}

/** Newer catalog versions that work with this Cleitext and plugin API. */
export function availableUpdates(
  items: CatalogItem[],
  installed: { type: 'plugin' | 'theme'; slug: string; version: string }[],
  coreVersion: string,
): AvailableUpdate[] {
  const result: AvailableUpdate[] = [];
  for (const item of installed) {
    const entry = items.find((i) => i.type === item.type && i.slug === item.slug);
    if (!entry || !semver.valid(entry.version) || !semver.valid(item.version)) continue;
    if (!semver.gt(entry.version, item.version)) continue;
    const compatible =
      item.type === 'plugin'
        ? !entry.apiVersion || semver.satisfies(SDK_VERSION, entry.apiVersion)
        : !entry.requires ||
          !semver.valid(coreVersion) ||
          semver.satisfies(coreVersion, entry.requires, { includePrerelease: true });
    if (!compatible) continue;
    result.push({
      type: item.type,
      slug: item.slug,
      installed: item.version,
      available: entry.version,
      paid: Boolean(entry.paid),
    });
  }
  return result;
}
