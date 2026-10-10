/** Posts → Categories (RF-TAX-01/03): add, edit, translate and delete terms. */
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

test('categories are managed and translated from their own screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Categories' })
    .click();
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

  // Translate into Italian, then look at the Italian terms.
  page.once('dialog', (dialog) => dialog.accept(`Scienza ${stamp}`));
  await page
    .getByRole('row')
    .filter({ hasText: `Science ${stamp}` })
    .filter({ hasNotText: 'Astrophysics' })
    .getByRole('button', { name: /Add translation/ })
    .click();
  await expect(page.getByText(`Translation added: Scienza ${stamp}`)).toBeVisible();
  await page.getByRole('button', { name: `Scienza ${stamp}` }).click();
  await expect(page.getByLabel('Language')).toHaveValue('it');
  await expect(page.getByRole('row').filter({ hasText: `Scienza ${stamp}` })).toHaveCount(1);

  // Delete.
  await page.getByLabel('Language').selectOption('en');
  await page.getByLabel(/^Search categories/).fill(stamp);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `Delete Astrophysics ${stamp}` }).click();
  await expect(page.getByRole('row').filter({ hasText: `Astrophysics ${stamp}` })).toHaveCount(0);

  expect(appErrors(errors)).toEqual([]);
});
