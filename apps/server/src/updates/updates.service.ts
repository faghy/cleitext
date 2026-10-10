import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  type OnModuleDestroy,
} from '@nestjs/common';
import { withContext, type DatabaseClient } from '@cleitext/db';
import semver from 'semver';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { appRoot } from '../install/token.js';

declare const PhusionPassenger: unknown;

/**
 * Core updates from the admin (RF-SYS-UPD). The check reads the latest
 * release on GitHub (cached for hours); the update itself is `cleitext
 * update`, run detached so that the site keeps answering, which reports its
 * progress in a file every server process can read.
 */

export interface UpdateCheckView {
  current: string;
  latest: string | null;
  available: boolean;
  notes: string;
  publishedAt: string | null;
  url: string | null;
  checkedAt: string | null;
  error: string | null;
}

export interface UpdateStatusView {
  state: 'running' | 'done' | 'failed';
  from: string;
  to: string;
  step: string | null;
  steps: string[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

const CHECK_TTL_MS = 6 * 60 * 60 * 1000;
/** An update still "running" after this long was interrupted. */
const STALE_MS = 30 * 60 * 1000;

@Injectable()
export class UpdatesService implements OnModuleDestroy {
  /** Tests replace it. */
  fetchImpl: typeof fetch = (...args) => fetch(...args);
  private cached: { at: number; view: UpdateCheckView } | null = null;
  private watcher: NodeJS.Timeout | null = null;
  readonly root = appRoot();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly audit: AuditService,
  ) {}

  onModuleDestroy(): void {
    if (this.watcher) clearInterval(this.watcher);
  }

  get current(): string {
    try {
      const file = join(this.root, 'package.json');
      return (JSON.parse(readFileSync(file, 'utf8')) as { version?: string }).version ?? 'dev';
    } catch {
      return 'dev';
    }
  }

  /** Shared by every version: next to media, plugins and themes. */
  get statusFile(): string {
    return join(dirname(this.config.media.path), 'update-status.json');
  }

  async check(force = false): Promise<UpdateCheckView> {
    const current = this.current;
    const empty: UpdateCheckView = {
      current,
      latest: null,
      available: false,
      notes: '',
      publishedAt: null,
      url: null,
      checkedAt: null,
      error: null,
    };
    if (!this.config.updates.repo) return empty;
    if (!force && this.cached && Date.now() - this.cached.at < CHECK_TTL_MS) {
      return { ...this.cached.view, current, available: newer(this.cached.view.latest, current) };
    }
    let view: UpdateCheckView;
    try {
      const response = await this.fetchImpl(
        `https://api.github.com/repos/${this.config.updates.repo}/releases/latest`,
        {
          headers: { accept: 'application/vnd.github+json', 'user-agent': 'cleitext-updater' },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const release = (await response.json()) as {
        tag_name: string;
        body?: string | null;
        published_at?: string | null;
        html_url: string;
      };
      const latest = release.tag_name.replace(/^v/, '');
      view = {
        current,
        latest,
        available: newer(latest, current),
        notes: release.body ?? '',
        publishedAt: release.published_at ?? null,
        url: release.html_url,
        checkedAt: new Date().toISOString(),
        error: null,
      };
    } catch (error) {
      view = {
        ...empty,
        checkedAt: new Date().toISOString(),
        error: `The update check failed: ${(error as Error).message}`,
      };
    }
    this.cached = { at: Date.now(), view };
    return view;
  }

  status(): UpdateStatusView | null {
    try {
      return JSON.parse(readFileSync(this.statusFile, 'utf8')) as UpdateStatusView;
    } catch {
      return null;
    }
  }

  /** Starts `cleitext update --to <latest>` in its own process. */
  async start(siteId: string, auth: AuthContext, ip: string): Promise<UpdateStatusView> {
    // Super admins only (the controller); two-factor authentication is not
    // required here, by the maintainer's choice: releases come from GitHub
    // and are checked against their SHA-256.
    const running = this.status();
    if (running?.state === 'running' && Date.now() - Date.parse(running.startedAt) < STALE_MS) {
      throw new ConflictException('An update is already running.');
    }
    const check = await this.check(true);
    if (!check.available || !check.latest) {
      throw new BadRequestException(check.error ?? `Cleitext ${check.current} is up to date.`);
    }
    const cli = join(this.root, 'packages/cli/dist/bin.js');
    if (!existsSync(cli))
      throw new BadRequestException('The Cleitext CLI is missing on this server.');
    const envFile = join(this.root, '.env');
    const log = openSync(join(dirname(this.statusFile), 'update.log'), 'a');
    const child = spawn(
      process.execPath,
      [
        ...(existsSync(envFile) ? [`--env-file=${envFile}`] : []),
        cli,
        'update',
        '--to',
        check.latest,
        '--repo',
        this.config.updates.repo,
        '--status',
        this.statusFile,
      ],
      {
        cwd: this.root,
        detached: true,
        stdio: ['ignore', log, log],
        env: {
          ...process.env,
          DATABASE_URL: this.config.database.url,
          ...(this.config.database.adminUrl
            ? { DATABASE_ADMIN_URL: this.config.database.adminUrl }
            : {}),
          MEDIA_PATH: this.config.media.path,
          PLUGINS_PATH: this.config.plugins.path,
          THEMES_PATH: this.config.themes.path,
        },
      },
    );
    child.unref();
    await withContext(this.database.db, { siteId, userId: auth.userId }, (tx) =>
      this.audit.record(tx, {
        siteId,
        userId: auth.userId,
        action: 'core.updated',
        targetType: 'core',
        targetId: check.latest!,
        ip,
      }),
    );
    this.watchForRestart();
    return {
      state: 'running',
      from: check.current,
      to: check.latest,
      step: null,
      steps: [],
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Passenger restarts the application by itself (tmp/restart.txt); a
   * server run by systemd or pm2 exits once the update is done, and is
   * started again from the new version.
   */
  private watchForRestart(): void {
    if (typeof PhusionPassenger !== 'undefined' || this.config.env === 'test') return;
    if (this.watcher) clearInterval(this.watcher);
    this.watcher = setInterval(() => {
      const status = this.status();
      if (status?.state === 'done') setTimeout(() => process.exit(0), 1000);
      if (status && status.state !== 'running' && this.watcher) clearInterval(this.watcher);
    }, 2000);
    this.watcher.unref();
  }
}

function newer(latest: string | null, current: string): boolean {
  return Boolean(
    latest && semver.valid(latest) && semver.valid(current) && semver.gt(latest, current),
  );
}
