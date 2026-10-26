/**
 * `cleitext media:rename-imported` and `media:purge-renamed` (core 0.86): a
 * site imported from WordPress before core 0.85 (media under uuid names)
 * gets WordPress's names and folders; its content follows, the old
 * WordPress addresses and, once purged, the old /media addresses redirect.
 */
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  purgeRenamedMedia,
  renameImportedMedia,
  wxrMedia,
  type RenameImportedResult,
} from '@cleitext/cli';
import {
  entries,
  importRefs,
  media,
  mediaRenames,
  mediaVariants,
  newId,
  revisions,
  settings,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config/config.js';
import { ownerDatabase, seedSite, startTestApp, TestClient, type SeededSite } from './helpers.js';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let mediaRoot: string;
let site: SeededSite;
let fixed: SeededSite;
let visitor: TestClient;
let workDir: string;
let wxrFile: string;

const SOURCE = 'wordpress:old.example.com';
const OLD = 'https://old.example.com/wp-content/uploads';
const ids = { a: newId(), b: newId(), c: newId(), d: newId() };
let keys: Record<string, string>;
let entryId: string;
let currentRevision: string;
let oldRevision: string;

const attachment = (id: number, url: string, attached: string, extra = '') => `
  <item>
    <title>file ${id}</title>
    <guid isPermaLink="false">${url}</guid>
    <wp:post_id>${id}</wp:post_id>
    <wp:post_date_gmt>2014-01-01 10:00:00</wp:post_date_gmt>
    <wp:post_type>attachment</wp:post_type>
    <wp:attachment_url>${url}</wp:attachment_url>
    <wp:postmeta><wp:meta_key>_wp_attached_file</wp:meta_key><wp:meta_value><![CDATA[${attached}]]></wp:meta_value></wp:postmeta>${extra}
  </item>`;

const WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Old</title>
  <link>https://old.example.com</link>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_blog_url>https://www.old.example.com/</wp:base_blog_url>
  ${attachment(11, `${OLD}/2015/07/Citt%C3%A0-d-arte.png`, "2015/07/Città d'arte.png")}
  ${attachment(12, `${OLD}/2019/03/logo.jpg`, '2019/03/logo.jpg')}
  ${attachment(13, `${OLD}/2016/01/hand.png`, '2016/01/hand.png')}
  ${attachment(14, `${OLD}/2016/02/missing.png`, '2016/02/missing.png')}
  <item>
    <title>A page</title>
    <wp:post_id>20</wp:post_id>
    <wp:post_type>page</wp:post_type>
  </item>
</channel>
</rss>`;

const library = (siteId: string) =>
  withSiteContext(owner.db, siteId, async (tx) => ({
    media: Object.fromEntries(
      (await tx.select({ id: media.id, key: media.storageKey }).from(media)).map((m) => [
        m.id,
        m.key,
      ]),
    ),
    variants: (await tx.select({ key: mediaVariants.storageKey }).from(mediaVariants))
      .map((v) => v.key)
      .sort(),
  }));

const revisionText = (id: string) =>
  withSiteContext(owner.db, site.id, async (tx) => {
    const [row] = await tx.select().from(revisions).where(eq(revisions.id, id));
    return JSON.stringify(row!.document);
  });

const setting = (namespace: string, key: string) =>
  withSiteContext(owner.db, site.id, async (tx) => {
    const [row] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(and(eq(settings.namespace, namespace), eq(settings.key, key)));
    return row?.value;
  });

const run = (extra: Partial<Parameters<typeof renameImportedMedia>[1]> = {}) =>
  renameImportedMedia(owner.db, { site: site.id, wxr: wxrFile, mediaPath: mediaRoot, ...extra });

async function put(key: string, data: string) {
  await mkdir(dirname(join(mediaRoot, key)), { recursive: true });
  await writeFile(join(mediaRoot, key), data);
}

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  mediaRoot = app.get<AppConfig>(APP_CONFIG).media.path;
  site = await seedSite(owner, 'rename-wp');
  fixed = await seedSite(owner, 'rename-fixed');
  visitor = new TestClient(app, site.host, '10.9.1.1');
  workDir = await mkdtemp(join(tmpdir(), 'cleitext-rename-'));
  wxrFile = join(workDir, 'old-site.xml');
  await writeFile(wxrFile, WXR);

  // Imported by an older core in September 2026: uuid names in that month.
  const folder = `${site.id}/2026/09`;
  const uuidA = newId();
  const uuidB = newId();
  keys = {
    a: `${folder}/${uuidA}.png`,
    aThumb: `${folder}/${uuidA}-thumb.webp`,
    aMd: `${folder}/${uuidA}-md.avif`,
    b: `${folder}/${uuidB}.jpg`,
    c: `${folder}/hand.png`,
    // Uploaded later on the site, with the name A will want.
    d: `${site.id}/2015/07/citta-d-arte.png`,
  };
  for (const [name, key] of Object.entries(keys)) await put(key, `file ${name}`);
  const row = (id: string, key: string, filename: string) => ({
    id,
    siteId: site.id,
    storageKey: key,
    filename,
    mime: key.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    sizeBytes: 6,
    checksum: id,
  });
  await withSiteContext(owner.db, site.id, async (tx) => {
    await tx
      .insert(media)
      .values([
        row(ids.a, keys.a!, 'Città-d-arte.png'),
        row(ids.b, keys.b!, 'logo.jpg'),
        row(ids.c, keys.c!, 'hand.png'),
        row(ids.d, keys.d!, 'citta-d-arte.png'),
      ]);
    const variant = (v: string, format: string, key: string) => ({
      siteId: site.id,
      mediaId: ids.a,
      variant: v,
      format,
      storageKey: key,
      width: 300,
      height: 150,
      sizeBytes: 6,
    });
    await tx
      .insert(mediaVariants)
      .values([variant('thumb', 'webp', keys.aThumb!), variant('md', 'avif', keys.aMd!)]);
    // B came from an import without refs (older still): found by its name.
    await tx.insert(importRefs).values([
      { siteId: site.id, source: SOURCE, ref: 'att:11', mediaId: ids.a },
      { siteId: site.id, source: SOURCE, ref: 'att:13', mediaId: ids.c },
    ]);
    const [entry] = await tx
      .insert(entries)
      .values({
        siteId: site.id,
        typeSlug: 'page',
        locale: 'en',
        slug: 'gallery',
        title: 'Gallery',
      })
      .returning();
    entryId = entry!.id;
    const doc = (html: string) => ({
      type: 'doc',
      version: 1,
      blocks: [{ type: 'core/html', attrs: { html } }],
    });
    const [older] = await tx
      .insert(revisions)
      .values({
        siteId: site.id,
        entryId,
        title: 'Gallery',
        document: doc(`<img src="/media/${keys.a}">`),
        schemaVersion: 1,
      })
      .returning();
    oldRevision = older!.id;
    const [current] = await tx
      .insert(revisions)
      .values({
        siteId: site.id,
        entryId,
        title: 'Gallery',
        document: doc(
          `<img src="/media/${keys.a}" srcset="https://${site.host}/media/${keys.aThumb} 300w"><a href="/media/${keys.b}">logo</a><img src="/media/${keys.d}">`,
        ),
        schemaVersion: 1,
      })
      .returning();
    currentRevision = current!.id;
    await tx
      .update(entries)
      .set({
        currentRevisionId: currentRevision,
        publishedRevisionId: currentRevision,
        status: 'published',
        publishedAt: new Date(),
      })
      .where(eq(entries.id, entryId));
    await tx.insert(settings).values([
      {
        siteId: site.id,
        namespace: 'additional-css',
        key: 'site',
        value: `body { background: url(/media/${keys.a}); }`,
      },
      {
        siteId: site.id,
        namespace: 'plugin:gallery-extras',
        key: 'options',
        value: { logo: `https://${site.host}/media/${keys.b}`, other: '/media/elsewhere.png' },
      },
    ]);
  });

  // A site whose media were named by hand already.
  await put(`${fixed.id}/2015/07/photo.png`, 'fixed');
  await withSiteContext(owner.db, fixed.id, (tx) =>
    tx.insert(media).values({
      siteId: fixed.id,
      storageKey: `${fixed.id}/2015/07/photo.png`,
      filename: 'photo.png',
      mime: 'image/png',
      sizeBytes: 5,
      checksum: 'fixed',
    }),
  );
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('reading the export', () => {
  it('finds the attachments, their source, names and folders', () => {
    const wxr = wxrMedia(WXR);
    expect(wxr.source).toBe(SOURCE);
    expect(wxr.attachments.map((a) => a.id)).toEqual([11, 12, 13, 14]);
    expect(wxr.attachments[0]).toMatchObject({
      filename: 'Città-d-arte.png',
      urls: [`${OLD}/2015/07/Citt%C3%A0-d-arte.png`],
    });
    expect(wxr.attachments[0]!.date?.toISOString()).toBe('2015-07-01T00:00:00.000Z');
    expect(() => wxrMedia('<html></html>')).toThrow(/not a WordPress export/);
  });
});

