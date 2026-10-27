/**
 * `cleitext entry:raw-titles` (core 0.90): a site imported from WordPress
 * before core 0.88 (titles with WordPress's curly quotes and dashes, no
 * `fields.seo.rawTitle`) gets the titles as written in WordPress beside its
 * entries, and the SEO plugin puts them in <title> and og:title.
 */
import { cp, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backfillRawTitles,
  buildPlugin,
  installPlugin,
  typedTitle,
  wxrTitles,
  type RawTitlesResult,
} from '@cleitext/cli';
import { entries, importRefs, revisions, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const SOURCE = 'wordpress:old.example.com';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let visitor: TestClient;
let workDir: string;
let wxrFile: string;

const post = (id: number, type: string, slug: string, title: string, status = 'publish') => `
  <item>
    <title>${title}</title>
    <wp:post_id>${id}</wp:post_id>
    <wp:post_name><![CDATA[${slug}]]></wp:post_name>
    <wp:post_type><![CDATA[${type}]]></wp:post_type>
    <wp:status><![CDATA[${status}]]></wp:status>
  </item>`;

const WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Old</title>
  <link>https://old.example.com</link>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_blog_url>https://www.old.example.com/</wp:base_blog_url>
  ${post(101, 'page', 'lipnosi', "<![CDATA[L'ipnosi -- cos'è]]>")}
  ${post(102, 'post', 'dell-ansia', '<![CDATA[Dell&#039;ansia...]]>')}
  ${post(103, 'page', 'edited', '<![CDATA[Edited "page"]]>')}
  ${post(104, 'page', 'plain', 'Plain')}
  ${post(105, 'page', 'missing', "<![CDATA[Missing's]]>")}
  ${post(106, 'wp_navigation', 'navigation', "<![CDATA[Nav's]]>")}
  ${post(107, 'page', 'kept', '<![CDATA["Quoted"]]>')}
  ${post(108, 'page', 'trashed', "<![CDATA[Trash's]]>", 'trash')}
  ${post(109, 'attachment', 'photo', "<![CDATA[Photo's]]>")}
</channel>
</rss>`;

const ids: Record<string, string> = {};
const revs: Record<string, string> = {};

/** An entry as an import before core 0.88 left it: WordPress's typography, no rawTitle. */
async function oldEntry(
  key: string,
  type: string,
  slug: string,
  title: string,
  options: { ref?: number; fields?: Record<string, unknown>; draft?: boolean } = {},
) {
  await withSiteContext(owner.db, site.id, async (tx) => {
    const [entry] = await tx
      .insert(entries)
      .values({ siteId: site.id, typeSlug: type, locale: 'en', slug, title })
      .returning();
    const revision = async (kind: 'import' | 'manual' | 'autosave', revTitle = title) => {
      const [row] = await tx
        .insert(revisions)
        .values({
          siteId: site.id,
          entryId: entry!.id,
          kind,
          title: revTitle,
          fields: options.fields ?? {},
          document: { schema: 1, blocks: [] },
          schemaVersion: 1,
        })
        .returning();
      return row!.id;
    };
    // History: an older revision with another title.
    revs[`${key}.old`] = await revision('import', `${title} (first)`);
    const published = await revision('import');
    const current = options.draft ? await revision('manual') : published;
    if (options.draft) revs[`${key}.autosave`] = await revision('autosave');
    revs[`${key}.published`] = published;
    revs[`${key}.current`] = current;
    await tx
      .update(entries)
      .set({
        currentRevisionId: current,
        publishedRevisionId: published,
        status: 'published',
        publishedAt: new Date(),
      })
      .where(eq(entries.id, entry!.id));
    if (options.ref) {
      await tx.insert(importRefs).values({
        siteId: site.id,
        source: SOURCE,
        ref: `post:${options.ref}`,
        entryId: entry!.id,
      });
    }
    ids[key] = entry!.id;
  });
}

const fieldsOf = (revision: string) =>
  withSiteContext(owner.db, site.id, async (tx) => {
    const [row] = await tx
      .select({ fields: revisions.fields, title: revisions.title })
      .from(revisions)
      .where(eq(revisions.id, revision));
    return row!;
  });

const run = (extra: Partial<Parameters<typeof backfillRawTitles>[1]> = {}) =>
  backfillRawTitles(owner.db, { site: site.id, wxr: wxrFile, ...extra });

const actions = (r: RawTitlesResult) =>
  Object.fromEntries(r.entries.map((e) => [e.wpId, e.action]));

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'seo-src-')), 'seo');
  await cp(join(pluginsRoot, 'seo'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'raw-titles');
  await seedUser(owner, {
    email: 'admin@raw-titles.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  const admin = new TestClient(app, site.host, '10.9.2.1');
  await admin.login('admin@raw-titles.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/seo/activate')).statusCode).toBe(200);
  visitor = new TestClient(app, site.host, '10.9.2.2');
  workDir = await mkdtemp(join(tmpdir(), 'cleitext-raw-titles-'));
  wxrFile = join(workDir, 'old-site.xml');
  await writeFile(wxrFile, WXR);

  // A draft newer than the published revision, an autosave and SEO fields of its own.
  await oldEntry('ipnosi', 'page', 'lipnosi', 'L’ipnosi – cos’è', {
    ref: 101,
    draft: true,
    fields: { seo: { description: 'What hypnosis is.' } },
  });
  // From an import without refs: found by its slug and type.
  await oldEntry('ansia', 'article', 'dell-ansia', 'Dell’ansia…');
  // Retitled by an editor since the import.
  await oldEntry('edited', 'page', 'edited', 'A new title', { ref: 103 });
  await oldEntry('plain', 'page', 'plain', 'Plain', { ref: 104 });
  // Imported by core 0.88: has it already.
  await oldEntry('kept', 'page', 'kept', '“Quoted”', {
    ref: 107,
    fields: { seo: { rawTitle: '"Quoted"' } },
  });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('reading the export', () => {
  it('finds the entries, their types and titles as written', () => {
    const wxr = wxrTitles(WXR);
    expect(wxr.source).toBe(SOURCE);
    expect(wxr.items.map((i) => i.id)).toEqual([101, 102, 103, 104, 105, 106, 107]);
    expect(wxr.items[0]).toMatchObject({
      type: 'page',
      entryType: 'page',
      slug: 'lipnosi',
      rawTitle: "L'ipnosi -- cos'è",
    });
    expect(wxr.items[1]).toMatchObject({ entryType: 'article', rawTitle: "Dell'ansia..." });
    expect(typedTitle('L’ipnosi – cos’è')).toBe(typedTitle("L'ipnosi -- cos'è"));
    expect(() => wxrTitles('<html></html>')).toThrow(/not a WordPress export/);
  });
});

describe('entry:raw-titles', () => {
  it('refuses to run as root', async () => {
    const getuid = vi.spyOn(process, 'getuid').mockReturnValue(0);
    try {
      await expect(run()).rejects.toMatchObject({ code: 'run_as_root' });
    } finally {
      getuid.mockRestore();
    }
  });

  it('shows the imported title in search results before', async () => {
    const html = (await visitor.get('/lipnosi')).body;
    expect(html).toContain('<title>L’ipnosi – cos’è – Site raw-titles</title>');
  });

  it('changes nothing in a dry run, and says what it would do', async () => {
    const files = await readdir(workDir);
    const dry = await run({ dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(dry.report).toBeNull();
    expect(actions(dry)).toEqual({
      101: 'set',
      102: 'set',
      103: 'skipped:edited',
      104: 'same',
      105: 'not-found',
      107: 'already',
    });
    expect(dry.entries.find((e) => e.wpId === 101)).toMatchObject({
      matchedBy: 'ref',
      title: 'L’ipnosi – cos’è',
      rawTitle: "L'ipnosi -- cos'è",
      revisions: 3,
    });
    expect(dry.entries.find((e) => e.wpId === 102)!.matchedBy).toBe('slug');
    expect(dry.counts).toMatchObject({ set: 2, revisions: 4, 'not-found': 1 });
    for (const revision of Object.values(revs)) {
      expect(
        ((await fieldsOf(revision)).fields as { seo?: { rawTitle?: string } }).seo?.rawTitle,
      ).toSatisfy((v: unknown) => v === undefined || v === '"Quoted"');
    }
    expect(await readdir(workDir)).toEqual(files);
  });

  it('keeps the title as written on the current and published revisions and autosaves', async () => {
    const done = await run();
    expect(actions(done)).toMatchObject({ 101: 'set', 102: 'set', 103: 'skipped:edited' });
    expect(done.report).toMatch(/old-site\.raw-titles-.*\.json$/);
    expect(JSON.parse(await readFile(done.report!, 'utf8')).counts.set).toBe(2);
    for (const key of ['ipnosi.current', 'ipnosi.published', 'ipnosi.autosave']) {
      const row = await fieldsOf(revs[key]!);
      // Other fields kept, titles never changed.
      expect(row.fields).toEqual({
        seo: { description: 'What hypnosis is.', rawTitle: "L'ipnosi -- cos'è" },
      });
      expect(row.title).toBe('L’ipnosi – cos’è');
    }
    // History stays as it was.
    expect((await fieldsOf(revs['ipnosi.old']!)).fields).toEqual({
      seo: { description: 'What hypnosis is.' },
    });
    expect((await fieldsOf(revs['ansia.current']!)).fields).toEqual({
      seo: { rawTitle: "Dell'ansia..." },
    });
    for (const key of ['edited.current', 'plain.current']) {
      expect((await fieldsOf(revs[key]!)).fields).toEqual({});
    }
    const [entry] = await withSiteContext(owner.db, site.id, (tx) =>
      tx.select({ title: entries.title }).from(entries).where(eq(entries.id, ids.ipnosi!)),
    );
    expect(entry!.title).toBe('L’ipnosi – cos’è');
  });

  it('puts the title as written in <title> and og:title', async () => {
    const html = (await visitor.get('/lipnosi')).body;
    expect(html).toContain('<title>L&#x27;ipnosi -- cos&#x27;è – Site raw-titles</title>');
    expect(html).toContain('<meta property="og:title" content="L&#x27;ipnosi -- cos&#x27;è"/>');
    expect(html).toContain('L’ipnosi – cos’è</h1>');
  });

  it('does nothing the second time', async () => {
    const again = await run({ report: join(workDir, 'again.json') });
    expect(actions(again)).toMatchObject({ 101: 'already', 102: 'already', 107: 'already' });
    expect(again.counts).toMatchObject({ set: 0, revisions: 0 });
  });
});
