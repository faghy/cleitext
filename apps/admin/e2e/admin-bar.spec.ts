/** From the admin to the site and back, as in WordPress. */
import { expect, test } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

test('the site name opens the site, whose toolbar leads back to the editor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');

  // A published page to visit.
  const id = await page.evaluate(async (title) => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    const headers = { 'x-csrf-token': token, 'content-type': 'application/json' };
    const entry = await (
      await fetch('/api/v1/entries', {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'page', title }),
      })
    ).json();
    await fetch(`/api/v1/entries/${entry.id}/publish`, { method: 'POST', headers, body: '{}' });
    return entry.id as string;
  }, `Toolbar ${stamp}`);

  // Hovering the site name shows "Visit site".
  const banner = page.getByRole('banner');
  // Always visible on the right, opening a new tab.
  await expect(
    banner.getByRole('link', { name: 'Visit site (opens in a new tab)' }),
  ).toHaveAttribute('target', '_blank');
  await banner.getByRole('link', { name: 'Development' }).hover();
  await banner.locator('.group').getByRole('link', { name: 'Visit site' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/admin'));

  const toolbar = page.getByRole('navigation', { name: 'Toolbar' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('link', { name: /Signed in as/ })).toBeVisible();

  await page.goto(`/toolbar-${stamp}`);
  await toolbar.getByRole('link', { name: 'Edit page' }).click();
  await page.waitForURL(`**/admin/entries/${id}`);
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(`Toolbar ${stamp}`);

  // Signed out, the site shows no toolbar.
  await page.context().clearCookies();
  await page.goto(`/toolbar-${stamp}`);
  await expect(page.getByRole('heading', { name: `Toolbar ${stamp}` })).toBeVisible();
  await expect(toolbar).toHaveCount(0);
  expect(appErrors(errors)).toEqual([]);
});
