import {
  listMySites,
  roles,
  settings,
  siteLocales,
  siteMembers,
  sites,
  superAdmins,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { effectiveCapabilities, type MeResponse } from '@cleitext/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { DATABASE } from '../database/database.module.js';

/** Loads who a user is on a given site: profile, role and capabilities. */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
  ) {}

  /**
   * Auth context for a user on a site, or null when the user is inactive or
   * has no access to the site (neither member nor super admin).
   */
  async load(siteId: string, userId: string, sessionId: string): Promise<AuthContext | null> {
    return withContext(this.database.db, { siteId, userId }, (tx) =>
      this.loadInTx(tx, siteId, userId, sessionId),
    );
  }

  async loadInTx(
    tx: SiteTransaction,
    siteId: string,
    userId: string,
    sessionId: string,
  ): Promise<AuthContext | null> {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user || user.status !== 'active') return null;

    const [admin] = await tx.select().from(superAdmins).where(eq(superAdmins.userId, userId));
    const [membership] = await tx
      .select({
        id: roles.id,
        slug: roles.slug,
        name: roles.name,
        capabilities: roles.capabilities,
      })
      .from(siteMembers)
      .innerJoin(roles, eq(roles.id, siteMembers.roleId))
      .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)));

    const isSuperAdmin = Boolean(admin);
    if (!isSuperAdmin && !membership) return null;

    return {
      userId,
      sessionId,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      isSuperAdmin,
      role: membership ? { id: membership.id, slug: membership.slug, name: membership.name } : null,
      capabilities: [
        ...effectiveCapabilities(membership?.capabilities ?? [], isSuperAdmin),
        // Capabilities defined by the plugins active on the site.
        ...this.plugins.capabilitiesFor(
          await this.plugins.activeSlugs(siteId),
          membership?.slug ?? null,
          isSuperAdmin,
        ),
      ],
    };
  }

  /** Payload of `GET /auth/me` (and of a successful login). */
  async me(siteId: string, auth: AuthContext): Promise<MeResponse> {
    return withContext(this.database.db, { siteId, userId: auth.userId }, async (tx) => {
      const [site] = await tx.select().from(sites).where(eq(sites.id, siteId));
      const locales = await tx
        .select({
          code: siteLocales.code,
          name: siteLocales.name,
          isDefault: siteLocales.isDefault,
        })
        .from(siteLocales)
        .orderBy(asc(siteLocales.position), asc(siteLocales.code));
      const [timezone] = await tx
        .select({ value: settings.value })
        .from(settings)
        .where(and(eq(settings.namespace, 'core'), eq(settings.key, 'timezone')));
      return {
        user: {
          id: auth.userId,
          email: auth.email,
          displayName: auth.displayName,
          locale: auth.locale,
          isSuperAdmin: auth.isSuperAdmin,
        },
        site: {
          id: siteId,
          name: site?.name ?? '',
          slug: site?.slug ?? '',
          defaultLocale: site?.defaultLocale ?? 'en',
          timezone:
            typeof timezone?.value === 'string' ? timezone.value : (site?.timezone ?? 'UTC'),
          locales,
        },
        role: auth.role ? { slug: auth.role.slug, name: auth.role.name } : null,
        capabilities: auth.capabilities,
        sites: await listMySites(tx),
      };
    });
  }
}
