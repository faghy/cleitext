/**
 * The site's members for plugins (`ctx.users`, plugin API 1.42): read-only,
 * behind the `users:read` permission, limited to the site by row-level
 * security, addresses only when their owners confirmed them.
 */
import { settings, users, withSiteContext, type DatabaseClient } from '@cleitext/db';
import { PluginPermissionError, type PluginContext } from '@cleitext/plugin-sdk';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { createPluginContext, userQuery } from '../src/plugins/plugin-context.js';
import { PluginHost, type LoadedPlugin } from '../src/plugins/plugin-host.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  tokenFromMail,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let other: SeededSite;
let ctx: PluginContext;
let denied: PluginContext;
const ids: Record<string, string> = {};

const fakePlugin = (permissions: string[]) =>
  ({ slug: 'notes', version: '1.0.0', manifest: { permissions } }) as unknown as LoadedPlugin;

async function person(
  key: string,
  displayName: string,
  options: { site?: SeededSite; role?: string; verified?: boolean; status?: string } = {},
) {
  const id = await seedUser(owner, {
    email: `${key}@users-api.test`,
    password: PASSWORD,
    site: options.site ?? site,
    role: options.role ?? 'editor',
  });
  await owner.db
    .update(users)
    .set({
      displayName,
      emailVerifiedAt: options.verified ? new Date() : null,
      status: options.status ?? 'active',
    })
    .where(eq(users.id, id));
  ids[key] = id;
  return id;
}

