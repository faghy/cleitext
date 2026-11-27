/** How many entries of a type in each status (#54): beside the list's filters and in the admin menu. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let author: TestClient;

beforeAll(async () => {
  owner = ownerDatabase();
  app = await startTestApp();
  const site = await seedSite(owner, 'entry-counts');
  await seedUser(owner, {
    email: 'admin@entry-counts.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'author@entry-counts.test',
    password: PASSWORD,
    site,
    role: 'contributor',
  });
  admin = new TestClient(app, site.host, '10.54.0.1');
  author = new TestClient(app, site.host, '10.54.0.2');
  await admin.login('admin@entry-counts.test', PASSWORD);
  await author.login('author@entry-counts.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('entry counts by status (#54)', () => {
  it('counts each status, all without the trash, private ones only for who may read them', async () => {
    const make = async (title: string) =>
      (await admin.post('/api/v1/entries', { type: 'article', title })).json() as { id: string };
    const published = await make('Online');
    await admin.post(`/api/v1/entries/${published.id}/publish`);
    await make('Draft one');
    await make('Draft two');
    const trashed = await make('Gone');
    await admin.post(`/api/v1/entries/${trashed.id}/trash`);
    const waiting = (
      await author.post('/api/v1/entries', { type: 'article', title: 'For review' })
    ).json();
    expect((await author.post(`/api/v1/entries/${waiting.id}/submit`)).statusCode).toBe(200);

    const counts = await admin.get('/api/v1/entries/counts?type=article');
    expect(counts.statusCode, counts.body).toBe(200);
    expect(counts.json()).toMatchObject({
      all: 4,
      published: 1,
      draft: 2,
      pending: 1,
      trashed: 1,
      scheduled: 0,
    });
    expect((await admin.get('/api/v1/entries/counts?type=page')).json()).toMatchObject({ all: 0 });
    expect((await admin.get('/api/v1/entries/counts')).statusCode).toBe(400);
  });
});
