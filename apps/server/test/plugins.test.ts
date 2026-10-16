/**
 * Plugin system (milestone M4): build, install with migrations in the
 * plugin schema, per-site activation, content types and fields, blocks,
 * hooks, routes, settings, capabilities, isolation and safe deactivation.
 */
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { plugins, type DatabaseClient } from '@cleitext/db';
import type { CxdDocument } from '@cleitext/blocks';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import * as tar from 'tar';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const fixture = fileURLToPath(new URL('./fixtures/events-plugin', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let other: SeededSite;
let admin: TestClient;
let editor: TestClient;
let author: TestClient;
let visitor: TestClient;
let pluginsPath: string;
let source: string;
const appRole = () => new URL(inject('appUrl')).username;

const doc = (...blocks: CxdDocument['blocks']): CxdDocument => ({ schema: 1, blocks });
const upcoming = (attrs: Record<string, unknown> = {}) => ({
  id: `b${Math.random().toString(36).slice(2, 8)}`,
  type: 'events/upcoming',
  v: 1,
  attrs,
});

async function createEvent(title: string, startsAt: string, publish = true) {
  const created = (
    await editor.post('/api/v1/entries', {
      type: 'event',
      title,
      fields: { startsAt, venue: 'Hall A' },
    })
  ).json();
  if (publish)
    expect((await editor.post(`/api/v1/entries/${created.id}/publish`)).statusCode).toBe(200);
  return created as { id: string; slug: string };
}

async function eventually(check: () => Promise<boolean>, timeoutMs = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
}

beforeAll(async () => {
  owner = ownerDatabase();
  pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  // A private copy: the build writes dist/ next to the sources.
  source = join(await mkdtemp(join(tmpdir(), 'events-src-')), 'events');
  await cp(fixture, source, { recursive: true });
  await buildPlugin(source);
  await installPlugin(owner.db, { source, pluginsPath, appRole: appRole() });

  app = await startTestApp({ pluginsPath, env: { DATABASE_ADMIN_URL: inject('ownerUrl') } });
  site = await seedSite(owner, 'plugins');
  other = await seedSite(owner, 'plugins-other');
  await seedUser(owner, {
    email: 'admin@plugins.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@plugins.test', password: PASSWORD, site, role: 'editor' });
  await seedUser(owner, { email: 'author@plugins.test', password: PASSWORD, site, role: 'author' });
  admin = new TestClient(app, site.host, '10.8.0.1');
  await admin.login('admin@plugins.test', PASSWORD);
  editor = new TestClient(app, site.host, '10.8.0.2');
  await editor.login('editor@plugins.test', PASSWORD);
  author = new TestClient(app, site.host, '10.8.0.3');
  await author.login('author@plugins.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.8.0.4');
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('installation', () => {
  it('builds the plugin with the host modules left out', async () => {
    const bundle = await readFile(join(source, 'dist/server.js'), 'utf8');
    expect(bundle).toContain('__cleitextShared');
    // Neither React nor Drizzle are bundled.
    expect(bundle).not.toContain('react.production');
    expect(bundle).not.toMatch(/class PgTable\b/);
  });

  it('creates the plugin schema and a role that cannot see core tables', async () => {
    const tables = await owner.db.execute(
      sql`select tablename from pg_tables where schemaname = 'plg_events'`,
    );
    expect(tables.map((t) => t.tablename)).toEqual(['rsvps']);
    const migrations = await owner.db.execute(
      sql`select migration from plugin_migrations where plugin_slug = 'events'`,
    );
    expect(migrations.map((m) => m.migration)).toEqual(['0001_rsvps.sql']);
  });

  it('refuses a migration changed after being applied', async () => {
    const copy = join(await mkdtemp(join(tmpdir(), 'events-changed-')), 'events');
    await cp(source, copy, { recursive: true });
    await writeFile(join(copy, 'migrations/0001_rsvps.sql'), 'SELECT 1;');
    const target = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
    await expect(
      installPlugin(owner.db, { source: copy, pluginsPath: target, appRole: appRole() }),
    ).rejects.toThrow(/changed after being applied/);
  });

  it('lists the plugin, inactive, with what it adds', async () => {
    const list = (await admin.get('/api/v1/plugins')).json();
    expect(list.find((p: { slug: string }) => p.slug === 'events')).toMatchObject({
      slug: 'events',
      version: '1.0.0',
      active: false,
      status: 'loaded',
      contributes: {
        types: ['event', 'event_template'],
        taxonomies: ['event-series'],
        settings: true,
        admin: false,
      },
    });
    expect((await editor.get('/api/v1/plugins')).statusCode).toBe(403);
  });

  it('adds nothing while inactive', async () => {
    const types = (await admin.get('/api/v1/content-types')).json();
    expect(types.map((t: { slug: string }) => t.slug)).not.toContain('event');
    expect((await admin.get('/api/v1/blocks')).json()).toEqual([]);
    expect((await admin.get('/api/v1/ext/events/rsvps')).statusCode).toBe(404);
    expect((await visitor.get('/events.ics')).statusCode).toBe(404);
  });
});

describe('an active plugin', () => {
  let event: { id: string; slug: string };

  beforeAll(async () => {
    const activated = await admin.post('/api/v1/plugins/events/activate');
    expect(activated.statusCode).toBe(200);
    expect(activated.json().active).toBe(true);
  });

  it('adds its content type with custom fields', async () => {
    const types = (await admin.get('/api/v1/content-types')).json();
    const type = types.find((t: { slug: string }) => t.slug === 'event');
    expect(type).toMatchObject({ source: 'plugin:events', permalink: '/events/{slug}' });
    expect(type.fields.map((f: { name: string }) => f.name)).toEqual(['startsAt', 'venue']);
  });

  it('adds its taxonomy, with custom fields and a manual order of its terms', async () => {
    const taxonomies = (await admin.get('/api/v1/taxonomies')).json();
    expect(taxonomies.find((t: { slug: string }) => t.slug === 'event-series')).toMatchObject({
      source: 'plugin:events',
      hierarchical: true,
      contentTypes: ['event'],
      fields: [{ name: 'poster' }, { name: 'season' }],
    });
    const add = (body: object) => admin.post('/api/v1/taxonomies/event-series/terms', body);
    expect((await add({ name: 'Bad', fields: { season: 0 } })).statusCode).toBe(400);
    const winter = (await add({ name: 'Winter', fields: { season: 2 }, position: 2 })).json();
    expect(winter.fields).toEqual({ season: 2 });
    await add({ name: 'Autumn', position: 1 });
    const updated = await admin.request('PATCH', `/api/v1/terms/${winter.id}`, {
      fields: { poster: null },
    });
    // Only the given fields change.
    expect(updated.json().fields).toEqual({ season: 2, poster: null });
    const terms = (await admin.get('/api/v1/taxonomies/event-series/terms')).json();
    expect(terms.map((t: { name: string }) => t.name)).toEqual(['Autumn', 'Winter']);
    // Entries carry their terms to plugins, in hooks and queries.
    const draft = await createEvent('Winter gala', '2031-01-10', false);
    const assigned = await editor.request('PATCH', `/api/v1/entries/${draft.id}`, {
      terms: { 'event-series': [winter.id] },
    });
    expect(assigned.statusCode).toBe(200);
    const seen = (await admin.get(`/api/v1/ext/events/saved/${draft.id}`)).json();
    expect(seen.event).toMatchObject({ terms: { 'event-series': [winter.id] } });
    expect(seen.found[0]).toMatchObject({
      terms: { 'event-series': [winter.id] },
      featuredMediaId: null,
    });
    await editor.request('DELETE', `/api/v1/entries/${draft.id}`);
    // Its archive works like the core ones.
    expect((await visitor.get('/event-series/winter')).statusCode).toBe(200);
    // It cannot be deleted from the admin: it goes away with the plugin.
    expect((await admin.request('DELETE', '/api/v1/taxonomies/event-series')).statusCode).toBe(400);
  });

  it('validates field values, and required fields when publishing', async () => {
    const invalid = await editor.post('/api/v1/entries', {
      type: 'event',
      title: 'Bad date',
      fields: { startsAt: 'tomorrow' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().errors[0].path).toBe('fields.startsAt');

    const draft = (
      await editor.post('/api/v1/entries', { type: 'event', title: 'No date yet' })
    ).json();
    const publish = await editor.post(`/api/v1/entries/${draft.id}/publish`);
    expect(publish.statusCode).toBe(400);
    expect(publish.json().errors[0].path).toBe('fields.startsAt');
  });

  it('renders entries of its type with its filters, and runs its actions', async () => {
    event = await createEvent('Spring concert', '2030-04-21');
    const page = await visitor.get('/events/spring-concert');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('When: 2030-04-21');
    expect(page.body).toContain('<script type="application/ld+json">');
    expect(page.body).toContain('"@type":"Event"');
    // The failing `render.html` filter was skipped.
    expect(page.body).toContain('</html>');

    const published = (await admin.get('/api/v1/ext/events/published')).json();
    expect(published).toContain(event.id);
  });

  it('renders its blocks, refreshed when its data changes', async () => {
    const created = (
      await editor.post('/api/v1/entries', {
        type: 'page',
        title: 'Agenda',
        document: doc(upcoming({ heading: 'Coming up', limit: 5 }), upcoming({ explode: true })),
      })
    ).json();
    await editor.post(`/api/v1/entries/${created.id}/publish`);

    const first = await visitor.get('/agenda');
    expect(first.statusCode).toBe(200);
    expect(first.body).toContain(
      '<div class="wp-block-events-upcoming"><section class="events"><h2>Coming up</h2>',
    );
    expect(first.body).toContain('href="/events/spring-concert"');
    // The failing block renders nothing; the page is fine.
    expect(first.body.match(/wp-block-events-upcoming/g)).toHaveLength(1);
    expect((await visitor.get('/agenda')).headers['x-cache']).toBe('HIT');

    // Its script and style, only where the block is.
    const script = '<script src="/plugin-assets/events/1.0.0/events.js" defer></script>';
    expect(first.body).toContain(script);
    expect(first.body.slice(0, first.body.indexOf('</head>'))).toContain(
      '<link rel="stylesheet" href="/plugin-assets/events/1.0.0/events.css">',
    );
    expect((await visitor.get('/')).body).not.toContain('/plugin-assets/events/');
    const js = await visitor.get('/plugin-assets/events/1.0.0/events.js');
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('text/javascript');
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(js.body).toContain('toUpperCase');
    // Block CSS comes after the plugins' stylesheets, so it wins.
    const head = first.body.slice(0, first.body.indexOf('</head>'));
    if (head.includes('data-cx-blocks')) {
      expect(head.indexOf('data-cx-blocks')).toBeGreaterThan(head.indexOf('events.css'));
    }
    expect((await visitor.get('/plugin-assets/events/1.0.0/_label.js')).statusCode).toBe(404);
    expect((await visitor.get('/plugin-assets/events/0.9.0/events.js')).statusCode).toBe(404);
    expect((await visitor.get('/plugin-assets/events/1.0.0/../server.js')).statusCode).toBe(404);

    await createEvent('Summer fair', '2030-07-01');
    const second = await visitor.get('/agenda');
    expect(second.headers['x-cache']).toBe('MISS');
    expect(second.body).toContain('Summer fair');
  });

  it('lists published entries with the public query, refreshed when they change', async () => {
    const page = (
      await editor.post('/api/v1/entries', {
        type: 'page',
        title: 'Titles',
        document: doc({ id: 'tl', type: 'events/titles', v: 1, attrs: { limit: 2 } }),
      })
    ).json();
    await editor.post(`/api/v1/entries/${page.id}/publish`);
    const first = await visitor.get('/titles');
    const total = Number(/data-total="(\d+)"/.exec(first.body)?.[1]);
    expect(total).toBeGreaterThanOrEqual(2);
    const titles = /<p class="titles"[^>]*>([^<]*)<\/p>/.exec(first.body)?.[1]?.split(' | ') ?? [];
    expect(titles).toHaveLength(2);
    expect([...titles].sort()).toEqual(titles);
    expect(titles[0]).toMatch(/@\/events\//);
    await createEvent('Aaa first by title', '2031-01-01');
    const second = await visitor.get('/titles');
    expect(second.headers['x-cache']).toBe('MISS');
    expect(second.body).toContain('Aaa first by title@/events/aaa-first-by-title');
    expect(second.body).toContain(`data-total="${total + 1}"`);
    // The address's parameters reach the loader (pagination).
    const skipped = await visitor.get('/titles?skip=1');
    expect(skipped.body).not.toContain('Aaa first by title');
    expect(skipped.body).toContain(titles[0]);
  });

  it('renders container blocks with their children, in pages and synced patterns', async () => {
    const paragraph = (id: string, text: string) => ({
      id,
      type: 'core/paragraph',
      v: 1,
      attrs: {},
      content: [{ text }],
    });
    const box = (id: string, tone: string, children: unknown[]) => ({
      id,
      type: 'events/box',
      v: 1,
      attrs: { tone },
      children,
    });
    const pattern = (
      await admin.post('/api/v1/patterns', {
        title: 'Boxed note',
        synced: true,
        document: { schema: 1, blocks: [box('pb1', 'blue', [paragraph('pp1', 'From a pattern')])] },
      })
    ).json();
    const created = await editor.post('/api/v1/entries', {
      type: 'page',
      title: 'Boxes',
      document: {
        schema: 1,
        blocks: [
          box('bx1', 'red', [
            paragraph('p1', 'Inside'),
            box('bx2', 'green', [paragraph('p2', 'Deeper')]),
          ]),
          { id: 'pt1', type: 'cleitext/pattern', v: 1, attrs: { ref: pattern.id } },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    await editor.post(`/api/v1/entries/${created.json().id}/publish`);

    const html = (await visitor.get('/boxes')).body;
    // No wrapper: the container's own markup, with the children inside.
    expect(html).toContain(
      '<aside class="box box-bx1" data-tone="red"><p>Inside</p><aside class="box box-bx2" data-tone="green"><p>Deeper</p></aside></aside>',
    );
    expect(html).not.toContain('wp-block-events-box');
    expect(html).toContain(
      '<aside class="box box-pb1" data-tone="blue"><p>From a pattern</p></aside>',
    );
    // One <style> in <head> with the CSS of every instance.
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('<style data-cx-blocks>');
    for (const css of [
      '.box-bx1{border:1px solid red}',
      '.box-bx2{border:1px solid green}',
      '.box-pb1{border:1px solid blue}',
    ]) {
      expect(head).toContain(css);
    }
  });

  it('gives containers each child on its own, and cleans raw HTML of authors without unfiltered_html', async () => {
    const stack = (note: string) => ({
      schema: 1,
      blocks: [
        {
          id: 'st1',
          type: 'events/stack',
          v: 1,
          attrs: { note },
          children: [
            { id: 'q1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'One' }] },
            { id: 'q2', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Two' }] },
          ],
        },
      ],
    });
    const note = '<b>Hi</b><script>alert(1)</script>';
    const byEditor = (
      await editor.post('/api/v1/entries', {
        type: 'page',
        title: 'Stacked',
        document: stack(note),
      })
    ).json();
    expect(byEditor.revision.document.blocks[0].attrs.note).toBe('<b>Hi</b>');
    const byAdmin = (
      await admin.post('/api/v1/entries', {
        type: 'page',
        title: 'Stacked raw',
        document: stack(note),
      })
    ).json();
    expect(byAdmin.revision.document.blocks[0].attrs.note).toBe(note);

    await editor.post(`/api/v1/entries/${byEditor.id}/publish`);
    const html = (await visitor.get('/stacked')).body;
    // Blocks know the page they are on.
    expect(html).toContain('data-page="entry:Stacked"');
    expect(html).toContain(
      '<div class="note"><b>Hi</b></div><ol><li><p>One</p></li><li><p>Two</p></li></ol>',
    );
  });

  it('keeps private types out of the public site', async () => {
    const created = await editor.post('/api/v1/entries', {
      type: 'event_template',
      title: 'Secret layout zebra',
    });
    expect(created.statusCode, created.body).toBe(201);
    await editor.post(`/api/v1/entries/${created.json().id}/publish`);
    expect((await visitor.get('/event_template/secret-layout-zebra')).statusCode).toBe(404);
    expect((await visitor.get('/search?q=zebra')).body).not.toContain('Secret layout');
    expect((await visitor.get('/sitemap.xml')).body).not.toContain('event_template');
    const types = (await admin.get('/api/v1/content-types')).json();
    expect(types.find((t: { slug: string }) => t.slug === 'event_template').supports).toContain(
      'private',
    );
    // The plugin reads its templates, with their published document.
    const templates = (await admin.get('/api/v1/ext/events/templates')).json();
    expect(templates).toEqual([
      expect.objectContaining({
        title: 'Secret layout zebra',
        url: '',
        document: { schema: 1, blocks: [] },
      }),
    ]);
  });

  it('fills the theme locations: header and the single template with the entry content', async () => {
    const created = (
      await editor.post('/api/v1/entries', {
        type: 'page',
        title: 'Located',
        document: {
          schema: 1,
          blocks: [
            {
              id: 'own',
              type: 'core/paragraph',
              v: 1,
              attrs: {},
              content: [{ text: 'The page itself' }],
            },
          ],
        },
      })
    ).json();
    await editor.post(`/api/v1/entries/${created.id}/publish`);
    const html = (await visitor.get('/located')).body;
    expect(html).toContain(
      '<div class="cx-location cx-location-header"><p>Plugin header</p></div>',
    );
    expect(html).not.toContain('class="site-header"');
    expect(html).toMatch(/cx-location-single"><p>Before the content<\/p><p>The page itself<\/p>/);
    // The overlay goes at the end of the page, whatever the theme.
    expect(html).toMatch(/cx-location-overlay"><p>A popup<\/p><\/div>(<script[^]*)?<\/body>/);
    // The theme's own footer stays.
    expect(html).toContain('class="site-footer"');
    // Elsewhere, the theme's header.
    expect((await visitor.get('/')).body).toContain('class="site-header"');
  });

  it('applies archive templates to its listings, which show where the entries go', async () => {
    const html = (await visitor.get('/event-tag/jazz')).body;
    expect(html).toContain('<p>Archive template jazz</p>');
    expect(html).toMatch(
      /data-archive="archive:Tagged jazz:jazz:event"><ul class="tagged"><li>jazz event<\/li><\/ul>/,
    );
    // The listing is shown once: the template takes the place of the page's content.
    expect(html.match(/class="tagged"/g)).toHaveLength(1);
    // Other plugin pages are no archives.
    expect((await visitor.get('/basket')).body).not.toContain('Archive template');
  });

  it('previews one of its blocks for visual editors', async () => {
    const preview = (block: object) =>
      editor.post('/api/v1/blocks/preview', { block: { v: 1, ...block }, locale: 'en' });
    const upcomingPreview = await preview({
      id: 'p1',
      type: 'events/upcoming',
      attrs: { heading: 'Soon', limit: 1 },
    });
    expect(upcomingPreview.statusCode).toBe(200);
    expect(upcomingPreview.json().html).toContain('<h2>Soon</h2>');
    const box = (await preview({ id: 'b1', type: 'events/box', attrs: { tone: 'red' } })).json();
    expect(box.html).toContain('data-tone="red"');
    expect(box.css).toContain('.box-b1{border:1px solid red}');
    // Only blocks of active plugins.
    expect((await preview({ id: 'c1', type: 'core/paragraph', attrs: {} })).statusCode).toBe(404);
    expect(
      (
        await visitor.post('/api/v1/blocks/preview', {
          block: { id: 'x', type: 'events/box', v: 1, attrs: {} },
        })
      ).statusCode,
    ).toBeGreaterThanOrEqual(400);
  });

  it('validates the attributes of its blocks', async () => {
    const response = await editor.post('/api/v1/entries', {
      type: 'page',
      title: 'Bad block',
      document: doc(upcoming({ limit: 'many' })),
    });
    expect(response.statusCode).toBe(400);
  });

  it('serves its API with capabilities, sessions and CSRF', async () => {
    const rsvp = (
      body: unknown,
      headers: Record<string, string> = { origin: `http://${site.host}` },
    ) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/ext/events/events/${event.id}/rsvp`,
        headers: { host: site.host, ...headers },
        payload: body as object,
      });
    expect((await rsvp({ email: 'ana@example.com' })).statusCode).toBe(201);
    expect((await rsvp({ email: 'nope' })).statusCode).toBe(400);
    expect(
      (await rsvp({ email: 'eve@example.com' }, { origin: 'https://evil.test' })).statusCode,
    ).toBe(403);

    const list = await editor.get('/api/v1/ext/events/rsvps');
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([{ eventId: event.id, email: 'ana@example.com' }]);
    expect((await author.get('/api/v1/ext/events/rsvps')).statusCode).toBe(403);
    expect((await visitor.get('/api/v1/ext/events/rsvps')).statusCode).toBe(401);
    expect((await admin.get('/api/v1/ext/events/nothing')).statusCode).toBe(404);
  });

  it('keeps plugin data per site and away from core tables', async () => {
    // Its PostgreSQL role cannot read core tables.
    expect((await admin.get('/api/v1/ext/events/peek')).statusCode).toBe(500);
    const stats = (await admin.get('/api/v1/plugins'))
      .json()
      .find((p: { slug: string }) => p.slug === 'events').stats;
    expect(stats.errors).toBeGreaterThan(0);
    expect(stats.lastError).toMatch(/permission denied/);

    // Another site does not have the plugin.
    const otherAdmin = new TestClient(app, other.host, '10.8.0.9');
    await seedUser(owner, {
      email: 'admin@plugins-other.test',
      password: PASSWORD,
      site: other,
      role: 'administrator',
    });
    await otherAdmin.login('admin@plugins-other.test', PASSWORD);
    expect((await otherAdmin.get('/api/v1/blocks')).json()).toEqual([]);
    expect((await otherAdmin.get('/api/v1/ext/events/rsvps')).statusCode).toBe(404);
  });

  it('serves its public addresses, cached by tag', async () => {
    const ics = await visitor.get('/events.ics');
    expect(ics.statusCode).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.body).toContain('SUMMARY:Spring concert');
    expect(ics.body).toContain('X-WR-CALNAME:Events');
    expect((await visitor.get('/events.ics')).headers['x-cache']).toBe('HIT');
  });

  it('shows its pages in the theme, never cached, with its own cookies only', async () => {
    const first = await admin.get('/basket');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(first.body).toContain('<title>Your basket');
    expect(first.body).toContain(
      '<div class="cx-plugin-page"><p class="basket">Visits: 1; cookies: ; language: en</p>',
    );
    // The theme's layout is around it, with noindex.
    expect(first.body).toMatch(/<meta name="robots" content="noindex/);
    expect(first.body).toMatch(/<p class="where">[^<]+ at http:\/\/[^<]+<\/p>/);
    const cookie = first.cookies.find((c: { name: string }) => c.name === 'events_visits');
    expect(cookie).toMatchObject({ value: '1', httpOnly: true, sameSite: 'Lax', path: '/' });
    // The session cookie is never given to the plugin.
    const second = await admin.get('/basket');
    expect(second.body).toContain('Visits: 2; cookies: events_visits;');
    expect((await admin.get('/bad-cookie')).statusCode).toBe(500);
  });

  it('can have cached pages for search engines, and links on the account page', async () => {
    const first = await visitor.get('/calendar');
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.body).toContain('<p class="calendar">All the events</p>');
    expect(first.body).not.toMatch(/<meta name="robots" content="noindex/);
    expect(first.body).toContain('"@type":"ItemList"');
    expect((await visitor.get('/calendar')).headers['x-cache']).toBe('HIT');
    // Every value of a repeated parameter (plugin API 1.17).
    expect((await visitor.get('/calendar?tag=a&tag=b')).body).toContain('<p class="tags">a,b</p>');
    // Signed in, it is not cached.
    expect((await admin.get('/calendar')).headers['x-cache']).toBe('BYPASS');

    const account = await admin.get('/account');
    expect(account.body).toContain('<a href="/account/rsvps">My RSVPs</a>');
    expect(account.body).not.toContain('Elsewhere');
  });

  it('runs its scheduled tasks on the sites where it is active', async () => {
    const host = app.get(PluginHost);
    const now = Date.now();
    expect(await host.runSchedules(now)).toBeGreaterThan(0);
    expect((await visitor.get('/ticks')).body).toBe('1');
    // Not again before 5 minutes.
    await host.runSchedules(now + 60_000);
    expect((await visitor.get('/ticks')).body).toBe('1');
    await host.runSchedules(now + 5 * 60_000);
    expect((await visitor.get('/ticks')).body).toBe('2');
  });

  it('posts and reads comments of its own type, outside the comment threads', async () => {
    const created = (
      await editor.post('/api/v1/entries', {
        type: 'event',
        title: 'Noted',
        fields: { startsAt: '2027-01-01' },
      })
    ).json();
    await editor.post(`/api/v1/entries/${created.id}/publish`);
    const posted = await admin.postForm('/event-notes', {
      entry: created.id,
      text: 'Great evening',
      stars: '5',
    });
    expect(posted.statusCode).toBe(200);
    expect(posted.json().status).toBe('approved');
    const empty = await visitor.postForm('/event-notes', {
      entry: created.id,
      text: '',
      name: 'Gino',
      email: 'gino@example.test',
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error).toBe('Write a comment.');
    const notes = (await visitor.get(`/event-notes/${created.id}`)).json();
    expect(notes).toEqual([
      expect.objectContaining({ type: 'note', content: 'Great evening', meta: { stars: 5 } }),
    ]);
  });

  it('has settings, editable with the right capability', async () => {
    expect((await admin.get('/api/v1/plugins/events/settings')).json()).toEqual({
      icsName: 'Events',
    });
    const saved = await admin.request('PATCH', '/api/v1/plugins/events/settings', {
      icsName: 'Concerts',
    });
    expect(saved.json()).toEqual({ icsName: 'Concerts' });
    expect((await visitor.get('/events.ics')).body).toContain('X-WR-CALNAME:Concerts');
    expect(
      (await admin.request('PATCH', '/api/v1/plugins/events/settings', { other: 1 })).statusCode,
    ).toBe(400);
    expect((await editor.get('/api/v1/plugins/events/settings')).statusCode).toBe(403);
    const info = (await admin.get('/api/v1/plugins/admin')).json();
    expect(info.find((p: { slug: string }) => p.slug === 'events').settings.fields[0].name).toBe(
      'icsName',
    );
  });

  it('grants its capabilities to the configured roles', async () => {
    expect((await editor.get('/api/v1/auth/me')).json().capabilities).toContain('manage_events');
    expect((await author.get('/api/v1/auth/me')).json().capabilities).not.toContain(
      'manage_events',
    );
  });
});

describe('deactivation', () => {
  it('hides what the plugin added without breaking the site', async () => {
    expect((await admin.post('/api/v1/plugins/events/deactivate')).statusCode).toBe(200);

    expect((await visitor.get('/events/spring-concert')).statusCode).toBe(404);
    const agenda = await visitor.get('/agenda');
    expect(agenda.statusCode).toBe(200);
    expect(agenda.body).not.toContain('wp-block-events-upcoming');
    expect((await visitor.get('/events.ics')).statusCode).toBe(404);
    expect((await admin.get('/api/v1/ext/events/rsvps')).statusCode).toBe(404);
    const types = (await admin.get('/api/v1/content-types')).json();
    expect(types.map((t: { slug: string }) => t.slug)).not.toContain('event');
    const taxonomies = (await admin.get('/api/v1/taxonomies')).json();
    expect(taxonomies.map((t: { slug: string }) => t.slug)).not.toContain('event-series');
    expect((await admin.get('/api/v1/taxonomies/event-series/terms')).statusCode).toBe(404);
    expect(
      (await editor.post('/api/v1/entries', { type: 'event', title: 'Later' })).statusCode,
    ).toBe(400);
    expect((await editor.get('/api/v1/auth/me')).json().capabilities).not.toContain(
      'manage_events',
    );
  });

  it('brings everything back when reactivated, data included', async () => {
    await admin.post('/api/v1/plugins/events/activate');
    expect((await visitor.get('/events/spring-concert')).statusCode).toBe(200);
    expect((await editor.get('/api/v1/ext/events/rsvps')).json()).toHaveLength(1);
  });

  it('is deactivated on a site where it keeps failing, with a Dashboard notice', async () => {
    const host = app.get(PluginHost);
    for (let i = 0; i < 10; i++) {
      await host.runHook({ plugin: 'events', name: 'test hook', siteId: site.id }, () => {
        throw new Error('boom');
      });
    }
    await eventually(async () => !(await host.activeSlugs(site.id)).has('events'));
    const dashboard = (await admin.get('/api/v1/dashboard')).json();
    expect(dashboard.pluginNotices).toEqual([
      expect.objectContaining({ plugin: 'events', error: 'test hook: boom' }),
    ]);
    expect((await admin.request('DELETE', '/api/v1/dashboard/plugin-notices')).statusCode).toBe(
      204,
    );
    expect((await admin.get('/api/v1/dashboard')).json().pluginNotices).toEqual([]);
    await admin.post('/api/v1/plugins/events/activate');
  });

  it('is activated on every site by a super admin, and must-use plugins stay on', async () => {
    await seedUser(owner, {
      email: 'root@plugins.test',
      password: PASSWORD,
      site,
      role: 'subscriber',
      superAdmin: true,
    });
    const root = new TestClient(app, site.host, '10.12.0.9');
    await root.login('root@plugins.test', PASSWORD);
    const host = app.get(PluginHost);
    await admin.post('/api/v1/plugins/events/deactivate');
    expect((await admin.post('/api/v1/plugins/events/network', { network: true })).statusCode).toBe(
      403,
    );
    const on = await root.post('/api/v1/plugins/events/network', { network: true });
    expect(on.json()).toMatchObject({ network: true, active: true });
    await eventually(async () => (await host.activeSlugs(other.id)).has('events'));
    // Sites cannot opt out of a network plugin.
    expect((await admin.post('/api/v1/plugins/events/deactivate')).statusCode).toBe(400);
    await root.post('/api/v1/plugins/events/network', { network: false });
    await eventually(async () => !(await host.activeSlugs(site.id)).has('events'));

    // Must-use, as installed with --required.
    await owner.db.update(plugins).set({ mustUse: true }).where(eq(plugins.slug, 'events'));
    await owner.db.execute(
      sql`select pg_notify('cleitext_cache', ${JSON.stringify({ plugins: true })})`,
    );
    await eventually(async () => (await host.activeSlugs(other.id)).has('events'));
    // The list below reads this site's (cached) state too.
    await eventually(async () => (await host.activeSlugs(site.id)).has('events'));
    const listed = (await admin.get('/api/v1/plugins')).json();
    expect(listed.find((p: { slug: string }) => p.slug === 'events')).toMatchObject({
      mustUse: true,
      active: true,
    });
    expect((await admin.post('/api/v1/plugins/events/deactivate')).statusCode).toBe(400);
    await owner.db.update(plugins).set({ mustUse: false }).where(eq(plugins.slug, 'events'));
    await owner.db.execute(
      sql`select pg_notify('cleitext_cache', ${JSON.stringify({ plugins: true })})`,
    );
    await eventually(async () => !(await host.activeSlugs(other.id)).has('events'));
    await admin.post('/api/v1/plugins/events/activate');
  });
});

describe('updates and removal', () => {
  let root: TestClient;

  it('reloads updated plugins in running servers', async () => {
    const manifest = JSON.parse(await readFile(join(source, 'cleitext.plugin.json'), 'utf8'));
    await writeFile(
      join(source, 'cleitext.plugin.json'),
      JSON.stringify({ ...manifest, version: '1.1.0' }),
    );
    await installPlugin(owner.db, { source, pluginsPath, appRole: appRole() });
    await owner.db.execute(
      sql`select pg_notify('cleitext_cache', ${JSON.stringify({ plugins: true })})`,
    );
    await eventually(async () => app.get(PluginHost).get('events')?.version === '1.1.0');
    expect((await visitor.get('/events/spring-concert')).statusCode).toBe(200);
  });

  it('installs an uploaded .tgz package (Upload Plugin)', async () => {
    root = new TestClient(app, site.host, '10.12.0.10');
    await root.login('root@plugins.test', PASSWORD);
    const manifest = JSON.parse(await readFile(join(source, 'cleitext.plugin.json'), 'utf8'));
    manifest.version = '9.9.9';
    await writeFile(join(source, 'cleitext.plugin.json'), JSON.stringify(manifest));
    const archive = join(await mkdtemp(join(tmpdir(), 'events-tgz-')), 'events.tgz');
    await tar.c({ gzip: true, file: archive, cwd: join(source, '..') }, ['events']);
    const res = await root.upload('/api/v1/plugins/upload', 'events.tgz', await readFile(archive));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ slug: 'events', version: '9.9.9' });
    await eventually(async () => app.get(PluginHost).get('events')?.version === '9.9.9');
    // Administrators cannot install code.
    expect(
      (await admin.upload('/api/v1/plugins/upload', 'events.tgz', await readFile(archive)))
        .statusCode,
    ).toBe(403);
  });

  it('deletes from the admin only a plugin active nowhere, with its data', async () => {
    // Deleting code is for super admins, as installing it.
    expect((await admin.delete('/api/v1/plugins/events')).statusCode).toBe(403);
    const active = await root.delete('/api/v1/plugins/events');
    expect(active.statusCode).toBe(400);
    expect(active.json().detail).toContain('Deactivate events first');

    expect((await admin.post('/api/v1/plugins/events/deactivate')).statusCode).toBe(200);
    expect((await root.delete('/api/v1/plugins/events')).statusCode).toBe(204);
    const schemas = await owner.db.execute(
      sql`select 1 from pg_namespace where nspname = 'plg_events'`,
    );
    expect(schemas).toHaveLength(0);
    await app.get(PluginHost).reload();
    const slugs = (await admin.get('/api/v1/plugins')).json().map((p: { slug: string }) => p.slug);
    expect(slugs).not.toContain('events');
    // Its entries stay in the database, invisible.
    expect((await visitor.get('/events/spring-concert')).statusCode).toBe(404);
    expect((await visitor.get('/agenda')).statusCode).toBe(200);
  });
});
