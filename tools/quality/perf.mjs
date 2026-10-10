// Performance and quality budgets of the built server with the default theme:
//
// - RNF-14 cold start < 3 s (migrations excluded);
// - RNF-01 cached public page TTFB p95 < 50 ms at 100 requests per second;
// - RNF-02 uncached public page TTFB p95 < 300 ms;
// - RNF-05 < 300 MB RSS after the load;
// - RF-THM-05 Lighthouse ≥ 95 in every category on the home and an article.
//
// It starts a throwaway PostgreSQL, installs Cleitext with the CLI, adds some
// content through the API and runs the production server.
//
//   pnpm build && pnpm check:perf
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { migrate } from '../../packages/db/dist/index.js';
import { setupTestDatabase } from '../../packages/testing/dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 3990;
const HOST = 'localhost';
const BASE = `http://${HOST}:${PORT}`;
const ADMIN = { email: 'perf@example.com', password: 'performance-check-password' };
const BUDGET = {
  coldStartMs: 3_000,
  cachedP95Ms: 50,
  uncachedP95Ms: 300,
  rssMb: 300,
  lighthouse: 0.95,
};

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
  APP_SECRET: 'performance-check-secret-0123456789abcdef',
  DATABASE_URL: db.appUrl,
  DATABASE_ADMIN_URL: db.ownerUrl,
  HOST: '127.0.0.1',
  PORT: String(PORT),
  MAIL_URL: 'log://',
  LOG_LEVEL: 'warn',
  SCHEDULER_INTERVAL_SECONDS: '0',
  MEDIA_PATH: await mkdtemp(join(tmpdir(), 'cleitext-perf-media-')),
  PLUGINS_PATH: await mkdtemp(join(tmpdir(), 'cleitext-perf-plugins-')),
  THEMES_PATH: await mkdtemp(join(tmpdir(), 'cleitext-perf-themes-')),
};
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
      'Performance',
      '--domain',
      HOST,
      '--no-https',
      '--admin-email',
      ADMIN.email,
    ],
    { env: { ...env, CLEITEXT_ADMIN_PASSWORD: ADMIN.password }, stdio: 'ignore' },
  );

  // RNF-14: from spawn to ready.
  const started = performance.now();
  server = spawn(process.execPath, [join(root, 'apps/server/dist/main.js')], {
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  let ready = false;
  while (!ready && performance.now() - started < 30_000) {
    ready = await fetch(`${BASE}/health/ready`).then(
      (r) => r.ok,
      () => false,
    );
    if (!ready) await wait(25);
  }
  const coldStart = performance.now() - started;
  check(
    ready && coldStart < BUDGET.coldStartMs,
    `cold start ${coldStart.toFixed(0)} ms (< ${BUDGET.coldStartMs})`,
  );

  const articles = await seedContent();
  const article = `${BASE}${articles[0]}`;

  // RNF-01 and RNF-02.
  await fetch(`${BASE}/`);
  const cached = await load(() => `${BASE}/`, 100, 10);
  check(
    cached.p95 < BUDGET.cachedP95Ms,
    `cached page TTFB p95 ${cached.p95.toFixed(1)} ms at 100 rps (< ${BUDGET.cachedP95Ms}), ${cached.hits} hits`,
  );
  let n = 0;
  const uncached = await load(
    () => `${BASE}${articles[n % articles.length]}?nocache=${n++}`,
    20,
    10,
  );
  check(
    uncached.p95 < BUDGET.uncachedP95Ms,
    `uncached page TTFB p95 ${uncached.p95.toFixed(1)} ms (< ${BUDGET.uncachedP95Ms}), ${uncached.misses} misses`,
  );

  // RNF-05.
  const status = await readFile(`/proc/${server.pid}/status`, 'utf8').catch(() => '');
  const rss = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) / 1024;
  if (rss > 0) check(rss < BUDGET.rssMb, `memory ${rss.toFixed(0)} MB RSS (< ${BUDGET.rssMb})`);

  // RF-THM-05.
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox'],
  });
  try {
    for (const url of [`${BASE}/`, article]) {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      });
      for (const category of Object.values(result.lhr.categories)) {
        const failing =
          category.score < 1
            ? category.auditRefs
                .filter((ref) => ref.weight > 0 && (result.lhr.audits[ref.id]?.score ?? 1) < 1)
                .map((ref) => ref.id)
            : [];
        check(
          category.score >= BUDGET.lighthouse,
          `Lighthouse ${category.title} ${Math.round(category.score * 100)} on ${url.replace(BASE, '') || '/'}` +
            (failing.length > 0 ? ` (${failing.join(', ')})` : ''),
        );
      }
    }
  } finally {
    chrome.kill();
  }
} finally {
  server?.kill('SIGINT');
  await wait(500);
  await db.teardown();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} budget(s) exceeded.`);
  process.exit(1);
}

/** Publishes articles and a page through the API; returns article paths. */
async function seedContent() {
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
  let { token } = await call('GET', '/auth/csrf');
  await call('POST', '/auth/login', ADMIN, token);
  ({ token } = await call('GET', '/auth/csrf'));

  await call(
    'PATCH',
    '/settings/core',
    { tagline: 'Notes on publishing fast, accessible websites with Cleitext.' },
    token,
  );

  const paragraph = (id, text) => ({
    id,
    type: 'core/paragraph',
    v: 1,
    attrs: {},
    content: [{ text }],
  });
  const text =
    'Cleitext renders this page on the server with the default theme, so that visitors get ' +
    'readable HTML at once, with little JavaScript and images sized for their screens.';
  const paths = [];
  for (let i = 1; i <= 20; i++) {
    const entry = await call(
      'POST',
      '/entries',
      {
        type: i === 20 ? 'page' : 'article',
        title: `Performance article ${i}`,
        excerpt: `A short summary of article ${i}.`,
        document: {
          schema: 1,
          blocks: Array.from({ length: 6 }, (_, b) => paragraph(`p${b}`, `${text} (${i}.${b})`)),
        },
      },
      token,
    );
    await call('POST', `/entries/${entry.id}/publish`, {}, token);
  }
  // Article addresses as the theme links them (the permalink structure may vary).
  const home = await (await fetch(`${BASE}/`)).text();
  for (const [, href] of home.matchAll(/href="([^"]*performance-article-[^"]*)"/g)) {
    const path = new URL(href, BASE).pathname;
    if (!paths.includes(path)) paths.push(path);
  }
  if (paths.length === 0) throw new Error('The home page links no article.');
  return paths;
}

/**
 * Sends `rate` requests per second for `seconds` without waiting for
 * answers, and measures the time to the response headers.
 */
async function load(next, rate, seconds) {
  const times = [];
  let hits = 0;
  let misses = 0;
  const pending = [];
  const interval = 1000 / rate;
  const start = performance.now();
  for (let i = 0; i < rate * seconds; i++) {
    const due = start + i * interval;
    const delay = due - performance.now();
    if (delay > 0) await wait(delay);
    const url = next();
    const sent = performance.now();
    pending.push(
      fetch(url).then(async (response) => {
        times.push(performance.now() - sent);
        const cache = response.headers.get('x-cache');
        if (cache === 'HIT') hits++;
        if (cache === 'MISS') misses++;
        await response.arrayBuffer();
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
      }),
    );
  }
  await Promise.all(pending);
  times.sort((a, b) => a - b);
  return { p95: times[Math.floor(times.length * 0.95)], hits, misses };
}
