/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * Names of stored media (core 0.85): the original file name made safe, in
 * the folder of the upload's month, with `-1`, `-2`… when taken; imported
 * WordPress media keep their name and year/month folder, and their old
 * addresses redirect (301) to the new ones.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  importRefs,
  media,
  mediaVariants,
  newId,
  superAdmins,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config/config.js';
import { MediaService } from '../src/media/media.service.js';
import {
  mediaFolder,
  storageBaseName,
  uploadsFolderDate,
  WORDPRESS_NAME_MAX,
  wordpressStorageName,
} from '../src/media/storage-names.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
import { importDocument, mediaDate, sourcePaths } from '../src/transfer/importer.js';
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
let author: TestClient;
let importer: string;
let mediaRoot: string;

const png = (width: number, color: string) =>
  sharp({ create: { width, height: Math.round(width / 2), channels: 3, background: color } })
    .png()
    .toBuffer();
const jpeg = (width: number, color: string) =>
  sharp({ create: { width, height: Math.round(width / 2), channels: 3, background: color } })
    .jpeg()
    .toBuffer();

/** A different image at every call. */
let shade = 0;
const nextColor = () => `#${(0x102030 + ++shade * 7919).toString(16).slice(-6)}`;

const thisMonth = () => mediaFolder('', new Date()).slice(1);

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  mediaRoot = app.get<AppConfig>(APP_CONFIG).media.path;
  site = await seedSite(owner, 'media-names');
  await seedUser(owner, { email: 'author@names.test', password: PASSWORD, site, role: 'author' });
  author = new TestClient(app, site.host, '10.9.0.1');
  await author.login('author@names.test', PASSWORD);
  const [user] = await owner.db
    .insert(users)
    .values({ email: 'importer@names.test', displayName: 'Importer' })
    .returning();
  importer = user!.id;
  await owner.db.insert(superAdmins).values({ userId: importer });
});

afterAll(async () => {
  await app?.get(MediaService).idle();
  await app?.close();
  await owner?.close();
});

