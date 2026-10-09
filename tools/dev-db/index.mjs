// Starts a persistent local PostgreSQL for development, provisions the
// `cleitext` database with separate owner/application roles, applies the
// migrations and keeps running until interrupted.
//
// Data lives in <repo>/.cleitext-dev/pg (git-ignored). Credentials below are
// for local development only.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '@cleitext/db';
import { provisionDatabase, startEmbeddedPostgres } from '@cleitext/testing';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(root, '.cleitext-dev', 'pg');
const port = Number(process.env.CLEITEXT_DEV_PG_PORT ?? 54329);

await mkdir(dirname(dataDir), { recursive: true });
const server = await startEmbeddedPostgres({ dataDir, port });
const db = await provisionDatabase(server.superuserUrl, {
  database: 'cleitext',
  ownerRole: 'cleitext_owner',
  appRole: 'cleitext_app',
  ownerPassword: 'cleitext_owner_dev',
  appPassword: 'cleitext_app_dev',
});
await migrate({ ownerUrl: db.ownerUrl, appRole: db.appRole });

const envFile = join(root, '.env');
if (!existsSync(envFile)) {
  await writeFile(
    envFile,
    [
      '# Local development (written by tools/dev-db). Not for production.',
      `DATABASE_URL=${db.appUrl}`,
      `DATABASE_ADMIN_URL=${db.ownerUrl}`,
      'LOG_LEVEL=debug',
      '',
    ].join('\n'),
  );
  console.log(`[dev-db] wrote ${envFile}`);
}

console.log(
  `[dev-db] PostgreSQL ready on 127.0.0.1:${port} (database "cleitext", migrations applied)`,
);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('[dev-db] stopping…');
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
