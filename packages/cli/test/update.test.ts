/** Core updates (RF-SYS-UPD): download, verification, switch, rollback on failure. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findRelease,
  isNewer,
  rollbackUpdate,
  runUpdate,
  trialRun,
  type UpdateActions,
} from '../src/update.js';

let base: string;
let archive: Buffer;

/** A release archive as `pnpm release` makes it: one `cleitext/` folder. */
async function makeArchive(version: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cx-rel-'));
  await mkdir(path.join(dir, 'cleitext', 'public'), { recursive: true });
  await writeFile(path.join(dir, 'cleitext', 'package.json'), JSON.stringify({ version }));
  await writeFile(path.join(dir, 'cleitext', 'public', '.keep'), '');
  const file = path.join(dir, 'release.tar.gz');
  await tar.c({ gzip: true, file, cwd: dir }, ['cleitext']);
  const data = readFileSync(file);
  await rm(dir, { recursive: true, force: true });
  return data;
}

function fakeGithub(data: Buffer, sum = createHash('sha256').update(data).digest('hex')) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/releases/')) {
      return Response.json({
        tag_name: 'v9.9.9',
        body: 'New things',
        published_at: '2026-10-11T00:00:00Z',
        html_url: 'https://github.com/x/y/releases/tag/v9.9.9',
        assets: [
          {
            name: 'cleitext-9.9.9.tar.gz',
            browser_download_url: 'https://dl/cleitext-9.9.9.tar.gz',
          },
          { name: 'SHA256SUMS', browser_download_url: 'https://dl/SHA256SUMS' },
        ],
      });
    }
    if (url.endsWith('.tar.gz')) return new Response(data);
    if (url.endsWith('SHA256SUMS')) return new Response(`${sum}  cleitext-9.9.9.tar.gz\n`);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

function recorder(fail?: 'migrate') {
  const calls: string[] = [];
  const actions: UpdateActions = {
    backup: async () => void calls.push('backup'),
    migrate: async (staging) => {
      // The new release is unpacked and configured before its migrations run.
      const { version } = JSON.parse(readFileSync(path.join(staging, 'package.json'), 'utf8'));
      calls.push(`migrate ${version}`);
      if (fail === 'migrate') throw new Error('migration 0099 failed');
    },
    plugins: async () => void calls.push('plugins'),
  };
  return { calls, actions };
}

