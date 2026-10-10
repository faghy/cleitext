import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serverUrl = process.env.CLEITEXT_SERVER_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Forward the original host in X-Forwarded-* headers: the server resolves
    // the site and checks the request origin against it.
    proxy: {
      '/api': { target: serverUrl, xfwd: true },
      '/health': { target: serverUrl, xfwd: true },
      '/media': { target: serverUrl, xfwd: true },
      '/__preview': { target: serverUrl, xfwd: true },
      '/admin-plugins': { target: serverUrl, xfwd: true },
      // The public site, so that "Visit site" and the toolbar work in development too.
      '^/(?!admin(/|$)|api/|health|media/|__preview|admin-plugins)': {
        target: serverUrl,
        xfwd: true,
      },
    },
  },
});
