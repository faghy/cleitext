import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = fileURLToPath(new URL('../..', import.meta.url));

/**
 * End-to-end tests of the admin in a real browser. They start the whole
 * development environment (`pnpm dev`: database, server, admin) unless it is
 * already running.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 } },
    },
    // RNF-10: `pnpm e2e:browsers` runs the same suite in Firefox and Safari's engine.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 1000 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 1000 } },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    cwd: root,
    url: 'http://localhost:5173/health/ready',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // Like Ctrl+C: lets the local database shut down cleanly.
    gracefulShutdown: { signal: 'SIGINT', timeout: 15_000 },
  },
});
