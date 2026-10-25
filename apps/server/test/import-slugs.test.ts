/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * Long addresses in imports (core 0.82): slugs up to WordPress's 200
 * characters, kept whole; a slug cut at the limit that collides gets a
 * suffix within it (`…-2`) and a redirect from its old address; records are
 * recognised by their source ref, so two posts with the same title are
 * never merged, also on sites imported by older cores (slugs cut at 80).
 */
import {
  entries,
  importRefs,
  newId,
  redirects,
  revisions,
  superAdmins,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import { htmlToCxd } from '@cleitext/blocks/html';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextFreeSlug, SLUG_MAX, slugify } from '../src/content/slug.js';
import { MediaService } from '../src/media/media.service.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
import { importDocument, importSource } from '../src/transfer/importer.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const BASE =
  'corso-di-formazione-professionale-per-lo-sviluppo-delle-competenze-trasversali-e-delle-nuove-abilita';
const TITLE = 'Corso di formazione per le nuove abilità';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let importer: string;

const paragraph = (text: string) => htmlToCxd(`<p>${text}</p>`);

/** A WordPress export, as the WordPress Importer plugin converts it, of the given posts. */
function document(
  posts: { id: number; slug: string; title?: string }[],
  source = 'https://lino.example.com',
) {
  return {
    format: 'cleitext-transfer',
    version: 1,
    source: { kind: 'wordpress', url: source, exportedAt: '2026-10-25T10:00:00Z' },
    entries: posts.map((p) => ({
      ref: `post:${p.id}`,
      type: 'page',
      locale: 'it',
      slug: p.slug,
      title: p.title ?? TITLE,
      status: 'published',
      publishedAt: '2024-05-02T08:00:00Z',
      document: paragraph(`Post ${p.id}`),
      oldPaths: [`${source}/${p.slug}/`],
    })),
  };
}

async function run(siteId: string, doc: unknown) {
  return importDocument(doc, {
    db: owner.db,
    siteId,
    asUserId: importer,
    media: app.get(MediaService),
    cache: app.get(PageCacheService),
    readFile: () => Promise.reject(new Error('no files')),
  });
}

