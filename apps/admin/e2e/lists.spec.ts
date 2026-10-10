/** List tables (RF-ADM-03): search, sorting, quick edit and bulk actions. */
import { expect, test, type Page } from '@playwright/test';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

async function signIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
}

async function createPage(page: Page, title: string): Promise<void> {
  await page.evaluate(async (title) => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    const res = await fetch('/api/v1/entries', {
      method: 'POST',
      headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'page', title }),
    });
    if (!res.ok) throw new Error(await res.text());
  }, title);
}

test('list tables sort, edit inline and apply bulk actions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  await createPage(page, `Beta ${stamp}`);
  await createPage(page, `Alpha ${stamp}`);

  await page.goto('/admin/pages');
  await page.getByLabel(/^Search pages/).fill(stamp);
  await page.getByRole('button', { name: 'Search' }).click();
  const rows = page.getByRole('row');
  await expect(rows).toHaveCount(3);

  // Sorting by title, then reversed.
  await page.getByRole('button', { name: 'Title' }).click();
  await expect(rows.nth(1)).toContainText(`Alpha ${stamp}`);
  await page.getByRole('button', { name: /^Title/ }).click();
  await expect(rows.nth(1)).toContainText(`Beta ${stamp}`);

  // Quick edit of the title and order.
  await rows.nth(1).getByRole('button', { name: 'Quick Edit' }).click();
  const form = page.getByRole('form', { name: 'Quick Edit' });
  await form.getByLabel('Title').fill(`Gamma ${stamp}`);
  await form.getByLabel('Order').fill('5');
  await form.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByRole('link', { name: `Gamma ${stamp}` })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`Gamma ${stamp}`) })).toContainText('5');

  // Bulk: publish both, then move them to the trash.
  await page.getByLabel('Select all').check();
  await page.getByLabel('Bulk action', { exact: true }).selectOption('publish');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('2 items updated.')).toBeVisible();
  await expect(rows.nth(1)).toContainText('Published');
  await page.getByLabel('Select all').check();
  await page.getByLabel('Bulk action', { exact: true }).selectOption('trash');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Nothing found.')).toBeVisible();

  expect(errors).toEqual([]);
});

test('pages are listed as a tree and ordered from the editor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);

  await signIn(page);
  // Titles starting with "0" come first among pages with the same order.
  const ids = await page.evaluate(async (stamp) => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    const headers = { 'x-csrf-token': token, 'content-type': 'application/json' };
    // Pages left by earlier runs would push these beyond the first page.
    const old = await (await fetch('/api/v1/entries?type=page&q=child&limit=100')).json();
    const parents = await (await fetch('/api/v1/entries?type=page&q=0%20Parent&limit=100')).json();
    const leftovers = [...old.items, ...parents.items]
      .filter((e: { title: string }) => /^0 (Parent|B child|C child) /.test(e.title))
      .map((e: { id: string }) => e.id);
    for (const action of ['trash', 'delete']) {
      for (let i = 0; i < leftovers.length; i += 100) {
        await fetch('/api/v1/entries/bulk', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ids: leftovers.slice(i, i + 100), action }),
        });
      }
    }
    const create = async (body: object) =>
      (await (
        await fetch('/api/v1/entries', { method: 'POST', headers, body: JSON.stringify(body) })
      ).json()) as { id: string };
    const parent = await create({ type: 'page', title: `0 Parent ${stamp}` });
    const second = await create({ type: 'page', title: `0 B child ${stamp}` });
    const first = await create({ type: 'page', title: `0 C child ${stamp}` });
    for (const [child, position] of [
      [second, 1],
      [first, 0],
    ] as const) {
      await fetch(`/api/v1/entries/${child.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ parentId: parent.id, position }),
      });
    }
    return { parent: parent.id, first: first.id };
  }, stamp);

  // In the editor: "C child" (order 0) moves after "B child" (order 1).
  await page.goto(`/admin/entries/${ids.first}`);
  await expect(page.getByLabel('Parent page')).toHaveValue(ids.parent);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/entries/${ids.first}`) && r.request().method() === 'PATCH',
  );
  await page.getByLabel('Order', { exact: true }).fill('2');
  await page.getByLabel('Order', { exact: true }).blur();
  expect((await saved).ok()).toBe(true);
  // The parent cannot be moved under its own child.
  await page.goto(`/admin/entries/${ids.parent}`);
  await expect(
    page.getByLabel('Parent page').locator('option', { hasText: `C child ${stamp}` }),
  ).toHaveCount(0);

  await page.goto('/admin/pages');
  const ours = page.getByRole('row').filter({ hasText: stamp });
  await expect(ours).toHaveCount(3);
  const titles = await ours.getByRole('link').allTextContents();
  expect(titles).toEqual([`0 Parent ${stamp}`, `— 0 B child ${stamp}`, `— 0 C child ${stamp}`]);

  expect(errors).toEqual([]);
});
