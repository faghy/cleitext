import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { superAdmins, users, withContext, type DatabaseClient } from '@cleitext/db';
import type {
  AutoUpdateItem,
  AutoUpdateResult,
  AutoUpdatesView,
  CorePolicy,
} from '@cleitext/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import semver from 'semver';
import { IdentityService } from '../auth/identity.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { MailService } from '../mail/mail.service.js';
import { UpdatesService } from './updates.service.js';

/**
 * Automatic updates, as in WordPress: the core (off, fix releases only, or
 * every release) and the plugins and themes chosen one by one. Choices are
 * the server's (code is installed once for every site), kept in a file next
 * to the update status that every server process reads. A check runs about
 * twice a day in one process at a time (a lock file); compatible plugins and
 * themes are updated first, then the core. Super admins get an email with
 * what changed.
 */

const RUN_EVERY_MS = 12 * 60 * 60 * 1000;
/** After a core update, compatible plugins and themes are looked at again soon. */
const FOLLOW_UP_MS = 15 * 60 * 1000;
const TICK_MS = 10 * 60 * 1000;
/** A lock older than this was left by a process that stopped. */
const STALE_LOCK_MS = 60 * 60 * 1000;
const LOG_SIZE = 50;

interface Actor {
  siteId: string;
  userId: string;
  origin: string;
}

interface Stored {
  core: CorePolicy;
  /** Who chose the core policy: the core update is recorded in their name. */
  coreBy?: Actor;
  items: (AutoUpdateItem & Actor)[];
  lastRun?: string;
  nextRun?: string;
  log: AutoUpdateResult[];
}

const EMPTY: Stored = { core: 'off', items: [], log: [] };

