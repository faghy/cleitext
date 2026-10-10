import {
  newId,
  roles,
  siteMembers,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import {
  CAPABILITIES,
  DEFAULT_ROLE_SLUGS,
  labelText,
  SUPER_ADMIN_ONLY,
  type CapabilityCatalog,
  type RoleView,
} from '@cleitext/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, isNull, or } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { slugify } from '../content/slug.js';
import { DATABASE } from '../database/database.module.js';
import { PluginHost } from '../plugins/plugin-host.service.js';

type RoleRow = typeof roles.$inferSelect;

/**
 * Role management (RF-USR-06). The five WordPress-like system roles are
 * shared by every site and read-only; sites add their own roles. Nobody can
 * grant a capability they do not have.
 */
@Injectable()
export class RolesService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
    private readonly audit: AuditService,
  ) {}

  async list(siteId: string, auth: AuthContext): Promise<RoleView[]> {
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const rows = await tx
        .select()
        .from(roles)
        .where(or(isNull(roles.siteId), eq(roles.siteId, siteId)))
        .orderBy(asc(roles.name));
      const counts = await tx
        .select({ roleId: siteMembers.roleId, members: count() })
        .from(siteMembers)
        .where(eq(siteMembers.siteId, siteId))
        .groupBy(siteMembers.roleId);
      const byRole = new Map(counts.map((c) => [c.roleId, c.members]));
      return rows.map((role) => ({ ...toView(role), members: byRole.get(role.id) ?? 0 }));
    });
  }

  async catalog(siteId: string, locale: string): Promise<CapabilityCatalog> {
    return {
      core: CAPABILITIES.filter((c) => !SUPER_ADMIN_ONLY.includes(c)),
      plugins: this.plugins
        .capabilityCatalog(await this.plugins.activeSlugs(siteId))
        .map(({ name, plugin, label }) => ({
          name,
          plugin,
          label:
            typeof label === 'string' ? label : labelText(label as Record<string, string>, locale),
        })),
    };
  }

  async create(
    siteId: string,
    auth: AuthContext,
    input: { name: string; slug?: string | undefined; capabilities: string[] },
    ip: string,
  ): Promise<RoleView> {
    const capabilities = await this.validCapabilities(siteId, auth, input.capabilities);
    const slug = input.slug ?? slugify(input.name).replaceAll('-', '_');
    if (!slug) throw new BadRequestException('The name must contain letters or digits.');
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const [taken] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.slug, slug), or(isNull(roles.siteId), eq(roles.siteId, siteId))));
      if (taken || (DEFAULT_ROLE_SLUGS as readonly string[]).includes(slug)) {
        throw new ConflictException(`A role with the identifier "${slug}" already exists.`);
      }
      const [role] = await tx
        .insert(roles)
        .values({ id: newId(), siteId, slug, name: input.name.trim(), capabilities })
        .returning();
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'role.created',
        targetType: 'role',
        targetId: role!.id,
        meta: { slug, name: role!.name },
        ip,
      });
      return { ...toView(role!), members: 0 };
    });
  }

  async update(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: { name?: string | undefined; capabilities?: string[] | undefined },
    ip: string,
  ): Promise<RoleView> {
    const capabilities =
      input.capabilities === undefined
        ? undefined
        : await this.validCapabilities(siteId, auth, input.capabilities);
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const role = await this.siteRole(tx, siteId, id);
      this.assertCanManage(auth, role);
      const [updated] = await tx
        .update(roles)
        .set({
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(capabilities !== undefined ? { capabilities } : {}),
        })
        .where(eq(roles.id, id))
        .returning();
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'role.updated',
        targetType: 'role',
        targetId: id,
        meta: { slug: role.slug },
        ip,
      });
      return toView(updated!);
    });
  }

  async remove(siteId: string, auth: AuthContext, id: string, ip: string): Promise<void> {
    await withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const role = await this.siteRole(tx, siteId, id);
      this.assertCanManage(auth, role);
      const [members] = await tx
        .select({ n: count() })
        .from(siteMembers)
        .where(eq(siteMembers.roleId, id));
      if ((members?.n ?? 0) > 0) {
        throw new ConflictException('Give its members another role before deleting it.');
      }
      await tx.delete(roles).where(eq(roles.id, id));
      await this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'role.deleted',
        targetType: 'role',
        targetId: id,
        meta: { slug: role.slug, name: role.name },
        ip,
      });
    });
  }

  /** Known capabilities only, and only those the current user has. */
  private async validCapabilities(
    siteId: string,
    auth: AuthContext,
    wanted: string[],
  ): Promise<string[]> {
    const catalog = await this.catalog(siteId, 'en');
    const known = new Set([...catalog.core, ...catalog.plugins.map((p) => p.name)]);
    const unique = [...new Set(wanted)];
    const unknown = unique.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}.`);
    }
    if (!auth.isSuperAdmin && unique.some((c) => !auth.capabilities.includes(c))) {
      throw new ForbiddenException('You cannot grant permissions you do not have.');
    }
    // Every role can at least see the admin.
    return unique.includes('read') ? unique : ['read', ...unique];
  }

  private async siteRole(tx: SiteTransaction, siteId: string, id: string): Promise<RoleRow> {
    const [role] = await tx.select().from(roles).where(eq(roles.id, id));
    if (!role) throw new NotFoundException('Role not found.');
    if (role.siteId !== siteId) {
      throw new BadRequestException('Built-in roles cannot be changed: duplicate them instead.');
    }
    return role;
  }

  private assertCanManage(auth: AuthContext, role: RoleRow): void {
    if (auth.isSuperAdmin) return;
    if (role.capabilities.some((c) => !auth.capabilities.includes(c))) {
      throw new ForbiddenException('This role has permissions you do not have.');
    }
  }
}

function toView(role: RoleRow): RoleView {
  return {
    id: role.id,
    slug: role.slug,
    name: role.name,
    system: role.siteId === null,
    capabilities: role.capabilities,
  };
}
