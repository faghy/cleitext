/** Light and dark admin (RF-ADM-04): following the system, or chosen in the profile. */
import { expect, test, type Page } from '@playwright/test';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
}

const background = (page: Page) =>
  page
    .locator('main, .min-h-screen')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

test('the color scheme follows the system and can be chosen', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page);
  const dark = await background(page);
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await background(page);
  expect(dark).not.toBe(light);

  // Chosen in the profile: applied at once and kept after a reload.
  await page.goto('/cl-admin/profile');
  await page.getByLabel('Color scheme').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await background(page)).toBe(dark);

  await page.getByLabel('Color scheme').selectOption('system');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});
