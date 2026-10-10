/** Users → Roles (RF-USR-06): a custom role made from a built-in one. */
import { expect, test } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

test('a custom role is duplicated, edited and deleted', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = `Proofreader ${Date.now().toString(36)}`;

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
  await page.goto('/admin/users');

  const roles = page.getByRole('list', { name: 'Roles' });
  await roles
    .getByRole('listitem', { name: 'Contributor' })
    .getByRole('button', { name: 'Duplicate' })
    .click();
  const form = page.getByRole('form', { name: 'New role' });
  await form.getByLabel('Role name').fill(name);
  await form.getByLabel('Edit content of others').check();
  await form.getByRole('button', { name: 'Add role' }).click();

  const item = roles.getByRole('listitem', { name });
  await expect(item).toContainText('Edit content of others');
  await expect(item).toContainText('custom · 0 members');

  await item.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('form', { name: 'Edit role' });
  await edit.getByLabel('Edit content of others').uncheck();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(item).not.toContainText('Edit content of others');

  page.once('dialog', (dialog) => dialog.accept());
  await item.getByRole('button', { name: 'Delete' }).click();
  await expect(item).toHaveCount(0);

  expect(appErrors(errors)).toEqual([]);
});
