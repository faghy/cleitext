/** Web installer on first start (RF-SIT-02). */
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstaller, needsInstall, setupToken } from '../src/install/installer.js';
import { createSetup } from '../src/install/setup.js';
import { ensureToken, tokenFile } from '../src/install/token.js';
import { ownerDatabase, seedSite } from './helpers.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: inject('appUrl'),
  DATABASE_ADMIN_URL: inject('ownerUrl'),
  MAIL_URL: 'memory://',
});
const calls: { args: string[]; env: Record<string, string> }[] = [];
let installedCalls = 0;
let installer: FastifyInstance;

const form = (values: Record<string, string>) => ({
  method: 'POST' as const,
  url: '/install',
  headers: { 'content-type': 'application/x-www-form-urlencoded', host: 'new.example' },
  payload: new URLSearchParams(values).toString(),
});
const valid = {
  siteName: 'New site',
  domain: 'new.example',
  locale: 'it',
  adminEmail: 'owner@new.example',
  adminPassword: 'correct horse battery staple',
  adminPasswordConfirm: 'correct horse battery staple',
};

beforeAll(async () => {
  installer = await createInstaller({
    config,
    run: async (args, env) => {
      calls.push({ args, env });
      return 'Installed.';
    },
    onInstalled: () => installedCalls++,
  });
});

afterAll(async () => {
  await installer?.close();
});

describe('web installer', () => {
  it('is not needed once a site exists', async () => {
    const owner = ownerDatabase();
    await seedSite(owner, 'installer-check');
    await owner.close();
    expect(await needsInstall(config)).toBe(false);
  });

  it('leads every page to the form, with a strict policy', async () => {
    const home = await installer.inject({ url: '/', headers: { host: 'new.example' } });
    expect(home.statusCode).toBe(302);
    expect(home.headers.location).toBe('/install');
    const page = await installer.inject({ url: '/install', headers: { host: 'new.example' } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('value="new.example"');
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    const api = await installer.inject({ method: 'POST', url: '/api/v1/auth/login' });
    expect(api.statusCode).toBe(503);
  });

  it('refuses a wrong token without running anything', async () => {
    const response = await installer.inject(form({ ...valid, token: 'nope' }));
    expect(response.statusCode).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('checks the fields', async () => {
    const response = await installer.inject(
      form({ ...valid, token: setupToken(config), adminPasswordConfirm: 'different password' }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('The passwords do not match.');
    expect(response.body).not.toContain(setupToken(config));
    expect(calls).toHaveLength(0);
  });

  it('installs through the CLI, passing the password in the environment', async () => {
    const response = await installer.inject(form({ ...valid, token: setupToken(config) }));
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Cleitext is installed');
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.args).toEqual([
      'install',
      '--site-slug',
      'main',
      '--site-name',
      'New site',
      '--domain',
      'new.example',
      '--locale',
      'it',
      '--admin-email',
      'owner@new.example',
      '--official-plugins',
      '--no-https',
    ]);
    expect(call!.args.join(' ')).not.toContain(valid.adminPassword);
    expect(call!.env).toEqual({ CLEITEXT_ADMIN_PASSWORD: valid.adminPassword });
    expect(installedCalls).toBe(1);

    const after = await installer.inject(form({ ...valid, token: setupToken(config) }));
    expect(after.statusCode).toBe(303);
    expect(calls).toHaveLength(1);
  });

  it('takes over the setup wizard: same token, no need to enter it again', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cleitext-installer-'));
    const runs: string[][] = [];
    // Written by the wizard before the installer starts.
    const token = ensureToken(root);
    const after = await createInstaller({
      config,
      root,
      run: async (args) => {
        runs.push(args);
        return 'Installed.';
      },
      onInstalled: () => {},
    });
    try {
      expect(setupToken(config, root)).toBe(token);
      // The session cookie of the wizard.
      const wizard = await createSetup({ root, onConfigured: () => {}, logLevel: 'silent' });
      const opened = await wizard.inject({
        method: 'POST',
        url: '/install/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: `token=${token}`,
      });
      await wizard.close();
      const cookie = String(opened.headers['set-cookie']).split(';')[0]!;

      const page = await after.inject({
        url: '/install',
        headers: { host: 'new.example', cookie },
      });
      expect(page.body).not.toContain('name="token"');
      expect(page.body).toContain('aria-current="step"');
      const done = await after.inject({
        ...form(valid),
        headers: { ...form(valid).headers, cookie },
      });
      expect(done.statusCode).toBe(200);
      expect(runs).toHaveLength(1);
      // Used up: the token file is gone.
      expect(existsSync(tokenFile(root))).toBe(false);
    } finally {
      await after.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
