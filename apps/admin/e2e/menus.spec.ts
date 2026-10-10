/** Menu items are reordered and nested by dragging (M6). */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

/** Drags the row's handle to `target`, moved by `dx` pixels sideways. */
async function dragTo(page: Page, row: Locator, target: Locator, place: 'above' | 'below', dx = 0) {
  const handle = row.getByRole('button', { name: 'Drag to move' });
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const y = place === 'above' ? to.y + 2 : to.y + to.height - 2;
  await page.mouse.move(from.x + from.width / 2 + dx, y, { steps: 8 });
  await page.mouse.up();
}

test('menu items can be dragged to a new place and level', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  await page.goto('/admin/appearance');
  await page.getByLabel('New menu').fill(`Drag ${stamp}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByLabel('Menu name')).toHaveValue(`Drag ${stamp}`);
  for (const name of ['One', 'Two', 'Three']) {
    await page.getByLabel('URL', { exact: true }).first().fill(`https://example.com/${name}`);
    await page.getByLabel('Link text').fill(name);
    await page.getByRole('button', { name: 'Add to menu' }).click();
  }
  const items = page.getByRole('list', { name: 'Menu items' }).getByRole('listitem');
  const labels = () =>
    items.evaluateAll((rows) =>
      rows.map((row) => {
        const input = row.querySelector('input') as HTMLInputElement;
        return `${row.getAttribute('style')?.includes('1.5rem') ? '-' : ''}${input.value}`;
      }),
    );
  await expect(items).toHaveCount(3);

  // "Three" to the top, then "One" (now second) under "Three".
  await dragTo(page, items.nth(2), items.nth(0), 'above');
  await expect.poll(labels).toEqual(['Three', 'One', 'Two']);
  await dragTo(page, items.nth(1), items.nth(1), 'above', 30);
  await expect.poll(labels).toEqual(['Three', '-One', 'Two']);

  await page.getByRole('button', { name: 'Save menu' }).click();
  await expect(page.getByText('Menu saved.')).toBeVisible();
  // The list now shows what the server stored.
  await expect.poll(labels).toEqual(['Three', '-One', 'Two']);
  expect(appErrors(errors)).toEqual([]);
});
