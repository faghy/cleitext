/**
 * Accounts of the CLI: `user:set-role` gives a member another role on a
 * site, `user:set-locale` the language of accounts, e.g. after a WordPress
 * site moved to Cleitext (docs/DEPLOYMENT.md, "Roles and language of
 * migrated accounts"), `user:set-username` the name an account signs in
 * with besides its email.
 *
 * The rule of the API (UsersService.changeRole) applies: any role of the
 * site, its own ones included; whoever runs the CLI controls the
 * installation, as a super admin does, so no capability limit. The change
 * is written in the site's activity log as the API writes it.
 */
import {
  auditLog,
  roles,
  siteMembers,
  sites,
  users,
  withSiteContext,
  type Database,
} from '@cleitext/db';
import { emailSchema, localeSchema, usernameSchema } from '@cleitext/shared';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { OperationError } from './operations.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SetRoleInput {
  /** Site slug or id. */
  site: string;
  email: string;
  /** Role slug: a built-in one or one of the site's. */
  role: string;
  /** Add the person to the site when not a member yet. */
  add?: boolean | undefined;
}

export interface SetRoleResult {
  site: string;
  email: string;
  userId: string;
  /** The previous role, null when the person was added. */
  from: string | null;
  to: string;
  changed: boolean;
  added: boolean;
  /** The site has no administrator any more (only super admins can manage it). */
  noAdministrator: boolean;
}

/** Sets a member's role on a site (`user:set-role`). */
export async function setRole(db: Database, input: SetRoleInput): Promise<SetRoleResult> {
  const site = await findSite(db, input.site);
  const user = await findUserByEmail(db, input.email);
  const slug = input.role.trim();
  return withSiteContext(db, site.id, async (tx) => {
    const candidates = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.slug, slug), or(isNull(roles.siteId), eq(roles.siteId, site.id))));
    // A site-specific role overrides the built-in one with the same slug, as in the API.
    const role = candidates.find((r) => r.siteId === site.id) ?? candidates[0];
    if (!role) {
      const known = await tx
        .select({ slug: roles.slug })
        .from(roles)
        .where(or(isNull(roles.siteId), eq(roles.siteId, site.id)));
      throw new OperationError(
        `Unknown role "${slug}" on ${site.slug}. Roles: ${[...new Set(known.map((r) => r.slug))].sort().join(', ')}.`,
        'unknown_role',
      );
    }
    const [member] = await tx
      .select({ role: roles })
      .from(siteMembers)
      .innerJoin(roles, eq(roles.id, siteMembers.roleId))
      .where(and(eq(siteMembers.siteId, site.id), eq(siteMembers.userId, user.id)));
    if (!member && !input.add) {
      throw new OperationError(
        `${user.email} is not a member of ${site.slug}: add --add to make them one.`,
        'not_member',
      );
    }
    const base = { site: site.slug, email: user.email, userId: user.id, to: role.slug };
    if (member && member.role.id === role.id) {
      return {
        ...base,
        from: member.role.slug,
        changed: false,
        added: false,
        noAdministrator: false,
      };
    }
    if (member) {
      await tx
        .update(siteMembers)
        .set({ roleId: role.id })
        .where(and(eq(siteMembers.siteId, site.id), eq(siteMembers.userId, user.id)));
    } else {
      await tx.insert(siteMembers).values({ siteId: site.id, userId: user.id, roleId: role.id });
    }
    await tx.insert(auditLog).values({
      siteId: site.id,
      userId: null,
      action: 'member.role.changed',
      targetType: 'user',
      targetId: user.id,
      meta: { from: member?.role.slug ?? null, to: role.slug, via: 'cli' },
      ip: null,
    });
    const admins = await tx
      .select({ userId: siteMembers.userId })
      .from(siteMembers)
      .innerJoin(roles, eq(roles.id, siteMembers.roleId))
      .where(and(eq(siteMembers.siteId, site.id), eq(roles.slug, 'administrator')));
    return {
      ...base,
      from: member?.role.slug ?? null,
      changed: true,
      added: !member,
      noAdministrator: admins.length === 0,
    };
  });
}

export interface SetLocaleInput {
  locale: string;
  /** One account… */
  email?: string | undefined;
  /** …or every member of a site (`--site <slug> --all`). */
  site?: string | undefined;
  all?: boolean | undefined;
}

export interface SetLocaleResult {
  locale: string;
  site: string | null;
  /** Accounts whose language changed, with the previous one. */
  changed: { email: string; from: string }[];
  /** Accounts that already had it. */
  unchanged: number;
}

