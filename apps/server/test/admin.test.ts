/** Dashboard, activity log and system status (RF-ADM-02, -06, -07). */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let author: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'board');
  await seedUser(owner, {
    email: 'admin@board.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'author@board.test', password: PASSWORD, site, role: 'author' });
  admin = new TestClient(app, site.host, '10.16.0.1');
  await admin.login('admin@board.test', PASSWORD);
  author = new TestClient(app, site.host, '10.16.0.2');
  await author.login('author@board.test', PASSWORD);
  const story = (
    await admin.post('/api/v1/entries', { type: 'article', title: 'Launch story' })
  ).json();
  await admin.post(`/api/v1/entries/${story.id}/publish`);
  await author.post('/api/v1/entries', { type: 'article', title: 'Author draft' });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('dashboard', () => {
  it('shows counts, the user drafts, recent posts and activity', async () => {
    const board = (await admin.get('/api/v1/dashboard')).json();
    expect(board.counts.find((c: { type: string }) => c.type === 'article')).toMatchObject({
      published: 1,
      drafts: 1,
    });
    expect(board.published[0].title).toBe('Launch story');
    expect(board.drafts).toEqual([]);
    expect(board.activity.map((a: { action: string }) => a.action)).toContain('entry.published');
    expect(
      board.activity.find((a: { action: string }) => a.action === 'entry.published').targetLabel,
    ).toBe('Launch story');
  });

  it('shows authors their drafts but not the activity log', async () => {
    const board = (await author.get('/api/v1/dashboard')).json();
    expect(board.drafts.map((d: { title: string }) => d.title)).toEqual(['Author draft']);
    expect(board.activity).toBeNull();
    expect(board.warnings).toEqual([]);
  });
});

describe('activity log', () => {
  it('lists, filters and pages the log', async () => {
    const all = (await admin.get('/api/v1/audit?limit=2')).json();
    expect(all.items).toHaveLength(2);
    expect(all.nextCursor).toMatch(/^\d+$/);
    const next = (await admin.get(`/api/v1/audit?limit=2&cursor=${all.nextCursor}`)).json();
    expect(next.items[0].id).toBeLessThan(all.items[1].id);
    const logins = (await admin.get('/api/v1/audit?action=user.login')).json();
    expect(logins.items.length).toBeGreaterThanOrEqual(2);
    expect(logins.items.every((i: { action: string }) => i.action.startsWith('user.login'))).toBe(
      true,
    );
    expect(logins.items[0].user.displayName).toBeTruthy();
    expect((await author.get('/api/v1/audit')).statusCode).toBe(403);
  });
});

describe('system status', () => {
  it('reports versions, migrations, cache and storage', async () => {
    const status = (await admin.get('/api/v1/system/status')).json();
    expect(status.node).toBe(process.version);
    expect(status.postgres).toMatch(/^PostgreSQL \d+/);
    expect(status.migrations.upToDate).toBe(true);
    expect(status.cache).toMatchObject({ enabled: true });
    expect(status.media).toEqual({ files: 0, bytes: 0 });
    expect((await author.get('/api/v1/system/status')).statusCode).toBe(403);
  });
});
