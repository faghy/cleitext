/**
 * The Forms plugin's contact form with fields of its own (Forms 1.3.0): the
 * fields are a list attribute, edited in the block (plugin API 1.43), and
 * the public form draws them in a grid and takes messages.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

test.beforeAll(() => {
  execFileSync(
    'node',
    [
      '--env-file-if-exists=.env',
      'packages/cli/dist/bin.js',
      'plugin:install',
      'plugins/forms',
      '--build',
    ],
    { cwd: root, stdio: 'pipe' },
  );
});

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
}

test('fields of its own are added, ordered and drawn on the site', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  await signIn(page);

  await page.goto('/cl-admin/plugins');
  const card = page.getByRole('listitem', { name: 'Forms' });
  await expect(card).toBeVisible();
  const activate = card.getByRole('button', { name: 'Activate', exact: true });
  if (await activate.isVisible()) await activate.click();
  await expect(card.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();

  await page.goto('/cl-admin/pages');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/cl-admin/entries/**');
  await page.locator('#entry-title').fill(`Booking ${stamp}`);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type('/contact form');
  await expect(page.getByRole('option', { name: /Contact form/i }).first()).toBeVisible();
  await page.keyboard.press('Enter');

  const list = canvas.locator('.cleitext-field-list');
  // Two fields: an arrival date, then the requests.
  await list.getByRole('button', { name: 'Add', exact: true }).click();
  await list.getByLabel('Label').fill('Arrival');
  await list.getByLabel(/^Name/).fill('arrival');
  await list.getByLabel('Type').selectOption('date');
  await list.getByLabel('Required').check();
  await list.getByLabel('Width on desktop').selectOption('1/2');
  await list.getByRole('button', { name: 'Add', exact: true }).click();
  await list.getByLabel('Label').fill('Requests');
  await list.getByLabel(/^Name/).fill('requests');
  await list.getByLabel('Type').selectOption('textarea');
  // The requests first, then back again.
  await list.getByRole('button', { name: 'Move up' }).nth(1).click();
  await expect(list.locator('li').first()).toContainText('Requests');
  await list.getByRole('button', { name: 'Move down' }).first().click();
  await expect(list.locator('li').first()).toContainText('Arrival');
  await canvas.getByLabel('Email subject').fill('Booking {arrival}');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();

  const visitor = await browser.newContext();
  const site = await visitor.newPage();
  await site.goto(`${SITE}/booking-${stamp}`);
  const form = site.locator('form.cf-grid');
  await expect(form.locator('.cf-date.cf-w-1-2')).toBeVisible();
  await form.getByLabel('Arrival').fill('2099-07-10');
  await form.getByLabel('Requests').fill('A quiet room, please.');
  await form.getByRole('button', { name: 'Send' }).click();
  await expect(site.getByRole('status')).toHaveText('Thank you, we will reply soon.');

  await page.goto('/cl-admin/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Messages' })
    .click();
  await expect(page.getByText('A quiet room, please.').first()).toBeVisible();
  expect(errors).toEqual([]);
  await visitor.close();
});
