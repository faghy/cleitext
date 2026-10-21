import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
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
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import semver from 'semver';
import * as tar from 'tar';
import { OperationError } from './operations.js';

/**
 * Core updates from the admin or the CLI (RF-SYS-UPD): the release is
 * downloaded from GitHub Releases, checked against its SHA-256, unpacked next
 * to the running one, configured, backed up, migrated, started on the side
 * to check that it works, and only then switched in. The previous version
 * stays on disk for `cleitext rollback`.
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
  | 'download'
  | 'verify'
  | 'unpack'
  | 'configure'
  | 'backup'
  | 'migrate'
  | 'plugins'
  | 'check'
  | 'switch';

export const UPDATE_STEPS: UpdateStep[] = [
  'download',
  'verify',
  'unpack',
  'configure',
  'backup',
  'migrate',
  'plugins',
  'check',
  'switch',
];

/** What depends on the database and the CLI of the new release. */
export interface UpdateActions {
  backup(): Promise<void>;
  /** Runs the new release's migrations (with the running version's configuration). */
  migrate(staging: string): Promise<void>;
  /** Updates installed official plugins shipped newer in the release. */
  plugins(staging: string): Promise<void>;
  /**
   * Starts the new release on the side and checks that it answers: when it
   * does not, the update stops before the switch and the site keeps running
   * the current version.
   */
  check?(staging: string): Promise<void>;
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

    step('check');
    await actions.check?.(staging);

    step('switch');
    let result: UpdateResult;
    if (layout.kind === 'releases') {
      const next = `${layout.link}.next`;
      await rm(next, { force: true });
      await symlink(path.relative(path.dirname(layout.link), staging), next);
      await rename(next, layout.link);
      result = { root: staging, previous: current };
      // `cleitext rollback` goes back to it.
      await writeFile(path.join(layout.releases, PREVIOUS_FILE), `${current}\n`);
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

/** In releases/: the folder of the version before the last update. */
const PREVIOUS_FILE = '.previous';

/** The folder `cleitext rollback` would go back to, or null. */
export function previousRelease(root: string): string | null {
  const layout = layoutOf(root);
  if (layout.kind === 'releases') {
    const file = path.join(layout.releases, PREVIOUS_FILE);
    const previous = existsSync(file) ? readFileSyncSafe(file, '').trim() : '';
    return previous && previous !== layout.current && existsSync(previous) ? previous : null;
  }
  const previous = path.join(path.dirname(layout.dir), '.cleitext-previous');
  return existsSync(path.join(previous, 'package.json')) ? previous : null;
}

/**
 * Back to the version that ran before the last update, kept on disk by it.
 * The database stays as it is: migrations only add, so the previous version
 * works on it; the backup taken before the update restores it when needed.
 */
export async function rollbackUpdate(root: string): Promise<{ root: string; version: string }> {
  const layout = layoutOf(root);
  const versionOf = (dir: string) =>
    (JSON.parse(readFileSyncSafe(path.join(dir, 'package.json'))) as { version?: string })
      .version ?? '?';
  let result: string;
  if (layout.kind === 'releases') {
    const file = path.join(layout.releases, PREVIOUS_FILE);
    const previous = existsSync(file) ? (await readFile(file, 'utf8')).trim() : '';
    if (!previous || !existsSync(previous) || previous === layout.current) {
      throw new OperationError('No previous version to go back to.');
    }
    const next = `${layout.link}.next`;
    await rm(next, { force: true });
    await symlink(path.relative(path.dirname(layout.link), previous), next);
    await rename(next, layout.link);
    await writeFile(file, `${layout.current}\n`);
    result = previous;
  } else {
    const previous = path.join(path.dirname(layout.dir), '.cleitext-previous');
    if (!existsSync(path.join(previous, 'package.json'))) {
      throw new OperationError('No previous version to go back to.');
    }
    // The two swap places: a second rollback undoes the first.
    const aside = path.join(path.dirname(layout.dir), '.cleitext-rollback');
    await rm(aside, { recursive: true, force: true });
    await rename(layout.dir, aside);
    await rename(previous, layout.dir);
    await rename(aside, previous);
    result = layout.dir;
  }
  await mkdir(path.join(result, 'tmp'), { recursive: true });
  await writeFile(path.join(result, 'tmp', 'restart.txt'), `${new Date().toISOString()}\n`);
  return { root: result, version: versionOf(result) };
}

function readFileSyncSafe(file: string, fallback = '{}'): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

export interface TrialOptions {
  /** The new release, configured. */
  staging: string;
  /** Its environment (the running version's configuration). */
  env: NodeJS.ProcessEnv;
  /** A host name of a site, to ask for its home page too. */
  host?: string;
  timeoutMs?: number;
  fetchImpl?: Fetch;
}

/**
 * Starts the new release's server on a free local port, without scheduled
 * work, and waits for it to be ready (database and migrations) and to serve
 * a site's home page without a server error. Stops it in every case.
 */
export async function trialRun(options: TrialOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const main = path.join(options.staging, 'apps/server/dist/main.js');
  if (!existsSync(main)) throw new OperationError(`The new release has no ${main}.`);
  const port = await freePort();
  let output = '';
  let exited: number | null | undefined;
  const child = spawn(process.execPath, [main], {
    cwd: options.staging,
    env: {
      ...options.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      // No scheduled publishing, automatic updates nor registry reports from the trial.
      SCHEDULER_INTERVAL_SECONDS: '0',
      INSTALL_REPORT_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const keep = (chunk: Buffer) => (output = (output + chunk.toString()).slice(-4000));
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('exit', (code) => (exited = code));
  const failed = (why: string) =>
    new OperationError(
      `The new version did not start properly (${why}); the site keeps the current one.${output.trim() ? `\n${output.trim()}` : ''}`,
    );
  try {
    const deadline = Date.now() + (options.timeoutMs ?? 90_000);
    const base = `http://127.0.0.1:${port}`;
    for (;;) {
      if (exited !== undefined) throw failed(`it stopped with code ${exited}`);
      if (Date.now() > deadline) throw failed('no answer in time');
      const ready = await fetchImpl(`${base}/health/ready`, {
        signal: AbortSignal.timeout(5_000),
      }).catch(() => null);
      if (ready?.ok) break;
      if (ready && ready.status !== 503) throw failed(`health check answered ${ready.status}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (options.host) {
      const home = await fetchImpl(`${base}/`, {
        headers: { host: options.host, 'x-forwarded-proto': 'https' },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      }).catch((error: Error) => {
        throw failed(`the home page failed: ${error.message}`);
      });
      if (home.status >= 500) throw failed(`the home page answered ${home.status}`);
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const gone = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await gone;
      clearTimeout(force);
    }
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
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
