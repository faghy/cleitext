/**
 * The Analytics plugin with Privacy & GDPR: a service turned on in the admin
 * is loaded on the public site only after consent.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
/**
 * Installing a plugin restarts the development server a moment later: wait,
 * then until its health check answers several times in a row.
 */
async function waitUntilReady() {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  await sleep(2000);
  let streak = 0;
  for (let i = 0; i < 240 && streak < 3; i++) {
    const ok = await fetch('http://localhost:5173/health/ready')
      .then((r) => r.ok)
      .catch(() => false);
    streak = ok ? streak + 1 : 0;
    await sleep(500);
  }
}

const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

test.beforeAll(async () => {
  for (const plugin of ['privacy', 'analytics']) {
    execFileSync(
      'node',
      [
        '--env-file-if-exists=.env',
        'packages/cli/dist/bin.js',
        'plugin:install',
        `plugins/${plugin}`,
        '--build',
      ],
      { cwd: root, stdio: 'pipe' },
    );
  }
  // Installing restarts the development server: wait until it answers again.
  await waitUntilReady();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page);
  for (const plugin of ['analytics', 'privacy']) {
    await call(page, 'POST', `/plugins/${plugin}/deactivate`).catch(() => undefined);
  }
  await page.close();
});

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
}

async function call<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const { token } = await (await fetch('/api/v1/auth/csrf')).json();
      const res = await fetch(`/api/v1${path}`, {
        method,
        headers: {
          'x-csrf-token': token,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
      return res.status === 204 ? (null as T) : res.json();
    },
    { method, path, body },
  );
}

test('Google Analytics turned on in the admin waits for consent', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  for (const plugin of ['privacy', 'analytics']) {
    await call(page, 'POST', `/plugins/${plugin}/activate`);
  }
  const privacy = await call<Record<string, Record<string, unknown>>>(
    page,
    'GET',
    '/ext/privacy/config',
  );
  await call(page, 'PUT', '/ext/privacy/config', {
    ...privacy,
    banner: { ...privacy.banner, enabled: true, categories: [], scripts: {} },
  });

  // The menu shows the pages of plugins active when the admin loaded.
  await page.reload();
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  await page.getByLabel('Use Google Analytics 4').check();
  await page.getByLabel('Measurement ID').fill('G-TEST12345');
  await expect(page.getByText(/loaded only after consent to “Statistics”/)).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  try {
    const context = await browser.newContext({ baseURL: SITE });
    // No real request to Google from the tests.
    await context.route('https://www.googletagmanager.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.gaLoaded=true;' }),
    );
    const visitor = await context.newPage();
    await visitor.goto('/');
    const banner = visitor.getByRole('dialog', { name: 'Your privacy' });
    await expect(banner).toBeVisible();
    expect(
      await visitor.evaluate(() => (window as { gaLoaded?: boolean }).gaLoaded),
    ).toBeUndefined();
    await banner.getByRole('button', { name: 'Accept all' }).click();
    await expect
      .poll(() => visitor.evaluate(() => (window as { gaLoaded?: boolean }).gaLoaded))
      .toBe(true);
    await context.close();
  } finally {
    await page.getByLabel('Use Google Analytics 4').uncheck();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^Saved\./)).toBeVisible();
  }
  expect(appErrors(errors)).toEqual([]);
});
