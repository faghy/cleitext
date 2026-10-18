/**
 * A plugin block with its own editor (plugin API 1.23): the plugin's block
 * editor entry registers it, the canvas gets its styles, and what is
 * written there reaches the site.
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
  execFileSync(
    'node',
    [
      '--env-file-if-exists=.env',
      'packages/cli/dist/bin.js',
      'plugin:install',
      'apps/server/test/fixtures/native-plugin',
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

test('a block of a plugin is edited with its own editor and published', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  const activated = await page.evaluate(async () => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    const res = await fetch('/api/v1/plugins/native/activate', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
    });
    return res.status;
  });
  expect([200, 409]).toContain(activated);

  await page.goto('/cl-admin/pages');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/cl-admin/entries/**');
  await page.locator('#entry-title').fill(`Native ${stamp}`);

  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type('/box');
  await expect(page.getByRole('option', { name: /^Box$/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');

  // The plugin's own edit, with the plugin's canvas styles.
  const box = canvas.locator('section.nb-box').first();
  await expect(box).toBeVisible();
  // Like WordPress, the selected block shows its settings in the sidebar.
  await expect(page.getByRole('tab', { name: 'Block' })).toHaveAttribute('aria-selected', 'true');
  await expect(box).toHaveCSS('border-top-color', 'rgb(124, 58, 237)');
  // The preview device: the canvas takes the tablet's width, then back.
  await page.getByRole('button', { name: 'Tablet preview' }).click();
  await expect(page.locator('.cleitext-gutenberg__frame')).toHaveCSS('width', '780px');
  await page.getByRole('button', { name: 'Desktop preview' }).click();
  await box.getByRole('textbox', { name: 'Box heading' }).click();
  await page.keyboard.type(`Heading ${stamp}`);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();

  await page.reload();
  await expect(canvas.locator('section.nb-box h2').first()).toHaveText(`Heading ${stamp}`);

  const id = page.url().split('/').pop()!;
  const entry = await page.evaluate(async (id) => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    const res = await fetch(`/api/v1/entries/${id}/publish`, {
      method: 'POST',
      headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
      body: '{}',
    });
    return (await res.json()) as { slug: string };
  }, id);

  const visitor = await context.browser()!.newContext();
  const site = await visitor.newPage();
  await site.goto(`${SITE}/${entry.slug}`);
  await expect(site.locator('section.nb-box h2')).toHaveText(`Heading ${stamp}`);
  await visitor.close();

  expect(appErrors(errors)).toEqual([]);
});
