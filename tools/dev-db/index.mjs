// Starts a persistent local PostgreSQL for development, provisions the
// `cleitext` database with separate owner/application roles, applies the
// migrations and keeps running until interrupted.
//
// Data lives in <repo>/.cleitext-dev/pg (git-ignored). Credentials below are
// for local development only.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDomain, createSite, createUser, hasSites } from '@cleitext/cli';
import { createDatabase, migrate } from '@cleitext/db';
import { provisionDatabase, startEmbeddedPostgres } from '@cleitext/testing';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(root, '.cleitext-dev', 'pg');
const port = Number(process.env.CLEITEXT_DEV_PG_PORT ?? 54329);

await mkdir(dirname(dataDir), { recursive: true });
await stopOrphanedServer(dataDir);
const server = await startEmbeddedPostgres({ dataDir, port });
const db = await provisionDatabase(server.superuserUrl, {
  database: 'cleitext',
  ownerRole: 'cleitext_owner',
  appRole: 'cleitext_app',
  ownerPassword: 'cleitext_owner_dev',
  appPassword: 'cleitext_app_dev',
});
await migrate({ ownerUrl: db.ownerUrl, appRole: db.appRole });

// First start: a development site answering on localhost, plus a super admin.
const DEV_ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
const owner = createDatabase(db.ownerUrl, { max: 1 });
try {
  if (!(await hasSites(owner.db))) {
    await createSite(owner.db, {
      slug: 'dev',
      name: 'Development',
      host: 'localhost',
      forceHttps: false,
    });
    await addDomain(owner.db, { site: 'dev', host: '127.0.0.1', forceHttps: false });
    await createUser(owner.db, { ...DEV_ADMIN, displayName: 'Admin', superAdmin: true });
    console.log(
      `[dev-db] created site "Development" (localhost) and super admin ${DEV_ADMIN.email} / ${DEV_ADMIN.password}`,
    );
  }
} finally {
  await owner.close();
}

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

// Server (cwd apps/server) and CLI (cwd root) must share the plugins folder.
const env = await readFile(envFile, 'utf8');
if (!/^PLUGINS_PATH=/m.test(env)) {
  const pluginsPath = join(root, '.cleitext-dev', 'plugins');
  await writeFile(envFile, `${env.replace(/\n?$/, '\n')}PLUGINS_PATH=${pluginsPath}\n`);
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

/**
 * A previous run killed without cleanup (e.g. SIGKILL) leaves PostgreSQL
 * running on our data directory, which would block a new start. Stop it.
 */
async function stopOrphanedServer(dir) {
  const pidFile = join(dir, 'postmaster.pid');
  if (!existsSync(pidFile)) return;
  const pid = Number((await readFile(pidFile, 'utf8')).split('\n')[0]);
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, 0);
  } catch {
    return; // stale pid file: PostgreSQL removes it on start
  }
  console.log(`[dev-db] stopping a PostgreSQL left running by a previous run (pid ${pid})…`);
  process.kill(pid, 'SIGINT'); // fast shutdown
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await sleep(100);
  }
  throw new Error(`PostgreSQL (pid ${pid}) did not stop; stop it manually.`);
}
