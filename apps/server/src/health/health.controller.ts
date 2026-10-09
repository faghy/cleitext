import { getMigrationStatus, ping, type DatabaseClient } from '@cleitext/db';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { DATABASE } from '../database/database.module.js';

type CheckResult = { status: 'up' | 'down'; error?: string };

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: {
    database: CheckResult;
    migrations: CheckResult & { applied?: number; expected?: number };
  };
}

/** Liveness and readiness probes (docs/ARCHITECTURE.md §19). */
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: DatabaseClient) {}

  /** The process is running. Never touches dependencies. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * The instance can serve traffic: database reachable and schema up to date.
   * Answers 503 with the same report when a check fails.
   */
  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report: ReadinessReport = {
      status: 'ok',
      checks: { database: { status: 'up' }, migrations: { status: 'up' } },
    };

    try {
      await ping(this.database.db);
      const { applied, expected, upToDate } = await getMigrationStatus(this.database.db);
      report.checks.migrations = upToDate
        ? { status: 'up', applied, expected }
        : { status: 'down', error: 'pending migrations', applied, expected };
    } catch {
      // Connection details are never exposed in the response.
      report.checks.database = { status: 'down', error: 'database unreachable' };
      report.checks.migrations = { status: 'down', error: 'not checked' };
    }

    if (report.checks.database.status === 'down' || report.checks.migrations.status === 'down') {
      report.status = 'error';
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
