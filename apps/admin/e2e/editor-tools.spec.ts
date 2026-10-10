/** Editor tools (M6): statistics, outline, revision diff, duplicates, editing lock. */
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const PASSWORD = 'correct horse battery staple';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

async function call<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const { token } = await (await fetch('/api/v1/auth/csrf')).json();
      const res = await fetch(`/api/v1${path}`, {
        method,
        headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
      return res.status === 204 ? (undefined as T) : res.json();
    },
    { method, path, body },
  );
}

const paragraph = (text: string) => ({
  schema: 1,
  blocks: [
    {
      id: 'h',
      type: 'core/heading',
      v: 1,
      attrs: { level: 4 },
      content: [{ text: 'Deep heading' }],
    },
    { id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text }] },
  ],
});

test('statistics, outline and revision diff in the editor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  await signIn(page, 'admin@example.com', 'cleitext-admin');
  const entry = await call<{ id: string }>(page, 'POST', '/entries', {
    type: 'article',
    title: `Tools ${stamp}`,
    document: paragraph('one two three'),
  });
  await call(page, 'PATCH', `/entries/${entry.id}`, { document: paragraph('one four three') });

  await page.goto(`/admin/entries/${entry.id}`);
  const stats = page.getByRole('region', { name: 'Statistics' });
  await expect(stats).toContainText('5 words');
  await stats.getByText('Outline').click();
  await expect(stats).toContainText('A heading level is skipped.');

  await page.getByRole('button', { name: 'Document outline' }).click();
  const outline = page.getByRole('complementary', { name: 'Document outline' });
  await expect(outline.getByText('Paragraph')).toBeVisible();

  await page.getByRole('button', { name: 'Compare' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Compare revisions' });
  await expect(dialog.locator('del')).toContainText(['two']);
  await expect(dialog.locator('ins')).toContainText(['four']);
  await dialog.getByRole('button', { name: 'Close' }).click();

  expect(appErrors(errors)).toEqual([]);
});

test('duplicates and the editing lock', async ({ page, browser }) => {
  const stamp = Date.now().toString(36);
  await signIn(page, 'admin@example.com', 'cleitext-admin');
  const email = `lock-${stamp}@example.com`;
  await call(page, 'POST', '/users/invite', {
    email,
    displayName: `Lucia ${stamp}`,
    role: 'editor',
    password: PASSWORD,
  });
  const entry = await call<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Locked ${stamp}`,
  });

  // Duplicate from the list.
  await page.goto('/admin/pages');
  await page.getByLabel(/^Search pages/).fill(`Locked ${stamp}`);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: `Duplicate Locked ${stamp}` }).click();
  await expect(page.getByText(`Copy created: Locked ${stamp} (copy)`)).toBeVisible();

  // The other editor opens it first.
  const other = await browser.newContext();
  const lucia = await other.newPage();
  await signIn(lucia, email, PASSWORD);
  await lucia.goto(`/admin/entries/${entry.id}`);
  await expect(lucia.locator('#entry-title')).toHaveValue(`Locked ${stamp}`);
  // Her editor takes the lock just after it shows the entry (in development
  // React mounts it twice: take, release, take again).
  await lucia.waitForLoadState('networkidle');
  await expect
    .poll(async () => {
      const lock = await call<{ lockedBy: { displayName: string } | null }>(
        page,
        'GET',
        `/entries/${entry.id}/lock`,
      );
      return lock.lockedBy?.displayName ?? null;
    })
    .toBe(`Lucia ${stamp}`);

  await page.goto(`/admin/entries/${entry.id}`);
  await expect(page.getByText(`Lucia ${stamp} is editing this entry`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Take over' }).click();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
  await other.close();
});
