/**
 * Identity functions and rules (migration 0003): default roles, login lookup,
 * host resolution, user visibility, super admins, membership roles.
 */
import { DEFAULT_ROLES, DEFAULT_ROLE_SLUGS } from '@cleitext/shared';
import { eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  createDatabase,
  findLogin,
  listMySites,
  resolveHost,
  withContext,
  withSiteContext,
  type DatabaseClient,
} from '../src/index.js';
import * as s from '../src/schema/index.js';

let owner: DatabaseClient;
let app: DatabaseClient;
let siteA: string;
let siteB: string;
let member: string;
let superAdmin: string;
let editorRoleId: string;

beforeAll(async () => {
  owner = createDatabase(inject('ownerUrl'), { max: 2 });
  app = createDatabase(inject('appUrl'), { max: 2 });

  const [a] = await owner.db
    .insert(s.sites)
    .values({ slug: 'id-a', name: 'Identity A' })
    .returning();
  const [b] = await owner.db
    .insert(s.sites)
    .values({ slug: 'id-b', name: 'Identity B' })
    .returning();
  siteA = a!.id;
  siteB = b!.id;
  await owner.db.insert(s.siteDomains).values([
    { siteId: siteA, host: 'www.id-a.test', isPrimary: true, forceHttps: true },
    { siteId: siteA, host: 'id-a.test', isPrimary: false, forceHttps: true },
    { siteId: siteB, host: 'id-b.test', isPrimary: true, forceHttps: false },
  ]);

  const [m] = await owner.db
    .insert(s.users)
    .values({ email: 'member@id.test', displayName: 'Member', passwordHash: 'hash-m' })
    .returning();
  const [sa] = await owner.db
    .insert(s.users)
    .values({ email: 'root@id.test', displayName: 'Root', passwordHash: 'hash-r' })
    .returning();
  member = m!.id;
  superAdmin = sa!.id;
  await owner.db.insert(s.superAdmins).values({ userId: superAdmin });

  const [editor] = await owner.db
    .select()
    .from(s.roles)
    .where(sql`${s.roles.siteId} is null and ${s.roles.slug} = 'editor'`);
  editorRoleId = editor!.id;
  await withSiteContext(owner.db, siteA, (tx) =>
    tx.insert(s.siteMembers).values({ siteId: siteA, userId: member, roleId: editorRoleId }),
  );
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('default roles', () => {
  it('are seeded as system roles matching @cleitext/shared', async () => {
    const rows = await app.db.select().from(s.roles).where(isNull(s.roles.siteId));
    expect(rows.map((r) => r.slug).sort()).toEqual([...DEFAULT_ROLE_SLUGS].sort());
    for (const row of rows) {
      const expected = DEFAULT_ROLES[row.slug as keyof typeof DEFAULT_ROLES];
      expect(row.capabilities.sort(), row.slug).toEqual([...expected.capabilities].sort());
      expect(row.name).toBe(expected.name);
    }
  });
});

describe('memberships', () => {
  it('reject a role that belongs to another site', async () => {
    const [foreignRole] = await withSiteContext(owner.db, siteB, (tx) =>
      tx.insert(s.roles).values({ siteId: siteB, slug: 'b-only', name: 'B only' }).returning(),
    );
    await expect(
      withSiteContext(owner.db, siteA, (tx) =>
        tx
          .insert(s.siteMembers)
          .values({ siteId: siteA, userId: superAdmin, roleId: foreignRole!.id }),
      ),
    ).rejects.toSatisfy(hasPgCode('23503'));
  });
});

describe('login lookup', () => {
  it('finds users by email (case-insensitive) without any context', async () => {
    expect(await findLogin(app.db, 'MEMBER@id.test')).toEqual({
      userId: member,
      passwordHash: 'hash-m',
      status: 'active',
      isSuperAdmin: false,
      email: 'member@id.test',
    });
    expect((await findLogin(app.db, 'root@id.test'))?.isSuperAdmin).toBe(true);
    expect(await findLogin(app.db, 'nobody@id.test')).toBeNull();
  });
});

describe('host resolution', () => {
  it('returns the primary host and HTTPS policy for aliases', async () => {
    expect(await resolveHost(app.db, 'id-a.test')).toEqual({
      siteId: siteA,
      siteStatus: 'active',
      isPrimary: false,
      forceHttps: true,
      primaryHost: 'www.id-a.test',
    });
    expect((await resolveHost(app.db, 'ID-B.TEST'))?.isPrimary).toBe(true);
    expect(await resolveHost(app.db, 'unknown.test')).toBeNull();
  });

  it('ignores archived sites', async () => {
    await owner.db.update(s.sites).set({ status: 'archived' }).where(eq(s.sites.id, siteB));
    expect(await resolveHost(app.db, 'id-b.test')).toBeNull();
    await owner.db.update(s.sites).set({ status: 'active' }).where(eq(s.sites.id, siteB));
  });
});

describe('user visibility', () => {
  it('shows members of the site and the current user only', async () => {
    const ids = await withContext(app.db, { siteId: siteA, userId: superAdmin }, async (tx) =>
      (await tx.select().from(s.users)).map((u) => u.id).sort(),
    );
    expect(ids).toEqual([member, superAdmin].sort());

    const inB = await withContext(app.db, { siteId: siteB, userId: member }, async (tx) =>
      (await tx.select().from(s.users)).map((u) => u.id),
    );
    expect(inB).toEqual([member]);
  });

  it('lists the sites a user can access', async () => {
    const forMember = await withContext(app.db, { siteId: siteA, userId: member }, (tx) =>
      listMySites(tx),
    );
    expect(forMember.map((x) => x.id)).toEqual([siteA]);
    expect(forMember[0]?.host).toBe('www.id-a.test');

    const forRoot = await withContext(app.db, { siteId: siteA, userId: superAdmin }, (tx) =>
      listMySites(tx),
    );
    expect(forRoot.map((x) => x.id)).toEqual(expect.arrayContaining([siteA, siteB]));
  });
});

describe('super admins', () => {
  it('cannot be granted by the application role', async () => {
    await expect(app.db.insert(s.superAdmins).values({ userId: member })).rejects.toSatisfy(
      hasPgCode('42501'),
    );
    await expect(app.db.delete(s.superAdmins)).rejects.toSatisfy(hasPgCode('42501'));
  });
});

function hasPgCode(code: string) {
  return (error: unknown): boolean => {
    let current: unknown = error;
    while (current && typeof current === 'object') {
      if ((current as { code?: unknown }).code === code) return true;
      current = (current as { cause?: unknown }).cause;
    }
    return false;
  };
}