describe('media:rename-imported', () => {
  let dry: RenameImportedResult;
  let done: RenameImportedResult;

  it('refuses to run as root', async () => {
    const getuid = vi.spyOn(process, 'getuid').mockReturnValue(0);
    try {
      await expect(run()).rejects.toMatchObject({ code: 'run_as_root' });
      await expect(
        purgeRenamedMedia(owner.db, { site: site.id, mediaPath: mediaRoot }),
      ).rejects.toMatchObject({ code: 'run_as_root' });
    } finally {
      getuid.mockRestore();
    }
  });

  it('changes nothing in a dry run, and says what it would do', async () => {
    const before = await library(site.id);
    const filesBefore = await readdir(workDir);
    dry = await run({ dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.report).toBeNull();
    expect(dry.renamed.map((r) => r.to).sort()).toEqual([
      `/media/${site.id}/2015/07/citta-d-arte-1.png`,
      `/media/${site.id}/2019/03/logo.jpg`,
    ]);
    expect(dry.references.revisions).toEqual({ rows: 1, addresses: 3 });
    expect(await library(site.id)).toEqual(before);
    expect(await readdir(workDir)).toEqual(filesBefore);
    expect(existsSync(join(mediaRoot, site.id, '2019/03/logo.jpg'))).toBe(false);
    expect(await revisionText(currentRevision)).toContain(keys.a);
    expect(
      await withSiteContext(owner.db, site.id, (tx) => tx.select().from(mediaRenames)),
    ).toEqual([]);
  });

  it("gives the media WordPress's names and folders, and copies their files", async () => {
    done = await run();
    expect(done.renamed).toEqual(dry.renamed);
    const after = await library(site.id);
    const a = `${site.id}/2015/07/citta-d-arte-1.png`;
    expect(after.media[ids.a]).toBe(a);
    expect(after.media[ids.b]).toBe(`${site.id}/2019/03/logo.jpg`);
    // The file named so by hand and the site's own upload stay as they are.
    expect(after.media[ids.c]).toBe(keys.c);
    expect(after.media[ids.d]).toBe(keys.d);
    expect(after.variants).toEqual([
      `${site.id}/2015/07/citta-d-arte-1-md.avif`,
      `${site.id}/2015/07/citta-d-arte-1-thumb.webp`,
    ]);
    expect(await readFile(join(mediaRoot, a), 'utf8')).toBe('file a');
    expect(
      await readFile(join(mediaRoot, `${site.id}/2015/07/citta-d-arte-1-thumb.webp`), 'utf8'),
    ).toBe('file aThumb');
    // Copied, not moved: the old files stay for the grace period.
    expect(existsSync(join(mediaRoot, keys.a!))).toBe(true);
    expect(done.counts).toMatchObject({ media: 2, variants: 2 });
    expect(done.renamed.find((r) => r.mediaId === ids.b)?.matchedBy).toBe('filename');
    expect(done.skipped).toEqual([
      expect.objectContaining({
        mediaId: ids.c,
        reason: expect.stringContaining('not a generated name'),
      }),
    ]);
    expect(done.unmatched).toEqual([expect.objectContaining({ wpId: 14 })]);
  });

  it('rewrites the addresses in content, CSS and plugin settings', async () => {
    const text = await revisionText(currentRevision);
    expect(text).not.toContain(keys.a);
    expect(text).not.toContain(keys.b);
    expect(text).toContain(`src=\\"/media/${site.id}/2015/07/citta-d-arte-1.png\\"`);
    expect(text).toContain(
      `https://${site.host}/media/${site.id}/2015/07/citta-d-arte-1-thumb.webp 300w`,
    );
    expect(text).toContain(`/media/${keys.d}`);
    // Older revisions are history: their addresses redirect.
    expect(await revisionText(oldRevision)).toContain(keys.a);
    expect(await setting('additional-css', 'site')).toBe(
      `body { background: url(/media/${site.id}/2015/07/citta-d-arte-1.png); }`,
    );
    expect(await setting('plugin:gallery-extras', 'options')).toEqual({
      logo: `https://${site.host}/media/${site.id}/2019/03/logo.jpg`,
      other: '/media/elsewhere.png',
    });
    expect(done.references).toMatchObject({
      revisions: { rows: 1, addresses: 3 },
      settings: { rows: 2, addresses: 2 },
    });
  });

  it('writes the report next to the export', async () => {
    expect(done.report).toMatch(/old-site\.media-rename-.*\.json$/);
    expect(dirname(done.report!)).toBe(workDir);
    const saved = JSON.parse(await readFile(done.report!, 'utf8')) as RenameImportedResult;
    expect(saved.renamed).toHaveLength(2);
    expect(saved.unmatched).toHaveLength(1);
  });

  it('redirects the old WordPress addresses to the new files', async () => {
    const exact = await visitor.get('/wp-content/uploads/2015/07/Citt%C3%A0-d-arte.png');
    expect(exact.statusCode).toBe(301);
    expect(exact.headers.location).toBe(`/media/${site.id}/2015/07/citta-d-arte-1.png`);
    const copy = await visitor.get('/wp-content/uploads/2019/03/logo-300x200.jpg');
    expect(copy.statusCode).toBe(301);
    expect(copy.headers.location).toBe(`/media/${site.id}/2019/03/logo.jpg`);
  });

  it('keeps serving the old files during the grace period, then redirects them', async () => {
    expect((await visitor.get(`/media/${keys.a}`)).statusCode).toBe(200);
    const day = 86_400_000;
    const early = await purgeRenamedMedia(owner.db, {
      site: 'rename-wp',
      mediaPath: mediaRoot,
      now: new Date(Date.now() + 29 * day),
    });
    expect(early.deleted).toEqual([]);
    expect(early.waiting).toBe(4);
    const later = new Date(Date.now() + 31 * day);
    const preview = await purgeRenamedMedia(owner.db, {
      site: 'rename-wp',
      mediaPath: mediaRoot,
      dryRun: true,
      now: later,
    });
    expect(preview.deleted.map((d) => d.key).sort()).toEqual(
      [keys.a, keys.aMd, keys.aThumb, keys.b].sort(),
    );
    expect(existsSync(join(mediaRoot, keys.a!))).toBe(true);
    const purged = await purgeRenamedMedia(owner.db, {
      site: 'rename-wp',
      mediaPath: mediaRoot,
      now: later,
    });
    expect(purged.deleted).toHaveLength(4);
    expect(existsSync(join(mediaRoot, keys.a!))).toBe(false);
    expect(existsSync(join(mediaRoot, `${site.id}/2015/07/citta-d-arte-1.png`))).toBe(true);

    const old = await visitor.get(`/media/${keys.a}`);
    expect(old.statusCode).toBe(301);
    expect(old.headers.location).toBe(`/media/${site.id}/2015/07/citta-d-arte-1.png`);
    const thumb = await visitor.get(`/media/${keys.aThumb}`);
    expect(thumb.headers.location).toBe(`/media/${site.id}/2015/07/citta-d-arte-1-thumb.webp`);
    expect((await visitor.get(old.headers.location as string)).statusCode).toBe(200);
    // Other missing files are still a 404, and another site never sees the redirect.
    expect((await visitor.get(`/media/${site.id}/2026/09/${newId()}.png`)).statusCode).toBe(404);
    const other = new TestClient(app, fixed.host, '10.9.1.2');
    expect((await other.get(`/media/${keys.a}`)).statusCode).toBe(404);
  });

  it('does nothing when run again', async () => {
    const before = await library(site.id);
    const again = await run();
    expect(again.alreadyFixed).toBe(true);
    expect(again.renamed).toEqual([]);
    expect(await library(site.id)).toEqual(before);
  });

  it('leaves a site whose media were named by hand alone', async () => {
    const before = await library(fixed.id);
    const result = await renameImportedMedia(owner.db, {
      site: 'rename-fixed',
      wxr: wxrFile,
      mediaPath: mediaRoot,
    });
    expect(result.alreadyFixed).toBe(true);
    expect(result.report).toBeNull();
    expect(await library(fixed.id)).toEqual(before);
  });
});