@Injectable()
export class AutoUpdatesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('AutoUpdates');
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly updates: UpdatesService,
    private readonly catalog: CatalogService,
    private readonly identity: IdentityService,
    private readonly mail: MailService,
  ) {}

  onApplicationBootstrap(): void {
    // Off where scheduled work is (tests): there `run()` is called directly.
    if (this.config.schedulerIntervalSeconds <= 0) return;
    this.timer = setInterval(() => void this.maybeRun(), TICK_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private get file(): string {
    return join(dirname(this.updates.statusFile), 'auto-updates.json');
  }

  private get lockFile(): string {
    return join(dirname(this.updates.statusFile), 'auto-updates.lock');
  }

  private read(): Stored {
    try {
      return { ...EMPTY, ...(JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Stored>) };
    } catch {
      return { ...EMPTY };
    }
  }

  /** Written whole and renamed into place: readers never see half a file. */
  private write(stored: Stored): void {
    const temporary = `${this.file}.${process.pid}`;
    writeFileSync(temporary, JSON.stringify(stored, null, 2));
    renameSync(temporary, this.file);
  }

  view(): AutoUpdatesView {
    const stored = this.read();
    return {
      core: stored.core,
      items: stored.items.map(({ type, slug }) => ({ type, slug })),
      lastRun: stored.lastRun ?? null,
      nextRun: stored.nextRun ?? null,
      log: stored.log,
    };
  }

  /** The core policy, or one plugin or theme on or off; `actor` is who chose. */
  change(
    input: { core?: CorePolicy; item?: AutoUpdateItem & { enabled: boolean } },
    actor: Actor,
  ): AutoUpdatesView {
    const stored = this.read();
    if (input.core) {
      stored.core = input.core;
      stored.coreBy = actor;
    }
    if (input.item) {
      const { type, slug, enabled } = input.item;
      if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) throw new BadRequestException('Unknown slug.');
      stored.items = stored.items.filter((i) => !(i.type === type && i.slug === slug));
      if (enabled) stored.items.push({ type, slug, ...actor });
    }
    if (!stored.nextRun && (stored.core !== 'off' || stored.items.length > 0)) {
      stored.nextRun = new Date(Date.now() + FOLLOW_UP_MS).toISOString();
    }
    this.write(stored);
    return this.view();
  }

  /** Runs when it is time, in one process at a time. */
  async maybeRun(): Promise<void> {
    const stored = this.read();
    if (stored.core === 'off' && stored.items.length === 0) return;
    const due = stored.nextRun
      ? Date.parse(stored.nextRun) <= Date.now()
      : !stored.lastRun || Date.now() - Date.parse(stored.lastRun) >= RUN_EVERY_MS;
    if (due) await this.run();
  }

  /** One round of automatic updates; returns what happened (also in the log). */
  async run(): Promise<AutoUpdateResult[]> {
    if (!this.lock()) return [];
    const results: AutoUpdateResult[] = [];
    let coreStarted = false;
    const stored = this.read();
    try {
      // Plugins and themes that work with this Cleitext, and whose license covers the update.
      if (stored.items.length > 0) {
        const items = await this.catalog.items(true);
        for (const chosen of stored.items) {
          const item = items.find((i) => i.type === chosen.type && i.slug === chosen.slug);
          if (!item) continue;
          const auth = await this.identity.load(chosen.siteId, chosen.userId, '');
          if (!auth?.capabilities.includes('manage_plugins')) continue;
          const view = (await this.catalog.view(chosen.siteId, auth)).items.find(
            (i) => i.type === chosen.type && i.slug === chosen.slug,
          );
          if (!view?.installed || !view.update || !view.compatible || view.renew) continue;
          const result: AutoUpdateResult = {
            at: new Date().toISOString(),
            type: chosen.type,
            slug: chosen.slug,
            name: item.name,
            from: view.installed,
            to: item.version,
            ok: true,
          };
          try {
            await this.catalog.install(chosen.type, chosen.slug, {
              id: chosen.siteId,
              auth,
              origin: chosen.origin,
            });
          } catch (error) {
            result.ok = false;
            result.error = error instanceof Error ? error.message : String(error);
          }
          results.push(result);
        }
      }

      // Then the core, when the policy allows this release.
      const status = this.updates.status();
      if (stored.core !== 'off' && stored.coreBy && status?.state !== 'running') {
        const check = await this.updates.check(true);
        if (check.available && check.latest && allowed(stored.core, check.current, check.latest)) {
          const result: AutoUpdateResult = {
            at: new Date().toISOString(),
            type: 'core',
            slug: 'cleitext',
            name: 'Cleitext',
            from: check.current,
            to: check.latest,
            ok: true,
          };
          try {
            await this.updates.launch(check.current, check.latest, {
              siteId: stored.coreBy.siteId,
              userId: stored.coreBy.userId,
              ip: '127.0.0.1',
            });
            coreStarted = true;
          } catch (error) {
            result.ok = false;
            result.error = error instanceof Error ? error.message : String(error);
          }
          results.push(result);
        }
      }

      const now = Date.now();
      const latest = this.read();
      latest.lastRun = new Date(now).toISOString();
      latest.nextRun = new Date(now + (coreStarted ? FOLLOW_UP_MS : RUN_EVERY_MS)).toISOString();
      latest.log = [...results, ...latest.log].slice(0, LOG_SIZE);
      this.write(latest);
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.unlock();
    }
    const siteId = stored?.coreBy?.siteId ?? stored?.items[0]?.siteId;
    if (results.length > 0 && siteId) await this.notify(results, siteId);
    return results;
  }

  /** An email to the super admins with what was updated, and what failed. */
  private async notify(results: AutoUpdateResult[], siteId: string): Promise<void> {
    try {
      // Each super admin can read their own email (Row Level Security on users).
      const ids = await this.database.db.select({ id: superAdmins.userId }).from(superAdmins);
      const people: { email: string }[] = [];
      for (const { id } of ids) {
        const [person] = await withContext(this.database.db, { siteId, userId: id }, (tx) =>
          tx.select({ email: users.email }).from(users).where(eq(users.id, id)),
        );
        if (person) people.push(person);
      }
      const failed = results.filter((r) => !r.ok);
      const lines = results.map((r) =>
        r.ok
          ? `- ${r.name}: ${r.from} → ${r.to}${r.type === 'core' ? ' (started; the site restarts on the new version)' : ''}`
          : `- ${r.name}: ${r.from} → ${r.to} FAILED: ${r.error ?? ''}`,
      );
      const subject = failed.length
        ? `Cleitext: ${failed.length} automatic update(s) failed`
        : 'Cleitext: automatic updates done';
      const text = [
        'Automatic updates ran on your Cleitext server:',
        '',
        ...lines,
        '',
        'Updates → Automatic updates in the admin shows the history and the choices.',
      ].join('\n');
      for (const person of people) await this.mail.send({ to: person.email, subject, text });
    } catch (error) {
      this.logger.error(error);
    }
  }

  private lock(): boolean {
    try {
      closeSync(openSync(this.lockFile, 'wx'));
      return true;
    } catch {
      try {
        if (Date.now() - statSync(this.lockFile).mtimeMs > STALE_LOCK_MS) {
          rmSync(this.lockFile, { force: true });
          closeSync(openSync(this.lockFile, 'wx'));
          return true;
        }
      } catch {
        // Another process took it meanwhile.
      }
      return false;
    }
  }

  private unlock(): void {
    rmSync(this.lockFile, { force: true });
  }
}

/** Fix releases only: the same major and minor version (0.26.0 → 0.26.1); `all`: any newer one. */
export function allowed(policy: CorePolicy, current: string, latest: string): boolean {
  if (policy === 'off' || !semver.valid(current) || !semver.valid(latest)) return false;
  if (!semver.gt(latest, current) || semver.prerelease(latest)) return false;
  return policy === 'all' || semver.diff(current, latest) === 'patch';
}