describe('safe names', () => {
  it('lowercases, transliterates and keeps only a-z 0-9 - _ .', () => {
    expect(storageBaseName("Città d'Arte.JPG")).toBe('citta-d-arte');
    expect(storageBaseName('Straße Øresund Łódź.png')).toBe('strasse-oresund-lodz');
    expect(storageBaseName('web_marketing_significato.gif')).toBe('web_marketing_significato');
    expect(storageBaseName('IMG 2024 (1).jpeg')).toBe('img-2024-1');
    expect(storageBaseName('photo.final.v2.png')).toBe('photo.final.v2');
  });

  it('never keeps a path, dots of a parent folder or an empty name', () => {
    expect(storageBaseName('../../etc/passwd')).toBe('passwd');
    expect(storageBaseName('..\\..\\windows\\evil name.png')).toBe('evil-name');
    expect(storageBaseName('....png')).toBe('file');
    expect(storageBaseName('日本語.png')).toBe('file');
    // Never a hidden file: the extension is the real type's (htaccess.png).
    expect(storageBaseName('.htaccess')).toBe('htaccess');
    expect(storageBaseName('a..b.png')).toBe('a.b');
    for (const name of ['../x', '..', '/', 'a/../../b.png', '%2e%2e%2f.png']) {
      expect(storageBaseName(name)).toMatch(/^[a-z0-9][a-z0-9_.-]*$/);
      expect(storageBaseName(name)).not.toContain('..');
    }
  });

  it('caps long names', () => {
    const name = storageBaseName(`${'a'.repeat(300)}.png`);
    expect(name).toHaveLength(100);
    expect(wordpressStorageName(`${'A'.repeat(300)}.png`, 'png').name).toHaveLength(
      WORDPRESS_NAME_MAX,
    );
  });

  it("keeps WordPress's names exactly, case and extension included, when safe", () => {
    expect(wordpressStorageName('Fotolia_63675623_M.jpg', 'jpg')).toEqual({
      name: 'Fotolia_63675623_M',
      ext: 'jpg',
    });
    // The real type is JPEG: `.JPG` and `.jpeg` name it, so they stay.
    expect(wordpressStorageName('PIATTO.JPG', 'jpg')).toEqual({ name: 'PIATTO', ext: 'JPG' });
    expect(wordpressStorageName('Foto-mia.jpeg', 'jpg')).toEqual({
      name: 'Foto-mia',
      ext: 'jpeg',
    });
    expect(wordpressStorageName('logo@2x.PNG', 'png')).toEqual({ name: 'logo@2x', ext: 'PNG' });
    expect(wordpressStorageName('photo.final.v2.png', 'png').name).toBe('photo.final.v2');
    // A name whose extension is not its real type's gets the real one.
    expect(wordpressStorageName('CUPCAKEBELLO.png', 'jpg')).toEqual({
      name: 'CUPCAKEBELLO',
      ext: 'jpg',
    });
  });

  it('replaces only the unsafe characters of a WordPress name, keeping the case', () => {
    expect(wordpressStorageName("Città d'Arte.JPG", 'jpg')).toEqual({
      name: 'Citta-d-Arte',
      ext: 'JPG',
    });
    expect(wordpressStorageName('Foto mia (1).png', 'png').name).toBe('Foto-mia-1');
    expect(wordpressStorageName('Straße Øresund.png', 'png').name).toBe('Strasse-Oresund');
    expect(wordpressStorageName('日本語.png', 'png').name).toBe('file');
    for (const name of [
      '../x.png',
      '..',
      '/',
      'a/../../B.png',
      '..\\..\\Evil.png',
      '.htaccess',
      '%2e%2e%2f.png',
      'a..b.png',
      'x\u0000y.png',
      ' .Hidden.png',
    ]) {
      const kept = wordpressStorageName(name, 'png').name;
      expect(kept).toMatch(/^[A-Za-z0-9@][A-Za-z0-9_.@-]*$/);
      expect(kept).not.toContain('..');
    }
  });

  it('reads the year and month of WordPress uploads', () => {
    expect(uploadsFolderDate('https://x.it/wp-content/uploads/2015/07/a.gif')?.toISOString()).toBe(
      '2015-07-01T00:00:00.000Z',
    );
    expect(uploadsFolderDate('https://x.it/wp-content/uploads/a.gif')).toBeUndefined();
    expect(uploadsFolderDate('https://x.it/wp-content/uploads/2015/13/a.gif')).toBeUndefined();
    const item = {
      ref: 'att:1',
      file: 'https://x.it/wp-content/uploads/2015/07/a.gif',
      filename: 'a.gif',
      urls: ['https://x.it/wp-content/uploads/2015/07/a%20b.gif?ver=2'],
    };
    expect(mediaDate(item)?.toISOString()).toBe('2015-07-01T00:00:00.000Z');
    expect(mediaDate({ ...item, date: '2019-03-04T10:00:00Z' })?.toISOString()).toBe(
      '2019-03-04T10:00:00.000Z',
    );
    expect(sourcePaths(item)).toEqual(['/wp-content/uploads/2015/07/a b.gif']);
  });
});

