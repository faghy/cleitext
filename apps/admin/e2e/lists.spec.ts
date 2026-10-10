/** List tables (RF-ADM-03): search, sorting, quick edit and bulk actions. */
import { expect, test, type Page } from '@playwright/test';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

async function createPage(page: Page, title: string): Promise<void> {
  await page.evaluate(async (title) => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    const res = await fetch('/api/v1/entries', {
      method: 'POST',
      headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'page', title }),
    });
    if (!res.ok) throw new Error(await res.text());
  }, title);
}

test('list tables sort, edit inline and apply bulk actions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  await createPage(page, `Beta ${stamp}`);
  await createPage(page, `Alpha ${stamp}`);

  await page.goto('/admin/pages');
  await page.getByLabel(/^Search pages/).fill(stamp);
  await page.getByRole('button', { name: 'Search' }).click();
  const rows = page.getByRole('row');
  await expect(rows).toHaveCount(3);

  // Sorting by title, then reversed.
  await page.getByRole('button', { name: 'Title' }).click();
  await expect(rows.nth(1)).toContainText(`Alpha ${stamp}`);
  await page.getByRole('button', { name: /^Title/ }).click();
  await expect(rows.nth(1)).toContainText(`Beta ${stamp}`);

  // Quick edit of the title and order.
  await rows.nth(1).getByRole('button', { name: 'Quick Edit' }).click();
  const form = page.getByRole('form', { name: 'Quick Edit' });
  await form.getByLabel('Title').fill(`Gamma ${stamp}`);
  await form.getByLabel('Order').fill('5');
  await form.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByRole('link', { name: `Gamma ${stamp}` })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`Gamma ${stamp}`) })).toContainText('5');

  // Bulk: publish both, then move them to the trash.
  await page.getByLabel('Select all').check();
  await page.getByLabel('Bulk action', { exact: true }).selectOption('publish');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('2 items updated.')).toBeVisible();
  await expect(rows.nth(1)).toContainText('Published');
  await page.getByLabel('Select all').check();
  await page.getByLabel('Bulk action', { exact: true }).selectOption('trash');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Nothing found.')).toBeVisible();

  expect(errors).toEqual([]);
});
