/**
 * `cleitext plugin:activate --site`: the server task the CLI runs, with the
 * same checks as the admin's Activate button.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPlugin } from '@cleitext/cli';
import { auditLog, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { loadConfig } from '../src/config/config.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { activatePluginTask, type TaskContext } from '../src/tasks.js';
import { ownerDatabase, seedSite, startTestApp, type SeededSite } from './helpers.js';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let context: TaskContext;

/** A plugin without server code, optionally requiring another one. */
async function plugin(root: string, slug: string, requires?: Record<string, string>) {
  const dir = join(root, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'cleitext.plugin.json'),
    JSON.stringify({
      slug,
      name: `Probe ${slug}`,
      version: '1.0.0',
      apiVersion: '^1.0',
      description: 'Used by the plugin:activate tests.',
      license: 'GPL-2.0-or-later',
      permissions: [],
      ...(requires ? { requires: { plugins: requires } } : {}),
    }),
  );
  return dir;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const sources = await mkdtemp(join(tmpdir(), 'cleitext-probe-'));
  const appRole = new URL(inject('appUrl')).username;
  for (const dir of [
    await plugin(sources, 'probe-base'),
    await plugin(sources, 'probe-extra', { 'probe-base': '^1.0.0' }),
  ]) {
    await installPlugin(owner.db, { source: dir, pluginsPath, appRole });
  }
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'activate-task');
  context = {
    app,
    config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: inject('appUrl') }),
    owner,
    log: () => {},
  };
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('activatePluginTask', () => {
  it('checks dependencies as the admin does', async () => {
    await expect(
      activatePluginTask(context, { slug: 'probe-extra', site: 'activate-task' }),
    ).rejects.toThrow(/Activate probe-base/);
  });

  it('activates once, records it, and says when it was already active', async () => {
    const first = await activatePluginTask(context, {
      slug: 'probe-base',
      site: 'activate-task',
    });
    expect(first).toEqual({
      slug: 'probe-base',
      site: 'activate-task',
      version: '1.0.0',
      alreadyActive: false,
    });
    expect((await app.get(PluginHost).activeSlugs(site.id)).has('probe-base')).toBe(true);
    const again = await activatePluginTask(context, { slug: 'probe-base', site: 'activate-task' });
    expect(again.alreadyActive).toBe(true);
    const entries = await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'plugin.activated'), eq(auditLog.targetId, 'probe-base'))),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.meta).toEqual({ via: 'cli' });
  });

  it('refuses unknown plugins and sites', async () => {
    await expect(
      activatePluginTask(context, { slug: 'nothing', site: 'activate-task' }),
    ).rejects.toThrow(/not installed/);
    await expect(
      activatePluginTask(context, { slug: 'probe-base', site: 'nowhere' }),
    ).rejects.toThrow(/No site/);
  });
});
