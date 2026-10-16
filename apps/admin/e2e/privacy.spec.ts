/**
 * The Privacy & GDPR plugin in the browser: the cookie banner on the public
 * site (choices, the floating button, scripts held until consent) and the
 * admin page that writes the policies.
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
  execFileSync(
    'node',
    [
      '--env-file-if-exists=.env',
      'packages/cli/dist/bin.js',
      'plugin:install',
      'plugins/privacy',
      '--build',
    ],
    { cwd: root, stdio: 'pipe' },
  );
  // Installing restarts the development server: wait until it answers again.
  await waitUntilReady();
});

// The other specs run without the banner, even after a failure here.
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page);
  await call(page, 'POST', '/plugins/privacy/deactivate').catch(() => undefined);
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

test('the cookie banner asks, remembers and holds scripts until consent', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await call(page, 'POST', '/plugins/privacy/activate');
  const config = await call<Record<string, Record<string, unknown>>>(
    page,
    'GET',
    '/ext/privacy/config',
  );
  await call(page, 'PUT', '/ext/privacy/config', {
    ...config,
    banner: {
      ...config.banner,
      enabled: true,
      categories: ['statistics', 'marketing'],
      scripts: {
        statistics: '<script>window.statsLoaded = (window.statsLoaded || 0) + 1</script>',
      },
    },
    askAgain: true,
  });

  const context = await browser.newContext({ baseURL: SITE });
  const visitor = await context.newPage();
  const errors: string[] = [];
  visitor.on('pageerror', (e) => errors.push(e.message));
  await visitor.goto('/');
  const banner = visitor.getByRole('dialog', { name: 'Your privacy' });
  await expect(banner).toBeVisible();
  // The first choice offered is the refusal, as visible as the acceptance.
  await expect(banner.getByRole('button', { name: 'Reject all' })).toBeFocused();
  await expect(banner.getByRole('button', { name: 'Accept all' })).toBeVisible();

  await banner.getByRole('button', { name: 'Reject all' }).click();
  await expect(banner).toBeHidden();
  expect(
    await visitor.evaluate(() => (window as { statsLoaded?: number }).statsLoaded),
  ).toBeUndefined();
  const cookie = (await context.cookies()).find((c) => c.name === 'cx_consent');
  expect(JSON.parse(decodeURIComponent(cookie!.value)).c).toEqual([]);

  // The floating button opens the choices again.
  await visitor.getByRole('button', { name: 'Cookie preferences' }).click();
  await expect(banner).toBeVisible();
  await banner.getByLabel(/Statistics/).check();
  await banner.getByRole('button', { name: 'Save choices' }).click();
  await expect(banner).toBeHidden();
  expect(await visitor.evaluate(() => (window as { statsLoaded?: number }).statsLoaded)).toBe(1);

  // Remembered on the next page, where the script runs at once.
  await visitor.reload();
  await expect(banner).toBeHidden();
  expect(await visitor.evaluate(() => (window as { statsLoaded?: number }).statsLoaded)).toBe(1);

  const stats = await call<{ total: number; byCategory: Record<string, number> }>(
    page,
    'GET',
    '/ext/privacy/consents',
  );
  expect(stats.total).toBeGreaterThanOrEqual(2);
  expect(stats.byCategory.statistics).toBeGreaterThanOrEqual(1);
  await context.close();
  expect(appErrors(errors)).toEqual([]);
});

test('the admin page writes a privacy policy as a draft made of blocks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await call(page, 'POST', '/plugins/privacy/activate');
  // The menu shows the pages of plugins active when the admin loaded.
  await page.reload();
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Privacy & GDPR' })).toBeVisible();
  await page.getByRole('tab', { name: 'Policies' }).click();
  await page.getByLabel('Name or company').fill('Example Ltd');
  await page.getByLabel('Email for privacy requests').fill('privacy@example.com');
  // From an earlier run, a page may exist already: a new draft is fine.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Create privacy policy' }).first().click();
  const link = page.getByRole('link', { name: /Privacy policy — open in the editor/ });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL('**/cl-admin/entries/**');
  // Ordinary blocks in the editor: the controller's name, headings, paragraphs.
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await expect(canvas.getByText('Example Ltd').first()).toBeVisible({ timeout: 15_000 });
  await expect(canvas.getByText('What data we process and why')).toBeVisible();
  expect(appErrors(errors)).toEqual([]);
});
