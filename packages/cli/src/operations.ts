/**
 * Administrative operations run with the owner connection (DATABASE_ADMIN_URL).
 * Used by the `cleitext` CLI and by `tools/dev-db`.
 */
import {
  roles,
  seedSiteDefaults,
  siteDomains,
  siteLocales,
  siteMembers,
  sites,
  superAdmins,
  users,
  withSiteContext,
  type Database,
} from '@cleitext/db';
import { emailSchema, localeSchema, passwordSchema } from '@cleitext/shared';
import { hash } from '@node-rs/argon2';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

export class OperationError extends Error {}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const HOST_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export interface CreateSiteInput {
  slug: string;
  name: string;
  /** Primary domain, without scheme or port (e.g. example.com). */
  host: string;
  locale?: string;
  timezone?: string;
  forceHttps?: boolean;
}

export async function createSite(db: Database, input: CreateSiteInput): Promise<string> {
  if (!SLUG_RE.test(input.slug)) throw new OperationError(`Invalid site slug "${input.slug}".`);
  const host = normalizeHost(input.host);
  const locale = input.locale ?? 'en';

  const [existing] = await db.select().from(sites).where(eq(sites.slug, input.slug));
  if (existing) throw new OperationError(`A site with slug "${input.slug}" already exists.`);
  await assertHostFree(db, host);

  const [site] = await db
    .insert(sites)
    .values({
      slug: input.slug,
      name: input.name,
      defaultLocale: locale,
      timezone: input.timezone ?? 'UTC',
    })
    .returning();
  const siteId = site!.id;
  await db
    .insert(siteDomains)
    .values({ siteId, host, isPrimary: true, forceHttps: input.forceHttps ?? true });
  await withSiteContext(db, siteId, (tx) =>
    tx
      .insert(siteLocales)
      .values({ siteId, code: locale, name: locale.toUpperCase(), isDefault: true }),
  );
  await seedSiteDefaults(db, siteId);
  return siteId;
}

export interface AddDomainInput {
  site: string;
  host: string;
  primary?: boolean;
  forceHttps?: boolean;
}

/** Adds a domain to a site (by slug). A new primary domain demotes the old one. */
export async function addDomain(db: Database, input: AddDomainInput): Promise<void> {
  const siteId = await siteIdBySlug(db, input.site);
  const host = normalizeHost(input.host);
  await assertHostFree(db, host);
  await db.transaction(async (tx) => {
    if (input.primary) {
      await tx.update(siteDomains).set({ isPrimary: false }).where(eq(siteDomains.siteId, siteId));
    }
    await tx.insert(siteDomains).values({
      siteId,
      host,
      isPrimary: input.primary ?? false,
      forceHttps: input.forceHttps ?? true,
    });
  });
}

/** Enables a language on a site (BCP 47 code, e.g. `it` or `de-CH`). */
export async function addLocale(
  db: Database,
  input: { site: string; code: string; name: string; isDefault?: boolean },
): Promise<void> {
  const siteId = await siteIdBySlug(db, input.site);
  const code = parse(localeSchema, input.code, 'language code');
  await withSiteContext(db, siteId, async (tx) => {
    const [exists] = await tx.select().from(siteLocales).where(eq(siteLocales.code, code));
    if (exists) throw new OperationError(`The language ${code} is already enabled.`);
    if (input.isDefault) await tx.update(siteLocales).set({ isDefault: false });
    const others = await tx.select().from(siteLocales);
    await tx.insert(siteLocales).values({
      siteId,
      code,
      name: input.name,
      isDefault: Boolean(input.isDefault),
      position: others.length,
    });
  });
  if (input.isDefault)
    await db.update(sites).set({ defaultLocale: code }).where(eq(sites.id, siteId));
}

export async function listSites(db: Database) {
  const rows = await db
    .select({ site: sites, domain: siteDomains })
    .from(sites)
    .leftJoin(siteDomains, eq(siteDomains.siteId, sites.id))
    .orderBy(asc(sites.slug), asc(siteDomains.host));
  const result = new Map<
    string,
    { id: string; slug: string; name: string; status: string; domains: string[] }
  >();
  for (const { site, domain } of rows) {
    const entry = result.get(site.id) ?? {
      id: site.id,
      slug: site.slug,
      name: site.name,
      status: site.status,
      domains: [],
    };
    if (domain) entry.domains.push(domain.isPrimary ? `${domain.host} (primary)` : domain.host);
    result.set(site.id, entry);
  }
  return [...result.values()];
}

export interface UpdateSiteInput {
  name?: string;
  /** New slug (used by the CLI and in backups). */
  slug?: string;
  /** New default language: must already be enabled on the site. */
  locale?: string;
  timezone?: string;
}

