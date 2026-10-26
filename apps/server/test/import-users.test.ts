/**
 * Accounts of a WordPress site moved to Cleitext (WordPress Importer 1.34.0,
 * plugin API 1.56): WordPress administrators are administrators here, from
 * the users list of WP-CLI (multipart field `users`) or `?admins=`; new
 * accounts speak the site's language; existing members get a higher role
 * from the import, never a lower one.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import {
  auditLog,
  roles,
  siteMembers,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { outranks } from '../src/transfer/importer.js';
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
const ids: Record<string, string> = {};

const author = (id: number, login: string) =>
  `<wp:author><wp:author_id>${id}</wp:author_id><wp:author_login>${login}</wp:author_login><wp:author_email>${login}@wpu.test</wp:author_email><wp:author_display_name>${login}</wp:author_display_name></wp:author>`;
const wxr = `<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Old site</title><link>https://old.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://old.example</wp:base_blog_url>
${['anna', 'bruno', 'carla', 'dario', 'elena'].map((l, i) => author(i + 1, l)).join('\n')}
</channel></rss>`;

/** What `wp user list --fields=user_login,user_email,roles --format=csv` prints. */
const USERS = [
  'user_login,user_email,roles',
  'anna,anna@wpu.test,administrator',
  // Found by email: another login in this list.
  'bruno.old,bruno@wpu.test,"editor,administrator"',
  'carla,carla@wpu.test,customer',
  'elena,elena@wpu.test,seo_manager',
].join('\n');

async function finished() {
  for (let i = 0; i < 300; i++) {
    const { job } = (await admin.get('/api/v1/ext/wordpress-importer/status')).json();
    if (job.status !== 'running') return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The import did not finish.');
}

async function memberRole(userId: string) {
  return withSiteContext(owner.db, site.id, async (tx) => {
    const [row] = await tx
      .select({ slug: roles.slug })
      .from(siteMembers)
      .innerJoin(roles, eq(roles.id, siteMembers.roleId))
      .where(and(eq(siteMembers.siteId, site.id), eq(siteMembers.userId, userId)));
    return row?.slug ?? null;
  });
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await buildPlugin(join(pluginsRoot, 'wordpress-importer'));
  const source = join(await mkdtemp(join(tmpdir(), 'wpi-src-')), 'wordpress-importer');
  await cp(join(pluginsRoot, 'wordpress-importer'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'wp-users', { locale: 'it' });
  ids.admin = await seedUser(owner, {
    email: 'admin@wpu.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  // Already members: Bruno is an author here, Carla an editor.
  ids.bruno = await seedUser(owner, {
    email: 'bruno@wpu.test',
    password: PASSWORD,
    site,
    role: 'author',
  });
  ids.carla = await seedUser(owner, {
    email: 'carla@wpu.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  admin = new TestClient(app, site.host, '10.49.0.1');
  await admin.login('admin@wpu.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/wordpress-importer/activate')).statusCode).toBe(200);
}, 240_000);

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('accounts of a WordPress site', () => {
  it('tells the admin page that the users list can be sent', async () => {
    const res = await admin.get('/api/v1/ext/wordpress-importer/status');
    expect(res.json()).toMatchObject({ job: null, usersList: true });
  });

  it('refuses a users list that is not one', async () => {
    const res = await admin.upload(
      '/api/v1/ext/wordpress-importer/imports?locale=it',
      'old.xml',
      Buffer.from(wxr),
      'text/xml',
      { users: 'name;mail\nx;y' },
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toMatch(/user_login/);
  });

  it('maps WordPress roles, upgrades members, never downgrades, and creates accounts in Italian', async () => {
    const started = await admin.upload(
      '/api/v1/ext/wordpress-importer/imports?locale=it&authorRole=contributor&admins=dario',
      'old.xml',
      Buffer.from(wxr),
      'text/xml',
      { users: USERS },
    );
    expect(started.statusCode, started.body).toBe(202);
    const job = await finished();
    expect(job.error ?? job.status).toBe('done');
    expect(
      job.users.map((u: { login: string; role: string; source: string }) => [
        u.login,
        u.role,
        u.source,
      ]),
    ).toEqual([
      ['anna', 'administrator', 'roles'],
      ['bruno', 'administrator', 'roles'],
      ['carla', 'subscriber', 'roles'],
      ['dario', 'administrator', 'admins'],
      ['elena', 'contributor', 'default'],
    ]);

    const account = async (email: string) =>
      (await owner.db.select().from(users).where(eq(users.email, email)))[0]!;
    for (const [login, role] of [
      ['anna', 'administrator'],
      ['dario', 'administrator'],
      ['elena', 'contributor'],
    ] as const) {
      const user = await account(`${login}@wpu.test`);
      expect(user.locale, login).toBe('it');
      expect(await memberRole(user.id), login).toBe(role);
    }
    // Existing accounts keep their language; Bruno is raised, Carla is not lowered.
    expect((await account('bruno@wpu.test')).locale).toBe('en');
    expect(await memberRole(ids.bruno!)).toBe('administrator');
    expect(await memberRole(ids.carla!)).toBe('editor');
    expect(job.report.warnings).toContain(
      'bruno@wpu.test: role on this site raised from author to administrator.',
    );
    expect(job.report.warnings.join('\n')).not.toContain('carla@wpu.test: role');
    expect(job.report.created.roleUpgrades).toBe(1);

    const logged = await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'member.role.changed'), eq(auditLog.targetId, ids.bruno!))),
    );
    expect(logged.map((l) => l.meta)).toEqual([
      { from: 'author', to: 'administrator', via: 'import' },
    ]);
  });

  it('ranks roles: built-in ones by their order, others by their capabilities', () => {
    const role = (slug: string, capabilities: string[] = []) => ({ slug, capabilities });
    expect(outranks(role('administrator'), role('editor'))).toBe(true);
    expect(outranks(role('subscriber'), role('editor'))).toBe(false);
    expect(outranks(role('editor'), role('editor'))).toBe(false);
    expect(outranks(role('manager', ['read', 'edit_entries']), role('reader', ['read']))).toBe(
      true,
    );
    expect(outranks(role('reader', ['read']), role('manager', ['read', 'edit_entries']))).toBe(
      false,
    );
  });
});
