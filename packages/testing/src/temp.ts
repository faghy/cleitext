import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/**
 * Temporary folders of the test suites.
 *
 * A test run (Vitest `globalSetup`) gets one folder `/tmp/cleitext-test-…`
 * and points `TMPDIR` at it, so everything that calls `os.tmpdir()` — tests,
 * the server under test, embedded PostgreSQL, child processes — writes inside
 * it. Each test file gets a sub-folder (see `vitest-setup`), removed when the
 * file ends; the run folder is removed by the global teardown, and on exit as
 * a last resort. Each folder holds a pid file: the next run deletes the
 * folders whose process is gone (`sweepStaleTempDirs`).
 */
export const TEST_TEMP_PREFIX = 'cleitext-test-';

const OWNER_FILE = '.cleitext-test-owner';
const SYSTEM_TMP_ENV = 'CLEITEXT_SYSTEM_TMPDIR';
const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** The system temporary folder, before a test run redirected `TMPDIR`. */
export function systemTempDir(): string {
  return process.env[SYSTEM_TMP_ENV] ?? tmpdir();
}

interface Owner {
  pid: number;
  /** Process start time (Linux clock ticks since boot), against pid reuse. */
  start: string | null;
}

function processStart(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
  } catch {
    return null;
  }
}

function isAlive(owner: Owner): boolean {
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
  const start = processStart(owner.pid);
  return owner.start === null || start === null || start === owner.start;
}

function writeOwner(dir: string): void {
  const owner: Owner = { pid: process.pid, start: processStart(process.pid) };
  writeFileSync(join(dir, OWNER_FILE), JSON.stringify(owner));
}

function readOwner(dir: string): Owner | null {
  try {
    const owner = JSON.parse(readFileSync(join(dir, OWNER_FILE), 'utf8')) as Owner;
    return Number.isInteger(owner.pid) ? owner : null;
  } catch {
    return null;
  }
}

/** Creates `<parent>/cleitext-test-<name>XXXXXX` with a pid file inside. */
function makeOwnedDir(parent: string, name: string): string {
  const dir = mkdtempSync(join(parent, `${TEST_TEMP_PREFIX}${name}`));
  writeOwner(dir);
  return dir;
}

function removeSync(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Best effort: the next run sweeps what is left.
  }
}

function nestedOwnerAlive(dir: string): boolean {
  try {
    return readdirSync(dir).some((entry) => {
      const owner = entry.startsWith(TEST_TEMP_PREFIX) ? readOwner(join(dir, entry)) : null;
      return owner !== null && isAlive(owner);
    });
  } catch {
    return false;
  }
}

/**
 * A PostgreSQL server still running on a data folder inside `dir` (left by a
 * run that was killed): its pid, or null.
 */
function postmasterInside(dir: string): number | null {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    let lines: string[];
    try {
      lines = readFileSync(join(dir, entry, 'postmaster.pid'), 'utf8').split('\n');
    } catch {
      continue;
    }
    const pid = Number(lines[0]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try {
      process.kill(pid, 0);
    } catch {
      continue;
    }
    // Only a postgres whose data folder is this one (not a reused pid).
    try {
      const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (cmdline.includes(resolve(dir, entry))) return pid;
    } catch {
      // Not Linux, or already gone.
    }
  }
  return null;
}

export interface SweepOptions {
  /** Folder to look in; the system temporary folder by default. */
  dir?: string;
  /** Folders without a pid file are removed only when older than this (6 hours). */
  maxAgeMs?: number;
}

/**
 * Deletes `cleitext-test-*` folders left by test runs that are gone: the
 * process in their pid file no longer exists (or, without a pid file, they
 * are older than `maxAgeMs`). Folders of running processes are left alone.
 * An orphaned PostgreSQL of a dead run is stopped first. Returns the folders
 * removed.
 */
export async function sweepStaleTempDirs(options: SweepOptions = {}): Promise<string[]> {
  const base = options.dir ?? systemTempDir();
  const maxAge = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const removed: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(base);
  } catch {
    return removed;
  }
  for (const entry of entries) {
    if (!entry.startsWith(TEST_TEMP_PREFIX)) continue;
    const dir = join(base, entry);
    try {
      if (!statSync(dir).isDirectory()) continue;
      const owner = readOwner(dir);
      if (owner) {
        if (isAlive(owner)) continue;
      } else if (Date.now() - statSync(dir).mtimeMs < maxAge) {
        continue;
      }
      // A test worker of a killed run may still be busy in its file folder.
      if (nestedOwnerAlive(dir)) continue;
      const postmaster = postmasterInside(dir);
      if (postmaster !== null) {
        process.kill(postmaster, 'SIGINT');
        for (let i = 0; i < 100 && postmasterInside(dir) !== null; i++) {
          await new Promise((done) => setTimeout(done, 100));
        }
        if (postmasterInside(dir) !== null) continue;
      }
      removeSync(dir);
      removed.push(dir);
    } catch {
      // Raced with another sweep or its owner: leave it.
    }
  }
  return removed;
}

export interface TempRun {
  /** The run folder; `TMPDIR` points here until `cleanup`. */
  root: string;
  /** Removes the folder and restores `TMPDIR`. */
  cleanup(): Promise<void>;
}

const exitCleanups = new Set<string>();
let exitHooked = false;

function removeOnExit(dir: string): void {
  exitCleanups.add(dir);
  if (exitHooked) return;
  exitHooked = true;
  process.on('exit', () => {
    for (const pending of exitCleanups) removeSync(pending);
  });
}

/**
 * For Vitest `globalSetup`: sweeps stale folders, creates the run folder and
 * points `TMPDIR` (inherited by workers and child processes) at it. Stop the
 * embedded PostgreSQL before calling `cleanup`.
 */
export async function startTempRun(name = 'run-'): Promise<TempRun> {
  const system = systemTempDir();
  await sweepStaleTempDirs({ dir: system });
  const root = makeOwnedDir(system, name);
  removeOnExit(root);
  const saved = { TMPDIR: process.env.TMPDIR, [SYSTEM_TMP_ENV]: process.env[SYSTEM_TMP_ENV] };
  process.env[SYSTEM_TMP_ENV] = system;
  process.env.TMPDIR = root;
  return {
    root,
    async cleanup() {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      removeSync(root);
      exitCleanups.delete(root);
    },
  };
}

/**
 * For a test file (Vitest `setupFiles`): a sub-folder of the current temporary
 * folder becomes `TMPDIR` until the returned function removes it. Without a
 * run folder (no `startTempRun`), the sub-folder is a `cleitext-test-*`
 * folder of its own, removed on exit and swept like the others.
 */
export function enterFileTemp(): () => Promise<void> {
  const parent = tmpdir();
  const dir = makeOwnedDir(parent, 'file-');
  removeOnExit(dir);
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = dir;
  return async () => {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
    removeSync(dir);
    exitCleanups.delete(dir);
  };
}

const tracked = new Set<string>();

/**
 * Creates a temporary folder `cleitext-test-<prefix>XXXXXX` in the current
 * temporary folder and tracks it: `removeTempDirs` (or process exit) deletes it.
 */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${TEST_TEMP_PREFIX}${prefix}`));
  tracked.add(dir);
  removeOnExit(dir);
  return dir;
}

/** Deletes the folders made by `tempDir` (all, or those inside `within`). */
export async function removeTempDirs(within?: string): Promise<void> {
  for (const dir of tracked) {
    if (within && !dir.startsWith(within + sep)) continue;
    removeSync(dir);
    tracked.delete(dir);
    exitCleanups.delete(dir);
  }
}
