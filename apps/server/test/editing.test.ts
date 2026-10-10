/** Editing helpers: concurrent editing lock (RF-CNT-15) and duplicates. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let ada: TestClient;
let bob: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'editing');
  await seedUser(owner, { email: 'ada@editing.test', password: PASSWORD, site, role: 'editor' });
  await seedUser(owner, { email: 'bob@editing.test', password: PASSWORD, site, role: 'editor' });
  ada = new TestClient(app, site.host, '10.37.0.1');
  bob = new TestClient(app, site.host, '10.37.0.2');
  await ada.login('ada@editing.test', PASSWORD);
  await bob.login('bob@editing.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('editing lock', () => {
  it('warns the second editor, who can take over', async () => {
    const entry = (await ada.post('/api/v1/entries', { type: 'page', title: 'Shared' })).json();
    expect((await ada.post(`/api/v1/entries/${entry.id}/lock`)).statusCode).toBe(200);
    // Refreshing one's own lock is fine.
    expect((await ada.post(`/api/v1/entries/${entry.id}/lock`)).statusCode).toBe(200);

    expect((await bob.get(`/api/v1/entries/${entry.id}/lock`)).json().lockedBy.displayName).toBe(
      'ada',
    );
    expect((await bob.post(`/api/v1/entries/${entry.id}/lock`)).statusCode).toBe(409);
    expect((await bob.post(`/api/v1/entries/${entry.id}/lock?takeover=1`)).statusCode).toBe(200);
    expect((await ada.get(`/api/v1/entries/${entry.id}/lock`)).json().lockedBy.displayName).toBe(
      'bob',
    );

    await bob.request('DELETE', `/api/v1/entries/${entry.id}/lock`);
    expect((await ada.get(`/api/v1/entries/${entry.id}/lock`)).json().lockedBy).toBeNull();
  });
});

describe('duplicates', () => {
  it('copies content, fields, summary and terms into a new draft', async () => {
    const term = (await ada.post('/api/v1/taxonomies/category/terms', { name: 'Copies' })).json();
    const entry = (
      await ada.post('/api/v1/entries', {
        type: 'article',
        title: 'Original',
        excerpt: 'Short',
        document: {
          schema: 1,
          blocks: [
            { id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Body' }] },
          ],
        },
      })
    ).json();
    await ada.request('PATCH', `/api/v1/entries/${entry.id}`, { terms: { category: [term.id] } });
    await ada.post(`/api/v1/entries/${entry.id}/publish`);

    const copy = (await bob.post(`/api/v1/entries/${entry.id}/duplicate`)).json();
    expect(copy).toMatchObject({ title: 'Original (copy)', status: 'draft', type: 'article' });
    expect(copy.id).not.toBe(entry.id);
    expect(copy.revision.excerpt).toBe('Short');
    expect(copy.revision.document.blocks[0].content).toEqual([{ text: 'Body' }]);
    expect(copy.terms.category.map((t: { id: string }) => t.id)).toEqual([term.id]);
    expect(copy.author.displayName).toBe('bob');
  });
});
