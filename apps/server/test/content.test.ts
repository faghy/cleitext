/**
 * Content (milestone M2): entries, revisions, statuses, scheduling,
 * translations, permissions and redirects.
 */
import { entries, redirects, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { CxdDocument } from '@cleitext/blocks';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SchedulerService } from '../src/content/scheduler.service.js';
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
let other: SeededSite;
const as: Record<string, TestClient> = {};

const doc = (text: string): CxdDocument => ({
  schema: 1,
  blocks: [
    { id: 'h', type: 'core/heading', v: 1, attrs: { level: 2 }, content: [{ text: 'Title' }] },
    { id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text, marks: ['bold'] }] },
  ],
});

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'content', { locales: ['en', 'it'] });
  other = await seedSite(owner, 'content-other');
  let ip = 1;
  for (const role of ['administrator', 'editor', 'author', 'contributor', 'subscriber'] as const) {
    await seedUser(owner, { email: `${role}@content.test`, password: PASSWORD, site, role });
    as[role] = new TestClient(app, site.host, `10.9.0.${ip++}`);
    await as[role].login(`${role}@content.test`, PASSWORD);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

async function createArticle(client: TestClient, title: string, text = 'Body') {
  const res = await client.post('/api/v1/entries', { type: 'article', title, document: doc(text) });
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

describe('content types', () => {
  it('lists the default types', async () => {
    const types = (await as.author!.get('/api/v1/content-types')).json();
    expect(types.map((t: { slug: string }) => t.slug)).toEqual(['article', 'page']);
  });

  it('are not available to subscribers', async () => {
    expect((await as.subscriber!.get('/api/v1/content-types')).statusCode).toBe(403);
  });
});

describe('entries', () => {
  it('creates a draft with a slug and a first revision', async () => {
    const entry = await createArticle(as.author!, 'Città e Caffè: guida!');
    expect(entry).toMatchObject({
      type: 'article',
      locale: 'en',
      status: 'draft',
      slug: 'citta-e-caffe-guida',
      permissions: { edit: true, publish: true, delete: true },
    });
    expect(entry.revision.document).toEqual(doc('Body'));
    expect(entry.author.displayName).toBe('author');
  });

  it('makes slugs unique within type and language', async () => {
    const a = await createArticle(as.author!, 'Same title');
    const b = await createArticle(as.author!, 'Same title');
    expect([a.slug, b.slug]).toEqual(['same-title', 'same-title-2']);
  });

  it('derives the slug from the title until the entry is published', async () => {
    const created = (
      await as.author!.post('/api/v1/entries', { type: 'article', title: '' })
    ).json();
    expect(created.slug).toMatch(/^untitled(-\d+)?$/);
    const titled = (
      await as.author!.request('PATCH', `/api/v1/entries/${created.id}`, { title: 'Spring news' })
    ).json();
    expect(titled.slug).toBe('spring-news');
    // A slug chosen by hand is kept.
    await as.author!.request('PATCH', `/api/v1/entries/${created.id}`, { slug: 'my-choice' });
    const renamed = (
      await as.author!.request('PATCH', `/api/v1/entries/${created.id}`, { title: 'Autumn news' })
    ).json();
    expect(renamed.slug).toBe('my-choice');
  });

  it('rejects invalid documents with details', async () => {
    const bad = await as.author!.post('/api/v1/entries', {
      type: 'article',
      title: 'Bad',
      document: {
        schema: 1,
        blocks: [
          { id: 'x', type: 'core/heading', v: 1, attrs: { level: 9 } },
          {
            id: 'y',
            type: 'core/paragraph',
            v: 1,
            attrs: {},
            content: [{ type: 'link', href: 'javascript:alert(1)', children: [{ text: 'x' }] }],
          },
        ],
      },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown content types and disabled languages', async () => {
    expect(
      (await as.author!.post('/api/v1/entries', { type: 'event', title: 'x' })).statusCode,
    ).toBe(400);
    expect(
      (await as.author!.post('/api/v1/entries', { type: 'article', title: 'x', locale: 'de' }))
        .statusCode,
    ).toBe(400);
  });

  it('keeps entries of other sites invisible', async () => {
    const entry = await createArticle(as.author!, 'Private to this site');
    const stranger = new TestClient(app, other.host, '10.9.9.9');
    await seedUser(owner, {
      email: 'admin@other.test',
      password: PASSWORD,
      site: other,
      role: 'administrator',
    });
    await stranger.login('admin@other.test', PASSWORD);
    expect((await stranger.get(`/api/v1/entries/${entry.id}`)).statusCode).toBe(404);
  });
});

describe('revisions (RF-CNT-05/07)', () => {
  it('saves every change as a revision and restores old ones', async () => {
    const entry = await createArticle(as.author!, 'Revised', 'first');
    await as.author!.request('PATCH', `/api/v1/entries/${entry.id}`, { document: doc('second') });
    await as.author!.request('PATCH', `/api/v1/entries/${entry.id}`, { title: 'Revised again' });

    const list = (await as.author!.get(`/api/v1/entries/${entry.id}/revisions`)).json();
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ current: true, title: 'Revised again' });
    expect(list[1].title).toBe('Revised');

    const first = list[2];
    const restored = (
      await as.author!.post(`/api/v1/entries/${entry.id}/revisions/${first.id}/restore`)
    ).json();
    expect(restored.title).toBe('Revised');
    expect(restored.revision.document).toEqual(doc('first'));
    expect(restored.revision.kind).toBe('restore');
  });

  it('keeps the published version while edits are pending', async () => {
    const entry = await createArticle(as.author!, 'Live', 'v1');
    const published = (await as.author!.post(`/api/v1/entries/${entry.id}/publish`)).json();
    expect(published).toMatchObject({ status: 'published', hasUnpublishedChanges: false });
    const edited = (
      await as.author!.request('PATCH', `/api/v1/entries/${entry.id}`, { document: doc('v2') })
    ).json();
    expect(edited.hasUnpublishedChanges).toBe(true);
    const republished = (await as.author!.post(`/api/v1/entries/${entry.id}/publish`)).json();
    expect(republished.hasUnpublishedChanges).toBe(false);
    expect(republished.publishedAt).toBe(published.publishedAt);
  });

  it('autosaves without changing the entry and offers recovery', async () => {
    const entry = await createArticle(as.author!, 'Draft in progress', 'saved');
    const autosave = await as.author!.request('PUT', `/api/v1/entries/${entry.id}/autosave`, {
      title: 'Draft in progress',
      document: doc('unsaved'),
    });
    expect(autosave.statusCode).toBe(200);
    const view = (await as.author!.get(`/api/v1/entries/${entry.id}`)).json();
    expect(view.revision.document).toEqual(doc('saved'));
    expect(view.autosave.document).toEqual(doc('unsaved'));
    // Autosaves do not appear in the revision history.
    expect((await as.author!.get(`/api/v1/entries/${entry.id}/revisions`)).json()).toHaveLength(1);
  });
});

describe('workflow and permissions', () => {
  it('lets a contributor write and submit, but not publish', async () => {
    const entry = await createArticle(as.contributor!, 'For review');
    expect(entry.permissions).toEqual({ edit: true, publish: false, delete: true });
    expect((await as.contributor!.post(`/api/v1/entries/${entry.id}/publish`)).statusCode).toBe(
      403,
    );
    const pending = (await as.contributor!.post(`/api/v1/entries/${entry.id}/submit`)).json();
    expect(pending.status).toBe('pending');
    // An editor publishes it.
    expect((await as.editor!.post(`/api/v1/entries/${entry.id}/publish`)).json().status).toBe(
      'published',
    );
    // The contributor can no longer change or delete it.
    expect(
      (await as.contributor!.request('PATCH', `/api/v1/entries/${entry.id}`, { title: 'x' }))
        .statusCode,
    ).toBe(403);
    expect((await as.contributor!.post(`/api/v1/entries/${entry.id}/trash`)).statusCode).toBe(403);
  });

  it('lets authors edit only their own entries, editors everyone’s', async () => {
    const mine = await createArticle(as.editor!, 'Editor note');
    expect(
      (await as.author!.request('PATCH', `/api/v1/entries/${mine.id}`, { title: 'x' })).statusCode,
    ).toBe(403);
    const theirs = await createArticle(as.author!, 'Author note');
    expect(
      (await as.editor!.request('PATCH', `/api/v1/entries/${theirs.id}`, { title: 'Edited' }))
        .statusCode,
    ).toBe(200);
  });

  it('moves entries through the trash before deleting them', async () => {
    const entry = await createArticle(as.author!, 'Disposable');
    expect((await as.author!.request('DELETE', `/api/v1/entries/${entry.id}`)).statusCode).toBe(
      409,
    );
    expect((await as.author!.post(`/api/v1/entries/${entry.id}/trash`)).json().status).toBe(
      'trashed',
    );
    const listed = (await as.author!.get('/api/v1/entries?type=article&limit=100')).json();
    expect(listed.items.some((e: { id: string }) => e.id === entry.id)).toBe(false);
    expect((await as.author!.post(`/api/v1/entries/${entry.id}/restore`)).json().status).toBe(
      'draft',
    );
    await as.author!.post(`/api/v1/entries/${entry.id}/trash`);
    expect((await as.author!.request('DELETE', `/api/v1/entries/${entry.id}`)).statusCode).toBe(
      204,
    );
    expect((await as.author!.get(`/api/v1/entries/${entry.id}`)).statusCode).toBe(404);
  });
});

describe('scheduling (RF-CNT-08)', () => {
  it('rejects past dates and publishes when the time comes', async () => {
    const entry = await createArticle(as.author!, 'Later');
    const past = await as.author!.post(`/api/v1/entries/${entry.id}/schedule`, {
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(past.statusCode).toBe(400);

    const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = (
      await as.author!.post(`/api/v1/entries/${entry.id}/schedule`, { scheduledAt })
    ).json();
    expect(scheduled).toMatchObject({ status: 'scheduled', scheduledAt });

    // Time passes…
    await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .update(entries)
        .set({ scheduledAt: new Date(Date.now() - 1_000) })
        .where(eq(entries.id, entry.id)),
    );
    expect(await app.get(SchedulerService).tick()).toBeGreaterThanOrEqual(1);
    expect((await as.author!.get(`/api/v1/entries/${entry.id}`)).json().status).toBe('published');
  });
});

describe('translations (RF-CNT-10)', () => {
  it('creates a draft translation in another enabled language', async () => {
    const entry = await createArticle(as.author!, 'Hello world', 'english');
    const translation = await as.author!.post(`/api/v1/entries/${entry.id}/translations`, {
      locale: 'it',
    });
    expect(translation.statusCode).toBe(201);
    expect(translation.json()).toMatchObject({
      locale: 'it',
      status: 'draft',
      translationGroup: entry.translationGroup,
      slug: entry.slug,
    });
    expect(translation.json().revision.document).toEqual(doc('english'));

    const source = (await as.author!.get(`/api/v1/entries/${entry.id}`)).json();
    expect(source.translations).toEqual([
      expect.objectContaining({ id: translation.json().id, locale: 'it' }),
    ]);
    expect(
      (await as.author!.post(`/api/v1/entries/${entry.id}/translations`, { locale: 'it' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await as.author!.post(`/api/v1/entries/${entry.id}/translations`, { locale: 'de' }))
        .statusCode,
    ).toBe(400);
  });
});

describe('slugs and redirects (RF-CNT-11)', () => {
  it('redirects the old path when a published page changes slug', async () => {
    const parent = (
      await as.editor!.post('/api/v1/entries', { type: 'page', title: 'About' })
    ).json();
    const child = (
      await as.editor!.post('/api/v1/entries', { type: 'page', title: 'Team', parentId: parent.id })
    ).json();
    await as.editor!.post(`/api/v1/entries/${child.id}/publish`);
    await as.editor!.request('PATCH', `/api/v1/entries/${child.id}`, { slug: 'our-team' });

    const rows = await withSiteContext(owner.db, site.id, (tx) => tx.select().from(redirects));
    expect(rows).toEqual([
      expect.objectContaining({ fromPath: '/about/team', toPath: '/about/our-team', status: 301 }),
    ]);
  });

  it('prevents parent loops and parents of another type', async () => {
    const a = (await as.editor!.post('/api/v1/entries', { type: 'page', title: 'A' })).json();
    const b = (
      await as.editor!.post('/api/v1/entries', { type: 'page', title: 'B', parentId: a.id })
    ).json();
    expect(
      (await as.editor!.request('PATCH', `/api/v1/entries/${a.id}`, { parentId: b.id })).statusCode,
    ).toBe(400);
    const article = await createArticle(as.editor!, 'Article');
    expect(
      (await as.editor!.post('/api/v1/entries', { type: 'page', title: 'C', parentId: article.id }))
        .statusCode,
    ).toBe(400);
  });
});

describe('listing', () => {
  it('paginates with a cursor and filters by status', async () => {
    for (let i = 0; i < 5; i++) await createArticle(as.administrator!, `Paged ${i}`);
    const first = (
      await as.administrator!.get('/api/v1/entries?type=article&limit=3&q=Paged')
    ).json();
    expect(first.items).toHaveLength(3);
    const second = (
      await as.administrator!.get(
        `/api/v1/entries?type=article&limit=3&q=Paged&cursor=${first.nextCursor}`,
      )
    ).json();
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(5);

    const published = (
      await as.administrator!.get('/api/v1/entries?status=published&limit=100')
    ).json();
    expect(published.items.every((e: { status: string }) => e.status === 'published')).toBe(true);
  });
});
