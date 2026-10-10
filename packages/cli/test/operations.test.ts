import {
  createDatabase,
  siteLocales,
  siteMembers,
  sites,
  superAdmins,
  users,
  withSiteContext,
  type DatabaseClient,
} from '@cleitext/db';
import { verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import {
  addDomain,
  archiveSite,
  addLocale,
  createSite,
  createUser,
  hasSites,
  listSites,
  normalizeHost,
  OperationError,
  setPassword,
  updateSite,
} from '../src/operations.js';
import { uninstallTheme } from '../src/themes.js';

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

  it('enables languages', async () => {
    await addLocale(owner.db, { site: 'main', code: 'en', name: 'English' });
    await expect(
      addLocale(owner.db, { site: 'main', code: 'en', name: 'English' }),
    ).rejects.toThrow(/already enabled/);
    await expect(
      addLocale(owner.db, { site: 'main', code: 'xx_bad', name: 'Bad' }),
    ).rejects.toThrow(OperationError);
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

  it('updates name, slug, default language and time zone', async () => {
    await createSite(owner.db, { slug: 'second', name: 'Second', host: 'second.test' });
    await addLocale(owner.db, { site: 'second', code: 'it', name: 'Italiano' });
    await updateSite(owner.db, 'second', {
      name: 'Secondo',
      slug: 'secondo',
      locale: 'it',
      timezone: 'Europe/Rome',
    });
    const [site] = await owner.db.select().from(sites).where(eq(sites.slug, 'secondo'));
    expect(site).toMatchObject({ name: 'Secondo', defaultLocale: 'it', timezone: 'Europe/Rome' });
    const locales = await withSiteContext(owner.db, site!.id, (tx) =>
      tx.select().from(siteLocales).where(eq(siteLocales.siteId, site!.id)),
    );
    expect(locales.filter((l) => l.isDefault).map((l) => l.code)).toEqual(['it']);

    await expect(updateSite(owner.db, 'secondo', { locale: 'fr' })).rejects.toThrow(/not enabled/);
    await expect(updateSite(owner.db, 'secondo', { timezone: 'Mars/Base' })).rejects.toThrow(
      /time zone/,
    );
    await expect(updateSite(owner.db, 'secondo', { slug: 'main' })).rejects.toThrow(
      /already exists/,
    );
    await expect(updateSite(owner.db, 'secondo', {})).rejects.toThrow(/Nothing to change/);
  });

  it('archives a site and brings it back', async () => {
    await archiveSite(owner.db, 'secondo');
    expect((await listSites(owner.db)).find((s) => s.slug === 'secondo')?.status).toBe('archived');
    await expect(archiveSite(owner.db, 'secondo')).rejects.toThrow(/already archived/);
    await archiveSite(owner.db, 'secondo', true);
    expect((await listSites(owner.db)).find((s) => s.slug === 'secondo')?.status).toBe('active');
    await expect(archiveSite(owner.db, 'missing')).rejects.toThrow(/No site/);
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

describe('theme uninstall', () => {
  it('refuses themes still used by a site', async () => {
    const themesPath = await mkdtemp(path.join(tmpdir(), 'cleitext-themes-'));
    await mkdir(path.join(themesPath, 'used'));
    await writeFile(
      path.join(themesPath, 'used', 'theme.json'),
      JSON.stringify({ slug: 'used', name: 'Used', version: '1.0.0' }),
    );
    await owner.db.update(sites).set({ themeSlug: 'used' }).where(eq(sites.slug, 'main'));
    await expect(uninstallTheme(owner.db, 'used', themesPath)).rejects.toThrow(/Used by main/);
    await owner.db.update(sites).set({ themeSlug: null }).where(eq(sites.slug, 'main'));
    await uninstallTheme(owner.db, 'used', themesPath);
  });
});
