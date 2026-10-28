/** Users → Edit (RF-USR-12): an administrator changes a member's details and password. */
import { expect, test } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

test('an administrator edits a member and sets a new password', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const email = `member-${stamp}@example.com`;

  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
  await page.goto('/cl-admin/users?tab=add');

  // A new author, with a password and no email.
  const add = page.getByRole('button', { name: 'Add New User' });
  await page.getByLabel('Name').first().fill(`Member ${stamp}`);
  await page.getByLabel('Email').first().fill(email);
  await page.getByLabel('Password').first().fill('first long password here');
  await page.getByLabel('Send the new user an email about their account').uncheck();
  await add.click();
  await expect(page.getByText(`${email} can now sign in.`)).toBeVisible();

  await page.getByRole('link', { name: `Member ${stamp}` }).click();
  await expect(page.getByRole('heading', { name: `Edit Member ${stamp}` })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(`Renamed ${stamp}`);
  await page.getByLabel('Biographical info').fill('Writes about the sea.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Edit Renamed ${stamp}` })).toBeVisible();

  await page.getByLabel('New password').fill('second long password here');
  await page.getByLabel('Tell the person by email (the password is not sent)').uncheck();
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();

  // The member signs in with the new password.
  const other = await context.browser()!.newContext();
  const member = await other.newPage();
  await member.goto(page.url().replace(/\/cl-admin\/.*$/, '/cl-admin/login'));
  await member.getByLabel('Email').fill(email);
  await member.getByLabel('Password').fill('second long password here');
  await member.getByRole('button', { name: 'Sign in' }).click();
  await member.waitForURL('**/cl-admin/');
  await other.close();

  expect(appErrors(errors)).toEqual([]);
});
