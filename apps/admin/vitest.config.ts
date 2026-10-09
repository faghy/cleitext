import { defineConfig } from 'vitest/config';

// Unit tests only; browser tests in e2e/ run with Playwright (`pnpm e2e`).
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'] },
});
