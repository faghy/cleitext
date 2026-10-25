import { setupTestDatabase, startTempRun } from '@cleitext/testing';
import { migrate } from '../src/migrate.js';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    ownerUrl: string;
    appUrl: string;
    appRole: string;
  }
}

export default async function setup(project: TestProject) {
  // Temporary files of the whole run (database included) go in one folder,
  // removed at the end; folders of runs that were killed are swept here.
  const temp = await startTempRun();
  const db = await setupTestDatabase({ migrate }).catch(async (error: unknown) => {
    await temp.cleanup();
    throw error;
  });
  project.provide('ownerUrl', db.ownerUrl);
  project.provide('appUrl', db.appUrl);
  project.provide('appRole', db.appRole);
  return async () => {
    try {
      await db.teardown();
    } finally {
      await temp.cleanup();
    }
  };
}
