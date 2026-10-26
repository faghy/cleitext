/** Embed and Custom HTML blocks in the editor and on the public site (RF-EDT-02). */
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');
}

test('embed and HTML blocks are edited, saved and published', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  await page.goto('/cl-admin/pages');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/cl-admin/entries/**');
  await page.locator('#entry-title').fill(`Media page ${stamp}`);

  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type('/youtube');
  await expect(page.getByRole('option', { name: /YouTube/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await canvas.getByRole('textbox', { name: /Embed URL/i }).fill('https://youtu.be/dQw4w9WgXcQ');
  await canvas.getByRole('button', { name: 'Embed' }).click();
  // The preview comes from Cleitext's own oEmbed endpoint.
  const preview = canvas.locator('.wp-block-embed iframe.components-sandbox');
  await expect(preview).toHaveAttribute('title', 'Embedded content from youtu.be');
  await expect
    .poll(() =>
      preview.evaluate((frame: HTMLIFrameElement) => frame.contentDocument?.body.innerHTML),
    )
    .toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  // Responsive: the preview gets a 16:9 height.
  await expect
    .poll(() => preview.evaluate((frame: HTMLIFrameElement) => frame.offsetHeight))
    .toBeGreaterThan(200);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();

  // The HTML block, added through the API to keep the test independent of its UI.
  const id = page.url().split('/').pop()!;
  const published = await page.evaluate(
    async ({ id, stamp }) => {
      const { token } = await (await fetch('/api/v1/auth/csrf')).json();
      const headers = { 'x-csrf-token': token, 'content-type': 'application/json' };
      const entry = await (await fetch(`/api/v1/entries/${id}`)).json();
      const blocks = [
        ...entry.revision.document.blocks,
        {
          id: 'html1',
          type: 'core/html',
          v: 1,
          attrs: { content: `<p class="raw-${stamp}">Raw <b>HTML</b></p>` },
        },
      ];
      await fetch(`/api/v1/entries/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ document: { schema: 1, blocks } }),
      });
      const res = await fetch(`/api/v1/entries/${id}/publish`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(body));
      return body;
    },
    { id, stamp },
  );
  expect(published.revision.document.blocks.map((b: { type: string }) => b.type)).toEqual([
    'core/embed',
    'core/html',
  ]);

  const visitor = await context.browser()!.newContext();
  const site = await visitor.newPage();
  await site.goto(`${SITE}/${published.slug}`);
  await expect(site.locator('iframe[src^="https://www.youtube-nocookie.com/embed/"]')).toHaveCount(
    1,
  );
  await expect(site.locator(`.raw-${stamp} b`)).toHaveText('HTML');
  await visitor.close();

  expect(appErrors(errors)).toEqual([]);
});

test('a TikTok profile is previewed in the editor at the size the page gives it', async ({
  page,
}) => {
  const blocked: string[] = [];
  page.on('console', (m) => {
    if (/Framing .* violates/.test(m.text())) blocked.push(m.text());
  });
  await signIn(page);
  await page.goto('/cl-admin/pages');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/cl-admin/entries/**');
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type('/tiktok');
  await expect(page.getByRole('option', { name: /TikTok/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await canvas
    .getByRole('textbox', { name: /Embed URL/i })
    .fill('https://www.tiktok.com/@linomissio');
  await canvas.getByRole('button', { name: 'Embed' }).click();
  const preview = canvas.locator('.wp-block-embed iframe.components-sandbox');
  await expect
    .poll(() =>
      preview.evaluate((frame: HTMLIFrameElement) => frame.contentDocument?.body.innerHTML),
    )
    .toContain('https://www.tiktok.com/embed/@linomissio');
  // Not 0×0: TikTok's creator frame is 479 px tall and as wide as the column.
  const size = await preview.evaluate((frame: HTMLIFrameElement) => ({
    width: frame.offsetWidth,
    height: frame.offsetHeight,
  }));
  expect(size.height).toBe(479);
  expect(size.width).toBeGreaterThan(300);
  // The admin lets TikTok's player in.
  expect(blocked).toEqual([]);
});
