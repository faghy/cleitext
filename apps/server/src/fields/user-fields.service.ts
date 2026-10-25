import {
  roles,
  siteMembers,
  userFields,
  users,
  withContext,
  type DatabaseClient,
} from '@cleitext/db';
import type { FieldValues, UserFieldsView } from '@cleitext/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { mergeFieldValues } from '../content/terms.service.js';
import { FieldGroupsService } from './field-groups.service.js';

/**
 * User fields (plugin API 1.47): values of the site's field groups for
 * people (rules `userRole`, `userForm`), kept per site in `user_fields`.
 */
@Injectable()
export class UserFieldsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly fieldGroups: FieldGroupsService,
  ) {}

  /** A member's role slug on the site; null for someone who is not a member. */
  private async memberRole(siteId: string, userId: string): Promise<string | null | undefined> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const [row] = await tx
        .select({ slug: roles.slug })
        .from(siteMembers)
        .innerJoin(roles, eq(roles.id, siteMembers.roleId))
        .where(eq(siteMembers.userId, userId));
      return row?.slug ?? null;
    });
  }

  /** Stored values (every group), `{}` when there are none. */
  async values(siteId: string, userId: string): Promise<FieldValues> {
    const [row] = await withContext(this.database.db, { siteId }, (tx) =>
      tx.select().from(userFields).where(eq(userFields.userId, userId)),
    );
    return (row?.fields as FieldValues | undefined) ?? {};
  }

  private async screen(
    siteId: string,
    userId: string,
    form: 'edit' | 'profile',
    auth: AuthContext | null,
    requireMember: boolean,
  ) {
    const role = await this.memberRole(siteId, userId);
    if (requireMember && role === null) {
      throw new NotFoundException('This person is not a member of the site.');
    }
    return {
      object: 'user' as const,
      userRole: role ?? null,
      userForm: form,
      currentUserRole: auth?.role?.slug ?? null,
    };
  }

  /** The person's values and the groups shown on the form (`edit`: by an administrator). */
  async get(
    siteId: string,
    auth: AuthContext | null,
    userId: string,
    form: 'edit' | 'profile',
  ): Promise<UserFieldsView> {
    const screen = await this.screen(siteId, userId, form, auth, form === 'edit');
    const groups = (await this.fieldGroups.matching(siteId, screen)).filter(
      (g) => g.storage !== 'document',
    );
    return { values: await this.values(siteId, userId), groups };
  }

  /**
   * Saves new values of some groups (the others keep theirs), checked
   * against the groups shown on the form; required fields must be filled.
   */
  async save(
    siteId: string,
    auth: AuthContext | null,
    userId: string,
    changes: FieldValues,
    form: 'edit' | 'profile',
  ): Promise<UserFieldsView> {
    const screen = await this.screen(siteId, userId, form, auth, form === 'edit');
    const current = await this.values(siteId, userId);
    const result = await this.fieldGroups.check(
      siteId,
      [],
      mergeFieldValues(current, changes),
      screen,
    );
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Some fields are not valid.',
        errors: result.errors,
      });
    }
    await withContext(
      this.database.db,
      { siteId, ...(auth ? { userId: auth.userId } : {}) },
      (tx) =>
        tx
          .insert(userFields)
          .values({ siteId, userId, fields: result.values })
          .onConflictDoUpdate({
            target: [userFields.siteId, userFields.userId],
            set: { fields: result.values, updatedAt: sql`now()` },
          }),
    );
    return { values: result.values, groups: result.groups };
  }

  /** The values of an address's account, for a privacy export (null without any). */
  async forEmail(siteId: string, email: string): Promise<FieldValues | null> {
    const rows = await withContext(this.database.db, { siteId }, (tx) =>
      tx
        .select({ fields: userFields.fields })
        .from(userFields)
        .innerJoin(users, eq(users.id, userFields.userId))
        .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`),
    );
    const values = rows[0]?.fields as FieldValues | undefined;
    return values && Object.keys(values).length > 0 ? values : null;
  }

  /** Erases an address's user field values (a privacy request); how many sets were removed. */
  async eraseEmail(siteId: string, email: string): Promise<number> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const removed = await tx
        .delete(userFields)
        .where(
          sql`${userFields.userId} in (select ${users.id} from ${users} where lower(${users.email}) = ${email.trim().toLowerCase()})`,
        )
        .returning({ userId: userFields.userId });
      return removed.length;
    });
  }
}
