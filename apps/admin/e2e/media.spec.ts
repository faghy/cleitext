/** Media library (RF-MED-01/04): upload, list view, captions, search and type filter. */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
const sample = readFileSync(new URL('./fixtures/sample.jpg', import.meta.url));

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
}

test('upload, describe, search and filter media', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const name = `photo-${stamp}.jpg`;

  await signIn(page);
  await page.goto('/cl-admin/media');
  // Bytes after the end of the JPEG make this file unique (duplicates are reused).
  const unique = Buffer.concat([sample, Buffer.from(stamp)]);
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'image/jpeg',
    buffer: unique,
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

  // Focal point: a click on the image.
  await page
    .getByRole('button', { name: 'Set the focal point' })
    .click({ position: { x: 10, y: 10 } });
  await expect(page.getByText(/^Focal point: \d+% from the left/)).toBeVisible();
  await expect(page.getByText('Not used in any entry.')).toBeVisible();

  // The same file again is not added twice.
  await page.locator('input[type=file]').setInputFiles({
    name: `again-${name}`,
    mimeType: 'image/jpeg',
    buffer: unique,
  });
  await expect(page.getByText(`again-${name} is already in the library as ${name}`)).toBeVisible();

  // The type filter hides it among documents.
  await page.getByLabel('Filter by type').selectOption('document');
  await expect(page.getByText('Nothing found.')).toBeVisible();

  // The image fields of the settings find it by name, whatever its age.
  await page.goto('/cl-admin/appearance');
  await page
    .getByRole('listitem', { name: 'Aurora' })
    .getByRole('button', { name: 'Customize Aurora' })
    .click();
  await page.getByRole('button', { name: 'Select image' }).first().click();
  await page.getByLabel('Search media').fill(stamp);
  await expect(page.getByRole('button', { name })).toBeVisible();
  await page.getByLabel('Search media').fill(`nothing-${stamp}`);
  await expect(page.getByText('Nothing found.')).toBeVisible();

  expect(appErrors(errors)).toEqual([]);
});
