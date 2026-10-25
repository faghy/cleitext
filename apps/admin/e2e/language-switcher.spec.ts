/**
 * Multilingual's language switcher (1.6.0): set in Languages → Language
 * switcher to go into a menu of the active theme, it takes a visitor from a
 * page to its translation. Everything made here is removed afterwards.
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

/** What this spec changed, undone in `afterAll`. */
const made = {
  entries: [] as string[],
  addedItalian: false,
  activated: false,
  settings: null as Record<string, unknown> | null,
};

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

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page);
  if (made.settings) await call(page, 'PUT', '/ext/multilingual/switcher', made.settings);
  for (const id of made.entries.reverse()) {
    await call(page, 'POST', `/entries/${id}/trash`).catch(() => {});
    await call(page, 'DELETE', `/entries/${id}`).catch(() => {});
  }
  if (made.addedItalian)
    await call(page, 'DELETE', '/ext/multilingual/languages/it').catch(() => {});
  if (made.activated) await call(page, 'POST', '/plugins/multilingual/deactivate');
  await page.close();
});

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
}

/** Calls the API from the signed-in admin page (with the CSRF token; JSON only with a body). */
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

test('a menu’s language switcher leads to the translation of the page', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  const plugins = await call<{ slug: string; active: boolean }[]>(page, 'GET', '/plugins');
  if (!plugins.find((p) => p.slug === 'multilingual')?.active) {
    await call(page, 'POST', '/plugins/multilingual/activate');
    made.activated = true;
  }
  const languages = await call<{ code: string }[]>(page, 'GET', '/ext/multilingual/languages');
  if (!languages.some((l) => l.code === 'it')) {
    await call(page, 'POST', '/ext/multilingual/languages', { code: 'it', name: 'Italiano' });
    made.addedItalian = true;
  }
  made.settings = await call(page, 'GET', '/ext/multilingual/switcher');

  // A page and its Italian translation, both published.
  const en = await call<{ id: string; slug: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Opening hours ${stamp}`,
  });
  made.entries.push(en.id);
  await call(page, 'POST', `/entries/${en.id}/publish`);
  const { id: itId } = await call<{ id: string }>(
    page,
    'POST',
    `/ext/multilingual/translations/entry/${en.id}`,
    { locale: 'it' },
  );
  made.entries.push(itId);
  await call(page, 'PATCH', `/entries/${itId}`, {
    title: `Orari ${stamp}`,
    slug: `orari-${stamp}`,
  });
  await call(page, 'POST', `/entries/${itId}/publish`);

  // Languages → Language switcher: one item per language, in the theme's first menu location.
  await page.goto('/cl-admin/ext/multilingual/switcher');
  await expect(page.getByRole('heading', { name: 'Language switcher', level: 1 })).toBeVisible();
  const location = page.getByLabel('Add the languages to the menu in');
  const first = await location.locator('option').nth(1).getAttribute('value');
  expect(first).toBeTruthy();
  await location.selectOption(first!);
  await page.getByLabel('In menus').selectOption('inline');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').getByText('Saved.')).toBeVisible();

  // The public page: the menu's "Italiano" (a menu item, not a switcher link) opens the translation.
  await page.goto(`${SITE}/${en.slug}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const item = page.locator('a:not([hreflang])', { hasText: /^Italiano$/ }).first();
  await expect(item).toBeVisible();
  await item.click();
  await page.waitForURL(`**/it/orari-${stamp}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page).toHaveTitle(new RegExp(`Orari ${stamp}`));
  // And back, from the Italian page.
  await page
    .locator('a:not([hreflang])', { hasText: /^English$/ })
    .first()
    .click();
  await page.waitForURL(`**/${en.slug}`);
  expect(appErrors(errors)).toEqual([]);
});
