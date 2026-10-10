/** Content defaults and scheduled publishing (migration 0004). */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  createDatabase,
  publishDueEntries,
  seedSiteDefaults,
  withSiteContext,
  type DatabaseClient,
} from '../src/index.js';
import * as s from '../src/schema/index.js';

let owner: DatabaseClient;
let app: DatabaseClient;
const siteIds: string[] = [];

beforeAll(async () => {
  owner = createDatabase(inject('ownerUrl'), { max: 2 });
  app = createDatabase(inject('appUrl'), { max: 2 });
  for (const slug of ['content-a', 'content-b']) {
    const [site] = await owner.db.insert(s.sites).values({ slug, name: slug }).returning();
    siteIds.push(site!.id);
    await seedSiteDefaults(owner.db, site!.id);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('site defaults', () => {
  it('creates pages, posts, categories and tags, idempotently', async () => {
    await seedSiteDefaults(owner.db, siteIds[0]!);
    await withSiteContext(app.db, siteIds[0]!, async (tx) => {
      const types = await tx.select().from(s.contentTypes);
      expect(types.map((t) => t.slug).sort()).toEqual(['article', 'page']);
      expect(types.find((t) => t.slug === 'page')?.hierarchical).toBe(true);
      const taxonomies = await tx.select().from(s.taxonomies);
      expect(taxonomies.map((t) => t.slug).sort()).toEqual(['category', 'tag']);
    });
  });

  it('cannot be called by the application role', async () => {
    await expect(
      app.db.execute(sql`select cleitext_seed_site_defaults(${siteIds[0]!}::uuid)`),
    ).rejects.toThrow();
  });
});

describe('scheduled publishing', () => {
  it('publishes due entries on every site and leaves future ones', async () => {
    const make = async (siteId: string, slug: string, scheduledAt: Date) =>
      withSiteContext(owner.db, siteId, async (tx) => {
        const [entry] = await tx
          .insert(s.entries)
          .values({
            siteId,
            typeSlug: 'article',
            locale: 'en',
            slug,
            title: slug,
            status: 'scheduled',
            scheduledAt,
          })
          .returning();
        const [revision] = await tx
          .insert(s.revisions)
          .values({
            siteId,
            entryId: entry!.id,
            title: slug,
            document: { schema: 1, blocks: [] },
            schemaVersion: 1,
          })
          .returning();
        await tx
          .update(s.entries)
          .set({ currentRevisionId: revision!.id })
          .where(eq(s.entries.id, entry!.id));
        return entry!.id;
      });

    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3_600_000);
    const dueA = await make(siteIds[0]!, 'due-a', past);
    const dueB = await make(siteIds[1]!, 'due-b', past);
    const later = await make(siteIds[0]!, 'later', future);

    // The application role can run it, without any site context.
    expect(await publishDueEntries(app.db)).toBe(2);

    const status = async (siteId: string, id: string) =>
      withSiteContext(owner.db, siteId, async (tx) => {
        const [row] = await tx
          .select()
          .from(s.entries)
          .where(and(eq(s.entries.id, id)));
        return row!;
      });
    const a = await status(siteIds[0]!, dueA);
    expect(a.status).toBe('published');
    expect(a.publishedRevisionId).toBe(a.currentRevisionId);
    expect(a.publishedAt?.getTime()).toBe(past.getTime());
    expect((await status(siteIds[1]!, dueB)).status).toBe('published');
    expect((await status(siteIds[0]!, later)).status).toBe('scheduled');
    expect(await publishDueEntries(app.db)).toBe(0);
  });
});
