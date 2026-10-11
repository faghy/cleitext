/** Tags next to entry titles (like WordPress's post states): front, posts and 404 pages. */
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

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'states');
  await seedUser(owner, {
    email: 'admin@states.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.41.0.1');
  await admin.login('admin@states.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const page = async (title: string) =>
  (await admin.post('/api/v1/entries', { type: 'page', title })).json() as { id: string };

describe('entry states', () => {
  it('marks the front, posts and 404 pages in the list and the editor', async () => {
    const home = await page('Welcome');
    const blog = await page('Blog');
    const missing = await page('Not found');
    const other = await page('About');
    expect(
      (
        await admin.request('PATCH', '/api/v1/settings/core', {
          frontPage: home.id,
          postsPage: blog.id,
          errorPage: missing.id,
        })
      ).statusCode,
    ).toBe(200);

    const list = (await admin.get('/api/v1/entries?type=page&limit=50')).json() as {
      items: { id: string; states?: { key: string; label: unknown }[] }[];
    };
    const states = (id: string) => list.items.find((e) => e.id === id)?.states;
    expect(states(home.id)).toEqual([{ key: 'front', label: { en: 'Front page', it: 'Home' } }]);
    expect(states(blog.id)?.map((s) => s.key)).toEqual(['posts']);
    expect(states(missing.id)?.map((s) => s.key)).toEqual(['error']);
    expect(states(other.id)).toBeUndefined();

    const entry = (await admin.get(`/api/v1/entries/${missing.id}`)).json();
    expect(entry.states).toEqual([{ key: 'error', label: { en: '404 page', it: 'Pagina 404' } }]);
  });
});
