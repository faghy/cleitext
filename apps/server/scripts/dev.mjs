// Development runner: recompiles on change and restarts the server.
// Environment variables come from the repository root `.env`, which
// `tools/dev-db` writes on first start; wait for it before launching.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const envFile = '../../.env';
const children = [];

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

children.push(
  spawn('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
  }),
);

if (!process.env.DATABASE_URL) {
  for (let waited = 0; !existsSync(envFile); waited += 500) {
    if (waited === 2_000) console.log('[server] waiting for .env (run `pnpm db:dev`)…');
    await sleep(500);
  }
}

children.push(
  spawn(process.execPath, ['--watch', `--env-file-if-exists=${envFile}`, 'dist/main.js'], {
    stdio: 'inherit',
    // The admin dev server proxies API calls: trust its X-Forwarded-* headers.
    env: { TRUST_PROXY: 'true', ...process.env },
  }),
);
