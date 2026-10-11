/**
 * The WordPress Importer plugin (shipped on its own): a WXR file uploaded from
 * the admin, imported in the background through `ctx.transfer` (plugin API 1.7).
 */
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/wxr/export.xml', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let editor: TestClient;

interface Job {
  status: string;
  report?: { created: Record<string, number>; errors: string[]; warnings: string[] };
  error?: string;
}

async function finished(): Promise<Job> {
  for (let i = 0; i < 200; i++) {
    const { job } = (await admin.get('/api/v1/ext/wordpress-importer/status')).json() as {
      job: Job;
    };
    if (job.status !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The import did not finish.');
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  // Built in place: the plugin bundles its own dependencies (the WordPress reader).
  await buildPlugin(join(pluginsRoot, 'wordpress-importer'));
  const source = join(
    await mkdtemp(join(tmpdir(), 'wordpress-importer-src-')),
    'wordpress-importer',
  );
  await cp(join(pluginsRoot, 'wordpress-importer'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'wp-importer');
  await seedUser(owner, {
    email: 'admin@wpi.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@wpi.test', password: PASSWORD, site, role: 'editor' });
  admin = new TestClient(app, site.host, '10.47.0.1');
  await admin.login('admin@wpi.test', PASSWORD);
  editor = new TestClient(app, site.host, '10.47.0.2');
  await editor.login('editor@wpi.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/wordpress-importer/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('WordPress Importer', () => {
  it('is for administrators only', async () => {
    expect((await editor.get('/api/v1/ext/wordpress-importer/status')).statusCode).toBe(403);
    const status = await admin.get('/api/v1/ext/wordpress-importer/status');
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ job: null });
  });

  it('refuses files that are not a WordPress export', async () => {
    const res = await admin.upload(
      '/api/v1/ext/wordpress-importer/imports',
      'notes.xml',
      Buffer.from('<?xml version="1.0"?><notes><note>Hi</note></notes>'),
      'text/xml',
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toContain('not a WordPress export');
  });

  it('imports in the background, with a report, never downloading from the server network', async () => {
    // The image points to the server itself: refused, the rest is imported.
    const xml = (await readFile(fixture, 'utf8')).replaceAll(
      'https://old.example.com/wp-content/uploads/',
      'http://127.0.0.1:9/wp-content/uploads/',
    );
    const started = await admin.upload(
      '/api/v1/ext/wordpress-importer/imports?locale=en&authorRole=contributor',
      'export.xml',
      Buffer.from(xml),
      'text/xml',
    );
    expect(started.statusCode).toBe(202);
    expect(started.json().job.status).toBe('running');

    const job = await finished();
    expect(job.error ?? job.status).toBe('done');
    expect(job.report!.created.entries).toBeGreaterThan(0);
    expect(job.report!.created.media ?? 0).toBe(0);
    expect(JSON.stringify(job.report)).toContain('not public');

    const posts = (await admin.get('/api/v1/entries?type=article&limit=50')).json().items as {
      title: string;
    }[];
    expect(posts.map((p) => p.title)).toContain('A morning at the harbour');

    // A finished import is cleared to start another.
    expect(
      (await admin.request('DELETE', '/api/v1/ext/wordpress-importer/status')).statusCode,
    ).toBe(204);
    expect((await admin.get('/api/v1/ext/wordpress-importer/status')).json()).toEqual({
      job: null,
    });
  });
});