/** Changes a site's name, slug, default language or time zone (RF-SIT-03). */
export async function updateSite(
  db: Database,
  slug: string,
  input: UpdateSiteInput,
): Promise<void> {
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug));
  if (!site) throw new OperationError(`No site with slug "${slug}".`);
  const changes: Partial<typeof sites.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new OperationError('The site name cannot be empty.');
    changes.name = name;
  }
  if (input.slug !== undefined && input.slug !== slug) {
    if (!SLUG_RE.test(input.slug)) throw new OperationError(`Invalid site slug "${input.slug}".`);
    const [taken] = await db.select().from(sites).where(eq(sites.slug, input.slug));
    if (taken) throw new OperationError(`A site with slug "${input.slug}" already exists.`);
    changes.slug = input.slug;
  }
  if (input.timezone !== undefined) {
    if (!isTimeZone(input.timezone))
      throw new OperationError(`Unknown time zone "${input.timezone}".`);
    changes.timezone = input.timezone;
  }
  if (Object.keys(changes).length === 0 && input.locale === undefined) {
    throw new OperationError('Nothing to change: give --name, --slug, --locale or --timezone.');
  }
  await withSiteContext(db, site.id, async (tx) => {
    if (input.locale !== undefined) {
      const [enabled] = await tx
        .select()
        .from(siteLocales)
        .where(and(eq(siteLocales.siteId, site.id), eq(siteLocales.code, input.locale)));
      if (!enabled) {
        throw new OperationError(
          `The language "${input.locale}" is not enabled on this site: add it with site:locale:add.`,
        );
      }
      await tx
        .update(siteLocales)
        .set({ isDefault: sql`${siteLocales.code} = ${input.locale}` })
        .where(eq(siteLocales.siteId, site.id));
      changes.defaultLocale = input.locale;
    }
    if (Object.keys(changes).length > 0)
      await tx.update(sites).set(changes).where(eq(sites.id, site.id));
  });
  await notifySiteChanged(db, site.id);
}

/**
 * Archives a site, or brings it back (RF-SIT-03). An archived site keeps
 * its data but answers no request and runs no scheduled task.
 */
export async function archiveSite(db: Database, slug: string, restore = false): Promise<void> {
  const [site] = await db.select().from(sites).where(eq(sites.slug, slug));
  if (!site) throw new OperationError(`No site with slug "${slug}".`);
  if (restore ? site.status !== 'archived' : site.status === 'archived') {
    throw new OperationError(`The site "${slug}" is ${restore ? 'not' : 'already'} archived.`);
  }
  await db
    .update(sites)
    .set({ status: restore ? 'active' : 'archived' })
    .where(eq(sites.id, site.id));
  await notifySiteChanged(db, site.id);
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Running servers drop what they cached about the site. */
async function notifySiteChanged(db: Database, siteId: string): Promise<void> {
  const payload = JSON.stringify({ siteId, tags: ['site'], sites: true });
  await db.execute(sql`select pg_notify('cleitext_cache', ${payload})`);
}

/**
 * Turns maintenance mode on or off (RF-SIT-06). Running servers are told
 * through the page-cache channel, so the change applies immediately.
 */
export async function setSiteStatus(
  db: Database,
  slug: string,
  status: 'active' | 'maintenance',
): Promise<void> {
  const [site] = await db.update(sites).set({ status }).where(eq(sites.slug, slug)).returning();
  if (!site) throw new OperationError(`No site with slug "${slug}".`);
  await notifySiteChanged(db, site.id);
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string;
  superAdmin?: boolean;
  /** Site slug and role slug, to add the user as a member. */
  site?: string;
  role?: string;
}

export async function createUser(db: Database, input: CreateUserInput): Promise<string> {
  const email = parse(emailSchema, input.email, 'email');
  const password = parse(passwordSchema, input.password, 'password');
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new OperationError(`A user with email ${email} already exists.`);
  if (input.site && !input.role) throw new OperationError('Specify --role together with --site.');

  const [user] = await db
    .insert(users)
    .values({
      email,
      displayName: input.displayName ?? email.split('@')[0]!,
      passwordHash: await hash(password),
    })
    .returning();
  const userId = user!.id;
  if (input.superAdmin) await db.insert(superAdmins).values({ userId });
  if (input.site && input.role) await addMember(db, { userId, site: input.site, role: input.role });
  return userId;
}

export async function setPassword(db: Database, email: string, password: string): Promise<void> {
  const normalized = parse(emailSchema, email, 'email');
  const passwordHash = await hash(parse(passwordSchema, password, 'password'));
  const updated = await db
    .update(users)
    .set({ passwordHash, status: 'active' })
    .where(eq(users.email, normalized))
    .returning({ id: users.id });
  if (updated.length === 0) throw new OperationError(`No user with email ${normalized}.`);
}

export async function addMember(
  db: Database,
  input: { userId: string; site: string; role: string },
): Promise<void> {
  const siteId = await siteIdBySlug(db, input.site);
  const candidates = await db
    .select()
    .from(roles)
    .where(and(eq(roles.slug, input.role), or(isNull(roles.siteId), eq(roles.siteId, siteId))));
  const role = candidates.find((r) => r.siteId === siteId) ?? candidates[0];
  if (!role) throw new OperationError(`Unknown role "${input.role}".`);
  await withSiteContext(db, siteId, (tx) =>
    tx.insert(siteMembers).values({ siteId, userId: input.userId, roleId: role.id }),
  );
}

export async function hasSites(db: Database): Promise<boolean> {
  const rows = await db.select({ id: sites.id }).from(sites).limit(1);
  return rows.length > 0;
}

async function siteIdBySlug(db: Database, slug: string): Promise<string> {
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, slug));
  if (!site) throw new OperationError(`No site with slug "${slug}".`);
  return site.id;
}

async function assertHostFree(db: Database, host: string): Promise<void> {
  const [taken] = await db.select().from(siteDomains).where(eq(siteDomains.host, host));
  if (taken) throw new OperationError(`The domain ${host} is already assigned to a site.`);
}

export function normalizeHost(value: string): string {
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  if (!HOST_RE.test(host) && !IPV4_RE.test(host)) {
    throw new OperationError(`Invalid domain "${value}". Use a host name without scheme or port.`);
  }
  return host;
}

function parse<T>(
  schema: {
    safeParse(
      v: unknown,
    ): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
  },
  value: unknown,
  label: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new OperationError(
      `Invalid ${label}: ${result.error.issues[0]?.message ?? 'invalid value'}`,
    );
  }
  return result.data;
}
