/**
 * The addresses of the source in imports (plugin API 1.55): a WordPress
 * site's posts at /%postname%/ keep them on a new site, with no redirects;
 * a site that already has posts keeps its own unless the import replaces
 * them (the old addresses then redirect); category bases likewise.
 */
import {
  contentTypes,
  entries,
  redirects,
  superAdmins,
  taxonomies,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import { htmlToCxd } from '@cleitext/blocks/html';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MediaService } from '../src/media/media.service.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
import { importDocument } from '../src/transfer/importer.js';
import { ownerDatabase, seedSite, startTestApp, TestClient } from './helpers.js';

const SOURCE = 'https://lino.example.com';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let importer: string;

/** An export of posts at /{slug}/, in a category, with the given permalinks. */
function document(
  posts: { id: number; slug: string }[],
  permalinks: Record<string, unknown> | undefined,
) {
  return {
    format: 'cleitext-transfer',
    version: 1,
    source: { kind: 'wordpress', url: SOURCE, exportedAt: '2026-10-25T10:00:00Z' },
    terms: [
      { ref: 'category:mente', taxonomy: 'category', locale: 'en', slug: 'mente', name: 'Mente' },
    ],
    entries: posts.map((p) => ({
      ref: `post:${p.id}`,
      type: 'article',
      locale: 'en',
      slug: p.slug,
      title: `Post ${p.id}`,
      status: 'published',
      publishedAt: '2024-05-02T08:00:00Z',
      document: htmlToCxd(`<p>Post ${p.id}</p>`),
      terms: { category: ['category:mente'] },
      oldPaths: [`${SOURCE}/${p.slug}/`],
    })),
    ...(permalinks ? { permalinks } : {}),
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

async function structure(siteId: string) {
  return withSiteContext(owner.db, siteId, async (tx) => ({
    post: (await tx.select().from(contentTypes).where(eq(contentTypes.slug, 'article')))[0]!
      .permalink,
    category: (await tx.select().from(taxonomies).where(eq(taxonomies.slug, 'category')))[0]!.base,
    redirects: (
      await tx.select({ from: redirects.fromPath, to: redirects.toPath }).from(redirects)
    ).sort((a, b) => a.from.localeCompare(b.from)),
  }));
}

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const [user] = await owner.db
    .insert(users)
    .values({ email: 'importer@permalinks.test', displayName: 'Importer' })
    .returning();
  importer = user!.id;
  await owner.db.insert(superAdmins).values({ userId: importer });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('permalinks of the source', () => {
  it('gives a new site the addresses of the export, with nothing to redirect', async () => {
    const site = await seedSite(owner, 'permalinks-new');
    const report = await run(
      site.id,
      document([{ id: 7, slug: 'obama' }], {
        types: { article: '/{slug}' },
        taxonomyBases: { category: 'argomenti' },
      }),
    );
    expect(report.errors).toEqual([]);
    const now = await structure(site.id);
    expect(now.post).toBe('/{slug}');
    expect(now.category).toBe('argomenti');
    expect(now.redirects).toEqual([]);
    expect(report.warnings).toContain(
      'Posts keep the addresses of the export: their permalink is now /{slug} (it was /{year}/{slug}).',
    );
    const visitor = new TestClient(app, site.host, '10.9.7.1');
    expect((await visitor.get('/obama')).statusCode).toBe(200);
    expect((await visitor.get('/argomenti/mente')).statusCode).toBe(200);
  });

  it('keeps the addresses of a site that already has posts, and says so', async () => {
    const site = await seedSite(owner, 'permalinks-kept');
    await run(site.id, document([{ id: 1, slug: 'older' }], undefined));
    const report = await run(
      site.id,
      document([{ id: 2, slug: 'newer' }], {
        types: { article: '/{slug}' },
        taxonomyBases: { category: '' },
      }),
    );
    const now = await structure(site.id);
    expect(now.post).toBe('/{year}/{slug}');
    expect(now.category).toBeNull();
    expect(report.warnings.some((w) => w.startsWith('Posts had addresses like /{slug}'))).toBe(
      true,
    );
    expect(report.warnings.some((w) => w.startsWith('Categories had archives at /…'))).toBe(true);
    // The old addresses redirect to the site's.
    expect(now.redirects).toContainEqual({ from: '/newer', to: '/2024/newer' });
  });

  it('replaces the addresses of a site that has posts when asked, redirecting the old ones', async () => {
    const site = await seedSite(owner, 'permalinks-replaced');
    await run(site.id, document([{ id: 1, slug: 'older' }], undefined));
    const report = await run(
      site.id,
      document([{ id: 2, slug: 'newer' }], {
        types: { article: '/{slug}' },
        taxonomyBases: { category: '' },
        replace: true,
      }),
    );
    expect(report.errors).toEqual([]);
    const now = await structure(site.id);
    expect(now.post).toBe('/{slug}');
    expect(now.category).toBe('');
    // The first import's redirect follows the post; its old address redirects too.
    expect(now.redirects).toEqual(
      expect.arrayContaining([
        { from: '/2024/older', to: '/older' },
        { from: '/category/mente', to: '/mente' },
      ]),
    );
    expect(now.redirects.find((r) => r.from === '/newer')).toBeUndefined();
    const rows = await withSiteContext(owner.db, site.id, (tx) =>
      tx.select({ slug: entries.slug }).from(entries),
    );
    expect(rows.map((r) => r.slug).sort()).toEqual(['newer', 'older']);
  });

  it('reports addresses that cannot be used and keeps the site’s', async () => {
    const site = await seedSite(owner, 'permalinks-invalid');
    const report = await run(
      site.id,
      document([{ id: 3, slug: 'third' }], {
        types: { article: '/{year}/{day}/{slug}', page: '/admin/{path}', nothing: '/{slug}' },
        taxonomyBases: { category: 'feed', tag: 'tag' },
      }),
    );
    const now = await structure(site.id);
    expect(now.post).toBe('/{year}/{slug}');
    expect(now.category).toBeNull();
    expect(report.warnings.filter((w) => w.includes('cannot be used'))).toHaveLength(3);
  });
});
