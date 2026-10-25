import { migrate } from '@cleitext/db';
import { setupTestDatabase, startTempRun } from '@cleitext/testing';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    ownerUrl: string;
    /** For tests that need a database of their own (provisionDatabase). */
    superuserUrl: string;
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
  project.provide('superuserUrl', db.superuserUrl);
  return async () => {
    try {
      await db.teardown();
    } finally {
      await temp.cleanup();
    }
  };
}