beforeAll(async () => {
  owner = ownerDatabase();
  app = await startTestApp();
  site = await seedSite(owner, 'users-api');
  other = await seedSite(owner, 'users-api-other');
  await person('anna', 'Anna Rossi', { role: 'administrator', verified: true });
  await person('bruno', 'Bruno Bianchi', { role: 'editor' });
  await person('carla', 'Carla 100%_off', { role: 'author', verified: true });
  await person('gone', 'Anna Suspended', { status: 'suspended', verified: true });
  await person('olga', 'Anna Elsewhere', { site: other, verified: true });
  const host = app.get(PluginHost);
  ctx = createPluginContext(fakePlugin(['users:read']), host);
  denied = createPluginContext(fakePlugin(['content:read']), host);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('ctx.users', () => {
  it('needs the users:read permission', async () => {
    await expect(denied.users.find(site.id)).rejects.toBeInstanceOf(PluginPermissionError);
    await expect(denied.users.get(site.id, ids.anna!)).rejects.toBeInstanceOf(
      PluginPermissionError,
    );
  });

  it("lists the site's active members by name, with role and confirmed addresses only", async () => {
    const list = await ctx.users.find(site.id);
    expect(list.map((u) => u.displayName)).toEqual([
      'Anna Rossi',
      'Bruno Bianchi',
      'Carla 100%_off',
    ]);
    expect(list[0]).toEqual({
      id: ids.anna,
      displayName: 'Anna Rossi',
      email: 'anna@users-api.test',
      avatarUrl: null,
      role: 'administrator',
    });
    // Bruno never confirmed his address.
    expect(list[1]).toMatchObject({ email: null, role: 'editor' });
  });

  it('never shows members of other sites (row-level security)', async () => {
    expect((await ctx.users.find(site.id, { search: 'Elsewhere' })).length).toBe(0);
    expect(await ctx.users.get(site.id, ids.olga!)).toBeNull();
    expect(await ctx.users.get(other.id, ids.olga!)).toMatchObject({
      displayName: 'Anna Elsewhere',
    });
    expect(await ctx.users.get(site.id, 'not-a-uuid')).toBeNull();
  });

  it('searches names and confirmed addresses, with literal wildcards', async () => {
    expect((await ctx.users.find(site.id, { search: 'anna' })).map((u) => u.id)).toEqual([
      ids.anna,
    ]);
    expect((await ctx.users.find(site.id, { search: 'ross ann' })).map((u) => u.id)).toEqual([
      ids.anna,
    ]);
    // Bruno's unconfirmed address is not searched.
    expect(await ctx.users.find(site.id, { search: 'bruno@' })).toEqual([]);
    expect((await ctx.users.find(site.id, { search: 'carla@users' })).map((u) => u.id)).toEqual([
      ids.carla,
    ]);
    expect((await ctx.users.find(site.id, { search: '%_' })).map((u) => u.id)).toEqual([ids.carla]);
    expect(await ctx.users.find(site.id, { search: '%%' })).toEqual([]);
  });

  it('filters by role and ids, with a limit and an offset', async () => {
    expect((await ctx.users.find(site.id, { role: 'author' })).map((u) => u.id)).toEqual([
      ids.carla,
    ]);
    expect(
      (await ctx.users.find(site.id, { ids: [ids.bruno!, ids.olga!, 'x'] })).map((u) => u.id),
    ).toEqual([ids.bruno]);
    expect(await ctx.users.find(site.id, { ids: [] })).toEqual([]);
    expect((await ctx.users.find(site.id, { limit: 2 })).length).toBe(2);
    expect((await ctx.users.find(site.id, { limit: 2, offset: 2 })).map((u) => u.id)).toEqual([
      ids.carla,
    ]);
    await expect(ctx.users.find('nope')).rejects.toThrow(/site id/);
  });

  it('checks queries', () => {
    expect(userQuery({})).toEqual({ limit: 20, offset: 0 });
    expect(userQuery({ limit: 1000, offset: -5, search: '  a  ' })).toEqual({
      limit: 100,
      offset: 0,
      search: 'a',
    });
    expect(() => userQuery({ ids: Array.from({ length: 101 }, () => 'x') })).toThrow(/100/);
    expect(() => userQuery({ ids: 'x' as unknown as string[] })).toThrow(/list/);
  });

  it('gives profile pictures, or Gravatar when the site uses it', async () => {
    await owner.db
      .update(users)
      .set({ avatarKey: 'avatars/x/y.webp' })
      .where(eq(users.id, ids.anna!));
    expect((await ctx.users.get(site.id, ids.anna!))?.avatarUrl).toBe('/media/avatars/x/y.webp');
    expect((await ctx.users.get(site.id, ids.bruno!))?.avatarUrl).toBeNull();
    await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .insert(settings)
        .values({ siteId: site.id, namespace: 'core', key: 'avatars', value: 'gravatar' })
        .onConflictDoUpdate({
          target: [settings.siteId, settings.namespace, settings.key],
          set: { value: sql`excluded.value` },
        }),
    );
    expect((await ctx.users.get(site.id, ids.bruno!))?.avatarUrl).toMatch(
      /^https:\/\/www\.gravatar\.com\/avatar\/[0-9a-f]{32}\?s=88&d=mp$/,
    );
  });
});

describe('confirmed addresses', () => {
  it('an accepted invitation confirms the address; a changed address is not confirmed', async () => {
    const mail = app.get(MailService);
    const admin = new TestClient(app, site.host, '10.9.0.1');
    expect((await admin.login('anna@users-api.test', PASSWORD)).statusCode).toBe(200);
    const invite = await admin.post('/api/v1/users/invite', {
      email: 'dario@users-api.test',
      displayName: 'Dario',
      role: 'editor',
    });
    expect(invite.statusCode).toBe(201);
    const id = invite.json().id as string;
    expect(await ctx.users.get(site.id, id)).toBeNull(); // Invited: not active yet.

    const token = tokenFromMail(mail.outbox, 'dario@users-api.test');
    const guest = new TestClient(app, site.host, '10.9.0.2');
    const accepted = await guest.post('/api/v1/auth/invitation/accept', {
      token,
      password: 'a brand new password',
    });
    expect(accepted.statusCode).toBe(200);
    expect(await ctx.users.get(site.id, id)).toMatchObject({ email: 'dario@users-api.test' });

    const changed = await admin.request('PATCH', `/api/v1/users/${id}/account`, {
      email: 'dario.new@users-api.test',
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(await ctx.users.get(site.id, id)).toMatchObject({ email: null });
  });
});
