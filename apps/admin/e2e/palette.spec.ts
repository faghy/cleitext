/** Command palette (RF-ADM-05). */
import { expect, test } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

test('Ctrl+K opens the palette to navigate and find content', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
  const entry = await page.evaluate(async (stamp) => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    const res = await fetch('/api/v1/entries', {
      method: 'POST',
      headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'page', title: `Palette ${stamp}` }),
    });
    return (await res.json()) as { id: string };
  }, stamp);

  // Navigation with the keyboard.
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('combobox')).toBeFocused();
  await page.keyboard.type('media');
  await expect(palette.getByRole('option').first()).toContainText('Media');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/cl-admin/media');
  await expect(palette).toHaveCount(0);

  // Content found by the global search.
  await page.getByRole('button', { name: 'Open the command palette' }).click();
  await expect(palette.getByRole('combobox')).toBeFocused();
  await page.keyboard.type(`Palette ${stamp}`);
  await expect(palette.getByRole('option', { name: new RegExp(`Palette ${stamp}`) })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/cl-admin/entries/${entry.id}`);

  expect(appErrors(errors)).toEqual([]);
});
