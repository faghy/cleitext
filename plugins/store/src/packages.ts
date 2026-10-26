/**
 * Paid packages live in the releases of a private GitHub repository, as the
 * catalog build puts them: tag `theme-<slug>-<version>` with the asset
 * `cleitext-theme-<slug>-<version>.zip`, or `plugin-…` and
 * `cleitext-plugin-…` for plugins. The store reads them with its token and
 * hands out the short-lived address GitHub redirects to.
 */
export interface PackageSource {
  api: string;
  repo: string;
  token: string;
}

export interface Release {
  publishedAt: string;
  assetUrl: string;
}

import { compareVersions } from './downloads';

const TIMEOUT_MS = 15_000;
const cache = new Map<string, { at: number; release: Release | null }>();

const headers = (source: PackageSource, accept: string) => ({
  accept,
  authorization: `Bearer ${source.token}`,
  'user-agent': 'Cleitext-Store',
  'x-github-api-version': '2022-11-28',
});

/** The release of a version, kept 10 minutes; null when there is none. */
export async function findRelease(
  source: PackageSource,
  slug: string,
  version: string,
): Promise<Release | null> {
  const key = `${source.api}|${source.repo}|${slug}|${version}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.release;
  // A product is a theme or a plugin: its release says which.
  let release: Release | null = null;
  for (const type of ['theme', 'plugin'] as const) {
    const res = await fetch(
      `${source.api}/repos/${source.repo}/releases/tags/${type}-${slug}-${version}`,
      {
        headers: headers(source, 'application/vnd.github+json'),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const data = (await res.json()) as {
      published_at?: string;
      created_at?: string;
      assets?: { name: string; url: string }[];
    };
    const asset = data.assets?.find((a) => a.name === `cleitext-${type}-${slug}-${version}.zip`);
    release = asset
      ? { publishedAt: data.published_at ?? data.created_at ?? '', assetUrl: asset.url }
      : null;
    break;
  }
  cache.set(key, { at: Date.now(), release });
  if (cache.size > 1000) cache.clear();
  return release;
}

/** Where to get the file: GitHub's own short-lived address, or the bytes. */
export async function packageLocation(
  source: PackageSource,
  assetUrl: string,
): Promise<{ redirect: string } | { data: Buffer }> {
  const res = await fetch(assetUrl, {
    headers: headers(source, 'application/octet-stream'),
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS * 4),
  });
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) return { redirect: location };
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return { data: Buffer.from(await res.arrayBuffer()) };
}

export interface ListedRelease extends Release {
  version: string;
}

const listCache = new Map<string, { at: number; releases: ListedRelease[] }>();

/** Every release of a product (theme or plugin), kept 10 minutes. */
export async function listReleases(source: PackageSource, slug: string): Promise<ListedRelease[]> {
  const key = `${source.api}|${source.repo}|${slug}`;
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.releases;
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = new RegExp(`^(theme|plugin)-${escaped}-(\\d+\\.\\d+\\.\\d+(?:[-+][\\w.-]+)?)$`);
  const releases: ListedRelease[] = [];
  // Ten pages of 100 are more than a catalog has.
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `${source.api}/repos/${source.repo}/releases?per_page=100&page=${page}`,
      {
        headers: headers(source, 'application/vnd.github+json'),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const data = (await res.json()) as {
      tag_name?: string;
      draft?: boolean;
      published_at?: string | null;
      created_at?: string;
      assets?: { name: string; url: string }[];
    }[];
    for (const release of data) {
      const match = tag.exec(release.tag_name ?? '');
      if (!match || release.draft) continue;
      const [, type, version] = match;
      const asset = release.assets?.find(
        (a) => a.name === `cleitext-${type}-${slug}-${version}.zip`,
      );
      if (!asset) continue;
      releases.push({
        version: version!,
        publishedAt: release.published_at ?? release.created_at ?? '',
        assetUrl: asset.url,
      });
    }
    if (data.length < 100) break;
  }
  listCache.set(key, { at: Date.now(), releases });
  if (listCache.size > 500) listCache.clear();
  return releases;
}

/**
 * The highest version a license may download: released before its updates
 * end (`until`, null for no end). Null when there is none.
 */
export function latestAllowed(releases: ListedRelease[], until: Date | null): ListedRelease | null {
  let best: ListedRelease | null = null;
  for (const release of releases) {
    if (until && Date.parse(release.publishedAt) > until.getTime()) continue;
    if (!best || compareVersions(release.version, best.version) > 0) best = release;
  }
  return best;
}

export function forgetReleases(): void {
  cache.clear();
  listCache.clear();
}
