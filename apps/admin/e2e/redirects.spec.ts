/** Settings → Redirects (RF-NAV-04). */
import { expect, test } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

test('redirects are added, imported and deleted', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
  const sidebar = page.getByRole('navigation', { name: 'Main' });
  await sidebar.getByRole('link', { name: 'Tools', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Redirects' }).click();

  const form = page.getByRole('form', { name: 'Add redirect' });
  await form.getByLabel('From (path of this site)').fill(`/old-${stamp}`);
  await form.getByLabel('To (path or full address)').fill(`/new-${stamp}`);
  await form.getByRole('button', { name: 'Add redirect' }).click();
  await expect(page.getByRole('cell', { name: `/old-${stamp}`, exact: true })).toBeVisible();

  const res = await request.get(`${SITE}/old-${stamp}`, { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(res.headers().location).toBe(`/new-${stamp}`);

  await page.getByLabel('CSV text').fill(`/a-${stamp},/b-${stamp}\n/gone-${stamp},,410\nbad`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('2 redirects saved.')).toBeVisible();
  await expect(page.getByText('Line 3:')).toBeVisible();

  await page.getByLabel('Search redirects').fill(stamp);
  await expect(page.getByRole('row')).toHaveCount(4);
  page.on('dialog', (dialog) => dialog.accept());
  for (const path of [`/old-${stamp}`, `/a-${stamp}`, `/gone-${stamp}`]) {
    await page.getByRole('button', { name: `Delete ${path}` }).click();
    await expect(page.getByRole('cell', { name: path, exact: true })).toHaveCount(0);
  }

  expect(appErrors(errors)).toEqual([]);
});
