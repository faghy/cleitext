/** Appearance → Themes, Customize and Areas (RF-THM-01/03/04). */
import { expect, test } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

test('the theme is customized with a live preview and a footer area', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
  await page.goto('/cl-admin/appearance');

  // Appearance opens on Themes; the active theme leads to its options.
  await expect(page.getByRole('tab', { name: 'Themes' })).toHaveAttribute('aria-selected', 'true');
  const aurora = page.getByRole('listitem', { name: 'Aurora' });
  await expect(aurora).toContainText('Active');
  await aurora.getByRole('button', { name: 'Customize Aurora' }).click();
  await expect(page.getByRole('tab', { name: 'Customize' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Customize: the preview follows the form before anything is saved.
  await page.getByLabel('Footer text').fill(`Footer ${stamp}`);
  const preview = page.frameLocator('iframe[title="Site preview"]');
  await expect(preview.getByText(`Footer ${stamp}`)).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  // Areas: a paragraph in the footer, written with the block editor.
  await page.getByRole('tab', { name: 'Areas' }).click();
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type(`Area note ${stamp}`);
  await page.getByRole('button', { name: 'Save area' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const visitor = await browser.newContext();
  const site = await visitor.newPage();
  await site.goto(`${SITE}/`);
  await expect(site.locator('.site-footer')).toContainText(`Footer ${stamp}`);
  await expect(site.locator('.footer-area')).toContainText(`Area note ${stamp}`);
  await visitor.close();

  // Back to the default footer text and an empty area.
  await page.getByRole('tab', { name: 'Customize' }).click();
  await page.getByLabel('Footer text').fill('');
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.evaluate(async () => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    await fetch('/api/v1/themes/active/areas/footer?locale=en', {
      method: 'PUT',
      headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ document: { schema: 1, blocks: [] } }),
    });
  });

  expect(appErrors(errors)).toEqual([]);
});
