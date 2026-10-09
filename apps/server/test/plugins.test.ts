/**
 * Plugin system (milestone M4): build, install with migrations in the
 * plugin schema, per-site activation, content types and fields, blocks,
 * hooks, routes, settings, capabilities, isolation and safe deactivation.
 */
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin, uninstallPlugin } from '@cleitext/cli';
import { type DatabaseClient } from '@cleitext/db';
import type { CxdDocument } from '@cleitext/blocks';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
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

  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'plugins', { locales: ['en', 'it'] });
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
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      slug: 'events',
      version: '1.0.0',
      active: false,
      status: 'loaded',
      contributes: { types: ['event'], settings: true, admin: false },
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

    await createEvent('Summer fair', '2030-07-01');
    const second = await visitor.get('/agenda');
    expect(second.headers['x-cache']).toBe('MISS');
    expect(second.body).toContain('Summer fair');
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
    const stats = (await admin.get('/api/v1/plugins')).json()[0].stats;
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
    expect(info[0].settings.fields[0].name).toBe('icsName');
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
});

describe('updates and removal', () => {
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

  it('uninstalls the plugin with its data', async () => {
    await uninstallPlugin(owner.db, 'events', { pluginsPath });
    const schemas = await owner.db.execute(
      sql`select 1 from pg_namespace where nspname = 'plg_events'`,
    );
    expect(schemas).toHaveLength(0);
    await app.get(PluginHost).reload();
    expect((await admin.get('/api/v1/plugins')).json()).toEqual([]);
    // Its entries stay in the database, invisible.
    expect((await visitor.get('/events/spring-concert')).statusCode).toBe(404);
    expect((await visitor.get('/agenda')).statusCode).toBe(200);
  });
});
