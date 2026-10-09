import { setupTestDatabase } from '@cleitext/testing';
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
  const db = await setupTestDatabase({ migrate });
  project.provide('ownerUrl', db.ownerUrl);
  project.provide('appUrl', db.appUrl);
  project.provide('appRole', db.appRole);
  return () => db.teardown();
}
