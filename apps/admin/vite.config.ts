import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverUrl = process.env.CLEITEXT_SERVER_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': serverUrl,
      '/health': serverUrl,
    },
  },
});
