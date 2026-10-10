import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, realpathSync } from 'node:fs';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import * as tar from 'tar';
import { OperationError } from './operations.js';

/**
 * Core updates from the admin or the CLI (RF-SYS-UPD): the release is
 * downloaded from GitHub Releases, checked against its SHA-256, unpacked next
 * to the running one, configured, backed up, migrated, and switched in. The
 * previous version stays on disk for a rollback.
 */

export interface ReleaseInfo {
  version: string;
  notes: string;
  publishedAt: string | null;
  url: string;
  /** The .tar.gz of the release. */
  tarball: string;
  /** SHA256SUMS of the release assets. */
  checksums: string | null;
}

type Fetch = typeof fetch;

interface GithubRelease {
  tag_name: string;
  body?: string | null;
  published_at?: string | null;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: { name: string; browser_download_url: string }[];
}

/** The latest release of `owner/name`, or the one of a given version. */
export async function findRelease(
  repo: string,
  version?: string,
  fetchImpl: Fetch = fetch,
): Promise<ReleaseInfo> {
  const url = `https://api.github.com/repos/${repo}/releases/${version ? `tags/v${version.replace(/^v/, '')}` : 'latest'}`;
  const response = await fetchImpl(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'cleitext-updater' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new OperationError(
      response.status === 404
        ? `No release found at ${repo}${version ? ` for ${version}` : ''}.`
        : `GitHub answered ${response.status} for ${url}.`,
    );
  }
  const release = (await response.json()) as GithubRelease;
  const v = release.tag_name.replace(/^v/, '');
  const asset = (name: string) =>
    release.assets.find((a) => a.name === name)?.browser_download_url ?? null;
  const tarball = asset(`cleitext-${v}.tar.gz`);
  if (!tarball) throw new OperationError(`The release ${v} has no cleitext-${v}.tar.gz.`);
  return {
    version: v,
    notes: release.body ?? '',
    publishedAt: release.published_at ?? null,
    url: release.html_url,
    tarball,
    checksums: asset('SHA256SUMS'),
  };
}

export function isNewer(candidate: string, current: string): boolean {
  return Boolean(semver.valid(candidate) && semver.valid(current) && semver.gt(candidate, current));
}

export type UpdateStep =
  'download' | 'verify' | 'unpack' | 'configure' | 'backup' | 'migrate' | 'plugins' | 'switch';

export const UPDATE_STEPS: UpdateStep[] = [
  'download',
  'verify',
  'unpack',
  'configure',
  'backup',
  'migrate',
  'plugins',
  'switch',
];

/** What depends on the database and the CLI of the new release. */
export interface UpdateActions {
  backup(): Promise<void>;
  /** Runs the new release's migrations (with the running version's configuration). */
  migrate(staging: string): Promise<void>;
  /** Updates installed official plugins shipped newer in the release. */
  plugins(staging: string): Promise<void>;
}

export interface UpdateOptions {
  /** The running application folder. */
  root: string;
  release: ReleaseInfo;
  actions: UpdateActions;
  onStep?: (step: UpdateStep) => void;
  fetchImpl?: Fetch;
}

export interface UpdateResult {
  /** Where the new version runs from. */
  root: string;
  /** The previous version, kept for a rollback. */
  previous: string;
}

/**
 * How the application is laid out: a plain folder (setup wizard: the new
 * version takes its place, the old one moves aside), or a `cleitext` link to
 * `releases/cleitext-<version>` (manual deployments: the link moves).
 */
export function layoutOf(
  root: string,
):
  | { kind: 'folder'; dir: string }
  | { kind: 'releases'; current: string; releases: string; link: string } {
  const real = realpathSync(root);
  const parent = path.dirname(real);
  if (path.basename(parent) === 'releases') {
    const link = path.join(path.dirname(parent), 'cleitext');
    try {
      if (lstatSync(link).isSymbolicLink() && realpathSync(link) === real) {
        return { kind: 'releases', current: real, releases: parent, link };
      }
    } catch {
      // No link: a plain folder that happens to be in releases/.
    }
  }
  return { kind: 'folder', dir: real };
}

