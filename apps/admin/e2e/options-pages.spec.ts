/**
 * Options pages (plugin API 1.48): a page made with the API shows in the
 * admin menu, saves a value, and a heading bound to that option shows it
 * on the public site.
 */
import { expect, test } from '@playwright/test';
import { api, removeEntries, signIn, SITE } from './fixtures/api.js';
import { appErrors } from './fixtures/errors.js';

test('an options page made with the API shows in the menu and its value on the site', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  const suffix = Date.now().toString(36);
  const slug = `contacts-${suffix}`;
  const title = `Contacts ${suffix}`;
  await api(page, 'POST', '/options-pages', {
    slug,
    title,
    fields: [{ name: 'phone', type: 'text', label: 'Phone number' }],
  });
  const entry = await api<{ id: string; slug: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Call us ${suffix}`,
    document: {
      schema: 1,
      blocks: [
        {
          id: 'h1',
          type: 'core/heading',
          v: 1,
          attrs: {
            level: 2,
            className: `phone-${suffix}`,
            metadata: {
              bindings: {
                content: { source: 'cleitext/field', args: { key: `option.field:${slug}.phone` } },
              },
            },
          },
          content: [{ text: 'No phone yet' }],
        },
      ],
    },
  });
  try {
    await api(page, 'POST', `/entries/${entry.id}/publish`, {});
    // The page is in the menu (the list of pages is read when the admin opens).
    await page.goto('/cl-admin/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: title }).click();
    await page.waitForURL(`**/cl-admin/options/${slug}`);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

    await page.getByLabel('Phone number').fill('+39 010 555 0101');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved');
    const saved = await api<{ values: Record<string, unknown> }>(page, 'GET', `/options/${slug}`);
    expect(saved.values).toEqual({ phone: '+39 010 555 0101' });

    const visitor = await context.browser()!.newContext();
    const site = await visitor.newPage();
    await site.goto(`${SITE}/${entry.slug}`);
    await expect(site.locator(`h2.phone-${suffix}`)).toHaveText('+39 010 555 0101');
    await visitor.close();
    expect(appErrors(errors)).toEqual([]);
  } finally {
    await removeEntries(page, [entry.id]);
    await api(page, 'DELETE', `/options-pages/${slug}`);
  }
});
