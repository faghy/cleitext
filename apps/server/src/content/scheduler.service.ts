import { publishDueEntries, purgeTrash, type DatabaseClient } from '@cleitext/db';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';

/**
 * Publishes scheduled entries when their time comes (RF-CNT-08). Runs in
 * every server process; the database update is idempotent, so concurrent
 * runs are harmless. To be replaced by the pg-boss job queue (§16).
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Scheduler');
  private timer: NodeJS.Timeout | undefined;
  private lastPurge = 0;
  /** The trash is emptied at most once an hour. */
  private static readonly PURGE_INTERVAL_MS = 60 * 60 * 1000;

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.schedulerIntervalSeconds;
    if (seconds <= 0) return;
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Empties old trash (RF-CNT-14); returns the number of deleted entries. */
  async purge(): Promise<number> {
    this.lastPurge = Date.now();
    const deleted = await purgeTrash(this.database.db);
    if (deleted > 0)
      this.logger.log(`Emptied ${deleted} entr${deleted === 1 ? 'y' : 'ies'} from the trash`);
    return deleted;
  }

  async tick(): Promise<number> {
    try {
      const published = await publishDueEntries(this.database.db);
      if (published > 0)
        this.logger.log(`Published ${published} scheduled entr${published === 1 ? 'y' : 'ies'}`);
      if (Date.now() - this.lastPurge >= SchedulerService.PURGE_INTERVAL_MS) await this.purge();
      return published;
    } catch (error) {
      this.logger.error(error);
      return 0;
    }
  }
}
