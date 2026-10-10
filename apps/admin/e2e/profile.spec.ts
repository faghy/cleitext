/** Profile picture (RF-USR-07): upload, shown in the top bar, removal. */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
const sample = readFileSync(new URL('./fixtures/sample.jpg', import.meta.url));

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

test('a profile picture can be set and removed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await signIn(page);
  await page.goto('/admin/profile');
  const card = page.getByRole('heading', { name: 'Profile picture' }).locator('..');
  await page
    .getByLabel('Profile picture file')
    .setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: sample });
  const avatar = page.locator('header img[src^="/media/avatars/"]');
  await expect(avatar).toBeVisible();
  expect(await avatar.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);

  await card.getByRole('button', { name: 'Remove picture' }).click();
  await expect(avatar).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Upload picture' })).toBeVisible();

  expect(appErrors(errors)).toEqual([]);
});
