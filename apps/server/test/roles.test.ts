/** Role management (RF-USR-06): custom roles, limits, assignment. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let editor: TestClient;
let other: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'roles');
  const otherSite = await seedSite(owner, 'roles-other');
  await seedUser(owner, {
    email: 'admin@roles.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@roles.test', password: PASSWORD, site, role: 'editor' });
  await seedUser(owner, {
    email: 'admin@roles-other.test',
    password: PASSWORD,
    site: otherSite,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.33.0.1');
  editor = new TestClient(app, site.host, '10.33.0.2');
  other = new TestClient(app, otherSite.host, '10.33.0.3');
  await admin.login('admin@roles.test', PASSWORD);
  await editor.login('editor@roles.test', PASSWORD);
  await other.login('admin@roles-other.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('roles', () => {
  it('lists the built-in roles with their members and the grantable permissions', async () => {
    const roles = (await admin.get('/api/v1/roles')).json();
    const administrator = roles.find((r: { slug: string }) => r.slug === 'administrator');
    expect(administrator).toMatchObject({ system: true, members: 1 });
    const catalog = (await admin.get('/api/v1/roles/capabilities')).json();
    expect(catalog.core).toContain('edit_entries');
    expect(catalog.core).not.toContain('manage_sites');
    expect((await editor.get('/api/v1/roles')).statusCode).toBe(403);
  });

  it('creates, assigns, edits and deletes a custom role', async () => {
    const created = await admin.post('/api/v1/roles', {
      name: 'Translator',
      capabilities: ['edit_entries', 'edit_others_entries'],
    });
    expect(created.statusCode).toBe(201);
    const role = created.json();
    expect(role).toMatchObject({ slug: 'translator', system: false });
    expect(role.capabilities).toEqual(['read', 'edit_entries', 'edit_others_entries']);

    // A member with the new role gets exactly its permissions.
    const invited = await admin.post('/api/v1/users/invite', {
      email: 'translator@roles.test',
      displayName: 'Translator',
      role: 'translator',
      password: PASSWORD,
    });
    expect(invited.statusCode).toBe(201);
    const translator = new TestClient(app, 'roles.test', '10.33.0.4');
    const me = (await translator.login('translator@roles.test', PASSWORD)).json();
    expect(me.capabilities.sort()).toEqual(['edit_entries', 'edit_others_entries', 'read']);

    const renamed = await admin.request('PATCH', `/api/v1/roles/${role.id}`, {
      name: 'Translators',
      capabilities: ['edit_entries'],
    });
    expect(renamed.json()).toMatchObject({
      name: 'Translators',
      capabilities: ['read', 'edit_entries'],
    });

    // In use: it cannot be deleted.
    expect((await admin.request('DELETE', `/api/v1/roles/${role.id}`)).statusCode).toBe(409);
    const members = (await admin.get('/api/v1/users')).json();
    const id = members.find((m: { email: string }) => m.email === 'translator@roles.test').id;
    await admin.request('PATCH', `/api/v1/users/${id}`, { role: 'author' });
    expect((await admin.request('DELETE', `/api/v1/roles/${role.id}`)).statusCode).toBe(204);
  });

  it('refuses built-in roles, unknown permissions, duplicates and other sites', async () => {
    const roles = (await admin.get('/api/v1/roles')).json();
    const author = roles.find((r: { slug: string }) => r.slug === 'author');
    expect(
      (await admin.request('PATCH', `/api/v1/roles/${author.id}`, { name: 'Writer' })).statusCode,
    ).toBe(400);
    expect(
      (await admin.post('/api/v1/roles', { name: 'Bad', capabilities: ['fly'] })).statusCode,
    ).toBe(400);
    expect(
      (await admin.post('/api/v1/roles', { name: 'Editor', capabilities: [] })).statusCode,
    ).toBe(409);
    expect(
      (await admin.post('/api/v1/roles', { name: 'Root', capabilities: ['manage_sites'] }))
        .statusCode,
    ).toBe(400);

    const mine = (
      await admin.post('/api/v1/roles', { name: 'Reviewer', capabilities: ['edit_entries'] })
    ).json();
    // Another site does not see or touch it.
    expect(
      (await other.get('/api/v1/roles')).json().some((r: { id: string }) => r.id === mine.id),
    ).toBe(false);
    expect((await other.request('DELETE', `/api/v1/roles/${mine.id}`)).statusCode).toBe(404);
  });
});
