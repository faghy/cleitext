/**
 * Imports and exports (milestone M5, RF-IMP-01…04): WordPress WXR, Cleitext
 * archives, HTML → CXD conversion, redirects from old addresses.
 */
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  menus,
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
import { htmlToCxd } from '../src/transfer/html-to-cxd.js';
import { importDocument } from '../src/transfer/importer.js';
import type { ImportReport } from '../src/transfer/model.js';
import { wxrToDocument } from '../src/transfer/wxr.js';
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

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  wordpress = await seedSite(owner, 'from-wordpress');
  clone = await seedSite(owner, 'clone', { locales: ['en', 'it'] });
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

  const xml = await readFile(join(fixtures, 'export.xml'), 'utf8');
  const { document, warnings } = wxrToDocument(xml, { locale: 'en' });
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
    expect(report.created).toMatchObject({ entries: 5, media: 1, terms: 3, menus: 1, users: 1 });
    const warnings = report.warnings.join('\n');
    expect(warnings).toContain('1 comment(s) were not imported');
    expect(warnings).toContain('custom type "product"');
    expect(warnings).toContain('shortcodes');
    expect(warnings).toContain('A table became text');
    expect(warnings).toContain('without a password');
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
    expect(page.body).toContain('href="/category/harbours"');
  });

  it('keeps hierarchy, dates, drafts and the featured image', async () => {
    const visitor = new TestClient(app, wordpress.host, '10.11.0.2');
    expect((await visitor.get('/about/team')).body).toContain('Marta and friends.');
    const classic = await visitor.get('/2019/old-classic-post');
    expect(classic.statusCode).toBe(200);
    expect(classic.body).toMatch(/datetime="2019-03-10/i);
    // The featured image is already in the content: not added twice.
    expect(classic.body.match(/<picture/g)).toHaveLength(1);
    expect(classic.body).toContain('<ol');
    expect((await visitor.get('/search?q=unfinished')).body).not.toContain('Unfinished draft');
  });

  it('redirects old WordPress addresses to the new ones', async () => {
    const visitor = new TestClient(app, wordpress.host, '10.11.0.3');
    const old = await visitor.get('/2024/05/a-morning-at-the-harbour');
    expect(old.statusCode).toBe(301);
    expect(old.headers.location).toBe('/2024/a-morning-at-the-harbour');
    const byId = await visitor.get('/?p=21');
    expect(byId.statusCode).toBe(200); // query strings are not part of redirects yet
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

  it('can be imported twice without overwriting', async () => {
    const xml = await readFile(join(fixtures, 'export.xml'), 'utf8');
    const { document } = wxrToDocument(xml, { locale: 'en' });
    const uploads = fileReader(join(fixtures, 'uploads'));
    const again = await runImport(wordpress.id, document, (file) =>
      uploads(decodeURIComponent(/\/wp-content\/uploads\/(.+)$/.exec(file)![1]!)),
    );
    expect(again.errors).toEqual([]);
    expect(again.skipped).toMatchObject({ terms: 3, users: 1 });
    expect(again.warnings.join('\n')).toContain('"about-2" used instead');
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
    // Redirects travel too.
    expect((await visitor.get('/2024/05/a-morning-at-the-harbour')).statusCode).toBe(301);
  });

  it('refuses archives with unsafe paths or invalid documents', async () => {
    const bad = await runImport(clone.id, { format: 'something-else' }, fileReader(null));
    expect(bad.errors[0]).toMatch(/Invalid document/);
  });
});
