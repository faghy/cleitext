/** List tables (RF-ADM-03): term filter, sorting with offset paging, bulk actions. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let editor: TestClient;
let contributor: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'lists');
  await seedUser(owner, { email: 'editor@lists.test', password: PASSWORD, site, role: 'editor' });
  await seedUser(owner, {
    email: 'contributor@lists.test',
    password: PASSWORD,
    site,
    role: 'contributor',
  });
  editor = new TestClient(app, site.host, '10.8.0.1');
  await editor.login('editor@lists.test', PASSWORD);
  contributor = new TestClient(app, site.host, '10.8.0.2');
  await contributor.login('contributor@lists.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

async function create(title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const response = await editor.post('/api/v1/entries', { type: 'page', title });
  expect(response.statusCode).toBe(201);
  const id: string = response.json().id;
  if (Object.keys(extra).length) await editor.request('PATCH', `/api/v1/entries/${id}`, extra);
  return id;
}

function titles(response: { json(): { items: { title: string }[] } }): string[] {
  return response.json().items.map((item) => item.title);
}

describe('list tables', () => {
  it('filters by term', async () => {
    const term = (
      await editor.post('/api/v1/taxonomies/category/terms', { name: 'Filtered' })
    ).json();
    const id = (
      await editor.post('/api/v1/entries', { type: 'article', title: 'With term' })
    ).json().id;
    await editor.request('PATCH', `/api/v1/entries/${id}`, { terms: { category: [term.id] } });
    await editor.post('/api/v1/entries', { type: 'article', title: 'Without term' });
    const response = await editor.get(`/api/v1/entries?type=article&term=${term.id}`);
    expect(titles(response)).toEqual(['With term']);
  });

  it('sorts by title and order, paging by offset', async () => {
    await create('Charlie', { position: 1 });
    await create('Alpha', { position: 3 });
    await create('Bravo', { position: 2 });
    const first = await editor.get('/api/v1/entries?type=page&sort=title&limit=2');
    expect(titles(first)).toEqual(['Alpha', 'Bravo']);
    expect(first.json().nextCursor).toBe('o:2');
    const second = await editor.get('/api/v1/entries?type=page&sort=title&limit=2&cursor=o:2');
    expect(titles(second)).toEqual(['Charlie']);
    expect(second.json().nextCursor).toBeNull();
    const desc = await editor.get('/api/v1/entries?type=page&sort=title&dir=desc');
    expect(titles(desc)).toEqual(['Charlie', 'Bravo', 'Alpha']);
    const order = await editor.get('/api/v1/entries?type=page&sort=order');
    expect(titles(order)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('lists hierarchical entries in tree order', async () => {
    const parent = await create('Tree parent', { position: 5 });
    await create('Tree child', { position: 0, parentId: parent });
    await create('Tree root', { position: 4 });
    const list = await editor.get('/api/v1/entries?type=page&sort=order&q=');
    const order = titles(list).filter((t) => t.startsWith('Tree'));
    expect(order).toEqual(['Tree root', 'Tree parent', 'Tree child']);
  });

  it('runs bulk actions entry by entry', async () => {
    const a = await create('Bulk A');
    const b = await create('Bulk B');
    const publish = await editor.post('/api/v1/entries/bulk', { ids: [a, b], action: 'publish' });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect((await editor.get(`/api/v1/entries/${a}`)).json().status).toBe('published');

    // A contributor cannot publish: each item fails, nothing changes.
    const denied = await contributor.post('/api/v1/entries/bulk', { ids: [a], action: 'trash' });
    expect(denied.json().results[0].ok).toBe(false);

    await editor.post('/api/v1/entries/bulk', { ids: [a, b], action: 'trash' });
    expect((await editor.get(`/api/v1/entries/${b}`)).json().status).toBe('trashed');
    await editor.post('/api/v1/entries/bulk', { ids: [a], action: 'restore' });
    expect((await editor.get(`/api/v1/entries/${a}`)).json().status).not.toBe('trashed');
    const removed = await editor.post('/api/v1/entries/bulk', { ids: [b], action: 'delete' });
    expect(removed.json().results).toEqual([{ id: b, ok: true }]);
    expect((await editor.get(`/api/v1/entries/${b}`)).statusCode).toBe(404);

    expect(
      (await editor.post('/api/v1/entries/bulk', { ids: [], action: 'trash' })).statusCode,
    ).toBe(400);
  });
});
