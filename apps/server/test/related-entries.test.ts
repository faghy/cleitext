/**
 * Related entries (theme `relatedEntries`): entries of the same type sharing
 * the entry's categories first, then its tags, newest first; none without
 * the theme asking for them. Also the previous and next entries
 * (`adjacentEntries`) and the terms of listed entries (`listTerms`).
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let visitor: TestClient;

async function theme(dir: string, slug: string, related?: number) {
  await mkdir(join(dir, slug, 'dist'), { recursive: true });
  await writeFile(
    join(dir, slug, 'theme.json'),
    JSON.stringify({ slug, name: slug, version: '1.0.0' }),
  );
  await writeFile(
    join(dir, slug, 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) { return h('html', null, h('head', null, h('title', null, head.title)), h('body', null, children)); }
function Index(props) {
  const related = props.kind === 'entry' ? props.entry.related : undefined;
  return h('main', null, h('h1', null, props.entry ? props.entry.title : 'list'), h('ul', { id: 'related' }, (related || []).map((e) => h('li', { key: e.id }, e.title))), h('p', { id: 'none' }, related === undefined ? 'none' : 'some'));
}
export default sdk.defineTheme({ slug: '${slug}', name: '${slug}', version: '1.0.0', menuLocations: {}, templates: { index: Index }, Layout, css: '', ${related ? `relatedEntries: ${related}` : ''} });
`,
  );
}

async function publish(title: string, terms: Record<string, unknown>) {
  const created = (await admin.post('/api/v1/entries', { type: 'article', title })).json();
  await admin.request('PATCH', `/api/v1/entries/${created.id}`, { terms });
  await admin.post(`/api/v1/entries/${created.id}/publish`);
  return (await admin.get(`/api/v1/entries/${created.id}`)).json() as { id: string; slug: string };
}

/** The public address of an entry, from the sitemaps (articles have dated addresses). */
async function addressOf(slug: string): Promise<string> {
  const index = (await visitor.get('/sitemap.xml')).body;
  for (const [, loc] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const urls = (await visitor.get(new URL(loc!).pathname)).body;
    const hit = [...urls.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1]!)
      .find((u) => u.endsWith(`/${slug}`));
    if (hit) return new URL(hit).pathname;
  }
  throw new Error(`No address for ${slug}`);
}

async function navTheme(dir: string) {
  await mkdir(join(dir, 'nav-theme', 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'nav-theme', 'theme.json'),
    JSON.stringify({ slug: 'nav-theme', name: 'nav-theme', version: '1.0.0' }),
  );
  await writeFile(
    join(dir, 'nav-theme', 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) { return h('html', null, h('head', null, h('title', null, head.title)), h('body', null, children)); }
function Index(props) {
  if (props.kind === 'entry') {
    const a = props.entry.adjacent || {};
    return h('main', null, h('p', { id: 'prev' }, a.prev ? a.prev.title : '-'), h('p', { id: 'next' }, a.next ? a.next.title : '-'));
  }
  return h('main', null, (props.entries || []).map((e) => h('p', { key: e.id, className: 'terms' }, e.title + ':' + ((e.terms && e.terms.category) || []).map((t) => t.name).join(','))));
}
export default sdk.defineTheme({ slug: 'nav-theme', name: 'nav-theme', version: '1.0.0', menuLocations: {}, templates: { index: Index }, Layout, css: '', listTerms: true, adjacentEntries: true });
`,
  );
}

const related = async (slug: string) => {
  const html = (await visitor.get(await addressOf(slug))).body;
  return [...html.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1]);
};

beforeAll(async () => {
  owner = ownerDatabase();
  const themesPath = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await theme(themesPath, 'related-theme', 3);
  await theme(themesPath, 'plain-theme');
  await navTheme(themesPath);
  app = await startTestApp({ env: { THEMES_PATH: themesPath } });
  const site = await seedSite(owner, 'related-entries');
  await seedUser(owner, {
    email: 'admin@related.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.38.0.1');
  visitor = new TestClient(app, site.host, '10.38.0.2');
  await admin.login('admin@related.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('related entries', () => {
  it('come from the same categories first, then the same tags', async () => {
    expect((await admin.post('/api/v1/themes/related-theme/activate')).statusCode).toBe(200);
    const sea = (await admin.post('/api/v1/taxonomies/category/terms', { name: 'Sea' })).json();
    const hills = (await admin.post('/api/v1/taxonomies/category/terms', { name: 'Hills' })).json();
    await publish('Tagged only', { category: [hills.id], tag: [{ name: 'boats' }] });
    await publish('Sea one', { category: [sea.id] });
    await publish('Sea two', { category: [sea.id] });
    await publish('Elsewhere', { category: [hills.id] });
    const main = await publish('Main', { category: [sea.id], tag: [{ name: 'boats' }] });
    const list = await related(main.slug);
    expect(list.slice(0, 2).sort()).toEqual(['Sea one', 'Sea two']);
    expect(list[2]).toBe('Tagged only');
    expect(list).not.toContain('Main');
    expect(list).not.toContain('Elsewhere');
  });

  it('are not looked up for themes that do not show them', async () => {
    await admin.post('/api/v1/themes/plain-theme/activate');
    const other = await publish('Plain', {});
    expect((await visitor.get(await addressOf(other.slug))).body).toContain(
      '<p id="none">none</p>',
    );
  });

  it('give the previous and next entries, and the terms of listed ones, to themes asking', async () => {
    expect((await admin.post('/api/v1/themes/nav-theme/activate')).statusCode).toBe(200);
    const river = (await admin.post('/api/v1/taxonomies/category/terms', { name: 'River' })).json();
    await publish('First of three', { category: [river.id] });
    const middle = await publish('Second of three', {});
    await publish('Third of three', {});
    const html = (await visitor.get(await addressOf(middle.slug))).body;
    expect(html).toContain('<p id="prev">First of three</p>');
    expect(html).toContain('<p id="next">Third of three</p>');
    const list = (await visitor.get(`/category/${river.slug}`)).body;
    expect(list).toContain('First of three:River');
  });
});
