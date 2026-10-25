import {
  provisionDatabase,
  startEmbeddedPostgres,
  type ProvisionedDatabase,
  type RunningPostgres,
} from './postgres.js';

export * from './postgres.js';
export * from './temp.js';

export interface TestDatabase extends ProvisionedDatabase {
  /** Superuser connection, for tests that create their own roles and databases. */
  superuserUrl: string;
  /** Stops everything started by `setupTestDatabase`. */
  teardown(): Promise<void>;
}

export interface SetupTestDatabaseOptions {
  /** Applies migrations; typically `migrate` from `@cleitext/db`. */
  migrate?: (options: { ownerUrl: string; appRole: string }) => Promise<void>;
}

/**
 * Prepares a fresh database (owner + application roles) for a test run.
 *
 * Uses the PostgreSQL server at `CLEITEXT_TEST_PG_URL` (superuser URL) when
 * set, otherwise starts an embedded one. Meant for Vitest `globalSetup`.
 */
export async function setupTestDatabase(
  options: SetupTestDatabaseOptions = {},
): Promise<TestDatabase> {
  const external = process.env.CLEITEXT_TEST_PG_URL;
  let server: RunningPostgres | undefined;
  const superuserUrl = external ?? (server = await startEmbeddedPostgres()).superuserUrl;

  const db = await provisionDatabase(superuserUrl);
  try {
    await options.migrate?.({ ownerUrl: db.ownerUrl, appRole: db.appRole });
  } catch (error) {
    await db.drop().finally(() => server?.stop());
    throw error;
  }

  return {
    ...db,
    superuserUrl,
    async teardown() {
      try {
        await db.drop();
      } finally {
        await server?.stop();
      }
    },
  };
}
