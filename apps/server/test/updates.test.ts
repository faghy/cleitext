/** Dashboard → Updates (RF-SYS-UPD): the check and who may start an update. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UpdatesService } from '../src/updates/updates.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let root: TestClient;
let latest = '99.0.0';
let requests = 0;

beforeAll(async () => {
  app = await startTestApp({ env: { UPDATES_REPO: 'example/cleitext' } });
  // GitHub, as the service sees it.
  app.get(UpdatesService).fetchImpl = (async () => {
    requests++;
    return Response.json({
      tag_name: `v${latest}`,
      body: 'Faster pages.',
      published_at: '2026-10-11T08:00:00Z',
      html_url: `https://github.com/example/cleitext/releases/tag/v${latest}`,
    });
  }) as typeof fetch;
  owner = ownerDatabase();
  const site = await seedSite(owner, 'updates');
  await seedUser(owner, {
    email: 'admin@updates.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'root@updates.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
    superAdmin: true,
  });
  admin = new TestClient(app, site.host, '10.36.0.1');
  root = new TestClient(app, site.host, '10.36.0.2');
  await admin.login('admin@updates.test', PASSWORD);
  await root.login('root@updates.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('updates', () => {
  it('are for super admins only', async () => {
    expect((await admin.get('/api/v1/updates')).statusCode).toBe(403);
    expect((await admin.post('/api/v1/updates/core')).statusCode).toBe(403);
  });

  it('tells a newer release, from a cached check', async () => {
    const check = (await root.get('/api/v1/updates')).json();
    expect(check).toMatchObject({ latest: '99.0.0', available: true, notes: 'Faster pages.' });
    expect(check.current).toMatch(/^\d+\.\d+\.\d+$/);
    await root.get('/api/v1/updates');
    expect(requests).toBe(1);
    expect((await root.get('/api/v1/updates/status')).json()).toBeNull();
  });

  it('needs no two-factor authentication, and refuses when there is nothing newer', async () => {
    latest = '0.0.1';
    const response = await root.post('/api/v1/updates/core');
    expect(response.statusCode).toBe(400);
    expect(response.json().detail).toContain('is up to date');
  });
});
