/** Block patterns (RF-EDT-07): copies and synced references. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let editor: TestClient;
let author: TestClient;
let visitor: TestClient;

const doc = (text: string) => ({
  schema: 1,
  blocks: [{ id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text }] }],
});

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'patterns');
  await seedUser(owner, {
    email: 'editor@patterns.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  await seedUser(owner, {
    email: 'author@patterns.test',
    password: PASSWORD,
    site,
    role: 'author',
  });
  editor = new TestClient(app, site.host, '10.40.0.1');
  author = new TestClient(app, site.host, '10.40.0.2');
  visitor = new TestClient(app, site.host, '10.40.0.3');
  await editor.login('editor@patterns.test', PASSWORD);
  await author.login('author@patterns.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('patterns', () => {
  it('saves patterns and renders synced ones from the pattern itself', async () => {
    const copy = await editor.post('/api/v1/patterns', {
      title: 'Call to action',
      document: doc('Buy now'),
    });
    expect(copy.statusCode).toBe(201);
    const synced = (
      await editor.post('/api/v1/patterns', {
        title: 'Shared notice',
        document: doc('Shop closed on Sunday'),
        synced: true,
      })
    ).json();
    expect(
      (await author.get('/api/v1/patterns')).json().map((p: { title: string }) => p.title),
    ).toEqual(['Call to action', 'Shared notice']);

    const page = (
      await editor.post('/api/v1/entries', {
        type: 'page',
        title: 'Hours',
        document: {
          schema: 1,
          blocks: [{ id: 'ref', type: 'cleitext/pattern', v: 1, attrs: { ref: synced.id } }],
        },
      })
    ).json();
    await editor.post(`/api/v1/entries/${page.id}/publish`);
    expect((await visitor.get('/hours')).body).toContain('Shop closed on Sunday');

    // Changing the pattern changes every page that uses it.
    await editor.request('PATCH', `/api/v1/patterns/${synced.id}`, {
      document: doc('Open every day'),
    });
    const after = (await visitor.get('/hours')).body;
    expect(after).toContain('Open every day');
    expect(after).not.toContain('Shop closed');
  });

  it('lets only the author or editors change a pattern', async () => {
    const mine = (
      await editor.post('/api/v1/patterns', { title: 'Editor only', document: doc('x') })
    ).json();
    expect(
      (await author.request('PATCH', `/api/v1/patterns/${mine.id}`, { title: 'Hijack' }))
        .statusCode,
    ).toBe(403);
    const own = (
      await author.post('/api/v1/patterns', { title: 'Mine', document: doc('y') })
    ).json();
    expect((await author.request('DELETE', `/api/v1/patterns/${own.id}`)).statusCode).toBe(204);
    expect((await editor.request('DELETE', `/api/v1/patterns/${mine.id}`)).statusCode).toBe(204);
  });
});
