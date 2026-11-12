/**
 * Palinsest, the editorial calendar (official plugin, plugin API 1.70):
 * rules place slots, a producer of another plugin fills them before their
 * time, and they are scheduled when the rule publishes automatically.
 */
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const EXT = '/api/v1/ext/palinsest';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;

/** A producer that writes a short article for each slot. */
async function producerSource(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'notes-src-')), 'notes-fixture');
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'cleitext.plugin.json'),
    JSON.stringify({
      slug: 'notes-fixture',
      name: 'Notes (test fixture)',
      version: '1.0.0',
      apiVersion: '^1.70',
      license: 'GPL-2.0-or-later',
      server: 'dist/server.js',
      permissions: ['content:write'],
    }),
  );
  await writeFile(
    join(dir, 'dist', 'server.js'),
    `export default { setup(ctx) {
  ctx.content.registerProducer({ id: 'notes-fixture', label: 'Notes', async produce(siteId, request) {
    const entry = await ctx.content.create(siteId, { type: request.type ?? 'article', title: 'Note at ' + request.slotAt }, { userId: request.userId });
    return { entryId: entry.id };
  } });
} };
`,
  );
  return dir;
}

async function eventually(check: () => Promise<boolean>, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('condition not met in time');
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const appRole = new URL(inject('appUrl')).username;
  const source = join(await mkdtemp(join(tmpdir(), 'palinsest-src-')), 'palinsest');
  await cp(join(pluginsRoot, 'palinsest'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, { source, pluginsPath, appRole });
  await installPlugin(owner.db, { source: await producerSource(), pluginsPath, appRole });
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'palinsest');
  await seedUser(owner, {
    email: 'admin@palinsest.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.40.0.1');
  await admin.login('admin@palinsest.test', PASSWORD);
  for (const slug of ['palinsest', 'notes-fixture']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`, {})).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

interface Slot {
  id: string;
  at: string;
  status: string;
  entryId: string | null;
  ruleId: string;
  error: string | null;
}

const state = async () =>
  (await admin.get(`${EXT}/state`)).json() as {
    slots: Slot[];
    producers: { id: string }[];
    supported: boolean;
    rules: { id: string }[];
  };

describe('Palinsest', () => {
  it('lists the producers of the active plugins', async () => {
    const s = await state();
    expect(s.supported).toBe(true);
    expect(s.producers.map((p) => p.id)).toContain('notes-fixture');
  });

  it('refuses a producer that is not active', async () => {
    const res = await admin.post(`${EXT}/rules`, { cadence: 'daily', producer: 'nope' });
    expect(res.statusCode).toBe(400);
  });

  it('fills a slot shortly before its time and schedules it', async () => {
    // A daily slot 10 minutes from now (UTC, the site's zone).
    const soon = new Date(Date.now() + 10 * 60_000);
    const hhmm = soon.toISOString().slice(11, 16);
    const rule = (
      await admin.post(`${EXT}/rules`, {
        name: 'Daily note',
        cadence: 'daily',
        times: [hhmm],
        startsOn: soon.toISOString().slice(0, 10),
        producer: 'notes-fixture',
        autoPublish: true,
      })
    ).json() as { id: string; autoPublish: boolean };
    expect(rule.autoPublish).toBe(true);
    const mine = (await state()).slots.filter((s) => s.ruleId === rule.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0]!.at.slice(11, 16)).toBe(hhmm);

    await app.get(PluginHost).runSchedules(Date.now() + 3_600_000);
    let slot: Slot | undefined;
    await eventually(async () => {
      slot = (await state()).slots.find((s) => s.id === mine[0]!.id);
      return Boolean(slot && !['planned', 'producing'].includes(slot.status));
    });
    expect(slot!.status, slot!.error ?? '').toBe('scheduled');
    const entry = (await admin.get(`/api/v1/entries/${slot!.entryId}`)).json();
    expect(entry.status).toBe('scheduled');
    expect(Date.parse(entry.scheduledAt)).toBe(Date.parse(mine[0]!.at));
  });

  it('moves, removes and puts back a slot written by hand', async () => {
    const rule = (
      await admin.post(`${EXT}/rules`, {
        name: 'By hand',
        cadence: '7',
        times: ['08:00'],
        producer: '',
      })
    ).json() as { id: string; autoPublish: boolean };
    expect(rule.autoPublish).toBe(false);
    const [slot] = (await state()).slots.filter(
      (s) => s.ruleId === rule.id && s.status === 'planned',
    );
    expect(slot).toBeDefined();
    const later = new Date(Date.parse(slot!.at) + 3_600_000).toISOString();
    const moved = await admin.request('PATCH', `${EXT}/slots/${slot!.id}`, { at: later });
    expect(moved.json().at).toBe(later);
    const past = await admin.request('PATCH', `${EXT}/slots/${slot!.id}`, {
      at: '2020-01-01T00:00:00Z',
    });
    expect(past.statusCode).toBe(400);
    expect(
      (await admin.request('PATCH', `${EXT}/slots/${slot!.id}`, { status: 'skipped' })).json()
        .status,
    ).toBe('skipped');
    expect(
      (await admin.request('PATCH', `${EXT}/slots/${slot!.id}`, { status: 'planned' })).json()
        .status,
    ).toBe('planned');
    // A slot by hand has nothing to produce.
    expect((await admin.post(`${EXT}/slots/${slot!.id}/produce`, {})).statusCode).toBe(400);
    // Deleting the rule takes its slots.
    await admin.request('DELETE', `${EXT}/rules/${rule.id}`);
    expect((await state()).slots.some((s) => s.ruleId === rule.id)).toBe(false);
  });
});