describe('uploads', () => {
  it('stores the file under its safe name, its variants beside it', async () => {
    const res = await author.upload(
      '/api/v1/media',
      "../../Città d'Arte.PNG",
      await png(1000, nextColor()),
      'image/png',
    );
    expect(res.statusCode, res.body).toBe(201);
    const url = res.json().url as string;
    expect(url).toBe(`/media/${site.id}/${thisMonth()}/citta-d-arte.png`);
    expect(res.json().filename).toBe("Città d'Arte.PNG");
    await app.get(MediaService).idle();
    const view = (await author.get(`/api/v1/media/${res.json().id}`)).json();
    const urls = view.variants.map((v: any) => v.url).sort();
    expect(urls).toContain(`/media/${site.id}/${thisMonth()}/citta-d-arte-thumb.webp`);
    expect(urls).toContain(`/media/${site.id}/${thisMonth()}/citta-d-arte-md.avif`);
    expect((await author.get(url)).statusCode).toBe(200);
  });

  it('adds -1, -2… to a name already taken, also by another extension', async () => {
    const urls: string[] = [];
    for (const [name, data] of [
      ['Logo.jpeg', await jpeg(400, nextColor())],
      ['logo.jpg', await jpeg(400, nextColor())],
      ['LOGO.png', await png(400, nextColor())],
    ] as const) {
      const res = await author.upload('/api/v1/media', name, data);
      expect(res.statusCode, res.body).toBe(201);
      urls.push(res.json().url);
    }
    const folder = `/media/${site.id}/${thisMonth()}`;
    expect(urls).toEqual([`${folder}/logo.jpg`, `${folder}/logo-1.jpg`, `${folder}/logo-2.png`]);
    await app.get(MediaService).idle();
  });

  it('gives files uploaded at the same time different names', async () => {
    const files = await Promise.all([1, 2, 3, 4, 5].map(() => png(320, nextColor())));
    const answers = await Promise.all(
      files.map((data) => author.upload('/api/v1/media', 'same.png', data)),
    );
    const urls = answers.map((r) => r.json().url as string);
    expect(new Set(urls).size).toBe(5);
    for (const url of urls) expect(url).toMatch(/\/same(-\d)?\.png$/);
    await app.get(MediaService).idle();
    // Each file is its own: none was written over.
    const sums = await Promise.all(
      urls.map(
        async (url) => (await readFile(join(mediaRoot, url.slice('/media/'.length)))).length,
      ),
    );
    expect(sums.every((n) => n > 0)).toBe(true);
    const variants = (
      await Promise.all(answers.map((r) => author.get(`/api/v1/media/${r.json().id}`)))
    ).flatMap((r) => r.json().variants.map((v: any) => v.url));
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('never touches existing files and records: hand-made names and old uuid keys stay', async () => {
    const folder = `${site.id}/${thisMonth()}`;
    // A file renamed by hand on disk, and a record pointing to a name.
    await mkdir(join(mediaRoot, folder), { recursive: true });
    await writeFile(join(mediaRoot, folder, 'on-disk.png'), 'hand-made');
    const legacyId = newId();
    const legacyKey = `${folder}/${legacyId}.png`;
    await writeFile(join(mediaRoot, legacyKey), 'legacy');
    await withSiteContext(owner.db, site.id, (tx) =>
      tx.insert(media).values([
        {
          id: legacyId,
          siteId: site.id,
          storageKey: legacyKey,
          filename: 'old.png',
          mime: 'image/png',
          sizeBytes: 6,
          checksum: 'legacy',
        },
        {
          siteId: site.id,
          storageKey: `${folder}/renamed.png`,
          filename: 'renamed.png',
          mime: 'image/png',
          sizeBytes: 1,
          checksum: 'renamed',
        },
      ]),
    );
    const onDisk = await author.upload('/api/v1/media', 'on-disk.png', await png(200, nextColor()));
    expect(onDisk.json().url).toBe(`/media/${folder}/on-disk-1.png`);
    expect(await readFile(join(mediaRoot, folder, 'on-disk.png'), 'utf8')).toBe('hand-made');
    const renamed = await author.upload(
      '/api/v1/media',
      'renamed.png',
      await png(200, nextColor()),
    );
    expect(renamed.json().url).toBe(`/media/${folder}/renamed-1.png`);
    const [legacy] = await withSiteContext(owner.db, site.id, (tx) =>
      tx.select().from(media).where(eq(media.id, legacyId)),
    );
    expect(legacy!.storageKey).toBe(legacyKey);
    expect(await readFile(join(mediaRoot, legacyKey), 'utf8')).toBe('legacy');
    await app.get(MediaService).idle();
  });
});

describe('WordPress imports', () => {
  const OLD = 'https://old.example.com/wp-content/uploads';
  let imported: SeededSite;
  let visitor: TestClient;
  let files: Map<string, Buffer>;
  let report: Awaited<ReturnType<typeof importDocument>>;

  beforeAll(async () => {
    imported = await seedSite(owner, 'media-names-wp');
    visitor = new TestClient(app, imported.host, '10.9.0.9');
    files = new Map([
      [`${OLD}/2015/07/web_marketing_significato.png`, await png(1400, nextColor())],
      [`${OLD}/2015/07/Web_Marketing_Significato.jpg`, await jpeg(500, nextColor())],
      [`${OLD}/2018/11/Città.png`, await png(300, nextColor())],
      [`${OLD}/notes.pdf`, Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF')],
      [`${OLD}/2011/07/Fotolia_63675623_M.jpg`, await jpeg(300, nextColor())],
      [`${OLD}/2013/02/PIATTO.JPG`, await jpeg(300, nextColor())],
      // Another file whose name differs only by case: its own name on Linux.
      [`${OLD}/2013/02/piatto.jpeg`, await jpeg(300, nextColor())],
      // The same name with another extension is taken (as for uploads).
      [`${OLD}/2013/02/PIATTO.png`, await png(300, nextColor())],
      // A JPEG named .png: the real type's extension.
      [`${OLD}/2015/01/CUPCAKEBELLO.png`, await jpeg(300, nextColor())],
    ]);
    const doc = {
      format: 'cleitext-transfer',
      version: 1,
      source: {
        kind: 'wordpress',
        url: 'https://old.example.com',
        exportedAt: '2026-10-26T10:00:00Z',
      },
      media: [...files.keys()].map((url, i) => ({
        ref: `att:${i + 1}`,
        file: url,
        filename: url.split('/').pop()!,
        urls: [url.replace('Città', 'Citt%C3%A0')],
        ...(url.endsWith('.pdf') ? { date: '2012-02-10T08:00:00Z' } : {}),
      })),
    };
    report = await importDocument(doc, {
      db: owner.db,
      siteId: imported.id,
      asUserId: importer,
      media: app.get(MediaService),
      cache: app.get(PageCacheService),
      readFile: (file) => Promise.resolve(files.get(file)!),
    });
    await app.get(MediaService).idle();
  });

  const library = () =>
    withSiteContext(owner.db, imported.id, (tx) =>
      tx.select({ id: media.id, key: media.storageKey, filename: media.filename }).from(media),
    );

  it("keeps WordPress's names exactly, case included, and year/month folders", async () => {
    expect(report.errors).toEqual([]);
    const keys = (await library()).map((m) => m.key.slice(imported.id.length + 1)).sort();
    expect(keys).toEqual(
      [
        '2011/07/Fotolia_63675623_M.jpg',
        '2012/02/notes.pdf',
        '2013/02/PIATTO-1.png',
        '2013/02/PIATTO.JPG',
        '2013/02/piatto.jpeg',
        '2015/01/CUPCAKEBELLO.jpg',
        '2015/07/Web_Marketing_Significato.jpg',
        '2015/07/web_marketing_significato.png',
        '2018/11/Citta.png',
      ].sort(),
    );
  });

  it('serves the files under their exact names, the variants beside them', async () => {
    const folder = `/media/${imported.id}`;
    expect((await visitor.get(`${folder}/2013/02/PIATTO.JPG`)).statusCode).toBe(200);
    expect((await visitor.get(`${folder}/2013/02/piatto.JPG`)).statusCode).toBe(404);
    const variants = await withSiteContext(owner.db, imported.id, (tx) =>
      tx
        .select({ key: mediaVariants.storageKey })
        .from(mediaVariants)
        .innerJoin(media, eq(media.id, mediaVariants.mediaId))
        .where(eq(media.storageKey, `${imported.id}/2011/07/Fotolia_63675623_M.jpg`)),
    );
    expect(variants.map((v) => v.key)).toContain(
      `${imported.id}/2011/07/Fotolia_63675623_M-thumb.webp`,
    );
    expect((await visitor.get(`${folder}/2011/07/Fotolia_63675623_M-thumb.webp`)).statusCode).toBe(
      200,
    );
  });

  it('records each media by its ref and by its old addresses', async () => {
    const refs = await withSiteContext(owner.db, imported.id, (tx) =>
      tx.select({ ref: importRefs.ref, mediaId: importRefs.mediaId }).from(importRefs),
    );
    const names = refs.map((r) => r.ref).sort();
    expect(names).toContain('att:1');
    expect(names).toContain('path:/wp-content/uploads/2015/07/web_marketing_significato.png');
    expect(names).toContain('path:/wp-content/uploads/2018/11/Città.png');
    expect(refs.every((r) => r.mediaId)).toBe(true);
  });

  it('reports the addresses that changed, one by one those renamed', () => {
    const text = report.warnings.join('\n');
    expect(text).toContain(`Media addresses changed: ${files.size} file(s)`);
    expect(text).toContain(
      '3 media file(s) got another name (without accents, spaces or other unsafe characters',
    );
    expect(text).toContain('redirect (301)');
    expect(text).toContain(
      `Media address changed: /wp-content/uploads/2018/11/Città.png → /media/${imported.id}/2018/11/Citta.png`,
    );
    expect(text).toContain(
      `Media address changed: /wp-content/uploads/2013/02/PIATTO.png → /media/${imported.id}/2013/02/PIATTO-1.png`,
    );
    expect(text).toContain('/wp-content/uploads/2015/01/CUPCAKEBELLO.png →');
    for (const kept of ['Web_Marketing_Significato.jpg', 'PIATTO.JPG', 'Fotolia_63675623_M.jpg']) {
      expect(text).not.toMatch(
        new RegExp(`Media address changed: \\S+/${kept.replace('.', '\\.')} `),
      );
    }
  });

  it('redirects old addresses to the new ones (301), resized copies to a variant', async () => {
    const folder = `/media/${imported.id}`;
    const exact = await visitor.get('/wp-content/uploads/2015/07/web_marketing_significato.png');
    expect(exact.statusCode).toBe(301);
    expect(exact.headers.location).toBe(`${folder}/2015/07/web_marketing_significato.png`);
    const renamed = await visitor.get('/wp-content/uploads/2015/07/Web_Marketing_Significato.jpg');
    expect(renamed.headers.location).toBe(`${folder}/2015/07/Web_Marketing_Significato.jpg`);
    const accented = await visitor.get('/wp-content/uploads/2018/11/Citt%C3%A0.png');
    expect(accented.headers.location).toBe(`${folder}/2018/11/Citta.png`);
    // WordPress's 300x150 copy: the smallest variant at least that wide.
    const copy = await visitor.get(
      '/wp-content/uploads/2015/07/web_marketing_significato-300x150.png',
    );
    expect(copy.statusCode).toBe(301);
    expect(copy.headers.location).toBe(`${folder}/2015/07/web_marketing_significato-thumb.webp`);
    const wide = await visitor.get(
      '/wp-content/uploads/2015/07/web_marketing_significato-1024x512.png',
    );
    expect(wide.headers.location).toBe(`${folder}/2015/07/web_marketing_significato-lg.webp`);
    const scaled = await visitor.get(
      '/wp-content/uploads/2015/07/web_marketing_significato-scaled.png',
    );
    expect(scaled.headers.location).toBe(`${folder}/2015/07/web_marketing_significato.png`);
    expect((await visitor.get(exact.headers.location as string)).statusCode).toBe(200);
  });

  it('leaves other addresses and other sites alone', async () => {
    expect((await visitor.get('/wp-content/uploads/2015/07/missing.png')).statusCode).toBe(404);
    expect((await visitor.get('/wp-content/plugins/x/readme.txt')).statusCode).toBe(404);
    // The site that uploaded files itself has no old addresses.
    expect(
      (await author.get('/wp-content/uploads/2015/07/web_marketing_significato.png')).statusCode,
    ).toBe(404);
  });

  it('keeps the names of a second import of the same export', async () => {
    const before = (await library()).map((m) => m.key).sort();
    const again = await importDocument(
      {
        format: 'cleitext-transfer',
        version: 1,
        source: {
          kind: 'wordpress',
          url: 'https://old.example.com',
          exportedAt: '2026-10-26T11:00:00Z',
        },
        media: [...files.keys()].map((url, i) => ({
          ref: `att:${i + 1}`,
          file: url,
          filename: url.split('/').pop()!,
          urls: [url],
        })),
      },
      {
        db: owner.db,
        siteId: imported.id,
        asUserId: importer,
        media: app.get(MediaService),
        cache: app.get(PageCacheService),
        readFile: (file) => Promise.resolve(files.get(file)!),
      },
    );
    expect(again.skipped.media).toBe(files.size);
    expect((await library()).map((m) => m.key).sort()).toEqual(before);
  });
});

describe('imports from other platforms', () => {
  it('lowercase the names as uploads do', async () => {
    const other = await seedSite(owner, 'media-names-other');
    const data = await png(300, nextColor());
    const result = await importDocument(
      {
        format: 'cleitext-transfer',
        version: 1,
        source: {
          kind: 'cleito',
          url: 'https://other.example.com',
          exportedAt: '2026-10-26T10:00:00Z',
        },
        media: [{ ref: 'm:1', file: 'Mixed-Case.PNG', filename: 'Mixed-Case.PNG' }],
      },
      {
        db: owner.db,
        siteId: other.id,
        asUserId: importer,
        media: app.get(MediaService),
        cache: app.get(PageCacheService),
        readFile: () => Promise.resolve(data),
      },
    );
    expect(result.errors).toEqual([]);
    const rows = await withSiteContext(owner.db, other.id, (tx) =>
      tx.select({ key: media.storageKey }).from(media),
    );
    expect(rows.map((r) => r.key)).toEqual([`${other.id}/${thisMonth()}/mixed-case.png`]);
    await app.get(MediaService).idle();
  });
});
