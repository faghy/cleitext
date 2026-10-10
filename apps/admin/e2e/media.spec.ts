/** Media library (RF-MED-01/04): upload, list view, captions, search and type filter. */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

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

test('upload, describe, search and filter media', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const name = `photo-${stamp}.jpg`;

  await signIn(page);
  await page.goto('/admin/media');
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'image/jpeg',
    buffer: sample,
  });
  // The progress list disappears once the upload is done.
  await expect(page.getByRole('list', { name: 'Uploads' })).toHaveCount(0);

  // List view, remembered across visits.
  await page.getByRole('button', { name: 'List' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name }).click();

  const details = page.getByRole('complementary', { name: 'File details' });
  await details
    .getByLabel(/^Caption/)
    .first()
    .fill(`Harbour at dawn ${stamp}`);
  await details.getByRole('button', { name: 'Save' }).click();
  await expect(details.getByText('Saved.')).toBeVisible();

  // Search by caption text.
  await page.getByLabel('Search media').fill(`dawn ${stamp}`);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('button', { name })).toBeVisible();

  // The type filter hides it among documents.
  await page.getByLabel('Filter by type').selectOption('document');
  await expect(page.getByText('Nothing found.')).toBeVisible();

  expect(errors).toEqual([]);
});
