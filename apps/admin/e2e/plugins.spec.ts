/**
 * M4 acceptance (docs/SPECIFICATIONS.md §13): a plugin outside the Cleitext
 * packages (examples/plugin-events), built only with the SDK documentation,
 * adds a content type, a block, an admin page and its own table; turning it
 * off does not break the site.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

test.beforeAll(() => {
  // Exactly what a site owner runs; running servers reload their plugins.
  execFileSync(
    'node',
    [
      '--env-file-if-exists=.env',
      'packages/cli/dist/bin.js',
      'plugin:install',
      'examples/plugin-events',
      '--build',
    ],
    { cwd: root, stdio: 'pipe' },
  );
});

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

/** Sets the plugin state from the Plugins screen. */
async function setActive(page: Page, active: boolean) {
  await page.goto('/admin/plugins');
  const card = page.getByRole('listitem', { name: 'Events' });
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
}

test('a plugin adds a type, a block, an admin page and its table; deactivating it is safe', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const sidebar = page.getByRole('navigation', { name: 'Main' });

  await signIn(page);
  await setActive(page, false); // a clean start if a previous run left it on
  await setActive(page, true);
  const details = page.getByRole('listitem', { name: 'Events' }).locator('details');
  await details.locator('summary').click();
  await expect(details).toContainText('Add blocks');

  // 1. The content type, with custom fields.
  await sidebar.getByRole('link', { name: 'Events', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/admin/entries/**');
  await page.locator('#entry-title').fill(`Open day ${stamp}`);
  const fields = page.getByRole('region', { name: 'Details' });
  await page.getByRole('button', { name: 'Publish' }).click();
  // The date is required to publish.
  await expect(fields.getByText(/expected string|Invalid|Required/i).first()).toBeVisible();
  await fields.getByLabel('Date').fill('2099-05-17');
  await fields.getByLabel('Venue').fill('Main hall');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();

  // 2. The block, inserted in a page with the Gutenberg editor.
  await page.goto('/admin/pages');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/admin/entries/**');
  await page.locator('#entry-title').fill(`What's on ${stamp}`);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type('/upcoming');
  await expect(page.getByRole('option', { name: /Upcoming events/i }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await canvas.getByLabel('Heading').fill('Coming soon');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();

  // 3. The public site: the block lists the event; the event page takes RSVPs.
  const visitor = await browser.newContext();
  const site = await visitor.newPage();
  await site.goto(`${SITE}/whats-on-${stamp}`);
  const block = site.locator('.wp-block-events-upcoming');
  await expect(block.getByRole('heading', { name: 'Coming soon' })).toBeVisible();
  await block.getByRole('link', { name: `Open day ${stamp}` }).click();
  await expect(site.getByRole('heading', { level: 1, name: `Open day ${stamp}` })).toBeVisible();
  await expect(site.getByText('Main hall')).toBeVisible();
  await site.getByLabel('Name').fill('Ada');
  await site.getByLabel('Email').fill(`ada-${stamp}@example.com`);
  await site.getByRole('button', { name: 'Book' }).click();
  await expect(site.getByRole('status')).toHaveText('Thank you, your place is booked.');

  // 4. The admin page, reading the plugin's own table.
  await page.goto('/admin/');
  await sidebar.getByRole('link', { name: 'RSVPs' }).click();
  await expect(page.getByRole('heading', { name: 'RSVPs' })).toBeVisible();
  await expect(page.getByText(`ada-${stamp}@example.com`)).toBeVisible();

  // 5. Deactivation: nothing breaks, the plugin's additions go away.
  await setActive(page, false);
  await expect(sidebar.getByRole('link', { name: 'RSVPs' })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Events', exact: true })).toHaveCount(0);
  const agenda = await site.goto(`${SITE}/whats-on-${stamp}`);
  expect(agenda?.status()).toBe(200);
  await expect(site.locator('.wp-block-events-upcoming')).toHaveCount(0);
  const event = await site.goto(`${SITE}/events/open-day-${stamp}`);
  expect(event?.status()).toBe(404);
  // The editor keeps the block as "unavailable".
  await page.goBack();
  await page.goto('/admin/pages');
  // Pages pile up across runs: search instead of relying on the first page.
  await page.getByRole('searchbox', { name: 'Search pages' }).fill(stamp);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name: `What's on ${stamp}` }).click();
  await expect(
    page
      .frameLocator('iframe[name="editor-canvas"]')
      .getByText(/events\/upcoming\) is not available/),
  ).toBeVisible();

  // 6. Reactivation brings everything back, data included.
  await setActive(page, true);
  await site.goto(`${SITE}/whats-on-${stamp}`);
  await expect(site.locator('.wp-block-events-upcoming')).toContainText(`Open day ${stamp}`);
  await sidebar.getByRole('link', { name: 'RSVPs' }).click();
  await expect(page.getByText(`ada-${stamp}@example.com`)).toBeVisible();

  await visitor.close();
  expect(appErrors(errors)).toEqual([]);
});
