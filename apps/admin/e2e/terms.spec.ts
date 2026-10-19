/** Posts → Categories (RF-TAX-01): add, edit and delete terms (translations: multilingual.spec.ts). */
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
}

test('categories are managed from their own screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  // As in WordPress: hovering Posts opens its submenu beside the sidebar.
  const main = page.getByRole('navigation', { name: 'Main' });
  await expect(main.getByRole('link', { name: 'Categories', exact: true })).toBeHidden();
  await main.getByRole('link', { name: 'Posts', exact: true }).hover();
  await main.getByRole('link', { name: 'Categories', exact: true }).click();
  // Now Posts is the current section: its submenu stays open below it.
  await expect(main.getByRole('link', { name: 'All posts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeVisible();

  const add = page.getByRole('form', { name: 'Add new' });
  await add.getByLabel('Name').fill(`Science ${stamp}`);
  await add.getByLabel('Description').fill('About science');
  await add.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(`Added: Science ${stamp}`)).toBeVisible();

  await add.getByLabel('Name').fill(`Physics ${stamp}`);
  await add.getByLabel('Parent').selectOption({ label: `Science ${stamp}` });
  await add.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel(/^Search categories/).fill(stamp);
  const row = page.getByRole('row').filter({ hasText: `Physics ${stamp}` });
  await expect(row).toHaveCount(1);

  // Edit inline.
  await row.getByRole('button', { name: `Edit Physics ${stamp}` }).click();
  const edit = page.getByRole('form', { name: `Edit Physics ${stamp}` });
  await edit.getByLabel('Name').fill(`Astrophysics ${stamp}`);
  await edit.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByRole('row').filter({ hasText: `Astrophysics ${stamp}` })).toHaveCount(1);

  // Delete.
  await page.getByLabel(/^Search categories/).fill(stamp);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Delete Astrophysics ${stamp}` }).click();
  await expect(page.getByRole('row').filter({ hasText: `Astrophysics ${stamp}` })).toHaveCount(0);

  expect(appErrors(errors)).toEqual([]);
});
