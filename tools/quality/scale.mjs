// Scale budgets of the built server:
//
// - RNF-03 admin API p95 < 150 ms with 50,000 entries on the site;
// - RNF-06 at least 100 sites per instance with no more than 10% degradation
//   of public pages (with a 2 ms margin: at a few milliseconds, 10% is noise).
//
// It starts a throwaway PostgreSQL, installs Cleitext with the CLI, writes the
// entries straight into the database, adds the sites with the CLI functions and
// runs the production server.
//
//   pnpm build && pnpm check:scale
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { request } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, migrate } from '../../packages/db/dist/index.js';
import { createSite } from '../../packages/cli/dist/index.js';
import { setupTestDatabase } from '../../packages/testing/dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
// drizzle-orm is a dependency of the db package, not of the workspace root.
const { sql } = await import(
  createRequire(join(root, 'packages/db/package.json')).resolve('drizzle-orm')
);
const PORT = 3991;
const HOST = 'localhost';
const BASE = `http://${HOST}:${PORT}`;
const ADMIN = { email: 'scale@example.com', password: 'scale-check-password' };
const ENTRIES = 50_000;
const SITES = 100;
const BUDGET = { apiP95Ms: 150, degradation: 1.1, marginMs: 2 };

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const db = await setupTestDatabase({ migrate });
const env = {
  ...process.env,
  NODE_ENV: 'production',
  // A check, not an installation: nothing goes to the registry.
  INSTALL_REPORT_URL: '',
  APP_SECRET: 'scale-check-secret-0123456789abcdef0123',
  DATABASE_URL: db.appUrl,
  DATABASE_ADMIN_URL: db.ownerUrl,
  HOST: '127.0.0.1',
  PORT: String(PORT),
  MAIL_URL: 'log://',
  LOG_LEVEL: 'warn',
  SCHEDULER_INTERVAL_SECONDS: '0',
  MEDIA_PATH: await mkdtemp(join(tmpdir(), 'cleitext-scale-media-')),
  PLUGINS_PATH: await mkdtemp(join(tmpdir(), 'cleitext-scale-plugins-')),
  THEMES_PATH: await mkdtemp(join(tmpdir(), 'cleitext-scale-themes-')),
};
const superuserUrl = new URL(db.superuserUrl);
superuserUrl.pathname = `/${db.database}`;
const superuser = createDatabase(superuserUrl.toString());
const owner = createDatabase(db.ownerUrl);
let server;

