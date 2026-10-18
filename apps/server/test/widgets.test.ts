/**
 * The official Widgets plugin: recent posts, recent comments, tag cloud,
 * categories and search form, with the term counts of plugin API 1.22.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { comments, withContext, type DatabaseClient } from '@cleitext/db';
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
let visitor: TestClient;
const ids: Record<string, string> = {};

async function term(taxonomy: string, name: string, parentId?: string) {
  const res = await admin.post(`/api/v1/taxonomies/${taxonomy}/terms`, {
    name,
    ...(parentId ? { parentId } : {}),
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
}

async function entry(
  type: string,
  title: string,
  blocks: unknown[] = [],
  terms: Record<string, string[]> = {},
  publish = true,
) {
  const created = await admin.post('/api/v1/entries', {
    type,
    title,
    document: { schema: 1, blocks },
  });
  expect(created.statusCode, created.body).toBe(201);
  if (Object.keys(terms).length) {
    const tagged = await admin.request('PATCH', `/api/v1/entries/${created.json().id}`, { terms });
    expect(tagged.statusCode, tagged.body).toBe(200);
  }
  if (!publish) return { id: created.json().id as string, path: '' };
  const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  return { id: created.json().id as string, path: `/${published.json().slug as string}` };
}

const widget = (id: string, type: string, attrs: Record<string, unknown> = {}) => ({
  id,
  type: `widgets/${type}`,
  v: 1,
  attrs,
});

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'widgets-src-')), 'widgets');
  await cp(join(pluginsRoot, 'widgets'), source, {
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
  site = await seedSite(owner, 'widgets');
  await seedUser(owner, {
    email: 'admin@widgets.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.61.0.1');
  await admin.login('admin@widgets.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.61.0.2');
  const activated = await admin.post('/api/v1/plugins/widgets/activate');
  expect(activated.statusCode, activated.body).toBe(200);

  ids.travel = await term('category', 'Travel');
  ids.italy = await term('category', 'Italy', ids.travel);
  ids.empty = await term('category', 'Empty');
  ids.rome = await term('tag', 'Rome');
  ids.food = await term('tag', 'Food');
  ids.rome_trip = (
    await entry('article', 'Rome trip', [], { category: [ids.italy!], tag: [ids.rome!, ids.food!] })
  ).id;
  await entry('article', 'Pasta night', [], { category: [ids.travel!], tag: [ids.food!] });
  await entry('article', 'Hello world');
  // Drafts count nowhere.
  await entry('article', 'Secret draft', [], { category: [ids.empty!] }, false);

  await withContext(owner.db, { siteId: site.id }, (tx) =>
    tx.insert(comments).values([
      {
        siteId: site.id,
        entryId: ids.rome_trip!,
        authorName: 'Gina',
        content: 'Lovely   pictures of the Colosseum!',
        status: 'approved',
      },
      {
        siteId: site.id,
        entryId: ids.rome_trip!,
        authorName: 'Spammer',
        content: 'Buy now',
        status: 'pending',
      },
    ]),
  );
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Widgets', () => {
  it('counts the published entries of terms for plugins (API 1.22)', async () => {
    const page = await entry('page', 'Sidebar', [
      widget('w1', 'categories'),
      widget('w2', 'tag-cloud', { counts: true }),
    ]);
    const html = (await visitor.get(page.path)).body;
    // Travel holds Pasta night, Italy holds Rome trip; Empty only a draft.
    expect(html).toMatch(
      /<a href="[^"]*\/category\/travel">Travel<\/a><span class="cxw-terms__count" title="1 post"> \(1\)<\/span><ul><li><a href="[^"]*\/category\/travel\/italy">Italy<\/a><span class="cxw-terms__count" title="1 post"> \(1\)<\/span>/,
    );
    expect(html).not.toContain('>Empty<');
    // Food has two posts: the largest; Rome one: the smallest.
    expect(html).toMatch(/style="font-size:180%" aria-label="Food \(2 posts\)">Food/);
    expect(html).toMatch(/style="font-size:80%" aria-label="Rome \(1 post\)">Rome/);
    expect(html).toContain('<link rel="stylesheet" href="/plugin-assets/widgets/');
  });

  it('lists recent posts, of a category, as a list, a grid or a magazine', async () => {
    const page = await entry('page', 'Posts', [
      widget('p1', 'recent-posts', { title: 'Latest', excerpt: true }),
      widget('p2', 'recent-posts', {
        layout: 'grid',
        columns: 2,
        filter: 'category',
        terms: 'italy, nope',
        title: '-',
      }),
      widget('p3', 'recent-posts', { layout: 'magazine', count: 2 }),
    ]);
    const html = (await visitor.get(page.path)).body;
    const [list, grid, magazine] = html.split('class="cxw-widget cxw-posts').slice(1);
    expect(list).toContain('<h2 class="cxw-widget__title">Latest</h2>');
    expect(list!.match(/class="cxw-posts__title"><a href="[^"]+">([^<]+)</g)).toHaveLength(3);
    expect(list).toMatch(/Hello world[\s\S]*Pasta night[\s\S]*Rome trip/);
    expect(list).not.toContain('Secret draft');
    expect(grid).toContain('style="--cxw-columns:2"');
    expect(grid).toContain('Rome trip');
    expect(grid).not.toContain('Pasta night');
    expect(grid).not.toContain('cxw-widget__title');
    expect(magazine).toContain('cxw-posts__item cxw-posts__item--lead');
    expect(magazine).not.toContain('Rome trip');
  });

  it('shows approved comments with their post, and a search form', async () => {
    const page = await entry('page', 'More', [
      widget('c1', 'recent-comments'),
      widget('s1', 'search', { placeholder: 'Find posts', showLabel: true }),
    ]);
    const html = (await visitor.get(page.path)).body;
    expect(html).toMatch(
      /<span class="cxw-comments__author">Gina<\/span> on <a href="[^"]*\/rome-trip#comment-[0-9a-f-]+">Rome trip<\/a>/,
    );
    expect(html).toContain('Lovely pictures of the Colosseum!');
    expect(html).not.toContain('Buy now');
    expect(html).toContain('<form role="search" action="/search" method="get">');
    expect(html).toContain('<label for="cxw-search-s1" class="cxw-search__label">Search</label>');
    expect(html).toContain('name="q"');
    expect(html).toContain('placeholder="Find posts"');
  });

  it('refreshes the lists when a post is published', async () => {
    const page = await entry('page', 'Fresh', [widget('f1', 'recent-posts', { count: 1 })]);
    expect((await visitor.get(page.path)).body).toContain('Hello world');
    await entry('article', 'Brand new', [], { tag: [ids.rome!] });
    const html = (await visitor.get(page.path)).body;
    expect(html).toContain('Brand new');
    expect(html).not.toContain('Hello world');
  });
});
