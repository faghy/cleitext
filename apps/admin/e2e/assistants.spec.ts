/** Admin → AI assistants: the chat, and the consent of an assistant in the admin (RF-AI-01/02/03). */
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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
  await page.goto('/cl-admin/login');
  await signIn(page);
  await page.waitForURL('**/cl-admin/');

  await page.getByRole('link', { name: 'AI assistants', exact: true }).click();
  // The browser tab names the screen and the site.
  await expect(page).toHaveTitle(/^AI assistants ‹ \S/);
  await page.getByRole('button', { name: 'Allow connections' }).click();
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
    await user.waitForURL('**/cl-admin/login**');
    await signIn(user);
    await user.waitForURL('**/cl-admin/connect?**');
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
    await page.getByRole('button', { name: 'Turn off connections' }).click();
    await expect(page.getByRole('button', { name: 'Allow connections' })).toBeVisible();
  }

  expect(appErrors(errors)).toEqual([]);
});

/** A scripted AI provider: creates a draft with blocks, then answers. */
function fakeProvider() {
  let round = 0;
  return createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const message =
        round++ % 2 === 0
          ? {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `c${round}`,
                  type: 'function',
                  function: {
                    name: 'create_entry',
                    arguments: JSON.stringify({
                      type: 'page',
                      title: 'Chat page',
                      content:
                        '<!-- wp:paragraph --><p>Written in the chat.</p><!-- /wp:paragraph -->',
                    }),
                  },
                },
              ],
            }
          : { role: 'assistant', content: 'Done: **Chat page** is a draft.' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message }] }));
    });
  });
}

test("the chat writes a draft with the site's AI provider", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const provider = fakeProvider();
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const port = (provider.address() as AddressInfo).port;
  await page.goto('/cl-admin/login');
  await signIn(page);
  await page.waitForURL('**/cl-admin/');
  const providerNow = () =>
    page.evaluate(async () => (await fetch('/api/v1/assistants/provider')).json());
  // A clean start, even after an interrupted run.
  await page.evaluate(async () => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    await fetch('/api/v1/assistants/provider', {
      method: 'DELETE',
      headers: { 'x-csrf-token': token },
    });
  });
  await page.goto('/cl-admin/assistants');
  await expect(page.getByText('To chat here, set up an AI provider')).toBeVisible();

  await page.getByLabel('API address').fill(`http://127.0.0.1:${port}/v1`);
  await page.getByLabel('Model').fill('test-model');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  try {
    await page.getByRole('button', { name: 'Use in the chat' }).first().click();
    await expect(page.getByLabel('Your request')).toHaveValue(/About us/);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('✓ Creating a draft')).toBeVisible();
    await expect(page.getByText('is a draft.')).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Chat page' })).toBeVisible();

    // The conversation survives moving around the admin.
    await page.goto('/cl-admin/pages');
    await expect(page.getByRole('link', { name: 'Chat page' }).first()).toBeVisible();
    await page.goto('/cl-admin/assistants');
    await expect(page.getByText('is a draft.')).toBeVisible();
    await page.getByRole('button', { name: 'New conversation' }).click();
  } finally {
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('To chat here, set up an AI provider')).toBeVisible();
    // Really removed, not saved again by the form around the button.
    expect(await providerNow()).toBeNull();
    provider.close();
  }
  expect(appErrors(errors)).toEqual([]);
});
