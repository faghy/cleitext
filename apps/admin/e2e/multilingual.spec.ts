/**
 * The Multilingual plugin (M7) in the admin: Settings → Languages, the
 * Translations section of the editor and the translations columns of the
 * lists. Without the plugin none of this shows (other specs).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
/** The public site is served by the application server, not by Vite. */
const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

test.beforeAll(() => {
  execFileSync(
    'node',
    [
      '--env-file-if-exists=.env',
      'packages/cli/dist/bin.js',
      'plugin:install',
      'plugins/multilingual',
      '--build',
    ],
    { cwd: root, stdio: 'pipe' },
  );
});

// The other specs run on a site with one language, even after a failure here.
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page);
  await setActive(page, false);
  await page.close();
});

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

/** Calls the API from the signed-in admin page (with the CSRF token). */
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

async function setActive(page: Page, active: boolean) {
  await page.goto('/admin/plugins');
  const card = page.getByRole('listitem', { name: 'Multilingual' });
  await expect(card).toBeVisible();
  const button = card.getByRole('button', {
    name: active ? 'Activate' : 'Deactivate',
    exact: true,
  });
  if (await button.isVisible()) {
    await button.click();
    await expect(
      card.getByRole('button', { name: active ? 'Deactivate' : 'Activate', exact: true }),
    ).toBeVisible();
  }
  // Only an active plugin links to its options: here the Languages page.
  const settings = card.getByRole('link', { name: 'Settings Multilingual' });
  if (active) {
    await expect(settings).toHaveAttribute('href', '/admin/ext/multilingual');
  } else {
    await expect(settings).toHaveCount(0);
  }
}

test('languages are added, and content and categories translated', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  await setActive(page, true);
  // Settings → Languages.
  await page.goto('/admin/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Languages' })
    .click();
  await expect(page.getByRole('heading', { name: 'Languages', level: 1 })).toBeVisible();
  const languages = page.getByRole('table');
  if ((await languages.getByRole('row').filter({ hasText: 'Italiano' }).count()) === 0) {
    await page.getByLabel('Language', { exact: true }).selectOption('it');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(languages.getByRole('row').filter({ hasText: 'Italiano' })).toHaveCount(1);

  // The editor: Translations section, then the Italian copy.
  const post = await call<{ id: string }>(page, 'POST', '/entries', {
    type: 'article',
    title: `Weekend in Rome ${stamp}`,
  });
  await page.goto(`/admin/entries/${post.id}`);
  const panel = page.getByRole('region', { name: 'Translations' });
  await expect(panel.getByText('Written in English.')).toBeVisible();
  await panel.getByLabel('Add translation').selectOption('it');
  await page.waitForURL((url) => !url.pathname.endsWith(post.id));
  const itId = page.url().split('/').pop()!;
  await page.getByRole('textbox', { name: 'Title' }).fill(`Weekend a Roma ${stamp}`);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Translations' }).getByText('Written in Italiano.'),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Translations' }).getByRole('link', {
      name: `English: Weekend in Rome ${stamp}`,
    }),
  ).toBeVisible();

  // The list: the English row links its Italian version.
  await page.goto('/admin/posts');
  await page.getByRole('searchbox', { name: 'Search posts' }).fill(stamp);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: `Weekend in Rome ${stamp}` });
  await expect(
    row.getByRole('link', { name: new RegExp(`Italiano: Weekend a Roma ${stamp}`) }),
  ).toBeVisible();

  // Categories: a translation from the list.
  await call(page, 'POST', '/taxonomies/category/terms', { name: `Travel ${stamp}` });
  await page.goto('/admin/taxonomies/category');
  page.once('dialog', (dialog) => dialog.accept(`Viaggi ${stamp}`));
  await page
    .getByRole('row')
    .filter({ hasText: `Travel ${stamp}` })
    .getByRole('button', { name: /Add translation/ })
    .click();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: `Travel ${stamp}` })
      .getByText(`Viaggi ${stamp}`),
  ).toBeVisible();

  // The overview: originals and their translations, per language.
  await page.goto('/admin/ext/multilingual/overview');
  await expect(page.getByRole('heading', { name: 'Translations', level: 1 })).toBeVisible();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: `Weekend in Rome ${stamp}` })
      .getByRole('link', { name: new RegExp(`Weekend a Roma ${stamp}`) }),
  ).toBeVisible();

  // The public site: the Italian address, linked to the English one.
  await call(page, 'POST', `/entries/${post.id}/publish`);
  await call(page, 'POST', `/entries/${itId}/publish`);
  const italian = await call<{ slug: string }>(page, 'GET', `/entries/${itId}`);
  const year = new Date().getUTCFullYear();
  const response = await page.goto(`${SITE}/it/${year}/${italian.slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  expect(await page.locator('link[rel="alternate"][hreflang="en"]').count()).toBe(1);
  expect(appErrors(errors)).toEqual([]);
});
