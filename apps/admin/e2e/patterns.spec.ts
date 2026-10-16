/** Block patterns in the editor (RF-EDT-07). */
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

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
      return res.json();
    },
    { method, path, body },
  );
}

test('a synced pattern is inserted, and a selection saved as a pattern', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
  await call(page, 'POST', '/patterns', {
    title: `Notice ${stamp}`,
    synced: true,
    document: {
      schema: 1,
      blocks: [
        {
          id: 'p',
          type: 'core/paragraph',
          v: 1,
          attrs: {},
          content: [{ text: `Shared ${stamp}` }],
        },
      ],
    },
  });
  const entry = await call<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Patterns ${stamp}`,
  });

  await page.goto(`/cl-admin/entries/${entry.id}`);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type(`Local ${stamp}`);

  // Insert the synced pattern from the inserter.
  await page.getByRole('button', { name: 'Add block' }).click();
  await page.getByRole('tab', { name: 'Patterns' }).click();
  // By name: the list is paged, and earlier runs leave patterns behind.
  await page.getByRole('searchbox', { name: 'Search' }).fill(`Notice ${stamp}`);
  await page
    .getByRole('option', { name: new RegExp(`Notice ${stamp} \\(synced\\)`) })
    .first()
    .click();
  await expect(canvas.getByText(`Synced pattern: Notice ${stamp}`)).toBeVisible();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  const saved = await call<{ revision: { document: { blocks: { type: string }[] } } }>(
    page,
    'GET',
    `/entries/${entry.id}`,
  );
  expect(saved.revision.document.blocks.map((b) => b.type)).toContain('cleitext/pattern');

  // Save the first paragraph as a new (unsynced) pattern.
  await canvas.getByText(`Local ${stamp}`).click();
  // First the name (prompt), then "keep it synced?" (confirm): no.
  page.on('dialog', (dialog) =>
    dialog.type() === 'prompt' ? dialog.accept(`Saved ${stamp}`) : dialog.dismiss(),
  );
  await page.getByRole('button', { name: 'Save as pattern' }).click();
  await expect
    .poll(async () =>
      (await call<{ title: string; synced: boolean }[]>(page, 'GET', '/patterns')).find(
        (p) => p.title === `Saved ${stamp}`,
      ),
    )
    .toMatchObject({ synced: false });

  expect(appErrors(errors)).toEqual([]);
});
