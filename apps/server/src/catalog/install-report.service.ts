import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sites, withContext, type DatabaseClient } from '@cleitext/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { installedThemes, themeFor } from '../public/themes.js';
import { UpdatesService } from '../updates/updates.service.js';

/**
 * Installation reports, as WordPress tells wordpress.org what a site runs:
 * about once a day, each site that gets visits sends the Cleitext version,
 * its theme and the plugins (installed and active) with their versions to
 * the registry of cleitext.com (the Store plugin). Nothing about content or
 * people; INSTALL_REPORT_URL empty turns it off.
 */

const EVERY_MS = 24 * 60 * 60 * 1000;
/** A failed report is tried again after this. */
const RETRY_MS = 60 * 60 * 1000;

export interface InstallReport {
  installId: string;
  origin: string;
  core: string;
  theme: { slug: string; version: string } | null;
  plugins: { slug: string; version: string; active: boolean }[];
  themes: { slug: string; version: string }[];
}

interface Stored {
  installId: string;
  /** Last report per site id. */
  sent: Record<string, string>;
}

@Injectable()
export class InstallReportService {
  private readonly logger = new Logger('InstallReport');
  /** Tests replace it. */
  fetchImpl: typeof fetch = (...args) => fetch(...args);
  /** When this process looks at a site again. */
  private readonly next = new Map<string, number>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly plugins: PluginHost,
    private readonly updates: UpdatesService,
  ) {}

  /** Shared by every process and version: next to media, plugins and themes. */
  get file(): string {
    return join(dirname(this.config.media.path), 'install-report.json');
  }

  /** A request reached a site: report it if its day has come (never waits). */
  touch(siteId: string, host: string, https: boolean): void {
    if (!this.config.installReport.url) return;
    const now = Date.now();
    if ((this.next.get(siteId) ?? 0) > now) return;
    this.next.set(siteId, now + RETRY_MS);
    void this.maybeSend(siteId, `${https ? 'https' : 'http'}://${host}`).catch((error: unknown) =>
      this.logger.warn(`Report not sent: ${String(error)}`),
    );
  }

  private async maybeSend(siteId: string, origin: string): Promise<void> {
    const stored = this.read();
    const last = Date.parse(stored.sent[siteId] ?? '');
    if (Number.isFinite(last) && Date.now() - last < EVERY_MS) {
      this.next.set(siteId, last + EVERY_MS);
      return;
    }
    await this.send(await this.build(siteId, origin, stored.installId));
    // Read again: another process may have written meanwhile.
    const latest = this.read();
    latest.sent[siteId] = new Date().toISOString();
    this.write(latest);
    this.next.set(siteId, Date.now() + EVERY_MS);
  }

  async build(siteId: string, origin: string, installId: string): Promise<InstallReport> {
    const [site] = await withContext(this.database.db, { siteId }, (tx) =>
      tx.select({ theme: sites.themeSlug }).from(sites).where(eq(sites.id, siteId)),
    );
    const theme = themeFor(site?.theme);
    const active = await this.plugins.activeSlugs(siteId);
    return {
      installId,
      origin,
      core: this.updates.current,
      theme: { slug: theme.slug, version: theme.version ?? '' },
      plugins: this.plugins
        .list()
        .map((p) => ({ slug: p.slug, version: p.version, active: active.has(p.slug) })),
      themes: installedThemes().map(({ theme: t }) => ({ slug: t.slug, version: t.version ?? '' })),
    };
  }

  private async send(report: InstallReport): Promise<void> {
    const response = await this.fetchImpl(this.config.installReport.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': `Cleitext/${report.core}`,
      },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`the registry answered ${response.status}`);
  }

  private read(): Stored {
    try {
      const stored = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Stored>;
      if (typeof stored.installId === 'string') {
        return { installId: stored.installId, sent: stored.sent ?? {} };
      }
    } catch {
      // First time, or unreadable: a new identity.
    }
    const fresh = { installId: randomUUID(), sent: {} };
    this.write(fresh);
    return fresh;
  }

  /** Written atomically: every process reads it. */
  private write(stored: Stored): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(stored));
    renameSync(tmp, this.file);
  }
}