/** A site installed by the setup wizard: a plain folder and cleitext-shared next to it. */
async function folderSite(): Promise<string> {
  const root = path.join(base, 'cleitext');
  await mkdir(path.join(root, 'public'), { recursive: true });
  await mkdir(path.join(base, 'cleitext-shared'), { recursive: true });
  await writeFile(path.join(base, 'cleitext-shared', '.env'), 'NODE_ENV=production\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  await symlink('../cleitext-shared/.env', path.join(root, '.env'));
  await writeFile(path.join(root, 'public', 'google1234.html'), 'verification');
  return root;
}

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'cx-update-'));
  archive = await makeArchive('9.9.9');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('core updates', () => {
  it('finds the latest release and compares versions', async () => {
    const release = await findRelease('x/y', undefined, fakeGithub(archive));
    expect(release).toMatchObject({ version: '9.9.9', notes: 'New things' });
    expect(release.tarball).toContain('cleitext-9.9.9.tar.gz');
    expect(isNewer('9.9.9', '1.0.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
  });

  it('replaces a plain folder, keeping configuration, public files and the old version', async () => {
    const root = await folderSite();
    const fetchImpl = fakeGithub(archive);
    const { calls, actions } = recorder();
    const release = await findRelease('x/y', undefined, fetchImpl);
    const result = await runUpdate({ root, release, actions, fetchImpl });

    expect(calls).toEqual(['backup', 'migrate 9.9.9', 'plugins']);
    expect(result.root).toBe(realpathSync(root));
    expect(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('9.9.9');
    expect(await readlink(path.join(root, '.env'))).toBe('../cleitext-shared/.env');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('production');
    expect(readFileSync(path.join(root, 'public', 'google1234.html'), 'utf8')).toBe('verification');
    expect(existsSync(path.join(root, 'tmp', 'restart.txt'))).toBe(true);
    const previous = JSON.parse(
      readFileSync(path.join(base, '.cleitext-previous', 'package.json'), 'utf8'),
    );
    expect(previous.version).toBe('1.0.0');
    expect(existsSync(path.join(base, '.cleitext-update-9.9.9'))).toBe(false);
  });

  it('moves the cleitext link of a releases/ layout', async () => {
    const current = path.join(base, 'releases', 'cleitext-1.0.0');
    await mkdir(current, { recursive: true });
    await writeFile(path.join(current, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    await writeFile(path.join(base, 'shared.env'), 'X=1\n');
    await symlink('../../shared.env', path.join(current, '.env'));
    await symlink('releases/cleitext-1.0.0', path.join(base, 'cleitext'));
    const fetchImpl = fakeGithub(archive);
    const release = await findRelease('x/y', undefined, fetchImpl);
    await runUpdate({
      root: path.join(base, 'cleitext'),
      release,
      actions: recorder().actions,
      fetchImpl,
    });

    expect(lstatSync(path.join(base, 'cleitext')).isSymbolicLink()).toBe(true);
    expect(await readlink(path.join(base, 'cleitext'))).toBe(
      path.join('releases', 'cleitext-9.9.9'),
    );
    expect(readFileSync(path.join(base, 'cleitext', '.env'), 'utf8')).toBe('X=1\n');
    expect(existsSync(current)).toBe(true);
  });

  it('refuses an archive that does not match its SHA-256, changing nothing', async () => {
    const root = await folderSite();
    const fetchImpl = fakeGithub(archive, '0'.repeat(64));
    const { calls, actions } = recorder();
    const release = await findRelease('x/y', undefined, fetchImpl);
    await expect(runUpdate({ root, release, actions, fetchImpl })).rejects.toThrow('SHA-256');
    expect(calls).toEqual([]);
    expect(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('1.0.0');
    expect(existsSync(path.join(base, '.cleitext-update-9.9.9'))).toBe(false);
  });

  it('keeps the running version when the migrations fail', async () => {
    const root = await folderSite();
    const fetchImpl = fakeGithub(archive);
    const { calls, actions } = recorder('migrate');
    const release = await findRelease('x/y', undefined, fetchImpl);
    await expect(runUpdate({ root, release, actions, fetchImpl })).rejects.toThrow('0099');
    expect(calls).toEqual(['backup', 'migrate 9.9.9']);
    expect(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('1.0.0');
    expect(existsSync(path.join(base, '.cleitext-previous'))).toBe(false);
  });

  it('keeps the running version when the new one does not start', async () => {
    const root = await folderSite();
    const fetchImpl = fakeGithub(archive);
    const { calls, actions } = recorder();
    actions.check = async () => {
      calls.push('check');
      throw new Error('The new version did not start properly');
    };
    const release = await findRelease('x/y', undefined, fetchImpl);
    await expect(runUpdate({ root, release, actions, fetchImpl })).rejects.toThrow('did not start');
    expect(calls).toEqual(['backup', 'migrate 9.9.9', 'plugins', 'check']);
    expect(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('1.0.0');
  });

  it('goes back to the previous version, and forward again', async () => {
    const root = await folderSite();
    const fetchImpl = fakeGithub(archive);
    const release = await findRelease('x/y', undefined, fetchImpl);
    await runUpdate({ root, release, actions: recorder().actions, fetchImpl });
    const version = () => JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    expect(version()).toBe('9.9.9');
    expect((await rollbackUpdate(root)).version).toBe('1.0.0');
    expect(version()).toBe('1.0.0');
    expect(existsSync(path.join(root, 'tmp', 'restart.txt'))).toBe(true);
    expect((await rollbackUpdate(root)).version).toBe('9.9.9');
  });

  it('moves the link back in a releases/ layout', async () => {
    const current = path.join(base, 'releases', 'cleitext-1.0.0');
    await mkdir(current, { recursive: true });
    await writeFile(path.join(current, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    await symlink('releases/cleitext-1.0.0', path.join(base, 'cleitext'));
    const link = path.join(base, 'cleitext');
    await expect(rollbackUpdate(link)).rejects.toThrow('No previous version');
    const fetchImpl = fakeGithub(archive);
    const release = await findRelease('x/y', undefined, fetchImpl);
    await runUpdate({ root: link, release, actions: recorder().actions, fetchImpl });
    expect(await readlink(link)).toBe(path.join('releases', 'cleitext-9.9.9'));
    expect((await rollbackUpdate(link)).version).toBe('1.0.0');
    expect(await readlink(link)).toBe(path.join('releases', 'cleitext-1.0.0'));
  });
});

/** A fake new release whose server is a script. */
async function fakeServer(code: string): Promise<string> {
  const staging = path.join(base, 'staging');
  await mkdir(path.join(staging, 'apps/server/dist'), { recursive: true });
  await writeFile(path.join(staging, 'apps/server/dist/main.js'), code);
  return staging;
}

describe('trying the new version before switching', () => {
  it('passes when the server is ready and the home page answers', async () => {
    const staging = await fakeServer(`
      require('node:http').createServer((req, res) => {
        res.statusCode = req.url === '/health/ready' ? 200 : req.headers.host === 'site.test' ? 200 : 404;
        res.end('ok');
      }).listen(Number(process.env.PORT), process.env.HOST);
    `);
    await expect(trialRun({ staging, env: {}, host: 'site.test' })).resolves.toBeUndefined();
  });

  it('fails when the server stops', async () => {
    const staging = await fakeServer(`console.error('Cannot find module x'); process.exit(3);`);
    await expect(trialRun({ staging, env: {} })).rejects.toThrow(
      /stopped with code 3[\s\S]*Cannot find module x/,
    );
  });

  it('fails when the home page has a server error', async () => {
    const staging = await fakeServer(`
      require('node:http').createServer((req, res) => {
        res.statusCode = req.url === '/health/ready' ? 200 : 500;
        res.end();
      }).listen(Number(process.env.PORT), process.env.HOST);
    `);
    await expect(trialRun({ staging, env: {}, host: 'site.test' })).rejects.toThrow(
      'the home page answered 500',
    );
  });
});
