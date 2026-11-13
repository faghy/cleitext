/** The publication date in the entry settings (core 0.99), as WordPress's. */
import { expect, test } from '@playwright/test';

const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

test('the publication date of a published post is changed from its settings', async ({ page }) => {
  await page.goto('/cl-admin/login');
  await page.locator('input[autocomplete="username"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/cl-admin/');
  const call = (method: string, path: string, body?: unknown) =>
    page.evaluate(
      async ({ method, path, body }) => {
        const { token } = await (await fetch('/api/v1/auth/csrf')).json();
        const res = await fetch(`/api/v1${path}`, {
          method,
          headers: {
            'x-csrf-token': token,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return res.json();
      },
      { method, path, body },
    );
  const entry = await call('POST', '/entries', {
    type: 'article',
    title: `Dated ${Date.now().toString(36)}`,
  });
  await call('POST', `/entries/${entry.id}/publish`, {});
  await page.goto(`/cl-admin/entries/${entry.id}`);
  const field = page.getByLabel('Publication date');
  await expect(field).toBeVisible();
  await field.fill('2023-04-05T10:30');
  await page.getByRole('button', { name: 'Set', exact: true }).click();
  await expect
    .poll(
      async () =>
        ((await call('GET', `/entries/${entry.id}`)) as { publishedAt: string }).publishedAt,
    )
    .toMatch(/^2023-04-05/);
});
