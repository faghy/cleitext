/**
 * `cleitext status`: what runs where, for a hosting panel. It never fails
 * because of the database: when it cannot be reached, `db.ok` is false and
 * the rest is still reported.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createDatabase, getMigrationStatus } from '@cleitext/db';
import { sql } from 'drizzle-orm';
import { connectionSettings, envFileOf, mediaPath, versionIn, withTimeout } from './context.js';
import { siteSummaries, type SiteSummary } from './operations.js';
import { layoutOf, previousRelease } from './update.js';

export type DbStatus =
  | {
      ok: true;
      /** PostgreSQL version of the server, e.g. "17.2". */
      postgres: string;
      database: string;
      migrations: { applied: number; expected: number; pending: number };
    }
  | { ok: false; error: string };

export interface AutoUpdatesStatus {
  /** off | patch | all (Updates → Automatic updates in the admin). */
  core: string;
  items: { type: string; slug: string }[];
  lastRun: string | null;
  nextRun: string | null;
}

export interface StatusReport {
  version: string | null;
  /** The running release folder (links resolved). */
  root: string;
  layout: 'folder' | 'releases';
  /** Releases layout: the `cleitext` link the site runs from. */
  link: string | null;
  /** The version `cleitext rollback` goes back to. */
  previous: { version: string | null; path: string } | null;
  node: string;
  /** DATABASE_ADMIN_URL is set (`.env` written by the wizard or `cleitext configure`). */
  configured: boolean;
  envFile: string | null;
  dataDir: string | null;
  db: DbStatus;
  /** At least one site exists (`cleitext install` ran). */
  installed: boolean | null;
  sites: SiteSummary[];
  autoUpdates: AutoUpdatesStatus | null;
  /** The last core update started from the admin or the CLI (`--status` file). */
  lastUpdate: Record<string, unknown> | null;
  /** APP_URL (if set) and the home page of each site. */
  appUrls: string[];
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function collectStatus(root: string): Promise<StatusReport> {
  const layout = layoutOf(root);
  const current = layout.kind === 'folder' ? layout.dir : layout.current;
  const previous = previousRelease(root);
  const configured = Boolean(process.env.DATABASE_ADMIN_URL);
  const dataDir = configured || process.env.MEDIA_PATH ? path.dirname(mediaPath()) : null;
  const report: StatusReport = {
    version: versionIn(current),
    root: current,
    layout: layout.kind,
    link: layout.kind === 'releases' ? layout.link : null,
    previous: previous ? { version: versionIn(previous), path: previous } : null,
    node: process.versions.node,
    configured,
    envFile: envFileOf(current),
    dataDir,
    db: { ok: false, error: 'DATABASE_ADMIN_URL is not set: Cleitext is not configured.' },
    installed: null,
    sites: [],
    autoUpdates: null,
    lastUpdate: null,
    appUrls: [],
  };
  if (dataDir) {
    const auto = readJson(path.join(dataDir, 'auto-updates.json'));
    report.autoUpdates = {
      core: typeof auto?.core === 'string' ? auto.core : 'off',
      items: Array.isArray(auto?.items)
        ? (auto.items as { type: string; slug: string }[]).map(({ type, slug }) => ({
            type,
            slug,
          }))
        : [],
      lastRun: typeof auto?.lastRun === 'string' ? auto.lastRun : null,
      nextRun: typeof auto?.nextRun === 'string' ? auto.nextRun : null,
    };
    report.lastUpdate = readJson(path.join(dataDir, 'update-status.json'));
  }
  if (configured) {
    const client = createDatabase(connectionSettings().ownerUrl, { max: 1, connectTimeout: 10 });
    try {
      await withTimeout(
        (async () => {
          const [server] = await client.db.execute<{ version: string; database: string }>(
            sql`select current_setting('server_version') as version, current_database() as database`,
          );
          const migrations = await getMigrationStatus(client.db);
          report.db = {
            ok: true,
            postgres: server?.version ?? '',
            database: server?.database ?? '',
            migrations: {
              applied: migrations.applied,
              expected: migrations.expected,
              pending: Math.max(0, migrations.expected - migrations.applied),
            },
          };
          // Before the first migration there are no tables yet.
          if (migrations.applied > 0) {
            report.sites = await siteSummaries(client.db);
            report.installed = report.sites.length > 0;
          } else report.installed = false;
        })(),
        15_000,
        'The database',
      );
    } catch (error) {
      report.db = { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      await client.close().catch(() => {});
    }
  }
  const urls = new Set<string>();
  if (process.env.APP_URL) urls.add(process.env.APP_URL);
  for (const site of report.sites) if (site.url) urls.add(site.url);
  report.appUrls = [...urls];
  return report;
}

/** The text of `cleitext status` without --json. */
export function formatStatus(s: StatusReport): string[] {
  const lines = [
    `Cleitext ${s.version ?? '?'} (${s.layout === 'releases' ? `releases, linked from ${s.link}` : 'folder'})`,
    `  folder: ${s.root}`,
    `  previous version: ${s.previous ? `${s.previous.version ?? '?'} (${s.previous.path})` : 'none'}`,
    `  Node.js ${s.node}`,
    `  configuration: ${s.envFile ?? 'no .env'}`,
    s.db.ok
      ? `  database: ${s.db.database} on PostgreSQL ${s.db.postgres}, ${s.db.migrations.pending ? `${s.db.migrations.pending} migrations pending` : 'migrations up to date'}`
      : `  database: not reachable (${s.db.error})`,
  ];
  if (s.autoUpdates) {
    lines.push(
      `  automatic updates: core ${s.autoUpdates.core}, ${s.autoUpdates.items.length} plugins/themes`,
    );
  }
  for (const site of s.sites) {
    lines.push(
      `  site ${site.slug}\t${site.status}\t${site.name}\t${site.domains.map((d) => d.host).join(', ')}`,
    );
  }
  return lines;
}
