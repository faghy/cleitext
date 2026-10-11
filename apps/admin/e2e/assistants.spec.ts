/** Admin → AI assistants and the consent of an assistant, in the admin (RF-AI-01/02). */
import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const REDIRECT = 'https://assistant.example/callback';

async function signIn(page: Page) {
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('an assistant is connected from the admin and disconnected', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/admin/login');
  await signIn(page);
  await page.waitForURL('**/admin/');

  await page.getByRole('link', { name: 'AI assistants', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI assistants are off' })).toBeVisible();
  await page.getByRole('button', { name: 'Turn on AI assistants' }).click();
  await expect(page.getByTestId('mcp-address')).toHaveText(/\/mcp$/);
  await expect(page.getByText('No assistant is connected to your account yet.')).toBeVisible();

  try {
    // What an assistant does: registers itself, then opens the authorization page.
    const registered = await page.request.post('/oauth/register', {
      data: { client_name: 'E2E assistant', redirect_uris: [REDIRECT] },
    });
    expect(registered.status()).toBe(201);
    const { client_id } = await registered.json();
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      response_type: 'code',
      client_id,
      redirect_uri: REDIRECT,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'e2e',
      scope: 'read write',
    });

    const context = await browser.newContext();
    const user = await context.newPage();
    await context.route('https://assistant.example/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'connected' }),
    );
    await user.goto(`/oauth/authorize?${query}`);
    await user.waitForURL('**/admin/login**');
    await signIn(user);
    await user.waitForURL('**/admin/connect?**');
    await expect(user.getByText('E2E assistant wants to work on')).toBeVisible();
    await user.getByRole('button', { name: 'Allow' }).click();
    await user.waitForURL(/^https:\/\/assistant\.example\/callback\?/);
    const back = new URL(user.url());
    expect(back.searchParams.get('state')).toBe('e2e');
    expect(back.searchParams.get('code')).toBeTruthy();

    const tokens = await page.request.post('/oauth/token', {
      form: {
        grant_type: 'authorization_code',
        code: back.searchParams.get('code')!,
        client_id,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
      },
    });
    expect((await tokens.json()).scope).toBe('read write');
    await context.close();

    await page.reload();
    const row = page.getByRole('row', { name: /E2E assistant/ });
    await expect(row).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: /Disconnect/ }).click();
    await expect(page.getByText('No assistant is connected to your account yet.')).toBeVisible();
  } finally {
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Turn off AI assistants' }).click();
    await expect(page.getByRole('heading', { name: 'AI assistants are off' })).toBeVisible();
  }

  expect(appErrors(errors)).toEqual([]);
});
