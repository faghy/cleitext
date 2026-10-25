/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * Large WordPress imports as background jobs (core 0.82, WordPress Importer
 * 1.27.0): the upload is received before the plugin's time starts and
 * answered at once with a job id; the import runs in the background with
 * counts, its hooks bound by the longer limit of jobs; one import per site;
 * cancelling; a job left running by a restart is shown as failed; posts
 * whose long addresses differ only after the 80th character stay two posts,
 * and importing the same file again adds nothing.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { settings, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const slowFixture = fileURLToPath(new URL('./fixtures/slow-import-plugin', import.meta.url));
const EXT = '/api/v1/ext/wordpress-importer';
/** The interactive limit of plugin code in this test: far below what the import takes. */
const HOOK_LIMIT_MS = 300;

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;

/** Two posts with the same title whose addresses differ only after the 80th character. */
const LONG_SLUG =
  'corso-di-formazione-professionale-per-lo-sviluppo-delle-competenze-trasversali-e-delle-nuove-abilita';
const LONG_TITLE = 'Corso di formazione per lo sviluppo delle competenze e delle nuove abilità';

const cdata = (value: string) => `<![CDATA[${value}]]>`;

/**
 * A WordPress export of `posts` posts and `attachments` media files, each
 * post about `kb` kilobytes of text: what a real blog's export weighs.
 * Media point to the server's own network, which imports never download
 * from, so they fail fast and are reported.
 */
function syntheticWxr(posts: number, attachments: number, kb: number): string {
  const items: string[] = [];
  for (let i = 1; i <= attachments; i++) {
    items.push(`<item>
<title>${cdata(`photo-${i}`)}</title>
<link>https://lino.example.com/photo-${i}/</link>
<dc:creator>${cdata('lino')}</dc:creator>
<content:encoded>${cdata('')}</content:encoded>
<wp:post_id>${10_000 + i}</wp:post_id>
<wp:post_date_gmt>${cdata('2024-05-01 08:00:00')}</wp:post_date_gmt>
<wp:post_name>${cdata(`photo-${i}`)}</wp:post_name>
<wp:status>${cdata('inherit')}</wp:status>
<wp:post_parent>0</wp:post_parent>
<wp:post_type>${cdata('attachment')}</wp:post_type>
<wp:attachment_url>${cdata(`http://127.0.0.1:9/wp-content/uploads/2024/05/photo-${i}.jpg`)}</wp:attachment_url>
</item>`);
  }
  const paragraph = `<p>${'Il mare al mattino, le barche che rientrano e il porto che si sveglia. '.repeat(14)}</p>`;
  const body = Array.from({ length: Math.max(1, Math.round(kb)) }, () => paragraph).join('\n');
  const post = (id: number, title: string, slug: string, image: number) => `<item>
<title>${cdata(title)}</title>
<link>https://lino.example.com/${slug}/</link>
<dc:creator>${cdata('lino')}</dc:creator>
<content:encoded>${cdata(`<p><img src="http://127.0.0.1:9/wp-content/uploads/2024/05/photo-${image}.jpg" class="wp-image-${10_000 + image}"/></p>\n${body}`)}</content:encoded>
<excerpt:encoded>${cdata('')}</excerpt:encoded>
<wp:post_id>${id}</wp:post_id>
<wp:post_date_gmt>${cdata('2024-05-02 08:00:00')}</wp:post_date_gmt>
<wp:post_name>${cdata(slug)}</wp:post_name>
<wp:status>${cdata('publish')}</wp:status>
<wp:post_parent>0</wp:post_parent>
<wp:post_type>${cdata('post')}</wp:post_type>
<category domain="category" nicename="notizie">${cdata('Notizie')}</category>
<wp:postmeta><wp:meta_key>${cdata('_thumbnail_id')}</wp:meta_key><wp:meta_value>${cdata(String(10_000 + image))}</wp:meta_value></wp:postmeta>
</item>`;
  for (let i = 1; i <= posts - 2; i++) {
    items.push(post(i, `Notizia numero ${i}`, `notizia-numero-${i}`, (i % attachments) + 1));
  }
  items.push(post(posts - 1, LONG_TITLE, LONG_SLUG, 1));
  items.push(post(posts, LONG_TITLE, `${LONG_SLUG}-3`, 2));
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
	xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
	xmlns:content="http://purl.org/rss/1.0/modules/content/"
	xmlns:wfw="http://wellformedweb.org/CommentAPI/"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:wp="http://wordpress.org/export/1.2/"
>
<channel>
<title>Lino</title>
<link>https://lino.example.com</link>
<description>Notizie</description>
<language>it-IT</language>
<wp:wxr_version>1.2</wp:wxr_version>
<wp:base_site_url>https://lino.example.com</wp:base_site_url>
<wp:base_blog_url>https://lino.example.com</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata('lino')}</wp:author_login><wp:author_email>${cdata('lino@lino.example.com')}</wp:author_email><wp:author_display_name>${cdata('Lino')}</wp:author_display_name></wp:author>
<wp:category><wp:term_id>2</wp:term_id><wp:category_nicename>${cdata('notizie')}</wp:category_nicename><wp:category_parent>${cdata('')}</wp:category_parent><wp:cat_name>${cdata('Notizie')}</wp:cat_name></wp:category>
${items.join('\n')}
</channel>
</rss>`;
}

/**
 * Uploads a file as multipart/form-data in `chunks` pieces, `delayMs`
 * apart: a large export on a slow connection.
 */
async function slowUpload(url: string, filename: string, data: Buffer, chunks = 1, delayMs = 0) {
  const boundary = `----cleitext${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        'Content-Type: text/xml\r\n\r\n',
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const size = Math.ceil(body.length / chunks);
  async function* pieces() {
    for (let i = 0; i < body.length; i += size) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      yield body.subarray(i, i + size);
    }
  }
  // A request of the admin: its CSRF token and session (TestClient keeps them).
  if (!(admin as any).csrf) await (admin as any).fetchCsrf();
  const cookies = (admin as any).cookies as Map<string, string>;
  return app.inject({
    method: 'POST',
    url,
    remoteAddress: '10.48.0.1',
    headers: {
      host: site.host,
      origin: `http://${site.host}`,
      'x-csrf-token': (admin as any).csrf,
      'content-type': `multipart/form-data; boundary=${boundary}`,
      cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    },
    payload: chunks > 1 ? Readable.from(pieces()) : body,
  });
}

