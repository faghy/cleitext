/**
 * Pages whose document names the block editor (`editor: { id: 'blocks' }`) and
 * keeps settings for the theme (`editor.data`): they open in the block editor,
 * and saving keeps those settings.
 */
import { expect, test } from '@playwright/test';

const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

test('a block editor document with settings for the theme opens and keeps them', async ({
  page,
}) => {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
  const api = (method: string, path: string, body?: unknown) =>
    page.evaluate(
      async ({ method, path, body }) => {
        const { token } = await (await fetch('/api/v1/auth/csrf')).json();
        const res = await fetch(path, {
          method,
          headers: body
            ? { 'x-csrf-token': token, 'content-type': 'application/json' }
            : { 'x-csrf-token': token },
          body: body ? JSON.stringify(body) : undefined,
        });
        return res.json();
      },
      { method, path, body },
    );
  const created = await api('POST', '/api/v1/entries', {
    type: 'article',
    title: `Theme settings ${Date.now().toString(36)}`,
    document: {
      schema: 1,
      editor: { id: 'blocks', data: { hideFeatured: true } },
      blocks: [{ id: 'p1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Hello' }] }],
    },
  });
  await page.goto(`/cl-admin/entries/${created.id}`);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas.getByText('Hello').click();
  await expect(page.getByText('which is not active')).toHaveCount(0);
  await page.keyboard.type(' world');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  const saved = await api('GET', `/api/v1/entries/${created.id}`);
  const document = (saved.draft ?? saved.revision).document;
  expect(document.editor).toEqual({ id: 'blocks', data: { hideFeatured: true } });
  expect(document.blocks[0].content[0].text).toBe('Hello world');
});
