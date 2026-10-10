/** Keyboard shortcuts in the editor and their help dialog (RF-EDT-06). */
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

test('undo, save and the shortcuts help work from the keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await signIn(page);
  await page.goto('/admin/posts');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/admin/entries/**');
  const id = page.url().split('/').pop()!;

  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type('First line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second line');
  await expect(canvas.getByText('Second line')).toBeVisible();

  // Undo from the canvas removes the last typing step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(canvas.getByText('Second line')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(canvas.getByText('Second line')).toBeVisible();

  // Ctrl/Cmd+S saves.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  const saved = await page.evaluate(
    async (entryId) => (await fetch(`/api/v1/entries/${entryId}`)).json(),
    id,
  );
  expect(saved.revision.document.blocks).toHaveLength(2);

  // The help dialog lists the editor's and the page's shortcuts.
  await page.keyboard.press('Shift+Alt+h');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Save your changes.')).toBeVisible();
  await expect(dialog.getByText('Duplicate the selected block(s).')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(dialog).toBeVisible();

  expect(appErrors(errors)).toEqual([]);
});
