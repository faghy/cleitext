/** Passkeys (RF-USR-05), with Chromium's virtual authenticator. */
import { expect, test } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

test('a passkey is added in the profile and signs in without a password', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The virtual authenticator needs Chromium (CDP).');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const name = `Virtual key ${Date.now().toString(36)}`;

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');

  await page.goto('/admin/profile');
  await page.getByLabel('Passkey name').fill(name);
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  const list = page.getByRole('list', { name: 'Your passkeys' });
  await expect(list.getByRole('paragraph').filter({ hasText: name })).toBeVisible();
  await expect(list.getByText('localhost · never used').first()).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/admin/login');
  await page.getByRole('button', { name: 'Use a passkey' }).click();
  await page.waitForURL('**/admin/');

  // Clean up: the passkey of this run is removed.
  await page.goto('/admin/profile');
  page.once('dialog', (dialog) => dialog.accept());
  await list.getByRole('button', { name: `Remove ${name}` }).click();
  await expect(list.getByRole('paragraph').filter({ hasText: name })).toHaveCount(0);

  expect(appErrors(errors)).toEqual([]);
});
