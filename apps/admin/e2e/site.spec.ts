/**
 * M3 acceptance (docs/SPECIFICATIONS.md §13): menus and settings managed from
 * the admin show up on the public site, publishing refreshes the pages without
 * flushing caches by hand, and drafts can be previewed with a signed link.
 */
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
/** The public site is served by the application server, not by Vite. */
const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

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
      return res.json();
    },
    { method, path, body },
  );
}

async function publish(page: Page, type: string, title: string) {
  const entry = await call<{ id: string; slug: string }>(page, 'POST', '/entries', { type, title });
  return call<{ id: string; slug: string }>(page, 'POST', `/entries/${entry.id}/publish`);
}

test('menus, settings, publishing and previews reach the public site', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  await publish(page, 'page', `About ${stamp}`);

  // Appearance → Menus: a page and a custom link nested under it.
  await page.goto('/admin/appearance');
  await page.getByRole('tab', { name: 'Menus' }).click();
  await page.getByLabel('New menu').fill(`Main ${stamp}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByLabel('Menu name')).toHaveValue(`Main ${stamp}`);
  await page.getByLabel('Display location').selectOption({ label: 'Main menu' });
  await page.getByLabel('Search pages').fill(stamp);
  await page.getByRole('button', { name: `Add About ${stamp} to the menu` }).click();
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/docs');
  await page.getByLabel('Link text').fill(`Docs ${stamp}`);
  await page.getByRole('button', { name: 'Add to menu' }).click();
  const items = page.getByRole('list', { name: 'Menu items' }).getByRole('listitem');
  await expect(items).toHaveCount(2);
  await items.nth(1).getByRole('button', { name: 'Make sub-item' }).click();
  await page.getByRole('button', { name: 'Save menu' }).click();
  await expect(page.getByText('Menu saved.')).toBeVisible();

  // Settings → tagline.
  await page.goto('/admin/settings');
  await page.getByLabel('Tagline').fill(`Notes ${stamp}`);
  // The same button sits between the cards and at the bottom.
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Save changes' }).first().click();
  await expect(page.getByText('Settings saved.').first()).toBeVisible();

  // The public site, as an anonymous visitor.
  const visitor = await context.browser()!.newContext();
  const site = await visitor.newPage();
  await site.goto(`${SITE}/`);
  await expect(site.locator('.site-tagline')).toHaveText(`Notes ${stamp}`);
  const nav = site.getByRole('navigation', { name: 'Main menu' });
  // The nested link opens as a drop-down.
  await nav.getByRole('link', { name: `About ${stamp}` }).hover();
  await expect(nav.getByRole('link', { name: `Docs ${stamp}` })).toHaveAttribute(
    'href',
    'https://example.com/docs',
  );
  await nav.getByRole('link', { name: `About ${stamp}` }).click();
  await expect(site.getByRole('heading', { level: 1, name: `About ${stamp}` })).toBeVisible();

  // Publishing refreshes the cached home page and the sitemap.
  await site.goto(`${SITE}/`);
  const story = await publish(page, 'article', `Story ${stamp}`);
  await site.goto(`${SITE}/`);
  await expect(site.getByRole('link', { name: `Story ${stamp}` }).first()).toBeVisible();
  const sitemap = await site.request.get(`${SITE}/sitemap-article-en.xml`);
  expect(await sitemap.text()).toContain(`/${story.slug}</loc>`);

  // A draft, previewed from the editor in a new tab.
  const draft = await call<{ id: string }>(page, 'POST', '/entries', {
    type: 'article',
    title: `Draft ${stamp}`,
  });
  await page.goto(`/admin/entries/${draft.id}`);
  const [preview] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Preview' }).click(),
  ]);
  await preview.waitForURL(/__preview/);
  await expect(preview.getByRole('heading', { level: 1, name: `Draft ${stamp}` })).toBeVisible();
  // Not on the public site.
  await site.goto(`${SITE}/`);
  await expect(site.getByText(`Draft ${stamp}`)).toHaveCount(0);

  await visitor.close();
  expect(appErrors(errors)).toEqual([]);
});
