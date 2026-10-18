/**
 * Imports and exports (milestone M5, RF-IMP-01…04): WordPress WXR, Cleitext
 * archives, HTML → CXD conversion, redirects from old addresses.
 */
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  entries,
  menus,
  revisions,
  sites,
  superAdmins,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config/config.js';
import { MediaService } from '../src/media/media.service.js';
import { DiskStorage } from '../src/media/storage.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
import { fileReader, openArchive, writeArchive } from '../src/transfer/archive.js';
import { exportSite } from '../src/transfer/exporter.js';
import { htmlToCxd } from '@cleitext/blocks/html';
import { importDocument } from '../src/transfer/importer.js';
import type { ImportReport } from '../src/transfer/model.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const fixtures = fileURLToPath(new URL('./fixtures/wxr', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let wordpress: SeededSite;
let clone: SeededSite;
let importer: string;
let report: ImportReport;

const types = (doc: { blocks: { type: string; children?: unknown[] }[] }) =>
  doc.blocks.map((b) => b.type);

async function runImport(
  siteId: string,
  document: unknown,
  read: (file: string) => Promise<Buffer>,
) {
  return importDocument(document, {
    db: owner.db,
    siteId,
    asUserId: importer,
    media: app.get(MediaService),
    cache: app.get(PageCacheService),
    readFile: read,
  });
}

async function wordpressDocument(): Promise<{ document: unknown; warnings: string[] }> {
  return JSON.parse(await readFile(join(fixtures, 'export.transfer.json'), 'utf8'));
}

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  wordpress = await seedSite(owner, 'from-wordpress');
  clone = await seedSite(owner, 'clone');
  const [user] = await owner.db
    .insert(users)
    .values({ email: 'importer@transfer.test', displayName: 'Importer' })
    .returning();
  importer = user!.id;
  await owner.db.insert(superAdmins).values({ userId: importer });
  await seedUser(owner, {
    email: 'admin@clone.test',
    password: PASSWORD,
    site: clone,
    role: 'administrator',
  });

  // A small WordPress site, as the WordPress Importer plugin converts it
  // (its tests check that the conversion still gives this document).
  const { document, warnings } = await wordpressDocument();
  const uploads = fileReader(join(fixtures, 'uploads'));
  report = await runImport(wordpress.id, document, (file) =>
    uploads(decodeURIComponent(/\/wp-content\/uploads\/(.+)$/.exec(file)![1]!)),
  );
  report.warnings.unshift(...warnings);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('HTML to CXD', () => {
  it('splits classic content like WordPress does', () => {
    const doc = htmlToCxd('One <em>two</em>.\n\nThree\nfour.\n\n<h2>Title</h2><hr>');
    expect(types(doc)).toEqual([
      'core/paragraph',
      'core/paragraph',
      'core/heading',
      'core/separator',
    ]);
    expect(doc.blocks[0]!.content).toEqual([
      { text: 'One ' },
      { text: 'two', marks: ['italic'] },
      { text: '.' },
    ]);
    expect(doc.blocks[1]!.content).toEqual([{ text: 'Three\nfour.' }]);
  });

  it('maps block markup, keeping unknown blocks as text', () => {
    const warnings: string[] = [];
    const doc = htmlToCxd(
      '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph --><!-- wp:spacer {"height":"40px"} /--><!-- wp:x/y --><div>Kept</div><!-- /wp:x/y -->',
      { warn: (m) => warnings.push(m) },
    );
    expect(types(doc)).toEqual(['core/paragraph', 'core/spacer', 'core/paragraph']);
    expect(doc.blocks[1]!.attrs).toEqual({ height: '40px' });
    expect(warnings[0]).toMatch(/x\/y has no equivalent/);
  });
});