/** Sets the language of one account, or of every member of a site (`user:set-locale`). */
export async function setLocale(db: Database, input: SetLocaleInput): Promise<SetLocaleResult> {
  const parsed = localeSchema.safeParse(input.locale?.trim());
  if (!parsed.success) {
    throw new OperationError(
      `Invalid locale "${input.locale}": a language code such as it, en or pt-BR.`,
      'invalid_option',
    );
  }
  const locale = parsed.data;
  if (input.email && (input.site || input.all)) {
    throw new OperationError('Give either --email or --site with --all.', 'invalid_option');
  }
  let targets: { id: string; email: string; locale: string }[];
  let siteSlug: string | null = null;
  if (input.email) {
    const user = await findUserByEmail(db, input.email);
    targets = [user];
  } else if (input.site && input.all) {
    const site = await findSite(db, input.site);
    siteSlug = site.slug;
    const members = await withSiteContext(db, site.id, (tx) =>
      tx
        .select({ userId: siteMembers.userId })
        .from(siteMembers)
        .where(eq(siteMembers.siteId, site.id)),
    );
    targets = members.length
      ? await db
          .select({ id: users.id, email: users.email, locale: users.locale })
          .from(users)
          .where(
            inArray(
              users.id,
              members.map((m) => m.userId),
            ),
          )
      : [];
  } else {
    throw new OperationError(
      'Give --email <email>, or --site <slug> --all for every member of a site.',
      'invalid_option',
    );
  }
  const changed = targets.filter((t) => t.locale !== locale);
  if (changed.length) {
    await db
      .update(users)
      .set({ locale })
      .where(
        inArray(
          users.id,
          changed.map((t) => t.id),
        ),
      );
  }
  return {
    locale,
    site: siteSlug,
    changed: changed
      .map((t) => ({ email: t.email, from: t.locale }))
      .sort((a, b) => a.email.localeCompare(b.email)),
    unchanged: targets.length - changed.length,
  };
}

export function setRoleText(result: SetRoleResult): string[] {
  const lines = [
    !result.changed
      ? `${result.email} is already ${result.to} on ${result.site}: nothing changed.`
      : result.added
        ? `${result.email} added to ${result.site} as ${result.to}.`
        : `${result.email} on ${result.site}: ${result.from} → ${result.to}.`,
  ];
  if (result.noAdministrator) {
    lines.push(
      `Warning: ${result.site} has no administrator now; only super admins can manage it.`,
    );
  }
  return lines;
}

export function setLocaleText(result: SetLocaleResult): string[] {
  return [
    ...result.changed.map((c) => `${c.email}: ${c.from} → ${result.locale}`),
    `${result.changed.length} account(s) now in ${result.locale}` +
      (result.unchanged ? `, ${result.unchanged} already were.` : '.'),
  ];
}

async function findSite(db: Database, ref: string): Promise<{ id: string; slug: string }> {
  const value = ref.trim();
  const [site] = await db
    .select({ id: sites.id, slug: sites.slug })
    .from(sites)
    .where(UUID_RE.test(value) ? eq(sites.id, value.toLowerCase()) : eq(sites.slug, value));
  if (!site) throw new OperationError(`No site "${value}".`, 'not_found');
  return site;
}

export interface SetUsernameResult {
  email: string;
  from: string | null;
  to: string | null;
}

/** Sets or removes ('') the username of an account (`user:set-username`). */
export async function setUsername(
  db: Database,
  input: { email: string; username: string },
): Promise<SetUsernameResult> {
  const user = await findUserByEmail(db, input.email);
  let to: string | null = null;
  if (input.username.trim() !== '') {
    const parsed = usernameSchema.safeParse(input.username);
    if (!parsed.success) {
      throw new OperationError(
        `Invalid username "${input.username}": ${parsed.error.issues[0]?.message ?? ''}`,
        'invalid_option',
      );
    }
    to = parsed.data;
    const [other] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.username, to));
    if (other && other.email !== user.email) {
      throw new OperationError(`The username "${to}" belongs to ${other.email}.`, 'conflict');
    }
  }
  const [before] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, user.id));
  await db.update(users).set({ username: to }).where(eq(users.id, user.id));
  return { email: user.email, from: before?.username ?? null, to };
}

export function setUsernameText(result: SetUsernameResult): string {
  return result.to
    ? `${result.email} signs in with "${result.to}" too.`
    : `${result.email} has no username now: only the email signs in.`;
}

async function findUserByEmail(db: Database, email: string) {
  const parsed = emailSchema.safeParse(email.trim());
  if (!parsed.success) {
    throw new OperationError(`Invalid email "${email}".`, 'invalid_option');
  }
  const [user] = await db
    .select({ id: users.id, email: users.email, locale: users.locale })
    .from(users)
    .where(eq(users.email, parsed.data));
  if (!user) throw new OperationError(`No user with email ${parsed.data}.`, 'not_found');
  return user;
}
