/** Two-factor authentication from the admin (RF-USR-04). */
import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const PASSWORD = 'correct horse battery staple';

/** RFC 6238 code (SHA-1, 30 s, 6 digits) for a base32 secret. */
function totp(secret: string, offset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const value = hmac.readUInt32BE(hmac[19]! & 15) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('a user turns on 2FA and signs in with a code', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = `twofa-${Date.now().toString(36)}@example.com`;

  // An administrator adds the user with a password.
  await signIn(page, 'admin@example.com', 'cleitext-admin');
  await page.waitForURL('**/cl-admin/');
  await page.evaluate(
    async ({ email, password }) => {
      const { token } = await (await fetch('/api/v1/auth/csrf')).json();
      const res = await fetch('/api/v1/users/invite', {
        method: 'POST',
        headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ email, displayName: 'Two Factor', role: 'author', password }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    { email, password: PASSWORD },
  );

  const context = await browser.newContext();
  const user = await context.newPage();
  await signIn(user, email, PASSWORD);
  await user.waitForURL('**/cl-admin/');
  await user.goto('/cl-admin/profile');
  await user.getByRole('button', { name: 'Set up two-factor authentication' }).click();
  await expect(user.getByRole('img', { name: 'QR code for the authenticator app' })).toBeVisible();
  const secret = (await user.getByTestId('totp-secret').textContent())!.trim();
  await user.getByLabel('2. Enter the 6-digit code it shows').fill(totp(secret));
  await user.getByRole('button', { name: 'Turn on' }).click();
  const codes = user.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(codes).toHaveCount(10);
  const recovery = await codes.first().textContent();
  await user.getByRole('button', { name: 'I saved them' }).click();
  await expect(user.getByText('10 recovery codes left.')).toBeVisible();

  // Sign out and back in: the code is asked after the password.
  await user.getByRole('button', { name: 'Sign out' }).click();
  await user.waitForURL('**/cl-admin/login');
  await signIn(user, email, PASSWORD);
  await expect(user.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
  await user.getByLabel('Authentication code').fill('000000');
  await user.getByRole('button', { name: 'Verify' }).click();
  await expect(user.getByText('The code is not correct.')).toBeVisible();
  await user.getByLabel('Authentication code').fill(recovery!);
  await user.getByRole('button', { name: 'Verify' }).click();
  await user.waitForURL('**/cl-admin/');
  await context.close();

  expect(appErrors(errors)).toEqual([]);
});
