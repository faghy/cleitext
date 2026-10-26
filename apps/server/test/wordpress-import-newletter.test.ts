/**
 * A WordPress export with The Newsletter Plugin's form written over several
 * lines (`[newsletter_form]` holding its `[newsletter_field]`s), imported by
 * the WordPress Importer with NewLetter active: in a Shortcode block and in
 * classic content, the form becomes NewLetter's signup block, and the report
 * says so.
 */
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CxdBlock } from '@cleitext/blocks';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
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

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;

interface Job {
  status: string;
  error?: string;
  report?: { warnings: string[]; errors: string[] };
}

async function finished(): Promise<Job> {
  for (let i = 0; i < 200; i++) {
    const { job } = (await admin.get('/api/v1/ext/wordpress-importer/status')).json() as {
      job: Job;
    };
    if (job.status !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The import did not finish.');
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  for (const slug of ['wordpress-importer', 'newletter']) {
    await buildPlugin(join(pluginsRoot, slug));
    const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
    await cp(join(pluginsRoot, slug), source, {
      recursive: true,
      filter: (file) => !file.includes('node_modules'),
    });
    await installPlugin(owner.db, {
      source,
      pluginsPath,
      appRole: new URL(inject('appUrl')).username,
    });
  }
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'wp-newletter');
  await seedUser(owner, {
    email: 'admin@wpnl.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.48.0.1');
  await admin.login('admin@wpnl.test', PASSWORD);
  for (const slug of ['wordpress-importer', 'newletter']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const item = (id: number, slug: string, content: string) => `
  <item>
    <title><![CDATA[${slug}]]></title>
    <link>https://news.example/${slug}/</link>
    <dc:creator><![CDATA[editor]]></dc:creator>
    <content:encoded><![CDATA[${content}]]></content:encoded>
    <wp:post_id>${id}</wp:post_id>
    <wp:post_date_gmt><![CDATA[2025-03-01 08:00:00]]></wp:post_date_gmt>
    <wp:post_name><![CDATA[${slug}]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_type><![CDATA[page]]></wp:post_type>
  </item>`;

describe('WordPress import with NewLetter', () => {
  it('turns a form over several lines into the signup block, in blocks and classic content', async () => {
    // The Newsletter Plugin's page, as its block editor saves it: a Shortcode block over three lines.
    const blocks = await readFile(
      join(pluginsRoot, 'newletter/test/fixtures/tnp-page.html'),
      'utf8',
    );
    const classic =
      'Our weekly letter.\n\n[newsletter_form button_label="Join"]\n' +
      '[newsletter_field name="first_name" label="Name"]\n\n' +
      '[newsletter_field name="email"\nlabel="Email"]\n[/newsletter_form]\n\nSee you soon.';
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>News</title>
  <link>https://news.example</link>
  <language>en-US</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>https://news.example</wp:base_site_url>
  <wp:author><wp:author_id>1</wp:author_id><wp:author_login><![CDATA[editor]]></wp:author_login><wp:author_email><![CDATA[editor@news.example]]></wp:author_email><wp:author_display_name><![CDATA[Editor]]></wp:author_display_name></wp:author>
  ${item(21, 'newsletter-blocks', blocks)}
  ${item(22, 'newsletter-classic', classic)}
</channel>
</rss>`;
    const started = await admin.upload(
      '/api/v1/ext/wordpress-importer/imports?locale=en',
      'export.xml',
      Buffer.from(xml),
      'text/xml',
    );
    expect(started.statusCode).toBe(202);
    const job = await finished();
    expect(job.error ?? job.status).toBe('done');
    const warnings = job.report!.warnings.join('\n');
    expect(warnings).toContain(
      'Shortcode [newsletter_form] became a block of an active plugin (2×).',
    );
    expect(warnings).toContain('Shortcode [newsletter] became a block of an active plugin (1×).');
    expect(warnings).not.toContain('left as text');

    const pages = (await admin.get('/api/v1/entries?type=page&limit=50')).json().items as {
      id: string;
      slug: string;
    }[];
    const document = async (slug: string) => {
      const page = pages.find((p) => p.slug === slug)!;
      const entry = (await admin.get(`/api/v1/entries/${page.id}`)).json() as {
        revision: { document: { blocks: CxdBlock[] } };
      };
      return entry.revision.document.blocks;
    };
    const fromBlocks = await document('newsletter-blocks');
    expect(fromBlocks.map((b) => b.type)).toEqual([
      'core/paragraph',
      'newletter/form',
      'newletter/form',
    ]);
    expect(fromBlocks[1]!.attrs).toEqual({
      fields: 'name-surname',
      buttonLabel: 'Go!',
      ref: 'tnp',
    });
    const fromClassic = await document('newsletter-classic');
    expect(fromClassic.map((b) => b.type)).toEqual([
      'core/paragraph',
      'newletter/form',
      'core/paragraph',
    ]);
    expect(fromClassic[1]!.attrs).toEqual({ fields: 'name', buttonLabel: 'Join', ref: 'tnp' });
  });
});
