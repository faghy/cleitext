import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC instead of esbuild: NestJS dependency injection needs decorator metadata.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // A transaction that takes a second connection of its pool fails the test (pool exhaustion).
    env: { CLEITEXT_DB_NESTING: 'error' },
  },
});
