import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Each test file gets its own temporary folder, removed when it ends.
    setupFiles: ['@cleitext/testing/vitest-setup'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