async function articles(siteId: string) {
  const rows = await withSiteContext(owner.db, siteId, (tx) =>
    tx.select({ id: entries.id, slug: entries.slug, title: entries.title }).from(entries),
  );
  return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function redirectsOf(siteId: string) {
  return withSiteContext(owner.db, siteId, (tx) =>
    tx.select({ from: redirects.fromPath, to: redirects.toPath }).from(redirects),
  );
}

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const [user] = await owner.db
    .insert(users)
    .values({ email: 'importer@slugs.test', displayName: 'Importer' })
    .returning();
  importer = user!.id;
  await owner.db.insert(superAdmins).values({ userId: importer });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('unique slugs within the limit', () => {
  it('adds the suffix after shortening the base, as WordPress does', () => {
    const base = 'a'.repeat(SLUG_MAX);
    expect(nextFreeSlug(base, new Set(), SLUG_MAX)).toBe(base);
    const second = nextFreeSlug(base, new Set([base]), SLUG_MAX);
    expect(second).toBe(`${'a'.repeat(SLUG_MAX - 2)}-2`);
    const third = nextFreeSlug(base, new Set([base, second]), SLUG_MAX);
    expect(third).toBe(`${'a'.repeat(SLUG_MAX - 2)}-3`);
    // Never a hyphen before the suffix's own.
    expect(nextFreeSlug('ab-cd', new Set(['ab-cd']), 5)).toBe('ab-2');
    // Too long to begin with: cut first.
    expect(nextFreeSlug('abcdefgh', new Set(), 5)).toBe('abcde');
    // Without a limit, as before.
    expect(nextFreeSlug('x', new Set(['x', 'x-2']))).toBe('x-3');
  });

  it('keeps written slugs up to 200 characters, titles to 80', () => {
    expect(slugify('a'.repeat(250), SLUG_MAX)).toHaveLength(200);
    expect(slugify('a'.repeat(250))).toHaveLength(80);
  });

  it('names a source by its kind and address', () => {
    expect(
      importSource({
        source: { kind: 'wordpress', url: 'https://www.Lino.example.com/', exportedAt: '' },
      }),
    ).toBe('wordpress:lino.example.com');
    expect(importSource({ source: { kind: 'cleito', name: 'Old site', exportedAt: '' } })).toBe(
      'cleito:Old site',
    );
  });
});

describe('long slugs in imports', () => {
  it('keeps two posts whose addresses differ only after the 80th character', async () => {
    const site = await seedSite(owner, 'slugs-twins', { locale: 'it' });
    const report = await run(
      site.id,
      document([
        { id: 41, slug: BASE },
        { id: 42, slug: `${BASE}-3` },
      ]),
    );
    expect(report.errors).toEqual([]);
    expect(report.created.entries).toBe(2);
    expect((await articles(site.id)).map((a) => a.slug)).toEqual([BASE, `${BASE}-3`]);
    // The addresses are the old ones: nothing to redirect.
    expect(await redirectsOf(site.id)).toEqual([]);

    // The same file again: both recognised by their WordPress post id.
    const again = await run(
      site.id,
      document([
        { id: 41, slug: BASE },
        { id: 42, slug: `${BASE}-3` },
      ]),
    );
    expect(again.created.entries ?? 0).toBe(0);
    expect(again.skipped.entries).toBe(2);
    expect(await articles(site.id)).toHaveLength(2);
    const refs = await withSiteContext(owner.db, site.id, (tx) =>
      tx.select({ ref: importRefs.ref, source: importRefs.source }).from(importRefs),
    );
    expect(refs.map((r) => r.ref).sort()).toEqual(['post:41', 'post:42']);
    expect(refs[0]!.source).toBe('wordpress:lino.example.com');
  });

  it('gives a slug cut at the limit a suffix within it, redirecting its old address', async () => {
    const site = await seedSite(owner, 'slugs-cut', { locale: 'it' });
    // 110 "ß" become 220 letters: both slugs are cut to the same 200.
    const long = 'ß'.repeat(110);
    const report = await run(
      site.id,
      document([
        { id: 1, slug: `${long}-uno`, title: 'Strasse' },
        { id: 2, slug: `${long}-due`, title: 'Strasse' },
      ]),
    );
    expect(report.errors).toEqual([]);
    expect(report.created.entries).toBe(2);
    const slugs = (await articles(site.id)).map((a) => a.slug);
    expect(slugs.sort()).toEqual([`${'s'.repeat(198)}-2`, 's'.repeat(200)].sort());
    expect(slugs.every((s) => s.length <= SLUG_MAX)).toBe(true);
    expect(report.warnings.join('\n')).toContain('used instead');
    const moved = await redirectsOf(site.id);
    expect(moved).toContainEqual({
      from: `/${long}-due`,
      to: `/${'s'.repeat(198)}-2`,
    });
  });

  it('never merges two posts on a site imported by an older core (slugs cut at 80)', async () => {
    const site = await seedSite(owner, 'slugs-legacy', { locale: 'it' });
    // What 0.81 left: one post, its address cut at 80, no ref recorded.
    const legacy = newId();
    const revision = newId();
    await withSiteContext(owner.db, site.id, async (tx) => {
      await tx.insert(entries).values({
        id: legacy,
        siteId: site.id,
        typeSlug: 'page',
        locale: 'it',
        slug: slugify(BASE),
        title: TITLE,
        status: 'published',
        publishedAt: new Date('2024-05-02T08:00:00Z'),
      });
      await tx.insert(revisions).values({
        id: revision,
        siteId: site.id,
        entryId: legacy,
        kind: 'import',
        title: TITLE,
        document: paragraph('Post 41'),
        schemaVersion: paragraph('x').schema,
      });
      await tx
        .update(entries)
        .set({ currentRevisionId: revision, publishedRevisionId: revision })
        .where(eq(entries.id, legacy));
    });
    expect(slugify(BASE)).toHaveLength(80);

    const report = await run(
      site.id,
      document([
        { id: 41, slug: BASE },
        { id: 42, slug: `${BASE}-3` },
      ]),
    );
    expect(report.errors).toEqual([]);
    // The first is the post already there; the second is no longer taken for it.
    expect(report.skipped.entries).toBe(1);
    expect(report.created.entries).toBe(1);
    const rows = await articles(site.id);
    expect(rows.map((r) => r.slug)).toEqual([slugify(BASE), `${BASE}-3`]);
    expect(rows[0]!.id).toBe(legacy);
    // The whole old address of the first leads to its address cut at 80.
    expect(await redirectsOf(site.id)).toContainEqual({
      from: `/${BASE}`,
      to: `/${slugify(BASE)}`,
    });

    // And again: both recognised, nothing added.
    const again = await run(
      site.id,
      document([
        { id: 41, slug: BASE },
        { id: 42, slug: `${BASE}-3` },
      ]),
    );
    expect(again.skipped.entries).toBe(2);
    expect(await articles(site.id)).toHaveLength(2);
  });

  it('takes the same title from another site as another post', async () => {
    const site = await seedSite(owner, 'slugs-sources', { locale: 'it' });
    await run(site.id, document([{ id: 7, slug: 'notizia', title: 'Notizia' }]));
    // Another site's posts with the same address and title: the post there
    // belongs to the first site's post 7, so they are new posts.
    const other = await run(
      site.id,
      document(
        [
          { id: 7, slug: 'notizia', title: 'Notizia' },
          { id: 8, slug: 'notizia', title: 'Notizia' },
        ],
        'https://other.example.com',
      ),
    );
    expect(other.errors).toEqual([]);
    expect(other.created.entries).toBe(2);
    expect((await articles(site.id)).map((a) => a.slug)).toEqual([
      'notizia',
      'notizia-2',
      'notizia-3',
    ]);
  });
});

describe('slugs written in the admin', () => {
  it('accepts up to 200 characters', async () => {
    const site = await seedSite(owner, 'slugs-api', { locale: 'it' });
    await seedUser(owner, {
      email: 'admin@slugs.test',
      password: PASSWORD,
      site,
      role: 'administrator',
    });
    const admin = new TestClient(app, site.host, '10.49.0.1');
    await admin.login('admin@slugs.test', PASSWORD);
    const slug = 'b'.repeat(200);
    const created = await admin.post('/api/v1/entries', {
      type: 'article',
      title: 'Long',
      slug,
      document: { schema: 1, blocks: [] },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect((created.json() as any).slug).toBe(slug);
    // The same again: a suffix within the limit.
    const second = await admin.post('/api/v1/entries', {
      type: 'article',
      title: 'Long',
      slug,
      document: { schema: 1, blocks: [] },
    });
    expect((second.json() as any).slug).toBe(`${'b'.repeat(198)}-2`);
    const tooLong = await admin.post('/api/v1/entries', {
      type: 'article',
      title: 'Long',
      slug: 'b'.repeat(201),
      document: { schema: 1, blocks: [] },
    });
    expect(tooLong.statusCode).toBe(400);
  });
});
