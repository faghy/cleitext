import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    testTimeout: 60_000,
    // WordPress packages import JSON without import attributes: let Vite
    // transform them, as it does in the browser.
    server: { deps: { inline: [/@wordpress\//] } },
  },
});
