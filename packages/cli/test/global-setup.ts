import { migrate } from '@cleitext/db';
import { setupTestDatabase } from '@cleitext/testing';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    ownerUrl: string;
    /** For tests that need a database of their own (provisionDatabase). */
    superuserUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const db = await setupTestDatabase({ migrate });
  project.provide('ownerUrl', db.ownerUrl);
  project.provide('superuserUrl', db.superuserUrl);
  return () => db.teardown();
}