try {
  execFileSync(
    process.execPath,
    [
      join(root, 'packages/cli/dist/bin.js'),
      'install',
      '--site-slug',
      'main',
      '--site-name',
      'Scale',
      '--domain',
      HOST,
      '--no-https',
      '--admin-email',
      ADMIN.email,
    ],
    { env: { ...env, CLEITEXT_ADMIN_PASSWORD: ADMIN.password }, stdio: 'ignore' },
  );

  // RNF-03: the entries, written in one statement (the API would take hours).
  const seeded = performance.now();
  await superuser.db.execute(sql`
    with site as (select id from sites where slug = 'main'),
    author as (select id from users where email = ${ADMIN.email}),
    e as (
      insert into entries (id, site_id, type_slug, locale, slug, title, status, author_id, published_at, updated_at, search)
      select gen_random_uuid(), site.id, 'article', 'en', 'scale-' || g, 'Scale article ' || g,
        'published', author.id, now() - g * interval '1 minute', now() - g * interval '1 minute',
        to_tsvector('simple', 'Scale article ' || g || ' about publishing')
      from site, author, generate_series(1, ${ENTRIES}) g
      returning id, site_id, title, author_id
    ),
    r as (
      insert into revisions (id, site_id, entry_id, title, document, schema_version, author_id)
      select gen_random_uuid(), site_id, id, title,
        '{"schema":1,"blocks":[{"id":"p","type":"core/paragraph","v":1,"attrs":{},"content":[{"text":"Text."}]}]}'::jsonb,
        1, author_id
      from e
      returning id, entry_id
    )
    update entries set current_revision_id = r.id, published_revision_id = r.id
    from r where entries.id = r.entry_id`);
  // As autovacuum would on a real site: statistics and the visibility map.
  await superuser.db.execute(sql`vacuum analyze entries`);
  await superuser.db.execute(sql`vacuum analyze revisions`);
  console.log(
    `  ${ENTRIES} entries written in ${((performance.now() - seeded) / 1000).toFixed(1)} s`,
  );

  server = spawn(process.execPath, [join(root, 'apps/server/dist/main.js')], {
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitReady();

  const api = await signIn();
  const first = await api('/entries?type=article&limit=20');
  const someId = first.items?.[0]?.id ?? first[0]?.id;
  const cursor = first.nextCursor;
  const queries = [
    ['list (newest)', '/entries?type=article&limit=20'],
    ['list by title', '/entries?type=article&sort=title&dir=asc&limit=20'],
    [
      'next page',
      `/entries?type=article&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ],
    ['search', '/entries?type=article&q=article%2042&limit=20'],
    ['published only', '/entries?type=article&status=published&limit=50'],
    ['one entry', `/entries/${someId}`],
    ['dashboard', '/dashboard'],
  ];
  for (const [label, path] of queries) {
    const times = [];
    for (let i = 0; i < 60; i++) {
      const sent = performance.now();
      await api(path);
      times.push(performance.now() - sent);
    }
    const p95 = percentile(times.slice(10), 0.95);
    check(
      p95 < BUDGET.apiP95Ms,
      `admin API ${label}: p95 ${p95.toFixed(1)} ms with ${ENTRIES} entries (< ${BUDGET.apiP95Ms})`,
    );
  }

  // RNF-06: public pages with one site, then with SITES sites.
  const alone = await publicLoad(() => HOST);
  for (let i = 1; i < SITES; i++) {
    await createSite(owner.db, {
      slug: `site-${i}`,
      name: `Site ${i}`,
      host: `site-${i}.test`,
      forceHttps: false,
    });
  }
  // The new sites must be served: one request to each, before measuring.
  for (let i = 1; i < SITES; i++) {
    const status = await get(`site-${i}.test`, '/');
    if (status !== 200) throw new Error(`site-${i}.test answered ${status}`);
  }
  let n = 0;
  const many = await publicLoad(() => (n++ % SITES === 0 ? HOST : `site-${n % SITES}.test`));
  for (const kind of ['cached', 'uncached']) {
    const limit = Math.max(alone[kind] * BUDGET.degradation, alone[kind] + BUDGET.marginMs);
    check(
      many[kind] <= limit,
      `${kind} public page p95 with ${SITES} sites ${many[kind].toFixed(1)} ms, with one site ${alone[kind].toFixed(1)} ms (≤ ${limit.toFixed(1)})`,
    );
  }
} finally {
  server?.kill('SIGINT');
  await wait(500);
  await superuser.close();
  await owner.close();
  await db.teardown();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} budget(s) exceeded.`);
  process.exit(1);
}

async function waitReady() {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const ready = await fetch(`${BASE}/health/ready`).then(
      (r) => r.ok,
      () => false,
    );
    if (ready) return;
    await wait(50);
  }
  throw new Error('The server did not start.');
}

/** Signs in and returns a GET helper for the admin API. */
async function signIn() {
  const cookies = new Map();
  const call = async (method, path, body, csrf) => {
    const response = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: {
        origin: BASE,
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const [name, ...value] = pair.split('=');
      cookies.set(name, value.join('='));
    }
    if (!response.ok)
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
  const { token } = await call('GET', '/auth/csrf');
  await call('POST', '/auth/login', ADMIN, token);
  return (path) => call('GET', path);
}

/** Status of a public page, asked with the given Host header. */
function get(host, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, headers: { host } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

/** p95 time to the headers of public pages: cached (home) and uncached. */
async function publicLoad(nextHost) {
  const measure = async (path) => {
    const times = [];
    for (let i = 0; i < 300; i++) {
      const host = nextHost();
      const sent = performance.now();
      await new Promise((resolve, reject) => {
        const req = request(
          { host: '127.0.0.1', port: PORT, path: path(i), headers: { host } },
          (res) => {
            times.push(performance.now() - sent);
            res.resume();
            res.on('end', resolve);
          },
        );
        req.on('error', reject);
        req.end();
      });
    }
    return percentile(times.slice(20), 0.95);
  };
  const cached = await measure(() => '/');
  const uncached = await measure((i) => `/?nocache=${Date.now()}-${i}`);
  return { cached, uncached };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
