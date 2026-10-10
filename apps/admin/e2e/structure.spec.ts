/** Settings → Content structure (RF-CNT-02, RF-TAX-02, RF-SET-03). */
import { expect, test } from '@playwright/test';

test('a content type and a taxonomy are made, used and removed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const slug = `book${Date.now().toString(36)}`;

  await page.goto('/admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('cleitext-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Content structure' })
    .click();

  await page.getByRole('button', { name: 'Add content type' }).click();
  const form = page.getByRole('form', { name: 'New content type' });
  await form.getByLabel('Identifier').fill(slug);
  await form.getByLabel('Name (EN)').fill(`Books ${slug}`);
  await form.getByLabel('Excerpt').check();
  await form.getByRole('button', { name: 'Add field' }).click();
  await form.getByLabel('Key').fill('isbn');
  await form.getByLabel('Label').fill('ISBN');
  await form.getByRole('button', { name: 'Add content type' }).click();

  const row = page.getByRole('row', { name: `Books ${slug}` });
  await expect(row).toContainText(`/${slug}/{slug}`);
  // The new type has its own entry in the sidebar.
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: `Books ${slug}` }),
  ).toBeVisible();

  // Permalink setting.
  await row.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('form', { name: `Edit ${slug}` });
  await edit.getByLabel('Permalink').fill(`/library/{year}/{slug}`);
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: `Books ${slug}` })).toContainText(
    '/library/{year}/{slug}',
  );

  // A taxonomy for the type.
  await page.getByRole('button', { name: 'Add taxonomy' }).click();
  const tax = page.getByRole('form', { name: 'New taxonomy' });
  await tax.getByLabel('Identifier').fill(`genre${slug.slice(4)}`);
  await tax.getByLabel('Name (EN)').fill(`Genres ${slug}`);
  await tax.getByLabel(`Books ${slug}`).check();
  await tax.getByRole('button', { name: 'Add taxonomy' }).click();
  const item = page.getByRole('listitem', { name: `Genres ${slug}` });
  await expect(item).toContainText(`Books ${slug}`);

  // Clean up.
  page.on('dialog', (dialog) => dialog.accept());
  await item.getByRole('button', { name: 'Delete' }).click();
  await expect(item).toHaveCount(0);
  await page
    .getByRole('row', { name: `Books ${slug}` })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByRole('row', { name: `Books ${slug}` })).toHaveCount(0);

  expect(errors).toEqual([]);
});
