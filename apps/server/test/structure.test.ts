/** Content types and taxonomies from the admin, permalink settings (RF-CNT-02, RF-TAX-02, RF-SET-03). */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let editor: TestClient;
let visitor: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'structure', { locales: ['en', 'it'] });
  await seedUser(owner, {
    email: 'admin@structure.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'editor@structure.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  admin = new TestClient(app, site.host, '10.34.0.1');
  editor = new TestClient(app, site.host, '10.34.0.2');
  visitor = new TestClient(app, site.host, '10.34.0.3');
  await admin.login('admin@structure.test', PASSWORD);
  await editor.login('editor@structure.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

async function publish(type: string, title: string, extra: object = {}) {
  const entry = (await admin.post('/api/v1/entries', { type, title, ...extra })).json();
  return (await admin.post(`/api/v1/entries/${entry.id}/publish`)).json();
}

describe('content types from the admin', () => {
  it('creates a type with fields, used like any other', async () => {
    const created = await admin.post('/api/v1/content-types', {
      slug: 'recipe',
      name: { en: 'Recipes', it: 'Ricette' },
      supports: ['blocks', 'featured_image'],
      fields: [{ name: 'minutes', label: 'Minutes', type: 'number', min: 1 }],
    });
    expect(created.statusCode).toBe(201);
    expect(
      (await editor.post('/api/v1/content-types', { slug: 'x', name: { en: 'X' } })).statusCode,
    ).toBe(403);

    const types = (await admin.get('/api/v1/content-types')).json();
    const recipe = types.find((t: { slug: string }) => t.slug === 'recipe');
    expect(recipe).toMatchObject({ source: 'user', permalink: '/recipe/{slug}' });
    expect(recipe.fields[0].name).toBe('minutes');

    const entry = await publish('recipe', 'Carbonara', { fields: { minutes: 20 } });
    expect(entry.revision.fields).toEqual({ minutes: 20 });
    expect((await visitor.get('/recipe/carbonara')).statusCode).toBe(200);
  });

  it('changes a permalink with redirects from the old addresses', async () => {
    const changed = await admin.request('PATCH', '/api/v1/content-types/recipe', {
      permalink: '/recipes/{year}/{slug}',
    });
    expect(changed.json()).toEqual({ redirects: 1 });
    const year = new Date().getUTCFullYear();
    const old = await visitor.get('/recipe/carbonara');
    expect(old.statusCode).toBe(301);
    expect(old.headers.location).toBe(`/recipes/${year}/carbonara`);
    expect((await visitor.get(`/recipes/${year}/carbonara`)).statusCode).toBe(200);

    // Built-in types: only the permalink can change.
    expect(
      (await admin.request('PATCH', '/api/v1/content-types/article', { name: { en: 'News' } }))
        .statusCode,
    ).toBe(400);
    const post = await publish('article', 'Hello permalinks');
    expect(
      (await admin.request('PATCH', '/api/v1/content-types/article', { permalink: '/news/{slug}' }))
        .statusCode,
    ).toBe(200);
    expect((await visitor.get(`/${year}/${post.slug}`)).headers.location).toBe(
      `/news/${post.slug}`,
    );
  });

  it('refuses invalid, reserved and clashing permalinks', async () => {
    for (const permalink of [
      'recipes/{slug}',
      '/recipes/{path}',
      '/Recipes/{slug}',
      '/{slug}/x',
      '/api/{slug}',
      '/category/{slug}',
      '/it/{slug}',
      '/news/{slug}',
    ]) {
      const res = await admin.request('PATCH', '/api/v1/content-types/recipe', { permalink });
      expect([400, 409], permalink).toContain(res.statusCode);
    }
  });

  it('deletes only unused types made in the admin', async () => {
    expect((await admin.request('DELETE', '/api/v1/content-types/recipe')).statusCode).toBe(409);
    expect((await admin.request('DELETE', '/api/v1/content-types/page')).statusCode).toBe(400);
    await admin.post('/api/v1/content-types', { slug: 'empty', name: { en: 'Empty' } });
    expect((await admin.request('DELETE', '/api/v1/content-types/empty')).statusCode).toBe(204);
  });
});

describe('taxonomies from the admin', () => {
  it('creates a taxonomy for a type, with public archives', async () => {
    const created = await admin.post('/api/v1/taxonomies', {
      slug: 'cuisine',
      name: { en: 'Cuisines', it: 'Cucine' },
      hierarchical: true,
      contentTypes: ['recipe'],
    });
    expect(created.statusCode).toBe(201);
    const term = (await admin.post('/api/v1/taxonomies/cuisine/terms', { name: 'Roman' })).json();
    const entry = (
      await admin.post('/api/v1/entries', { type: 'recipe', title: 'Amatriciana' })
    ).json();
    await admin.request('PATCH', `/api/v1/entries/${entry.id}`, { terms: { cuisine: [term.id] } });
    await admin.post(`/api/v1/entries/${entry.id}/publish`);
    const archive = await visitor.get('/cuisine/roman');
    expect(archive.statusCode).toBe(200);
    expect(archive.body).toContain('Amatriciana');

    expect(
      (await admin.post('/api/v1/taxonomies', { slug: 'recipes', name: { en: 'x' } })).statusCode,
    ).toBe(409);
    expect(
      (await admin.post('/api/v1/taxonomies', { slug: 'feed', name: { en: 'x' } })).statusCode,
    ).toBe(400);
  });

  it('updates the types it applies to, and deletes it when empty', async () => {
    const updated = await admin.request('PATCH', '/api/v1/taxonomies/cuisine', {
      contentTypes: ['recipe', 'article'],
    });
    expect(updated.json().contentTypes).toEqual(['recipe', 'article']);
    expect((await admin.request('DELETE', '/api/v1/taxonomies/cuisine')).statusCode).toBe(409);
    expect((await admin.request('DELETE', '/api/v1/taxonomies/tag')).statusCode).toBe(400);
    await admin.post('/api/v1/taxonomies', { slug: 'mood', name: { en: 'Moods' } });
    expect((await admin.request('DELETE', '/api/v1/taxonomies/mood')).statusCode).toBe(204);
  });
});
