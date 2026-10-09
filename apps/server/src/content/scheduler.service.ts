import { publishDueEntries, type DatabaseClient } from '@cleitext/db';
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

  async tick(): Promise<number> {
    try {
      const published = await publishDueEntries(this.database.db);
      if (published > 0)
        this.logger.log(`Published ${published} scheduled entr${published === 1 ? 'y' : 'ies'}`);
      return published;
    } catch (error) {
      this.logger.error(error);
      return 0;
    }
  }
}
