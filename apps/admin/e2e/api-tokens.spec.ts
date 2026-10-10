/** API tokens from the profile (RF-USR-08). */
import { expect, test } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

test('a token is created once, used as a bearer and revoked', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = `CI ${Date.now().toString(36)}`;

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
  await page.goto('/admin/profile');

  const form = page.getByRole('form', { name: 'New token' });
  await form.getByLabel('Token name').fill(name);
  await form.getByLabel('Expires after').selectOption({ label: '7 days' });
  await form.getByRole('button', { name: 'Create token' }).click();
  const token = (await page.getByTestId('new-token').textContent())!.trim();
  expect(token).toMatch(/^ctx_/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('new-token')).toHaveCount(0);

  // Used by a script: only the header, no cookie.
  const me = await request.get('/api/v1/auth/me', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect((await me.json()).user.email).toBe('admin@example.com');

  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('Read only');
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: `Revoke ${name}` }).click();
  await expect(row).toHaveCount(0);
  const after = await request.get('/api/v1/auth/me', {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(after.status()).toBe(401);

  expect(appErrors(errors)).toEqual([]);
});