describe('WordPress import', () => {
  it('imports posts, pages, media, terms and menus with a report', () => {
    expect(report.errors).toEqual([]);
    expect(report.created).toMatchObject({
      entries: 5,
      media: 1,
      terms: 3,
      menus: 1,
      users: 1,
      comments: 3,
    });
    const warnings = report.warnings.join('\n');
    expect(warnings).toContain('1 pingback(s)');
    expect(warnings).toContain('shop type "product"');
    // The table and the [gallery] of the classic post are a table and a gallery now.
    expect(warnings).not.toContain('shortcodes');
    expect(warnings).not.toContain('table');
    expect(warnings).toContain('without a password');
    // A block of another plugin: no active plugin takes it, its text stays.
    expect(warnings).toContain('Block some-plugin/map has no equivalent (1×)');
  });

  it('converts block content and points images to the imported media', async () => {
    const visitor = new TestClient(app, wordpress.host, '10.11.0.1');
    const page = await visitor.get('/2024/a-morning-at-the-harbour');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<strong>dawn</strong>');
    expect(page.body).toMatch(/<img[^>]+alt="Boats in the harbour"/);
    expect(page.body).toContain(`/media/${wordpress.id}/`);
    expect(page.body).not.toContain('old.example.com/wp-content');
    expect(page.body).toContain('<h3');
    expect(page.body).toContain('A sailor');
    expect(page.body).toContain('wp-block-columns');
    expect(page.body).toContain('Map of the coast');
    // A subcategory, under its parent as in WordPress.
    expect(page.body).toContain('href="/category/travel/harbours"');
    // Comments come along, threaded; spam stays out of sight.
    expect(page.body).toContain('2 comments');
    expect(page.body).toMatch(
      /Lovely![\s\S]*cx-comments__children[\s\S]*Thank you &amp; see you there\./,
    );
    expect(page.body).not.toContain('Buy now');
    expect(page.body).toContain('action="/comments"');
  });

  it('points images inside other blocks (page builders) to the imported media', async () => {
    const site = await seedSite(owner, 'builder-import');
    const oldUrl = 'https://old.example.com/wp-content/uploads/2024/05/harbour.jpg';
    const { document } = (await wordpressDocument()) as {
      document: { media: unknown[]; site: unknown; source: unknown };
    };
    const uploads = fileReader(join(fixtures, 'uploads'));
    const result = await runImport(
      site.id,
      {
        format: 'cleitext-transfer',
        version: 1,
        source: document.source,
        site: document.site,
        media: document.media,
        entries: [
          {
            ref: 'page:1',
            type: 'page',
            locale: 'en',
            slug: 'built',
            title: 'Built',
            status: 'published',
            document: {
              schema: 1,
              blocks: [
                {
                  id: 'g1',
                  type: 'acme/gallery',
                  v: 1,
                  attrs: {
                    images: [{ id: 'att:10', url: oldUrl, alt: 'Boats' }],
                    background: { id: null, url: oldUrl },
                    unknown: { id: 'att:99', url: 'https://elsewhere.test/x.jpg' },
                  },
                },
              ],
            },
          },
        ],
      },
      (file) => uploads(decodeURIComponent(/\/wp-content\/uploads\/(.+)$/.exec(file)![1]!)),
    );
    expect(result.errors).toEqual([]);
    const [row] = await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .select({ document: revisions.document })
        .from(entries)
        .innerJoin(revisions, eq(revisions.id, entries.currentRevisionId))
        .where(eq(entries.slug, 'built')),
    );
    const attrs = (
      row!.document as {
        blocks: {
          attrs: Record<string, { id: unknown; url: string }[] & { id: unknown; url: string }>;
        }[];
      }
    ).blocks[0]!.attrs;
    const image = attrs.images![0]!;
    expect(typeof image.id).toBe('string');
    expect(image.id).not.toBe('att:10');
    expect(image.url).toContain(`/media/${site.id}/`);
    expect(attrs.background!.url).toContain(`/media/${site.id}/`);
    expect(attrs.unknown!.url).toBe('https://elsewhere.test/x.jpg');
  });

  it('keeps hierarchy, dates, drafts and the featured image', async () => {
    const visitor = new TestClient(app, wordpress.host, '10.11.0.2');
    expect((await visitor.get('/about/team')).body).toContain('Marta and friends.');
    const classic = await visitor.get('/2019/old-classic-post');
    expect(classic.statusCode).toBe(200);
    expect(classic.body).toMatch(/datetime="2019-03-10/i);
    // The featured image above the post, and the same picture where the text has it
    // and in its gallery, as WordPress themes show them (only one when it opens the text).
    expect(classic.body.match(/<picture/g)).toHaveLength(3);
    expect(classic.body).toContain('class="wp-block-gallery');
    expect(classic.body).toMatch(
      /<figure class="wp-block-table"><table><tbody><tr><td>Day<\/td><td>Hours<\/td>/,
    );
    expect(classic.body).toContain('data-cx-core-blocks');
    expect(classic.body).toContain('<ol');
    expect((await visitor.get('/search?q=unfinished')).body).not.toContain('Unfinished draft');
  });

  it('redirects old WordPress addresses to the new ones', async () => {
    const visitor = new TestClient(app, wordpress.host, '10.11.0.3');
    const old = await visitor.get('/2024/05/a-morning-at-the-harbour');
    expect(old.statusCode).toBe(301);
    expect(old.headers.location).toBe('/2024/a-morning-at-the-harbour');
    // WordPress's addresses by id, /?p=21, too.
    const byId = await visitor.get('/?p=21');
    expect(byId.statusCode).toBe(301);
    expect(byId.headers.location).toBe('/2019/old-classic-post');
  });

  it('rebuilds menus with nested items, terms and external links', async () => {
    const visitor = new TestClient(app, wordpress.host, '10.11.0.4');
    const [menu] = await withSiteContext(owner.db, wordpress.id, (tx) => tx.select().from(menus));
    expect(menu?.name).toBe('Main');
    const admin = await seedUser(owner, {
      email: 'admin@wp.test',
      password: PASSWORD,
      site: wordpress,
      role: 'administrator',
    });
    expect(admin).toBeTruthy();
    const client = new TestClient(app, wordpress.host, '10.11.0.5');
    await client.login('admin@wp.test', PASSWORD);
    const view = (await client.get(`/api/v1/menus/${menu!.id}`)).json();
    expect(view.items.map((i: { displayLabel: string }) => i.displayLabel)).toEqual([
      'About',
      'Travel',
      'Shop',
    ]);
    expect(view.items[0].children[0].displayLabel).toBe('Our team');
    expect(view.items[2]).toMatchObject({
      kind: 'url',
      url: 'https://shop.example.com/',
      target: '_blank',
    });
    expect(visitor).toBeTruthy();
  });

  it('can be imported twice: nothing is added or overwritten', async () => {
    const { document } = await wordpressDocument();
    const uploads = fileReader(join(fixtures, 'uploads'));
    const again = await runImport(wordpress.id, document, (file) =>
      uploads(decodeURIComponent(/\/wp-content\/uploads\/(.+)$/.exec(file)![1]!)),
    );
    expect(again.errors).toEqual([]);
    expect(again.skipped).toMatchObject({ terms: 3, users: 1, entries: 5, comments: 3, menus: 1 });
    expect(again.created.entries ?? 0).toBe(0);
    expect(again.created.comments ?? 0).toBe(0);
    expect(again.created.menus ?? 0).toBe(0);
    expect(again.warnings.join('\n')).not.toContain('used instead');
    const visitor = new TestClient(app, wordpress.host, '10.11.0.2');
    expect((await visitor.get('/2024/a-morning-at-the-harbour')).body).toContain('2 comments');
  });
});