export async function runUpdate(options: UpdateOptions): Promise<UpdateResult> {
  const { release, actions } = options;
  const step = (s: UpdateStep) => options.onStep?.(s);
  const fetchImpl = options.fetchImpl ?? fetch;
  const layout = layoutOf(options.root);
  const current = layout.kind === 'folder' ? layout.dir : layout.current;
  const base = layout.kind === 'folder' ? path.dirname(layout.dir) : layout.releases;
  const work = path.join(base, `.cleitext-update-${release.version}`);
  const staging =
    layout.kind === 'folder'
      ? path.join(work, 'cleitext')
      : path.join(layout.releases, `cleitext-${release.version}`);
  if (layout.kind === 'releases' && existsSync(staging)) {
    throw new OperationError(`${staging} already exists: remove it, or update to another version.`);
  }
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  let switched = false;
  try {
    step('download');
    const archive = path.join(work, `cleitext-${release.version}.tar.gz`);
    await download(fetchImpl, release.tarball, archive);

    step('verify');
    if (!release.checksums) {
      throw new OperationError('The release has no SHA256SUMS: it cannot be verified.');
    }
    const sums = await (await get(fetchImpl, release.checksums)).text();
    const expected = sums
      .split('\n')
      .map((line) => line.trim().split(/\s+\*?/))
      .find(([, name]) => name === path.basename(archive))?.[0];
    const actual = await sha256(archive);
    if (!expected || expected.toLowerCase() !== actual) {
      throw new OperationError('The downloaded release does not match its SHA-256: not installed.');
    }

    step('unpack');
    await mkdir(staging, { recursive: true });
    await tar.x({ file: archive, cwd: staging, strip: 1 });
    const unpacked = JSON.parse(await readFile(path.join(staging, 'package.json'), 'utf8')) as {
      version?: string;
    };
    if (unpacked.version !== release.version) {
      throw new OperationError(`The archive holds ${unpacked.version}, not ${release.version}.`);
    }

    step('configure');
    // Links are written for where the new version will run from.
    await carryConfiguration(current, staging, layout.kind === 'folder' ? current : staging);

    step('backup');
    await actions.backup();

    step('migrate');
    await actions.migrate(staging);

    step('plugins');
    await actions.plugins(staging);

    step('switch');
    let result: UpdateResult;
    if (layout.kind === 'releases') {
      const next = `${layout.link}.next`;
      await rm(next, { force: true });
      await symlink(path.relative(path.dirname(layout.link), staging), next);
      await rename(next, layout.link);
      result = { root: staging, previous: current };
    } else {
      const previous = path.join(base, '.cleitext-previous');
      await rm(previous, { recursive: true, force: true });
      await rename(current, previous);
      try {
        await rename(staging, current);
      } catch (error) {
        await rename(previous, current);
        throw error;
      }
      result = { root: current, previous };
    }
    switched = true;
    // Passenger restarts the application on the next request.
    await mkdir(path.join(result.root, 'tmp'), { recursive: true });
    await writeFile(path.join(result.root, 'tmp', 'restart.txt'), `${new Date().toISOString()}\n`);
    return result;
  } catch (error) {
    if (!switched && layout.kind === 'releases')
      await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * The new version gets the configuration of the running one: the `.env`
 * (the same link, or a copy) and any file added to `public/`.
 */
async function carryConfiguration(current: string, staging: string, final: string): Promise<void> {
  const env = path.join(current, '.env');
  if (existsSync(env) || isLink(env)) {
    const target = path.join(staging, '.env');
    await rm(target, { force: true });
    if (isLink(env)) {
      const pointsTo = path.resolve(current, await readlink(env));
      await symlink(path.relative(final, pointsTo), target);
    } else {
      await copyFile(env, target);
      await chmod(target, 0o600);
    }
  }
  const publicDir = path.join(current, 'public');
  if (existsSync(publicDir)) {
    for (const name of await readdir(publicDir)) {
      const target = path.join(staging, 'public', name);
      if (!existsSync(target)) {
        await cp(path.join(publicDir, name), target, { recursive: true });
      }
    }
  }
}

function isLink(file: string): boolean {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

async function get(fetchImpl: Fetch, url: string): Promise<Response> {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'cleitext-updater' },
    redirect: 'follow',
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new OperationError(`Download failed (${response.status}): ${url}`);
  return response;
}

async function download(fetchImpl: Fetch, url: string, file: string): Promise<void> {
  const response = await get(fetchImpl, url);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}
