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
import { effectiveCapabilities, type InviteUserRequest, type MemberView } from '@cleitext/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { ClientInfo } from '../auth/auth.service.js';
import { UserTokenService } from '../auth/session.service.js';
import type { AuthContext } from '../common/request-context.js';
import { hashPassword } from '../auth/crypto.js';
import { assertPasswordNotBreached } from '../auth/password-policy.js';
import { DATABASE } from '../database/database.module.js';
import { avatarUrl } from '../profile/avatar.js';
import { MailService } from '../mail/mail.service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type RoleRow = typeof roles.$inferSelect;

/** Site members, invitations and role assignment. */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly tokens: UserTokenService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
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
            `Sign in at ${client.origin}/admin/ with this email address and the password you were given.`,
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
            `${client.origin}/admin/accept-invite?token=${token}`,
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
            `Sign in with your existing account: ${client.origin}/admin/`,
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
