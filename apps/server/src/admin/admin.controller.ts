import { readFileSync } from 'node:fs';
import {
  auditLog,
  contentTypes,
  entries,
  getMigrationStatus,
  media,
  revisions,
  settings,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import {
  listAuditQuerySchema,
  type AuditEntryView,
  type AuditListResponse,
  type DashboardView,
  type SystemStatusView,
} from '@cleitext/shared';
import { Controller, Delete, Get, HttpCode, Inject, Query } from '@nestjs/common';
import { and, count, desc, eq, inArray, like, lt, or, sql, sum } from 'drizzle-orm';
import { CurrentAuth, CurrentSite, RequireCapability } from '../common/decorators.js';
import { parseBody } from '../common/problem.js';
import type { AuthContext, SiteContext } from '../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { MailService } from '../mail/mail.service.js';
import { PLUGIN_NOTICES, PluginHost } from '../plugins/plugin-host.service.js';
import { PageCacheService } from '../public/page-cache.service.js';

/** Version of the release (root package.json, next to apps/). */
const VERSION = (() => {
  try {
    const file = new URL('../../../../package.json', import.meta.url);
    return (JSON.parse(readFileSync(file, 'utf8')) as { version?: string }).version ?? 'dev';
  } catch {
    return 'dev';
  }
})();

const LOG_CAPABILITY = 'manage_settings';

/** Dashboard, activity log and system status (RF-ADM-02, -06, -07). */
@Controller()
export class AdminController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly cache: PageCacheService,
    private readonly plugins: PluginHost,
    private readonly mail: MailService,
  ) {}

  private run<T>(site: SiteContext, auth: AuthContext, fn: (tx: SiteTransaction) => Promise<T>) {
    return withContext(this.database.db, { siteId: site.id, userId: auth.userId }, fn);
  }

  @Get('audit')
  @RequireCapability(LOG_CAPABILITY)
  audit(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
    @Query() query: Record<string, unknown>,
  ): Promise<AuditListResponse> {
    const input = parseBody(listAuditQuerySchema, query);
    return this.run(site, auth, async (tx) => {
      const conditions = [
        ...(input.action
          ? [or(eq(auditLog.action, input.action), like(auditLog.action, `${input.action}.%`))!]
          : []),
        ...(input.user ? [eq(auditLog.userId, input.user)] : []),
        ...(input.cursor ? [lt(auditLog.id, Number(input.cursor))] : []),
      ];
      const rows = await tx
        .select()
        .from(auditLog)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(auditLog.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: await auditViews(tx, page, true),
        nextCursor: rows.length > input.limit ? String(page.at(-1)!.id) : null,
      };
    });
  }

  @Get('dashboard')
  dashboard(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<DashboardView> {
    return this.run(site, auth, async (tx) => {
      const types = await tx.select().from(contentTypes);
      const active = await this.plugins.activeSlugs(site.id);
      const visible = types.filter(
        (t) => !t.source.startsWith('plugin:') || active.has(t.source.slice(7)),
      );
      const byStatus = await tx
        .select({ type: entries.typeSlug, status: entries.status, n: count() })
        .from(entries)
        .groupBy(entries.typeSlug, entries.status);
      const n = (type: string, status: string) =>
        Number(byStatus.find((r) => r.type === type && r.status === status)?.n ?? 0);
      const canEdit = auth.capabilities.includes('edit_entries');
      const drafts = canEdit
        ? await tx
            .select({
              id: entries.id,
              type: entries.typeSlug,
              title: revisions.title,
              updatedAt: entries.updatedAt,
            })
            .from(entries)
            .innerJoin(revisions, eq(revisions.id, entries.currentRevisionId))
            .where(
              and(eq(entries.authorId, auth.userId), inArray(entries.status, ['draft', 'pending'])),
            )
            .orderBy(desc(entries.updatedAt))
            .limit(5)
        : [];
      const published = await tx
        .select({
          id: entries.id,
          type: entries.typeSlug,
          title: entries.title,
          publishedAt: entries.publishedAt,
        })
        .from(entries)
        .where(eq(entries.status, 'published'))
        .orderBy(desc(entries.publishedAt))
        .limit(5);
      const canLog = auth.capabilities.includes(LOG_CAPABILITY);
      const activity = canLog
        ? await auditViews(
            tx,
            await tx.select().from(auditLog).orderBy(desc(auditLog.id)).limit(8),
            true,
          )
        : null;
      const warnings: string[] = [];
      if (canLog) {
        for (const plugin of this.plugins.list()) {
          if (plugin.status === 'error')
            warnings.push(`Plugin ${plugin.manifest.name} could not be loaded: ${plugin.error}`);
          else if (active.has(plugin.slug) && plugin.stats.errors > 0) {
            warnings.push(
              `Plugin ${plugin.manifest.name}: ${plugin.stats.errors} errors (${plugin.stats.lastError})`,
            );
          }
        }
        const status = await getMigrationStatus(this.database.db).catch(() => null);
        if (status && !status.upToDate)
          warnings.push('Database migrations are pending: run cleitext migrate.');
      }
      return {
        counts: visible.map((t) => ({
          type: t.slug,
          name: t.name as Record<string, string>,
          published: n(t.slug, 'published') + n(t.slug, 'private'),
          drafts: n(t.slug, 'draft') + n(t.slug, 'pending'),
          scheduled: n(t.slug, 'scheduled'),
        })),
        drafts: drafts.map((d) => ({ ...d, title: d.title, updatedAt: d.updatedAt.toISOString() })),
        published: published.map((p) => ({
          ...p,
          publishedAt: p.publishedAt?.toISOString() ?? null,
        })),
        activity,
        warnings,
        pluginNotices: auth.capabilities.includes('activate_plugins')
          ? await this.pluginNotices(tx)
          : [],
      };
    });
  }

  /** Dismisses the notices about plugins deactivated after errors. */
  @Delete('dashboard/plugin-notices')
  @HttpCode(204)
  @RequireCapability('activate_plugins')
  async dismissPluginNotices(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.run(site, auth, (tx) =>
      tx
        .delete(settings)
        .where(
          and(
            eq(settings.namespace, PLUGIN_NOTICES.namespace),
            eq(settings.key, PLUGIN_NOTICES.key),
          ),
        ),
    );
  }

  private async pluginNotices(tx: SiteTransaction) {
    const [row] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(
        and(eq(settings.namespace, PLUGIN_NOTICES.namespace), eq(settings.key, PLUGIN_NOTICES.key)),
      );
    return Array.isArray(row?.value)
      ? (row.value as { plugin: string; error: string; at: string }[])
      : [];
  }

  @Get('system/status')
  @RequireCapability(LOG_CAPABILITY)
  async status(
    @CurrentSite() site: SiteContext,
    @CurrentAuth() auth: AuthContext,
  ): Promise<SystemStatusView> {
    const [pg] = (await this.database.db.execute(
      sql`select version() as v, pg_database_size(current_database())::bigint as size`,
    )) as unknown as { v: string; size: string }[];
    const migrations = await getMigrationStatus(this.database.db);
    const files = await this.run(site, auth, (tx) =>
      tx.select({ n: count(), bytes: sum(media.sizeBytes) }).from(media),
    );
    const active = await this.plugins.activeSlugs(site.id);
    const mailView = await this.mail.view(site.id);
    return {
      version: VERSION,
      environment: this.config.env,
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      postgres: pg?.v.split(' on ')[0] ?? 'unknown',
      migrations,
      database: { sizeBytes: pg ? Number(pg.size) : null },
      media: { files: Number(files[0]?.n ?? 0), bytes: Number(files[0]?.bytes ?? 0) },
      cache: { enabled: this.cache.enabled, entries: this.cache.size, ...this.cache.stats },
      plugins: this.plugins.list().map((p) => ({
        slug: p.slug,
        version: p.version,
        status: p.status,
        active: active.has(p.slug),
        errors: p.stats.errors,
        lastError: p.stats.lastError,
      })),
      scheduler: { intervalSeconds: this.config.schedulerIntervalSeconds },
      mail: {
        siteSettings: mailView.configured,
        serverDriver: this.config.mail.url.split(':')[0] ?? 'smtp',
      },
    };
  }
}

