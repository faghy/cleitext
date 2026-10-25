/**
 * Additional CSS (core 0.80): written in a code editor with highlighting in
 * Customize, and applied in the block editor's canvas too.
 */
import { expect, test } from '@playwright/test';
import { api, removeEntries, signIn } from './fixtures/api.js';
import { appErrors } from './fixtures/errors.js';

interface Css {
  site: string;
  theme: string;
}

interface ThemeView {
  slug: string;
  name: string;
}

test('Customize → Additional CSS is a code editor whose typing changes the preview', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  const { theme } = await api<{ theme: ThemeView }>(page, 'GET', '/themes/active');
  const saved = await api<Css>(page, 'GET', '/themes/additional-css');
  try {
    await page.goto('/cl-admin/appearance');
    await page
      .getByRole('listitem', { name: theme.name, exact: true })
      .getByRole('button', { name: `Customize ${theme.name}` })
      .click();
    const panel = page.getByRole('complementary', { name: 'Customize' });
    await panel.getByRole('button', { name: 'Additional CSS', exact: true }).last().click();

    // CodeMirror, loaded when the section opens: labelled, with line numbers.
    const editor = page.getByRole('textbox', { name: 'CSS for every theme' });
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await expect(page.locator('[data-code-editor="css"] .cm-lineNumbers').first()).toBeVisible();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    // Typed key by key: brackets close themselves, so only the inside is typed.
    await page.keyboard.type('body { outline: 9px solid rgb(0, 0, 255); ');
    await expect(editor).toContainText('body { outline: 9px solid rgb(0, 0, 255); }');
    // Highlighted: the property is a token of its own.
    await expect(editor.locator('span', { hasText: 'outline' }).first()).toBeVisible();
    const preview = page.frameLocator('iframe[title="Site preview"]');
    await expect
      .poll(async () =>
        preview
          .locator('body')
          .evaluate((b) => getComputedStyle(b).outlineWidth)
          .catch(() => ''),
      )
      .toBe('9px');
    await expect(page.getByTestId('additional-css')).toContainText(/\d+ of 100,000 characters/);

    // Errors before publishing; Tab leaves the editor (no keyboard trap).
    const only = page.getByRole('textbox', { name: `CSS for ${theme.name} only` });
    await only.click();
    await page.keyboard.type('</style>');
    await expect(page.getByRole('alert').filter({ hasText: '</style>' })).toBeVisible();
    await expect(only).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await expect(page.getByRole('alert').filter({ hasText: '</style>' })).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(only).not.toBeFocused();
    await page.getByRole('button', { name: 'Close customizer' }).click();
  } finally {
    await api(page, 'PUT', '/themes/additional-css', saved).catch(() => undefined);
  }
  expect(appErrors(errors)).toEqual([]);
});

test('the block editor canvas shows the site’s Additional CSS', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  const stamp = Date.now().toString(36);
  const saved = await api<Css>(page, 'GET', '/themes/additional-css');
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'article',
    title: `Additional CSS ${stamp}`,
    document: { schema: 1, blocks: [] },
  });
  try {
    await api(page, 'PUT', '/themes/additional-css', {
      site: `${saved.site}\n:root { --e2e-site: "${stamp}"; }`,
      theme: `${saved.theme}\n.editor-styles-wrapper { --e2e-theme: "${stamp}"; }`,
    });
    await page.goto(`/cl-admin/entries/${entry.id}`);
    const canvas = page.frameLocator('iframe[name="editor-canvas"]');
    await expect
      .poll(() =>
        canvas
          .locator('body')
          .evaluate((body) => [
            getComputedStyle(document.documentElement).getPropertyValue('--e2e-site'),
            getComputedStyle(body).getPropertyValue('--e2e-theme'),
          ])
          .catch(() => []),
      )
      .toEqual([`"${stamp}"`, `"${stamp}"`]);
    // Only in the canvas: the admin's page is left alone.
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--e2e-site'),
      ),
    ).toBe('');
  } finally {
    await api(page, 'PUT', '/themes/additional-css', saved).catch(() => undefined);
    await removeEntries(page, [entry.id]);
  }
  expect(appErrors(errors)).toEqual([]);
});