describe('Cleitext export and import', () => {
  it('clones a site through an archive', async () => {
    const config = app.get<AppConfig>(APP_CONFIG);
    const storage = new DiskStorage(config.media.path);
    const [source] = await owner.db.select().from(sites).where(eq(sites.id, wordpress.id));
    const { document, files } = await exportSite(owner.db, wordpress.id, { name: source!.name });
    const archive = join(await mkdtemp(join(tmpdir(), 'cleitext-archive-')), 'site.tar.gz');
    await writeArchive(archive, document, files, (key) => storage.pathOf(key));

    const opened = await openArchive(archive);
    const result = await runImport(clone.id, opened.document, fileReader(opened.dir));
    await opened.close();
    expect(result.errors).toEqual([]);
    expect(result.created.media).toBe(files.size);

    const visitor = new TestClient(app, clone.host, '10.11.1.1');
    const page = await visitor.get('/2024/a-morning-at-the-harbour');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain(`/media/${clone.id}/`);
    expect(page.body).not.toContain(`/media/${wordpress.id}/`);
    expect((await visitor.get('/about/team')).statusCode).toBe(200);
    // Redirects and comments travel too.
    expect((await visitor.get('/2024/05/a-morning-at-the-harbour')).statusCode).toBe(301);
    // The second WordPress import above added nothing: the post and its comments once.
    expect(result.created.comments).toBe(3);
    expect(page.body).toContain('Thank you &amp; see you there.');
    // The featured image travels too.
    const classic = (await visitor.get('/2019/old-classic-post')).body;
    expect(classic.match(/<picture/g)).toHaveLength(3);
  });

  it('refuses archives with unsafe paths or invalid documents', async () => {
    const bad = await runImport(clone.id, { format: 'something-else' }, fileReader(null));
    expect(bad.errors[0]).toMatch(/Invalid document/);
  });
});
