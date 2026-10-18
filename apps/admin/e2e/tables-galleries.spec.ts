/** Table and gallery blocks in the editor and on the public site (RF-EDT-02). */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';
const sample = readFileSync(new URL('./fixtures/sample.jpg', import.meta.url));

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
}

test('tables are made in the editor, galleries open in it, both on the site', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  await page.goto('/cl-admin/pages');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/cl-admin/entries/**');
  await page.locator('#entry-title').fill(`Tables ${stamp}`);

  // A table from the inserter: two columns, two rows, a cell written.
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type('/table');
  await expect(page.getByRole('option', { name: /^Table$/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await canvas.getByRole('spinbutton', { name: 'Column count' }).fill('2');
  await canvas.getByRole('spinbutton', { name: 'Row count' }).fill('2');
  await canvas.getByRole('button', { name: 'Create Table' }).click();
  await canvas.locator('.wp-block-table td').first().click();
  await page.keyboard.type(`Cell ${stamp}`);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();

  // A gallery of an uploaded picture, added through the API, then opened in the editor.
  const id = page.url().split('/').pop()!;
  const media = await page.evaluate(
    async ({ bytes, name }) => {
      const { token } = await (await fetch('/api/v1/auth/csrf')).json();
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), name);
      const res = await fetch('/api/v1/media', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: form,
      });
      return (await res.json()) as { id: string; url: string };
    },
    { bytes: [...Buffer.concat([sample, Buffer.from(stamp)])], name: `gallery-${stamp}.jpg` },
  );
  const saved = await page.evaluate(
    async ({ id, media }) => {
      const { token } = await (await fetch('/api/v1/auth/csrf')).json();
      const headers = { 'x-csrf-token': token, 'content-type': 'application/json' };
      const entry = await (await fetch(`/api/v1/entries/${id}`)).json();
      const image = (n: string) => ({
        id: n,
        type: 'core/image',
        v: 1,
        attrs: { id: media.id, url: media.url, alt: 'Sample' },
      });
      const blocks = [
        ...entry.revision.document.blocks,
        {
          id: 'gal1',
          type: 'core/gallery',
          v: 1,
          attrs: { columns: 2 },
          children: [image('img1'), image('img2')],
        },
      ];
      const res = await fetch(`/api/v1/entries/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ document: { schema: 1, blocks } }),
      });
      return (await res.json()) as {
        revision: { document: { blocks: { type: string; attrs: Record<string, unknown> }[] } };
      };
    },
    { id, media },
  );
  const table = saved.revision.document.blocks.find((b) => b.type === 'core/table')!;
  expect(JSON.stringify(table.attrs.body)).toContain(`Cell ${stamp}`);

  await page.reload();
  await expect(canvas.locator('.wp-block-gallery img')).toHaveCount(2);
  await expect(canvas.locator('.wp-block-table td').first()).toHaveText(`Cell ${stamp}`);

  const entry = await page.evaluate(async (id) => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    const res = await fetch(`/api/v1/entries/${id}/publish`, {
      method: 'POST',
      headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
      body: '{}',
    });
    return (await res.json()) as { slug: string };
  }, id);

  const visitor = await context.browser()!.newContext();
  const site = await visitor.newPage();
  await site.goto(`${SITE}/${entry.slug}`);
  await expect(site.locator('.wp-block-table td').first()).toHaveText(`Cell ${stamp}`);
  await expect(site.locator('.wp-block-gallery.columns-2 img')).toHaveCount(2);
  await expect(site.locator('style[data-cx-core-blocks]')).toHaveCount(1);
  await visitor.close();

  expect(appErrors(errors)).toEqual([]);
});
