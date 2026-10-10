/**
 * M2 acceptance (docs/SPECIFICATIONS.md §13): a writer creates an article with
 * headings, an image and columns, saves it, assigns terms, restores a
 * revision, translates it and schedules it — in the real Gutenberg editor.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const sample = fileURLToPath(new URL('./fixtures/sample.jpg', import.meta.url));
// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

test.beforeAll(() => {
  // A second language for the translation step (idempotent).
  try {
    execFileSync(
      'node',
      [
        '--env-file-if-exists=.env',
        'packages/cli/dist/bin.js',
        'site:locale:add',
        '--site',
        'dev',
        '--code',
        'it',
        '--name',
        'Italiano',
      ],
      { cwd: root, stdio: 'pipe' },
    );
  } catch (error) {
    if (!String((error as { stderr?: Buffer }).stderr).includes('already enabled')) throw error;
  }
});

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

async function entry(page: Page, id: string) {
  return page.evaluate(async (entryId) => (await fetch(`/api/v1/entries/${entryId}`)).json(), id);
}

test('write, classify, revise, translate and schedule a post', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);

  // An image in the media library.
  await page.goto('/admin/media');
  await page.locator('input[type=file]').setInputFiles(sample);
  await expect(page.locator('ul img').first()).toBeVisible();

  // 1. Write and save.
  await page.goto('/admin/posts');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/admin/entries/**');
  const id = page.url().split('/').pop()!;
  await page.locator('#entry-title').fill(`A weekend in Rome ${stamp}`);

  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  const slash = async (block: string) => {
    await page.keyboard.type(`/${block}`);
    await expect(page.getByRole('option', { name: new RegExp(block, 'i') }).first()).toBeVisible();
    await page.keyboard.press('Enter');
  };
  await slash('heading');
  await page.keyboard.type('Day one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('We walked from the Colosseum to Trastevere.');
  await page.keyboard.press('Enter');
  await slash('image');
  await canvas.getByRole('button', { name: 'Media Library' }).click();
  await page.getByRole('dialog').locator('ul button').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Select' }).click();
  await expect(canvas.locator('.wp-block-image img')).toBeVisible();
  await canvas.locator('.wp-block-image').click();
  await page.keyboard.press('Enter');
  await slash('columns');
  await canvas.getByRole('button', { name: /Two columns; equal split/ }).click();

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  let saved = await entry(page, id);
  expect(saved.revision.document.blocks.map((b: { type: string }) => b.type)).toEqual([
    'core/heading',
    'core/paragraph',
    'core/image',
    'core/columns',
  ]);
  expect(saved.revision.document.blocks[3].children).toHaveLength(2);
  expect(saved.slug).toBe(`a-weekend-in-rome-${stamp}`);

  // 2. Category and tags.
  await page.getByLabel('Add new to Categories').fill(`Travel ${stamp}`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel(`Travel ${stamp}`)).toBeChecked();
  await page.getByLabel('Add tags').fill('Rome, Food');
  await page.getByLabel('Add tags').press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Food' })).toBeVisible();
  saved = await entry(page, id);
  expect(saved.terms.tag.map((t: { name: string }) => t.name).sort()).toEqual(['Food', 'Rome']);

  // 3. Change, save, restore the previous revision.
  await canvas.getByText('We walked from the Colosseum to Trastevere.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Then we got lost.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  expect(JSON.stringify((await entry(page, id)).revision.document)).toContain('got lost');
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await expect(canvas.getByText('Then we got lost.')).toHaveCount(0);
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  saved = await entry(page, id);
  expect(saved.revision.kind).toBe('restore');
  expect(JSON.stringify(saved.revision.document)).not.toContain('got lost');

  // 4. Italian translation.
  await page.getByLabel('Add translation').selectOption('it');
  await page.waitForURL((url) => !url.pathname.endsWith(id));
  const itId = page.url().split('/').pop()!;
  await page.locator('#entry-title').fill(`Un weekend a Roma ${stamp}`);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible();
  const italian = await entry(page, itId);
  expect(italian).toMatchObject({ locale: 'it', slug: `un-weekend-a-roma-${stamp}` });
  expect(italian.translations.map((t: { id: string }) => t.id)).toEqual([id]);
  expect(italian.revision.document.blocks).toHaveLength(4);

  // 5. Schedule the English post.
  await page.goto(`/admin/entries/${id}`);
  const when = new Date(Date.now() + 2 * 86_400_000);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await page.locator('input[type=datetime-local]').fill(local);
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
  expect((await entry(page, id)).status).toBe('scheduled');

  expect(appErrors(errors)).toEqual([]);
});
