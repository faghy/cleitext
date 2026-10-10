/** Global admin search (RF-ADM-05), within the user's permissions. */
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
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'search-admin');
  await seedUser(owner, {
    email: 'zebra-admin@search.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'author@search.test', password: PASSWORD, site, role: 'author' });
  admin = new TestClient(app, site.host, '10.39.0.1');
  author = new TestClient(app, site.host, '10.39.0.2');
  await admin.login('zebra-admin@search.test', PASSWORD);
  await author.login('author@search.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('admin search', () => {
  it('finds entries, terms and users the user may see', async () => {
    await admin.post('/api/v1/entries', { type: 'article', title: 'Zebra crossing' });
    const secret = (
      await admin.post('/api/v1/entries', { type: 'page', title: 'Zebra secret' })
    ).json();
    await admin.post(`/api/v1/entries/${secret.id}/publish`, { visibility: 'private' });
    await admin.post('/api/v1/taxonomies/category/terms', { name: 'Zebras' });

    const all = (await admin.get('/api/v1/search?q=zebra')).json();
    expect(all.entries.map((e: { title: string }) => e.title).sort()).toEqual([
      'Zebra crossing',
      'Zebra secret',
    ]);
    expect(all.terms.map((t: { name: string }) => t.name)).toEqual(['Zebras']);
    expect(all.users.map((u: { email: string }) => u.email)).toEqual(['zebra-admin@search.test']);

    const limited = (await author.get('/api/v1/search?q=zebra')).json();
    expect(limited.entries.map((e: { title: string }) => e.title)).toEqual(['Zebra crossing']);
    expect(limited.terms).toEqual([]);
    expect(limited.users).toEqual([]);
    expect((await author.get('/api/v1/search?q=z')).json().entries).toEqual([]);
  });
});
