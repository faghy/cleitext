import {
  findLogin,
  newId,
  roles,
  siteMembers,
  sites,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import {
  ADMIN_PATH,
  effectiveCapabilities,
  type InviteUserRequest,
  type MemberAccountView,
  type MemberView,
  type UpdateMemberAccountRequest,
} from '@cleitext/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { ClientInfo } from '../auth/auth.service.js';
import { SessionService, UserTokenService } from '../auth/session.service.js';
import type { AuthContext } from '../common/request-context.js';
import { hashPassword } from '../auth/crypto.js';
import { assertPasswordNotBreached } from '../auth/password-policy.js';
import { DATABASE } from '../database/database.module.js';
import { avatarUrl } from '../profile/avatar.js';
import { MailService } from '../mail/mail.service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const LOCK_MESSAGES = {
  self: 'Change your own account from your profile.',
  role: 'This person has permissions you do not have.',
  shared:
    'This person also belongs to other sites: only they or a super admin can change their account.',
  super_admin: 'Only super admins can change the account of a super admin.',
} as const;

type RoleRow = typeof roles.$inferSelect;

/** Site members, invitations and role assignment. */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly tokens: UserTokenService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly sessions: SessionService,
  ) {}

  async listMembers(siteId: string, auth: AuthContext): Promise<MemberView[]> {
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const rows = await tx
        .select({ user: users, role: { slug: roles.slug, name: roles.name } })
        .from(siteMembers)
        .innerJoin(users, eq(users.id, siteMembers.userId))
        .innerJoin(roles, eq(roles.id, siteMembers.roleId))
        .where(eq(siteMembers.siteId, siteId))
        .orderBy(asc(users.displayName));
      return rows.map(({ user, role }) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: avatarUrl(user.avatarKey),
        status: user.status as MemberView['status'],
        role,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      }));
    });
  }

  /**
   * Invites someone to the site (RF-USR-03). New addresses get an account in
   * the "invited" state and a 7-day link; existing users are added directly.
   */
  async invite(
    siteId: string,
    auth: AuthContext,
    input: Required<Pick<InviteUserRequest, 'displayName' | 'role'>> & {
      email: string;
      password?: string | undefined;
      sendEmail?: boolean | undefined;
    },
    client: ClientInfo,
  ): Promise<MemberView> {
    if (input.password) assertPasswordNotBreached(input.password);
    const existing = await findLogin(this.database.db, input.email);
    // A password is only set for new accounts: never for someone else's account.
    const passwordHash =
      input.password && (!existing || existing.status === 'invited')
        ? await hashPassword(input.password)
        : null;
    const sendEmail = input.sendEmail !== false;

    const result = await withContext(
      this.database.db,
      { siteId, userId: auth.userId },
      async (tx) => {
        const role = await this.assignableRole(tx, siteId, auth, input.role);
        let userId = existing?.userId;

        if (userId) {
          const [already] = await tx
            .select()
            .from(siteMembers)
            .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)));
          // An invitation never accepted can be completed with a password.
          if (already && !(passwordHash && existing?.status === 'invited')) {
            throw new ConflictException(
              'This person is already a member of the site: change their role from the list.',
            );
          }
          if (already) {
            await tx
              .update(siteMembers)
              .set({ roleId: role.id })
              .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)));
          }
        } else {
          // No RETURNING: the new user is not visible yet under RLS (not a member).
          userId = newId();
          await tx.insert(users).values({
            id: userId,
            email: input.email,
            displayName: input.displayName,
            status: passwordHash ? 'active' : 'invited',
            passwordHash,
          });
        }

        await tx
          .insert(siteMembers)
          .values({ siteId, userId, roleId: role.id })
          .onConflictDoNothing();
        await this.audit.record(tx, {
          siteId,
          userId: auth.userId,
          action: passwordHash ? 'user.created' : 'user.invited',
          targetType: 'user',
          targetId: userId,
          meta: { email: input.email, role: role.slug },
          ip: client.ip,
        });
        const [site] = await tx
          .select({ name: sites.name })
          .from(sites)
          .where(eq(sites.id, siteId));
        return { userId, role, siteName: site?.name ?? 'Cleitext' };
      },
    );

    const needsAccount = !existing || existing.status === 'invited';
    if (passwordHash && existing?.status === 'invited') {
      await withContext(this.database.db, { siteId, userId: auth.userId }, (tx) =>
        tx.update(users).set({ passwordHash, status: 'active' }).where(eq(users.id, result.userId)),
      );
    }
    if (!sendEmail) {
      // Nothing to send: the administrator shares the access details.
    } else if (passwordHash) {
      await this.mail.send(
        {
          to: input.email,
          subject: `Your account on ${result.siteName}`,
          text: [
            `${auth.displayName} created an account for you on ${result.siteName} (${result.role.name}).`,
            '',
            `Sign in at ${client.origin}${ADMIN_PATH}/ with this email address and the password you were given.`,
            'You can change it from your profile.',
          ].join('\n'),
        },
        siteId,
      );
    } else if (needsAccount) {
      const token = await this.tokens.issue({
        kind: 'invitation',
        userId: result.userId,
        ttlMs: INVITATION_TTL_MS,
        meta: { siteId },
      });
      await this.mail.send(
        {
          to: input.email,
          subject: `You have been invited to ${result.siteName}`,
          text: [
            `${auth.displayName} invited you to join ${result.siteName} as ${result.role.name}.`,
            '',
            'To accept and choose your password, open this link within 7 days:',
            `${client.origin}${ADMIN_PATH}/accept-invite?token=${token}`,
          ].join('\n'),
        },
        siteId,
      );
    } else {
      await this.mail.send(
        {
          to: input.email,
          subject: `You have been added to ${result.siteName}`,
          text: [
            `${auth.displayName} added you to ${result.siteName} as ${result.role.name}.`,
            '',
            `Sign in with your existing account: ${client.origin}${ADMIN_PATH}/`,
          ].join('\n'),
        },
        siteId,
      );
    }

    const members = await this.listMembers(siteId, auth);
    return members.find((m) => m.id === result.userId)!;
  }

  /** Changes a member's role (`promote_users`). */
  async changeRole(
    siteId: string,
    auth: AuthContext,
    memberId: string,
    roleSlug: string,
    client: ClientInfo,
  ): Promise<MemberView> {
    if (memberId === auth.userId) {
      throw new ForbiddenException('You cannot change your own role.');
    }
    await withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const current = await this.memberRole(tx, siteId, memberId);
      this.assertCanManage(auth, current);
      const role = await this.assignableRole(tx, siteId, auth, roleSlug);
      await tx
        .update(siteMembers)
        .set({ roleId: role.id })
        .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, memberId)));
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'member.role.changed',
        targetType: 'user',
        targetId: memberId,
        meta: { from: current.slug, to: role.slug },
        ip: client.ip,
      });
    });
    const members = await this.listMembers(siteId, auth);
    return members.find((m) => m.id === memberId)!;
  }

  /**
   * A member's account, for administrators (RF-USR-12), with whether they
   * may change it here: accounts are shared by every site they belong to.
   */
  async account(siteId: string, auth: AuthContext, memberId: string): Promise<MemberAccountView> {
    const member = (await this.listMembers(siteId, auth)).find((m) => m.id === memberId);
    if (!member) throw new NotFoundException('This person is not a member of the site.');
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, memberId));
      return {
        ...member,
        locale: user!.locale,
        bio: user!.bio,
        website: user!.website ?? '',
        slug: user!.slug ?? '',
        hasPassword: Boolean(user!.passwordHash),
        twoFactor: Boolean(user!.totpConfirmedAt),
        locked: await this.accountLock(tx, siteId, auth, memberId),
      };
    });
  }

  /**
   * Changes a member's name, email, profile or password (RF-USR-12), as
   * WordPress's "Edit User". Only for accounts of this site alone, with no
   * more permissions than the administrator's; super admins edit any.
   * A new password ends the person's sessions; the person is told by email.
   */
  async updateAccount(
    siteId: string,
    auth: AuthContext,
    memberId: string,
    input: UpdateMemberAccountRequest,
    client: ClientInfo,
  ): Promise<MemberAccountView> {
    if (input.password) assertPasswordNotBreached(input.password);
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    // Before the transaction: the lookup takes its own connection.
    const taken = input.email ? await findLogin(this.database.db, input.email) : null;
    if (taken && taken.userId !== memberId) {
      throw new ConflictException('Another account uses this email address.');
    }
    const before = await withContext(
      this.database.db,
      { siteId, userId: auth.userId },
      async (tx) => {
        const locked = await this.accountLock(tx, siteId, auth, memberId);
        if (locked) throw new ForbiddenException(LOCK_MESSAGES[locked]);
        const [user] = await tx.select().from(users).where(eq(users.id, memberId));
        if (!user) throw new NotFoundException('This person is not a member of the site.');
        await tx
          .update(users)
          .set({
            ...(input.displayName ? { displayName: input.displayName } : {}),
            ...(input.email ? { email: input.email } : {}),
            ...(input.locale ? { locale: input.locale } : {}),
            ...(input.bio !== undefined ? { bio: input.bio } : {}),
            ...(input.website !== undefined ? { website: input.website || null } : {}),
            ...(input.slug ? { slug: input.slug } : {}),
            // An account invited and given a password can sign in.
            ...(passwordHash
              ? { passwordHash, ...(user.status === 'invited' ? { status: 'active' } : {}) }
              : {}),
          })
          .where(eq(users.id, memberId))
          .catch((error: unknown) => {
            const cause = (error as { cause?: { constraint_name?: string } }).cause;
            if (cause?.constraint_name?.includes('slug'))
              throw new ConflictException('That author page address is taken: choose another one.');
            if (cause?.constraint_name?.includes('email'))
              throw new ConflictException('Another account uses this email address.');
            throw error;
          });
        const changed = [
          ...(input.displayName && input.displayName !== user.displayName ? ['name'] : []),
          ...(input.email && input.email.toLowerCase() !== user.email.toLowerCase()
            ? ['email']
            : []),
          ...(passwordHash ? ['password'] : []),
        ];
        await this.audit.record(tx, {
          siteId,
          userId: auth.userId,
          action: passwordHash ? 'member.password.changed' : 'member.account.changed',
          targetType: 'user',
          targetId: memberId,
          meta: { fields: Object.keys(input).filter((k) => k !== 'password' && k !== 'notify') },
          ip: client.ip,
        });
        const [site] = await tx
          .select({ name: sites.name })
          .from(sites)
          .where(eq(sites.id, siteId));
        return { user, changed, siteName: site?.name ?? '' };
      },
    );
    // Signed in elsewhere with the old password: those sessions end.
    if (passwordHash) await this.sessions.revokeAll(memberId);
    if (input.notify !== false && before.changed.some((c) => c !== 'name')) {
      const what = before.changed
        .filter((c) => c !== 'name')
        .map((c) => (c === 'email' ? `your email address (now ${input.email})` : 'your password'))
        .join(' and ');
      const text = [
        `${auth.displayName} changed ${what} on ${before.siteName}.`,
        '',
        ...(passwordHash
          ? ['You have been signed out: sign in again with the new password you were given.']
          : []),
        `Sign in at ${client.origin}${ADMIN_PATH}/`,
        '',
        'If you did not expect this, contact the site administrators.',
      ].join('\n');
      // The old address hears about a change of address too.
      const recipients = new Set([before.user.email, ...(input.email ? [input.email] : [])]);
      for (const to of recipients) {
        await this.mail.send({ to, subject: `Your account on ${before.siteName}`, text }, siteId);
      }
    }
    return this.account(siteId, auth, memberId);
  }

  /** Why an administrator may not edit an account, or null. */
  private async accountLock(
    tx: SiteTransaction,
    siteId: string,
    auth: AuthContext,
    memberId: string,
  ): Promise<MemberAccountView['locked']> {
    if (memberId === auth.userId) return 'self';
    const role = await this.memberRole(tx, siteId, memberId);
    if (auth.isSuperAdmin) return null;
    const granted = effectiveCapabilities(role.capabilities, false);
    if (granted.some((c) => !auth.capabilities.includes(c))) return 'role';
    const [reach] = (await tx.execute(
      sql`select * from cleitext_app_account_reach(${memberId}::uuid)`,
    )) as unknown as { other_sites: number; is_super_admin: boolean }[];
    if (reach?.is_super_admin) return 'super_admin';
    if ((reach?.other_sites ?? 0) > 0) return 'shared';
    return null;
  }

  /** Removes a member from the site; the global account is kept. */
  async remove(siteId: string, auth: AuthContext, memberId: string, client: ClientInfo) {
    if (memberId === auth.userId) {
      throw new ForbiddenException('You cannot remove yourself from the site.');
    }
    await withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const current = await this.memberRole(tx, siteId, memberId);
      this.assertCanManage(auth, current);
      await tx
        .delete(siteMembers)
        .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, memberId)));
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'member.removed',
        targetType: 'user',
        targetId: memberId,
        ip: client.ip,
      });
    });
  }

  /** A role the current user may assign: no capabilities beyond their own. */
  private async assignableRole(
    tx: SiteTransaction,
    siteId: string,
    auth: AuthContext,
    slug: string,
  ): Promise<RoleRow> {
    const candidates = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.slug, slug), or(isNull(roles.siteId), eq(roles.siteId, siteId))));
    // A site-specific role overrides the system role with the same slug.
    const role = candidates.find((r) => r.siteId === siteId) ?? candidates[0];
    if (!role) throw new BadRequestException(`Unknown role "${slug}".`);
    this.assertCanManage(auth, role);
    return role;
  }

  private async memberRole(tx: SiteTransaction, siteId: string, memberId: string) {
    const [row] = await tx
      .select({ role: roles })
      .from(siteMembers)
      .innerJoin(roles, eq(roles.id, siteMembers.roleId))
      .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, memberId)));
    if (!row) throw new NotFoundException('This person is not a member of the site.');
    return row.role;
  }

  /** Non super admins cannot act on roles with capabilities they lack. */
  private assertCanManage(auth: AuthContext, role: RoleRow): void {
    if (auth.isSuperAdmin) return;
    const granted = effectiveCapabilities(role.capabilities, false);
    if (granted.some((c) => !auth.capabilities.includes(c))) {
      throw new ForbiddenException('This role has permissions you do not have.');
    }
  }
}
