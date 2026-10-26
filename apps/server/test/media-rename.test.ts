/**
 * `cleitext media:rename-imported` and `media:purge-renamed` (core 0.86): a
 * site imported from WordPress before core 0.85 (media under uuid names)
 * gets WordPress's names and folders; its content follows, the old
 * WordPress addresses and, once purged, the old /media addresses redirect.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  purgeRenamedMedia,
  renameImportedMedia,
  uploadsHasher,
  uploadsPath,
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
const ids = {
  a: newId(),
  b: newId(),
  c: newId(),
  d: newId(),
  e: newId(),
  f: newId(),
  g: newId(),
  h: newId(),
};
let uploadsDir: string;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
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
  ${attachment(11, `${OLD}/2015/07/Citt%C3%A0-d-arte.png`, '2015/07/Città-d-arte.png')}
  ${attachment(12, `${OLD}/2019/03/Logo_Big.JPG`, '2019/03/Logo_Big.JPG')}
  ${attachment(13, `${OLD}/2016/01/hand.png`, '2016/01/hand.png')}
  ${attachment(14, `${OLD}/2016/02/missing.png`, '2016/02/missing.png')}
  ${attachment(15, `${OLD}/2015/09/yoga.png`, '2015/09/yoga-1.png')}
  ${attachment(
    16,
    `${OLD}/2020/05/Big-Photo-scaled.jpg`,
    '2020/05/Big-Photo-scaled.jpg',
    '<wp:postmeta><wp:meta_key>_wp_attachment_metadata</wp:meta_key><wp:meta_value><![CDATA[a:2:{s:4:"file";s:28:"2020/05/Big-Photo-scaled.jpg";s:14:"original_image";s:13:"Big-Photo.jpg";}]]></wp:meta_value></wp:postmeta>',
  )}
  ${attachment(17, `${OLD}/2015/10/marketing.jpg`, '2015/10/marketing.jpg')}
  ${attachment(18, `${OLD}/2015/11/marketing.jpg`, '2015/11/marketing.jpg')}
  ${attachment(19, `${OLD}/2016/03/escape.png`, '2016/03/../../../../secret/escape.png')}
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
  const uuid = { a: newId(), b: newId(), e: newId(), f: newId(), g: newId(), h: newId() };
  keys = {
    a: `${folder}/${uuid.a}.png`,
    aThumb: `${folder}/${uuid.a}-thumb.webp`,
    aMd: `${folder}/${uuid.a}-md.avif`,
    b: `${folder}/${uuid.b}.jpg`,
    c: `${folder}/hand.png`,
    // Uploaded later on the site, with the name A will want.
    d: `${site.id}/2015/07/Citta-d-arte.png`,
    e: `${folder}/${uuid.e}.png`,
    f: `${folder}/${uuid.f}.jpg`,
    g: `${folder}/${uuid.g}.jpg`,
    h: `${folder}/${uuid.h}.jpg`,
  };
  for (const [name, key] of Object.entries(keys)) await put(key, `file ${name}`);
  // A copy of WordPress's uploads folder, and a file outside it.
  uploadsDir = join(workDir, 'uploads');
  await mkdir(join(uploadsDir, '2015/10'), { recursive: true });
  await mkdir(join(uploadsDir, '2015/11'), { recursive: true });
  await writeFile(join(uploadsDir, '2015/10/marketing.jpg'), 'file g');
  await writeFile(join(uploadsDir, '2015/11/marketing.jpg'), 'file h');
  await writeFile(join(workDir, 'outside.jpg'), 'file h');
  await symlink(join(workDir, 'outside.jpg'), join(uploadsDir, '2015/11/link.jpg'));
  const row = (id: string, key: string, filename: string, checksum = id) => ({
    id,
    siteId: site.id,
    storageKey: key,
    filename,
    mime: key.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    sizeBytes: 6,
    checksum,
  });
  await withSiteContext(owner.db, site.id, async (tx) => {
    await tx.insert(media).values([
      row(ids.a, keys.a!, 'Città-d-arte.png'),
      row(ids.b, keys.b!, 'Logo_Big.JPG'),
      row(ids.c, keys.c!, 'hand.png'),
      row(ids.d, keys.d!, 'Citta-d-arte.png'),
      row(ids.e, keys.e!, 'yoga.png'),
      row(ids.f, keys.f!, 'Big-Photo-scaled.jpg'),
      // Two files of the same name and size: only their content tells them apart.
      row(ids.g, keys.g!, 'marketing.jpg', sha256('file g')),
      row(ids.h, keys.h!, 'marketing.jpg', sha256('file h')),
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
      { siteId: site.id, source: SOURCE, ref: 'att:15', mediaId: ids.e },
      { siteId: site.id, source: SOURCE, ref: 'att:16', mediaId: ids.f },
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
    expect(wxr.attachments.map((a) => a.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(wxr.attachments[0]).toMatchObject({
      filename: 'Città-d-arte.png',
      urls: [`${OLD}/2015/07/Città-d-arte.png`, `${OLD}/2015/07/Citt%C3%A0-d-arte.png`],
      files: ['2015/07/Città-d-arte.png'],
    });
    expect(wxr.attachments[0]!.date?.toISOString()).toBe('2015-07-01T00:00:00.000Z');
    expect(() => wxrMedia('<html></html>')).toThrow(/not a WordPress export/);
  });

  it('takes the name and folder from _wp_attached_file before the address', () => {
    const yoga = wxrMedia(WXR).attachments.find((a) => a.id === 15)!;
    expect(yoga.filename).toBe('yoga-1.png');
    expect(yoga.names).toContain('yoga.png');
    expect(yoga.urls).toEqual([`${OLD}/2015/09/yoga-1.png`, `${OLD}/2015/09/yoga.png`]);
    expect(yoga.files).toEqual(['2015/09/yoga-1.png', '2015/09/yoga.png']);
  });

  it('keeps the name of a -scaled image and adds its original', () => {
    const scaled = wxrMedia(WXR).attachments.find((a) => a.id === 16)!;
    expect(scaled.filename).toBe('Big-Photo-scaled.jpg');
    expect(scaled.urls).toEqual([
      `${OLD}/2020/05/Big-Photo-scaled.jpg`,
      `${OLD}/2020/05/Big-Photo.jpg`,
    ]);
  });

  it('never takes a path that leaves the uploads folder', () => {
    const escape = wxrMedia(WXR).attachments.find((a) => a.id === 19)!;
    expect(escape.filename).toBe('escape.png');
    expect(escape.files).toEqual(['2016/03/escape.png']);
    for (const path of ['../x.jpg', '2015/10/../../x.jpg', '/etc/passwd', 'a//b.jpg', 'a\\b.jpg']) {
      expect(uploadsPath(path)).toBeUndefined();
    }
    expect(uploadsPath('https://x.it/wp-content/uploads/2015/10/..%2F..%2Fx.jpg', true)).toBe(
      undefined,
    );
    expect(uploadsPath('/var/www/wp-content/uploads/2010/01/old.jpg')).toBe('2010/01/old.jpg');
  });

  it('reads only files inside the uploads folder (--uploads)', async () => {
    const checksum = await uploadsHasher(uploadsDir);
    expect(await checksum('2015/10/marketing.jpg')).toBe(sha256('file g'));
    expect(await checksum('../outside.jpg')).toBeNull();
    expect(await checksum(join(workDir, 'outside.jpg'))).toBeNull();
    expect(await checksum('2015/11/../../../outside.jpg')).toBeNull();
    // A link that leads out of the folder is not followed.
    expect(await checksum('2015/11/link.jpg')).toBeNull();
    expect(await checksum('2015/10')).toBeNull();
    expect(await checksum('2015/10/none.jpg')).toBeNull();
    await expect(uploadsHasher(join(workDir, 'no-such-folder'))).rejects.toMatchObject({
      code: 'not_found',
    });
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

  it('cannot tell files of the same name apart without --uploads', async () => {
    const plain = await run({ dryRun: true });
    expect(plain.counts.byChecksum).toBe(0);
    expect(plain.unmatched.filter((u) => u.wpId === 17 || u.wpId === 18)).toEqual([
      expect.objectContaining({ reason: expect.stringContaining('2 media files have the name') }),
      expect.objectContaining({ reason: expect.stringContaining('2 media files have the name') }),
    ]);
  });

  it('changes nothing in a dry run, and says what it would do', async () => {
    const before = await library(site.id);
    const filesBefore = await readdir(workDir);
    dry = await run({ dryRun: true, uploads: uploadsDir });
    expect(dry.dryRun).toBe(true);
    expect(dry.report).toBeNull();
    expect(dry.renamed.map((r) => r.to).sort()).toEqual(
      [
        `/media/${site.id}/2015/07/Citta-d-arte-1.png`,
        `/media/${site.id}/2019/03/Logo_Big.JPG`,
        `/media/${site.id}/2015/09/yoga-1.png`,
        `/media/${site.id}/2020/05/Big-Photo-scaled.jpg`,
        `/media/${site.id}/2015/10/marketing.jpg`,
        `/media/${site.id}/2015/11/marketing.jpg`,
      ].sort(),
    );
    expect(dry.counts.byChecksum).toBe(2);
    expect(dry.references.revisions).toEqual({ rows: 1, addresses: 3 });
    expect(await library(site.id)).toEqual(before);
    expect(await readdir(workDir)).toEqual(filesBefore);
    expect(existsSync(join(mediaRoot, site.id, '2019/03/Logo_Big.JPG'))).toBe(false);
    expect(await revisionText(currentRevision)).toContain(keys.a);
    expect(
      await withSiteContext(owner.db, site.id, (tx) => tx.select().from(mediaRenames)),
    ).toEqual([]);
  });

  it("gives the media WordPress's names and folders, and copies their files", async () => {
    done = await run({ uploads: uploadsDir });
    expect(done.renamed).toEqual(dry.renamed);
    const after = await library(site.id);
    // Taken (case-sensitively) by the site's own upload: -1.
    const a = `${site.id}/2015/07/Citta-d-arte-1.png`;
    expect(after.media[ids.a]).toBe(a);
    // WordPress's name, case and extension included.
    expect(after.media[ids.b]).toBe(`${site.id}/2019/03/Logo_Big.JPG`);
    // The file named so by hand and the site's own upload stay as they are.
    expect(after.media[ids.c]).toBe(keys.c);
    expect(after.media[ids.d]).toBe(keys.d);
    // The name of _wp_attached_file, not of the address.
    expect(after.media[ids.e]).toBe(`${site.id}/2015/09/yoga-1.png`);
    expect(after.media[ids.f]).toBe(`${site.id}/2020/05/Big-Photo-scaled.jpg`);
    // Same name, told apart by the checksum of WordPress's files.
    expect(after.media[ids.g]).toBe(`${site.id}/2015/10/marketing.jpg`);
    expect(after.media[ids.h]).toBe(`${site.id}/2015/11/marketing.jpg`);
    expect(await readFile(join(mediaRoot, after.media[ids.g]!), 'utf8')).toBe('file g');
    expect(await readFile(join(mediaRoot, after.media[ids.h]!), 'utf8')).toBe('file h');
    expect(after.variants).toEqual([
      `${site.id}/2015/07/Citta-d-arte-1-md.avif`,
      `${site.id}/2015/07/Citta-d-arte-1-thumb.webp`,
    ]);
    expect(await readFile(join(mediaRoot, a), 'utf8')).toBe('file a');
    expect(
      await readFile(join(mediaRoot, `${site.id}/2015/07/Citta-d-arte-1-thumb.webp`), 'utf8'),
    ).toBe('file aThumb');
    // Copied, not moved: the old files stay for the grace period.
    expect(existsSync(join(mediaRoot, keys.a!))).toBe(true);
    expect(done.counts).toMatchObject({ media: 6, variants: 2, byChecksum: 2 });
    expect(done.renamed.find((r) => r.mediaId === ids.b)?.matchedBy).toBe('filename');
    expect(done.renamed.find((r) => r.mediaId === ids.g)?.matchedBy).toBe('checksum');
    expect(done.skipped).toEqual([
      expect.objectContaining({
        mediaId: ids.c,
        reason: expect.stringContaining('not a generated name'),
      }),
    ]);
    expect(done.unmatched.map((u) => u.wpId).sort()).toEqual([14, 19]);
    // The uploads folder is only read.
    expect((await readdir(join(uploadsDir, '2015/10'))).sort()).toEqual(['marketing.jpg']);
  });

  it('rewrites the addresses in content, CSS and plugin settings', async () => {
    const text = await revisionText(currentRevision);
    expect(text).not.toContain(keys.a);
    expect(text).not.toContain(keys.b);
    expect(text).toContain(`src=\\"/media/${site.id}/2015/07/Citta-d-arte-1.png\\"`);
    expect(text).toContain(
      `https://${site.host}/media/${site.id}/2015/07/Citta-d-arte-1-thumb.webp 300w`,
    );
    expect(text).toContain(`/media/${keys.d}`);
    // Older revisions are history: their addresses redirect.
    expect(await revisionText(oldRevision)).toContain(keys.a);
    expect(await setting('additional-css', 'site')).toBe(
      `body { background: url(/media/${site.id}/2015/07/Citta-d-arte-1.png); }`,
    );
    expect(await setting('plugin:gallery-extras', 'options')).toEqual({
      logo: `https://${site.host}/media/${site.id}/2019/03/Logo_Big.JPG`,
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
    expect(saved.renamed).toHaveLength(6);
    expect(saved.unmatched).toHaveLength(2);
    expect(saved.counts.byChecksum).toBe(2);
  });

  it('redirects the old WordPress addresses to the new files', async () => {
    const at = async (path: string) => {
      const res = await visitor.get(path);
      expect(res.statusCode, path).toBe(301);
      return res.headers.location;
    };
    expect(await at('/wp-content/uploads/2015/07/Citt%C3%A0-d-arte.png')).toBe(
      `/media/${site.id}/2015/07/Citta-d-arte-1.png`,
    );
    expect(await at('/wp-content/uploads/2019/03/Logo_Big-300x200.JPG')).toBe(
      `/media/${site.id}/2019/03/Logo_Big.JPG`,
    );
    // The attached file's path and the address's, when they differ.
    expect(await at('/wp-content/uploads/2015/09/yoga-1.png')).toBe(
      `/media/${site.id}/2015/09/yoga-1.png`,
    );
    expect(await at('/wp-content/uploads/2015/09/yoga.png')).toBe(
      `/media/${site.id}/2015/09/yoga-1.png`,
    );
    // A -scaled image keeps its name; its original redirects to it.
    expect(await at('/wp-content/uploads/2020/05/Big-Photo-scaled.jpg')).toBe(
      `/media/${site.id}/2020/05/Big-Photo-scaled.jpg`,
    );
    expect(await at('/wp-content/uploads/2020/05/Big-Photo.jpg')).toBe(
      `/media/${site.id}/2020/05/Big-Photo-scaled.jpg`,
    );
    expect(await at('/wp-content/uploads/2015/11/marketing.jpg')).toBe(
      `/media/${site.id}/2015/11/marketing.jpg`,
    );
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
    expect(early.waiting).toBe(8);
    const later = new Date(Date.now() + 31 * day);
    const preview = await purgeRenamedMedia(owner.db, {
      site: 'rename-wp',
      mediaPath: mediaRoot,
      dryRun: true,
      now: later,
    });
    expect(preview.deleted.map((d) => d.key).sort()).toEqual(
      [keys.a, keys.aMd, keys.aThumb, keys.b, keys.e, keys.f, keys.g, keys.h].sort(),
    );
    expect(existsSync(join(mediaRoot, keys.a!))).toBe(true);
    const purged = await purgeRenamedMedia(owner.db, {
      site: 'rename-wp',
      mediaPath: mediaRoot,
      now: later,
    });
    expect(purged.deleted).toHaveLength(8);
    expect(existsSync(join(mediaRoot, keys.a!))).toBe(false);
    expect(existsSync(join(mediaRoot, `${site.id}/2015/07/Citta-d-arte-1.png`))).toBe(true);

    const old = await visitor.get(`/media/${keys.a}`);
    expect(old.statusCode).toBe(301);
    expect(old.headers.location).toBe(`/media/${site.id}/2015/07/Citta-d-arte-1.png`);
    const thumb = await visitor.get(`/media/${keys.aThumb}`);
    expect(thumb.headers.location).toBe(`/media/${site.id}/2015/07/Citta-d-arte-1-thumb.webp`);
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