async function status(): Promise<any> {
  return (await admin.get(`${EXT}/status`)).json().job;
}

/** Waits for the job to end, collecting the counts it showed on the way. */
async function finished(seen: any[] = []): Promise<any> {
  for (let i = 0; i < 1200; i++) {
    const job = await status();
    if (job?.counts) seen.push(job.counts);
    if (job?.status !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The import did not finish.');
}

/**
 * No import running and none shown: the one before is waited for (or
 * cancelled and waited for) and cleared, so each test starts on its own.
 */
async function ready(): Promise<void> {
  let job = await status();
  if (job?.status === 'running') {
    await admin.post(`${EXT}/cancel`);
    job = await finished();
  }
  if (job) expect((await admin.request('DELETE', `${EXT}/status`)).statusCode).toBe(204);
  expect(await status()).toBeNull();
}

async function install(source: string, pluginsPath: string, name: string, build = true) {
  const copy = join(await mkdtemp(join(tmpdir(), `${name}-src-`)), name);
  if (!build) await buildPlugin(source);
  await cp(source, copy, { recursive: true, filter: (file) => !file.includes('node_modules') });
  if (build) await buildPlugin(copy);
  await installPlugin(owner.db, {
    source: copy,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

const xml = syntheticWxr(150, 300, 50);

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  // The importer bundles its own dependencies: built in place, then copied.
  await install(join(pluginsRoot, 'wordpress-importer'), pluginsPath, 'wordpress-importer', false);
  await install(slowFixture, pluginsPath, 'slow-import');
  app = await startTestApp({
    pluginsPath,
    env: { PLUGIN_HOOK_TIMEOUT_MS: String(HOOK_LIMIT_MS), PLUGIN_JOB_TIMEOUT_MS: '20000' },
  });
  site = await seedSite(owner, 'wp-import-jobs', { locale: 'it' });
  await seedUser(owner, {
    email: 'admin@wij.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.48.0.1');
  await admin.login('admin@wij.test', PASSWORD);
  for (const slug of ['wordpress-importer', 'slow-import']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('WordPress imports as background jobs', () => {
  it('generates an export as large as a real blog', () => {
    expect(xml.length).toBeGreaterThan(7 * 1024 * 1024);
  });

  it('answers a slow upload of a large export at once with a job, and imports it in the background', async () => {
    await ready();
    const started = Date.now();
    // About a second and a half to arrive: far beyond the plugin's own time limit.
    const res = await slowUpload(
      `${EXT}/imports?locale=it&comments=skip`,
      'lino.xml',
      Buffer.from(xml),
      15,
      100,
    );
    expect(res.statusCode, res.body).toBe(202);
    expect(Date.now() - started).toBeGreaterThan(HOOK_LIMIT_MS);
    const { job } = res.json();
    expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(job.status).toBe('running');

    // One import per site at a time: a second one is refused with a clear message.
    const again = await slowUpload(`${EXT}/imports?locale=it`, 'other.xml', Buffer.from(xml));
    expect(again.statusCode).toBe(409);
    expect(again.json().detail).toContain('An import is already running on this site (lino.xml');

    const seen: any[] = [];
    const done = await finished(seen);
    expect(done.error ?? done.status).toBe('done');
    expect(done.id).toBe(job.id);
    // The counts went through the file's contents, the media and the entries.
    expect(done.counts.parsed).toEqual({ entries: 150, media: 300, terms: 1 });
    expect(done.counts.media).toEqual({ done: 300, total: 300 });
    expect(done.counts.entries).toEqual({ done: 150, total: 150 });
    expect(seen.some((c) => c.phase === 'media' || c.phase === 'entries')).toBe(true);
    // The report: every post, media refused (the server's own network), and
    // the plugin hook slower than the interactive limit ran to its end.
    expect(done.report.created.entries).toBe(150);
    expect(done.report.errors.filter((e: string) => e.startsWith('Media')).length).toBe(300);
    expect(done.report.warnings).toContain('Slow hook ran on 450 items.');

    // The job is also found by its id.
    const byId = await admin.get(`${EXT}/imports/${job.id}`);
    expect(byId.statusCode).toBe(200);
    expect(byId.json().job.status).toBe('done');
    expect((await admin.get(`${EXT}/imports/${crypto.randomUUID()}`)).statusCode).toBe(404);
  }, 120_000);

  it('keeps two posts whose long addresses differ only after the 80th character', async () => {
    const posts = (
      await admin.get(
        `/api/v1/entries?type=article&limit=100&q=${encodeURIComponent('formazione')}`,
      )
    ).json().items as { slug: string; title: string }[];
    const twins = posts.filter((p) => p.title === LONG_TITLE).map((p) => p.slug);
    // WordPress's addresses, whole (up to its 200 characters): no redirect needed.
    expect(twins.sort()).toEqual([LONG_SLUG, `${LONG_SLUG}-3`]);
    expect(LONG_SLUG.length).toBeGreaterThan(80);
  });

  it('adds nothing when the same file is imported again', async () => {
    await ready();
    const res = await slowUpload(
      `${EXT}/imports?locale=it&comments=skip`,
      'lino.xml',
      Buffer.from(xml),
    );
    expect(res.statusCode).toBe(202);
    const done = await finished();
    expect(done.error ?? done.status).toBe('done');
    expect(done.report.created.entries ?? 0).toBe(0);
    expect(done.report.skipped.entries).toBe(150);
    const twins = (
      await admin.get(
        `/api/v1/entries?type=article&limit=100&q=${encodeURIComponent('formazione')}`,
      )
    ).json().items as { title: string }[];
    expect(twins.filter((p) => p.title === LONG_TITLE)).toHaveLength(2);
  }, 120_000);

  it('cancels a running import, keeping what was imported', async () => {
    await ready();
    expect((await admin.post(`${EXT}/cancel`)).statusCode).toBe(409);
    const res = await slowUpload(`${EXT}/imports?locale=it`, 'lino.xml', Buffer.from(xml));
    expect(res.statusCode).toBe(202);
    const cancel = await admin.post(`${EXT}/cancel`);
    expect(cancel.statusCode).toBe(202);
    const done = await finished();
    expect(done.status).toBe('cancelled');
    expect(done.error).toContain('cancelled');
  }, 120_000);

  it('shows a job left running by a restart as failed, never running forever', async () => {
    await ready();
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    await withSiteContext(owner.db, site.id, (tx) =>
      tx.insert(settings).values({
        siteId: site.id,
        namespace: 'plugin:wordpress-importer',
        key: 'storage:job',
        value: {
          id: crypto.randomUUID(),
          status: 'running',
          file: 'lost.xml',
          locale: 'it',
          user: 'Admin',
          startedAt: old,
          updatedAt: old,
          progress: [],
        },
      }),
    );
    const job = await status();
    expect(job.status).toBe('failed');
    expect(job.error).toContain('the server restarted');
    // And a new import can start.
    const stored = await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .select()
        .from(settings)
        .where(
          and(eq(settings.namespace, 'plugin:wordpress-importer'), eq(settings.key, 'storage:job')),
        ),
    );
    expect((stored[0]!.value as any).status).toBe('failed');
  });
});
