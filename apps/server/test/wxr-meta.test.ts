/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * WordPress meta for plugins (`import.wxrMeta`, plugin API 1.48): the
 * WordPress Importer gives every item's post meta (ACF's field groups and
 * fields too) and every term's term meta to the active plugins, whose field
 * values, field groups, options pages and options are imported, definitions
 * first. Without a plugin the import is as before.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const fixture = fileURLToPath(new URL('./fixtures/options-plugin', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let plain: SeededSite;
let admin: TestClient;
let plainAdmin: TestClient;

const cdata = (value: string) => `<![CDATA[${value}]]>`;
const meta = (rows: Record<string, string>, tag = 'wp:postmeta') =>
  Object.entries(rows)
    .map(
      ([key, value]) =>
        `<${tag}><wp:meta_key>${cdata(key)}</wp:meta_key><wp:meta_value>${cdata(value)}</wp:meta_value></${tag}>`,
    )
    .join('');
const item = (fields: {
  id: number;
  type: string;
  title: string;
  name: string;
  status?: string;
  content?: string;
  excerpt?: string;
  parent?: number;
  meta?: Record<string, string>;
  categories?: string;
}) => `<item>
<title>${cdata(fields.title)}</title>
<link>https://acf.example.com/${fields.name}/</link>
<dc:creator>${cdata('marta')}</dc:creator>
<content:encoded>${cdata(fields.content ?? '')}</content:encoded>
<excerpt:encoded>${cdata(fields.excerpt ?? '')}</excerpt:encoded>
<wp:post_id>${fields.id}</wp:post_id>
<wp:post_date_gmt>${cdata('2024-05-01 08:00:00')}</wp:post_date_gmt>
<wp:post_name>${cdata(fields.name)}</wp:post_name>
<wp:status>${cdata(fields.status ?? 'publish')}</wp:status>
<wp:post_parent>${fields.parent ?? 0}</wp:post_parent>
<wp:menu_order>0</wp:menu_order>
<wp:post_type>${cdata(fields.type)}</wp:post_type>
${fields.categories ?? ''}
${meta(fields.meta ?? {})}
</item>`;

/** A WordPress export of a site using ACF: a field group, two fields, a post with values. */
const WXR = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
<title>ACF site</title>
<link>https://acf.example.com</link>
<description>Books</description>
<wp:wxr_version>1.2</wp:wxr_version>
<wp:base_blog_url>https://acf.example.com</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata('marta')}</wp:author_login><wp:author_email>${cdata('marta@acf.example.com')}</wp:author_email><wp:author_display_name>${cdata('Marta')}</wp:author_display_name></wp:author>
<wp:category><wp:term_id>5</wp:term_id><wp:category_nicename>${cdata('news')}</wp:category_nicename><wp:category_parent>${cdata('')}</wp:category_parent><wp:cat_name>${cdata('News')}</wp:cat_name>${meta({ color: '#ff0000', curator: 'admin@wxr-meta.test' }, 'wp:termmeta')}</wp:category>
<wp:term><wp:term_id>6</wp:term_id><wp:term_taxonomy>${cdata('genre')}</wp:term_taxonomy><wp:term_slug>${cdata('jazz')}</wp:term_slug><wp:term_name>${cdata('Jazz')}</wp:term_name>${meta({ icon: 'star' }, 'wp:termmeta')}</wp:term>
${item({ id: 10, type: 'acf-field-group', title: 'Book details', name: 'group_books', content: 'a:1:{s:8:"position";s:6:"normal";}' })}
${item({ id: 11, type: 'acf-field', title: 'Price', name: 'field_price', excerpt: 'price', parent: 10, content: 'a:2:{s:4:"type";s:6:"number";s:3:"min";i:0;}' })}
${item({ id: 12, type: 'acf-field', title: 'Cover', name: 'field_cover', excerpt: 'cover', parent: 10, content: 'a:1:{s:4:"type";s:5:"image";}' })}
${item({ id: 13, type: 'acf-field', title: 'Host', name: 'field_host', excerpt: 'host', parent: 10, content: 'a:1:{s:4:"type";s:4:"user";}' })}
${item({ id: 40, type: 'book', title: 'A novel', name: 'a-novel', categories: `<category domain="genre" nicename="jazz">${cdata('Jazz')}</category>` })}
${item({
  id: 20,
  type: 'post',
  title: 'A good book',
  name: 'a-good-book',
  content:
    '<!-- wp:paragraph --><p>Read it.</p><!-- /wp:paragraph --><!-- wp:acf/quote {"name":"acf/quote","data":{"text":"Hi"}} /-->',
  meta: {
    price: '12',
    _price: 'field_price',
    cover: '30',
    _cover: 'field_cover',
    host: '1',
    _host: 'field_host',
    _edit_last: '1',
  },
  categories: `<category domain="category" nicename="news">${cdata('News')}</category><category domain="genre" nicename="jazz">${cdata('Jazz')}</category>`,
})}
</channel>
</rss>`;

async function install(source: string, pluginsPath: string, name: string, inPlace = false) {
  // The importer is built in place: it bundles its own dependencies (the WordPress reader).
  if (inPlace) await buildPlugin(source);
  const copy = join(await mkdtemp(join(tmpdir(), `${name}-src-`)), name);
  await cp(source, copy, { recursive: true, filter: (file) => !file.includes('node_modules') });
  if (!inPlace) await buildPlugin(copy);
  await installPlugin(owner.db, {
    source: copy,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

/** Uploads the export and waits for the import's report. */
async function importWxr(client: TestClient): Promise<any> {
  const started = await client.upload(
    '/api/v1/ext/wordpress-importer/imports?locale=en',
    'acf.xml',
    Buffer.from(WXR),
    'text/xml',
  );
  expect(started.statusCode, started.body).toBe(202);
  for (let i = 0; i < 200; i++) {
    const { job } = (await client.get('/api/v1/ext/wordpress-importer/status')).json();
    if (job.status !== 'running') {
      expect(job.error ?? job.status).toBe('done');
      return job.report;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The import did not finish.');
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install(join(pluginsRoot, 'wordpress-importer'), pluginsPath, 'wordpress-importer', true);
  await install(fixture, pluginsPath, 'options-kit');
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'wxr-meta');
  plain = await seedSite(owner, 'wxr-plain');
  await seedUser(owner, {
    email: 'admin@wxr-meta.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'admin@wxr-plain.test',
    password: PASSWORD,
    site: plain,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.51.0.1');
  await admin.login('admin@wxr-meta.test', PASSWORD);
  plainAdmin = new TestClient(app, plain.host, '10.51.0.2');
  await plainAdmin.login('admin@wxr-plain.test', PASSWORD);
  for (const client of [admin, plainAdmin]) {
    expect((await client.post('/api/v1/plugins/wordpress-importer/activate')).statusCode).toBe(200);
  }
  // Only the first site has the plugin that reads the meta.
  expect((await admin.post('/api/v1/plugins/options-kit/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('import.wxrMeta', () => {
  it('gives plugins the post and term meta, and imports what they make of it', async () => {
    const report = await importWxr(admin);
    expect(report.errors).toEqual([]);
    // The plugin saw every item (ACF's own too), the terms with their meta, no options.
    expect(report.warnings).toContain(
      'options-kit saw 6 items (3 ACF fields), 2 terms (2 with meta), options: none, in en',
    );
    // The export's authors and the slugs of its custom types (plugin API 1.49).
    expect(report.warnings).toContain(
      'options-kit saw authors 1=user:marta and types {"book":"book"} {"genre":"genre"}',
    );
    // ACF's records are not content (nor reported as unknown types).
    expect(JSON.stringify(report.warnings)).not.toContain('acf-field');
    expect(report.created).toMatchObject({ fieldGroups: 2, optionsPages: 1, options: 1 });

    const groups = (await admin.get('/api/v1/field-groups')).json();
    expect(groups.find((g: any) => g.id === 'acf')).toMatchObject({
      title: 'Book details',
      fields: [
        { name: 'price', type: 'number', label: 'Price' },
        { name: 'cover', type: 'media', label: 'Cover' },
        { name: 'host', type: 'user', label: 'Host' },
      ],
    });
    const posts = (await admin.get('/api/v1/entries?type=article')).json().items;
    const post = (await admin.get(`/api/v1/entries/${posts[0].id}`)).json();
    const members = (await admin.get('/api/v1/users')).json();
    const list = Array.isArray(members) ? members : members.items;
    const marta = list.find((u: any) => u.email === 'marta@acf.example.com');
    const me = list.find((u: any) => u.email === 'admin@wxr-meta.test');
    // The attachment was not in the export: its reference becomes null; the
    // author named by a user field is the imported member.
    expect(post.revision.fields.acf).toEqual({ price: 12, cover: null, host: marta.id });
    const news = (await admin.get('/api/v1/taxonomies/category/terms'))
      .json()
      .find((t: any) => t.slug === 'news');
    // A person named by email is the member with that email.
    expect(news.fields).toEqual({ 'acf-term': { color: '#ff0000', curator: me.id } });
    // The ACF block became the plugin's block, its refs resolved like field values.
    const quote = post.revision.document.blocks.find((b: any) => b.type === 'options-kit/quote');
    expect(quote.attrs).toEqual({ text: 'Hi', who: marta.id, topic: news.id, photo: null });
    // The plugin described the custom post type and taxonomy.
    const types = (await admin.get('/api/v1/content-types')).json();
    expect(types.find((t: any) => t.slug === 'book')).toMatchObject({
      hierarchical: true,
      name: { en: 'Books' },
    });
    const genre = (await admin.get('/api/v1/taxonomies'))
      .json()
      .find((t: any) => t.slug === 'genre');
    expect(genre).toMatchObject({ name: { en: 'Genres' } });
    expect(genre.contentTypes).toContain('book');
    expect((await admin.get('/api/v1/options/acf-options')).json().values).toEqual({
      phone: '010 555',
    });
  });

  it('leaves the import as before without a plugin taking the meta', async () => {
    const report = await importWxr(plainAdmin);
    expect(report.errors).toEqual([]);
    expect(JSON.stringify(report.warnings)).not.toContain('options-kit');
    expect(report.created.fieldGroups).toBeUndefined();
    expect((await plainAdmin.get('/api/v1/field-groups')).json()).toEqual([]);
    const posts = (await plainAdmin.get('/api/v1/entries?type=article')).json().items;
    const post = (await plainAdmin.get(`/api/v1/entries/${posts[0].id}`)).json();
    expect(post.revision.fields.acf).toBeUndefined();
  });
});
