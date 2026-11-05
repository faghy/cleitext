/**
 * `cleitext media:import-addresses` (core 0.95.7): a site imported without
 * the old WordPress addresses gets their 301s from the export or from the
 * leftover wp-content folder, and learns which files still need the folder.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { importAddresses, isCovered } from '@cleitext/cli';
import { importRefs, media, newId, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, startTestApp, TestClient, type SeededSite } from './helpers.js';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let visitor: TestClient;
let work: string;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const ids = { photo: newId(), logo: newId(), clip: newId() };

const WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <link>https://old.example.org</link>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_blog_url>https://old.example.org/</wp:base_blog_url>
  <item>
    <wp:post_id>31</wp:post_id>
    <wp:post_type>attachment</wp:post_type>
    <wp:attachment_url>https://old.example.org/wp-content/uploads/2018/04/c%C3%A8-posta.jpg</wp:attachment_url>
    <wp:postmeta><wp:meta_key>_wp_attached_file</wp:meta_key><wp:meta_value><![CDATA[2018/04/cè-posta.jpg]]></wp:meta_value></wp:postmeta>
  </item>
</channel>
</rss>`;

async function put(file: string, data: string) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'import-addresses');
  visitor = new TestClient(app, site.host, '10.9.2.1');
  work = await mkdtemp(join(tmpdir(), 'cleitext-addresses-'));
  const row = (id: string, name: string, checksum: string) => ({
    id,
    siteId: site.id,
    storageKey: `${site.id}/2018/04/${name}`,
    filename: name,
    mime: name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
    sizeBytes: 10,
    checksum,
  });
  await withSiteContext(owner.db, site.id, (tx) =>
    tx
      .insert(media)
      .values([
        row(ids.photo, 'cè-posta.jpg', sha256('photo')),
        row(ids.logo, 'logo.jpg', sha256('logo')),
        row(ids.clip, 'clip.mp4', sha256('clip')),
      ]),
  );
  await writeFile(join(work, 'old.xml'), WXR);
  const wp = join(work, 'public', 'wp-content');
  await put(join(wp, 'uploads/2018/04/logo.jpg'), 'logo');
  await put(join(wp, 'uploads/2018/04/logo-300x200.jpg'), 'small logo');
  await put(join(wp, 'uploads/2018/04/logo.webp'), 'webp logo');
  await put(join(wp, 'uploads/2019/01/video-sfondo.mp4'), 'clip');
  await put(join(wp, 'uploads/2019/01/lost.pdf'), 'not in the library');
  await put(join(wp, 'themes/old/style.css'), 'body{}');
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('media:import-addresses', () => {
  it('tells which old addresses the server redirects', () => {
    const refs = new Set(['path:/wp-content/uploads/2018/04/logo.jpg']);
    expect(isCovered('/wp-content/uploads/2018/04/logo-300x200.jpg', refs)).toBe(true);
    expect(isCovered('/wp-content/uploads/2018/04/logo.webp', refs)).toBe(true);
    expect(isCovered('/wp-content/uploads/2018/04/other.jpg', refs)).toBe(false);
    expect(isCovered('/wp-content/themes/old/style.css', refs)).toBe(false);
  });

  it('changes nothing in a dry run', async () => {
    const r = await importAddresses(owner.db, {
      site: site.id,
      wxr: join(work, 'old.xml'),
      folder: join(work, 'public', 'wp-content'),
      dryRun: true,
    });
    expect(r.added).toBeGreaterThan(0);
    const rows = await withSiteContext(owner.db, site.id, (tx) => tx.select().from(importRefs));
    expect(rows).toEqual([]);
  });

  it('records the 301s from the export and the folder, and lists what still needs the folder', async () => {
    const r = await importAddresses(owner.db, {
      site: site.id,
      wxr: join(work, 'old.xml'),
      folder: join(work, 'public', 'wp-content'),
    });
    expect(r.attachments).toEqual({ found: 1, missing: 0 });
    expect(r.byChecksum).toBe(2);
    expect(r.folder!.uncovered.sort()).toEqual([
      '/wp-content/themes/old/style.css',
      '/wp-content/uploads/2019/01/lost.pdf',
    ]);

    const photo = await visitor.get('/wp-content/uploads/2018/04/c%C3%A8-posta.jpg');
    expect([photo.statusCode, photo.headers.location]).toEqual([
      301,
      `/media/${site.id}/2018/04/c%C3%A8-posta.jpg`,
    ]);
    const video = await visitor.get('/wp-content/uploads/2019/01/video-sfondo.mp4');
    expect([video.statusCode, video.headers.location]).toEqual([
      301,
      `/media/${site.id}/2018/04/clip.mp4`,
    ]);
    expect((await visitor.get('/wp-content/uploads/2018/04/logo-300x200.jpg')).statusCode).toBe(
      301,
    );

    const again = await importAddresses(owner.db, {
      site: site.id,
      folder: join(work, 'public', 'wp-content'),
    });
    expect(again.added).toBe(0);
  });
});