/** Audit rows with the user's name and a label for the target. */
async function auditViews(
  tx: SiteTransaction,
  rows: (typeof auditLog.$inferSelect)[],
  withIp: boolean,
): Promise<AuditEntryView[]> {
  const userIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.userId, r.targetType === 'user' ? r.targetId : null])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const entryIds = [
    ...new Set(rows.filter((r) => r.targetType === 'entry' && r.targetId).map((r) => r.targetId!)),
  ];
  const people = new Map(
    (userIds.length
      ? await tx
          .select({ id: users.id, name: users.displayName })
          .from(users)
          .where(inArray(users.id, userIds))
      : []
    ).map((u) => [u.id, u.name]),
  );
  const titles = new Map(
    (entryIds.length
      ? await tx
          .select({ id: entries.id, title: entries.title })
          .from(entries)
          .where(inArray(entries.id, entryIds))
      : []
    ).map((e) => [e.id, e.title]),
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel:
      (r.targetType === 'entry' && r.targetId ? titles.get(r.targetId) : undefined) ??
      (r.targetType === 'user' && r.targetId ? people.get(r.targetId) : undefined) ??
      (typeof r.meta === 'object' && r.meta && 'email' in r.meta
        ? String((r.meta as { email: unknown }).email)
        : null),
    meta: r.meta as Record<string, unknown>,
    ip: withIp ? r.ip : null,
    createdAt: r.createdAt.toISOString(),
    user: r.userId ? { id: r.userId, displayName: people.get(r.userId) ?? '—' } : null,
  }));
}
