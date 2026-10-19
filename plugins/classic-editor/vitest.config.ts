import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The converter reads HTML with the browser's DOMParser.
  test: { environment: 'jsdom' },
});
