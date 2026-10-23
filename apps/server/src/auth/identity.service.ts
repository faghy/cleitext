import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  listMySites,
  roles,
  settings,
  siteMembers,
  sites,
  superAdmins,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { coreSettingsSchema, effectiveCapabilities, type MeResponse } from '@cleitext/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { LanguagesService } from '../content/languages.service.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { DATABASE } from '../database/database.module.js';
import { avatarUrl } from '../profile/avatar.js';
import { appRoot } from '../install/token.js';

/** Loads who a user is on a given site: profile, role and capabilities. */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
    private readonly languages: LanguagesService,
  ) {}

  /**
   * Auth context for a user on a site, or null when the user is inactive or
   * has no access to the site (neither member nor super admin).
   */
  async load(siteId: string, userId: string, sessionId: string): Promise<AuthContext | null> {
    const active = await this.activePlugins(siteId);
    return withContext(this.database.db, { siteId, userId }, (tx) =>
      this.loadInTx(tx, siteId, userId, sessionId, active),
    );
  }

  /** Whether the installation has one site only, refreshed every minute. */
  private single: { value: boolean; at: number } | null = null;

  private async singleSite(): Promise<boolean> {
    if (this.single && Date.now() - this.single.at < 60_000) return this.single.value;
    // `sites` shows the application role only the current site: a function counts them all.
    const [row] = await this.database.db.execute<{ n: number }>(
      sql`select cleitext_app_site_count() as n`,
    );
    this.single = { value: Number(row?.n ?? 0) === 1, at: Date.now() };
    return this.single.value;
  }

  /**
   * The plugins active on the site, for `loadInTx`: read them before opening
   * the transaction (with the number of sites, read there too).
   */
  async activePlugins(siteId: string): Promise<Set<string>> {
    await this.singleSite().catch(() => false);
    return this.plugins.activeSlugs(siteId);
  }

  /** `active` comes from `activePlugins`: reading it here would need a second connection. */
  async loadInTx(
    tx: SiteTransaction,
    siteId: string,
    userId: string,
    sessionId: string,
    active: Set<string>,
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
      avatarUrl: avatarUrl(user.avatarKey),
      twoFactor: { enabled: Boolean(user.totpConfirmedAt) },
      isSuperAdmin,
      role: membership ? { id: membership.id, slug: membership.slug, name: membership.name } : null,
      capabilities: [
        ...effectiveCapabilities(membership?.capabilities ?? [], isSuperAdmin),
        // As in WordPress: on an installation with one site, its administrators
        // install plugins and themes; with several sites only super admins do.
        ...(!isSuperAdmin && membership?.slug === 'administrator' && this.single?.value
          ? (['manage_plugins'] as const)
          : []),
        // Capabilities defined by the plugins active on the site.
        ...this.plugins.capabilitiesFor(
          active,
          membership?.slug ?? null,
          isSuperAdmin,
          membership?.capabilities ?? [],
        ),
      ],
    };
  }

  /** Payload of `GET /auth/me` (and of a successful login). */
  async me(siteId: string, auth: AuthContext): Promise<MeResponse> {
    const { site, timezone, defaultEditors, mySites } = await withContext(
      this.database.db,
      { siteId, userId: auth.userId },
      async (tx) => ({
        site: (await tx.select().from(sites).where(eq(sites.id, siteId)))[0],
        timezone: (
          await tx
            .select({ value: settings.value })
            .from(settings)
            .where(and(eq(settings.namespace, 'core'), eq(settings.key, 'timezone')))
        )[0],
        defaultEditors: (
          await tx
            .select({ value: settings.value })
            .from(settings)
            .where(and(eq(settings.namespace, 'core'), eq(settings.key, 'defaultEditors')))
        )[0],
        mySites: await listMySites(tx),
      }),
    );
    // After the transaction: a language plugin may need its own connection.
    const locales = (await this.languages.locales(siteId, site?.defaultLocale ?? 'en')).map(
      ({ code, name, isDefault }) => ({ code, name, isDefault }),
    );
    return {
      user: {
        id: auth.userId,
        email: auth.email,
        displayName: auth.displayName,
        locale: auth.locale,
        isSuperAdmin: auth.isSuperAdmin,
        avatarUrl: auth.avatarUrl,
        twoFactorEnabled: auth.twoFactor.enabled,
      },
      site: {
        id: siteId,
        name: site?.name ?? '',
        slug: site?.slug ?? '',
        defaultLocale: site?.defaultLocale ?? 'en',
        timezone: typeof timezone?.value === 'string' ? timezone.value : (site?.timezone ?? 'UTC'),
        locales,
        defaultEditors: editorsByType(defaultEditors?.value),
      },
      role: auth.role ? { slug: auth.role.slug, name: auth.role.name } : null,
      capabilities: auth.capabilities,
      sites: mySites,
      version: appVersion(),
    };
  }
}

let version: string | undefined;
/** The running Cleitext version (the root package.json), read once. */
function appVersion(): string {
  if (version === undefined) {
    try {
      const pkg = JSON.parse(readFileSync(join(appRoot(), 'package.json'), 'utf8')) as {
        version?: string;
      };
      version = pkg.version ?? 'dev';
    } catch {
      version = 'dev';
    }
  }
  return version;
}

/** The `defaultEditors` setting as stored, keeping only valid pairs. */
function editorsByType(value: unknown): Record<string, string> {
  const parsed = coreSettingsSchema.shape.defaultEditors.safeParse(value);
  return parsed.success ? parsed.data : {};
}
