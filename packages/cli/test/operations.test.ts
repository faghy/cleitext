import {
  createDatabase,
  siteMembers,
  superAdmins,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import { verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import {
  addDomain,
  createSite,
  createUser,
  hasSites,
  listSites,
  normalizeHost,
  OperationError,
  setPassword,
} from '../src/operations.js';

let owner: DatabaseClient;

beforeAll(() => {
  owner = createDatabase(inject('ownerUrl'), { max: 2 });
});

afterAll(async () => {
  await owner?.close();
});

describe('sites', () => {
  it('creates a site with its primary domain and default language', async () => {
    expect(await hasSites(owner.db)).toBe(false);
    await createSite(owner.db, { slug: 'main', name: 'Main', host: 'Example.COM.', locale: 'it' });
    await addDomain(owner.db, { site: 'main', host: 'www.example.com' });
    const [site] = await listSites(owner.db);
    expect(site).toMatchObject({ slug: 'main', name: 'Main', status: 'active' });
    expect(site?.domains.sort()).toEqual(['example.com (primary)', 'www.example.com']);
    expect(await hasSites(owner.db)).toBe(true);
  });

  it('switches the primary domain', async () => {
    await addDomain(owner.db, { site: 'main', host: 'new.example.com', primary: true });
    const [site] = await listSites(owner.db);
    expect(site?.domains.filter((d) => d.endsWith('(primary)'))).toEqual([
      'new.example.com (primary)',
    ]);
  });

  it('rejects duplicate slugs, taken domains and invalid hosts', async () => {
    await expect(createSite(owner.db, { slug: 'main', name: 'X', host: 'x.test' })).rejects.toThrow(
      OperationError,
    );
    await expect(
      createSite(owner.db, { slug: 'dup', name: 'X', host: 'example.com' }),
    ).rejects.toThrow(/already assigned/);
    expect(() => normalizeHost('https://example.com')).toThrow(OperationError);
    expect(() => normalizeHost('example.com:8080')).toThrow(OperationError);
    expect(normalizeHost('127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('users', () => {
  it('creates a super admin with an argon2id password', async () => {
    const id = await createUser(owner.db, {
      email: 'Root@Example.com',
      password: 'a long enough password',
      superAdmin: true,
    });
    const [user] = await owner.db.select().from(users).where(eq(users.id, id));
    expect(user?.email).toBe('root@example.com');
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(user!.passwordHash!, 'a long enough password')).toBe(true);
    expect(
      await owner.db.select().from(superAdmins).where(eq(superAdmins.userId, id)),
    ).toHaveLength(1);
  });

  it('adds a member to a site with a role', async () => {
    const id = await createUser(owner.db, {
      email: 'editor@example.com',
      password: 'a long enough password',
      site: 'main',
      role: 'editor',
    });
    const [site] = await listSites(owner.db);
    const members = await withSiteContext(owner.db, site!.id, (tx) =>
      tx.select().from(siteMembers).where(eq(siteMembers.userId, id)),
    );
    expect(members).toHaveLength(1);
  });

  it('validates input and resets passwords', async () => {
    await expect(
      createUser(owner.db, { email: 'x@example.com', password: 'short' }),
    ).rejects.toThrow(/password/);
    await expect(
      createUser(owner.db, { email: 'root@example.com', password: 'a long enough password' }),
    ).rejects.toThrow(/already exists/);
    await setPassword(owner.db, 'root@example.com', 'another long password');
    const [user] = await owner.db.select().from(users).where(eq(users.email, 'root@example.com'));
    expect(await verify(user!.passwordHash!, 'another long password')).toBe(true);
  });
});
