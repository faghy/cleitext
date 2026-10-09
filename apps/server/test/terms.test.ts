/** Taxonomies and terms (RF-TAX-01/03): permissions, assignments, hierarchy. */
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
let editor: TestClient;
let author: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'terms', { locales: ['en', 'it'] });
  await seedUser(owner, { email: 'editor@terms.test', password: PASSWORD, site, role: 'editor' });
  await seedUser(owner, { email: 'author@terms.test', password: PASSWORD, site, role: 'author' });
  editor = new TestClient(app, site.host, '10.7.0.1');
  author = new TestClient(app, site.host, '10.7.0.2');
  await editor.login('editor@terms.test', PASSWORD);
  await author.login('author@terms.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const article = async (client: TestClient, title: string, locale = 'en') =>
  (await client.post('/api/v1/entries', { type: 'article', title, locale })).json();

describe('taxonomies', () => {
  it('lists categories and tags for posts', async () => {
    const list = (await author.get('/api/v1/taxonomies')).json();
    expect(list).toEqual([
      expect.objectContaining({ slug: 'category', hierarchical: true, contentTypes: ['article'] }),
      expect.objectContaining({ slug: 'tag', hierarchical: false, contentTypes: ['article'] }),
    ]);
  });
});

describe('terms', () => {
  it('lets editors manage categories, and authors only create tags', async () => {
    const news = await editor.post('/api/v1/taxonomies/category/terms', {
      name: 'Notizie & Eventi',
    });
    expect(news.statusCode).toBe(201);
    expect(news.json()).toMatchObject({
      slug: 'notizie-eventi',
      locale: 'en',
      taxonomy: 'category',
    });

    expect(
      (await author.post('/api/v1/taxonomies/category/terms', { name: 'Nope' })).statusCode,
    ).toBe(403);
    expect((await author.post('/api/v1/taxonomies/tag/terms', { name: 'Coffee' })).statusCode).toBe(
      201,
    );
    expect(
      (await author.request('PATCH', `/api/v1/terms/${news.json().id}`, { name: 'x' })).statusCode,
    ).toBe(403);
  });

  it('keeps categories hierarchical and tags flat', async () => {
    const parent = (
      await editor.post('/api/v1/taxonomies/category/terms', { name: 'Sports' })
    ).json();
    const child = (
      await editor.post('/api/v1/taxonomies/category/terms', {
        name: 'Football',
        parentId: parent.id,
      })
    ).json();
    expect(child.parentId).toBe(parent.id);
    expect(
      (await editor.request('PATCH', `/api/v1/terms/${parent.id}`, { parentId: child.id }))
        .statusCode,
    ).toBe(400);
    const tag = (await editor.post('/api/v1/taxonomies/tag/terms', { name: 'Flat' })).json();
    expect(
      (await editor.post('/api/v1/taxonomies/tag/terms', { name: 'Child tag', parentId: tag.id }))
        .statusCode,
    ).toBe(400);

    // Deleting a category moves its children up.
    expect((await editor.request('DELETE', `/api/v1/terms/${parent.id}`)).statusCode).toBe(204);
    const terms = (await editor.get('/api/v1/taxonomies/category/terms')).json();
    expect(terms.find((t: { id: string }) => t.id === child.id).parentId).toBeNull();
  });
});

describe('assignments', () => {
  it('assigns categories and creates tags by name on the fly', async () => {
    const category = (
      await editor.post('/api/v1/taxonomies/category/terms', { name: 'Travel' })
    ).json();
    const entry = await article(author, 'Trip to Rome');
    const res = await author.request('PATCH', `/api/v1/entries/${entry.id}`, {
      terms: {
        category: [category.id],
        tag: [{ name: 'Rome' }, { name: 'Food' }, { name: 'rome' }],
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const view = res.json();
    expect(view.terms.category.map((t: { name: string }) => t.name)).toEqual(['Travel']);
    expect(view.terms.tag.map((t: { name: string }) => t.name).sort()).toEqual(['Food', 'Rome']);

    // A second post reuses the existing tag; counts reflect both.
    const other = await article(author, 'Rome again');
    await author.request('PATCH', `/api/v1/entries/${other.id}`, {
      terms: { tag: [{ name: 'Rome' }] },
    });
    const tags = (await author.get('/api/v1/taxonomies/tag/terms?locale=en')).json();
    expect(tags.filter((t: { name: string }) => t.name === 'Rome')).toEqual([
      expect.objectContaining({ count: 2 }),
    ]);

    // Replacing the list removes the others.
    const replaced = (
      await author.request('PATCH', `/api/v1/entries/${entry.id}`, { terms: { tag: [] } })
    ).json();
    expect(replaced.terms.tag).toBeUndefined();
    expect(replaced.terms.category).toHaveLength(1);
  });

  it('refuses taxonomies that do not apply and terms of another language', async () => {
    const page = (await editor.post('/api/v1/entries', { type: 'page', title: 'About' })).json();
    const category = (
      await editor.post('/api/v1/taxonomies/category/terms', { name: 'Misc' })
    ).json();
    expect(
      (
        await editor.request('PATCH', `/api/v1/entries/${page.id}`, {
          terms: { category: [category.id] },
        })
      ).statusCode,
    ).toBe(400);

    const italian = (
      await editor.post('/api/v1/taxonomies/category/terms', { name: 'Viaggi', locale: 'it' })
    ).json();
    const english = await article(editor, 'English post');
    expect(
      (
        await editor.request('PATCH', `/api/v1/entries/${english.id}`, {
          terms: { category: [italian.id] },
        })
      ).statusCode,
    ).toBe(400);
  });
});
