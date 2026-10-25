/**
 * Hide on screen (plugin API 1.49): a field group made with the API hides
 * parts of the entry editor where it shows, and the others stay.
 */
import { expect, test } from '@playwright/test';
import { api, removeEntries, signIn } from './fixtures/api.js';
import { appErrors } from './fixtures/errors.js';

test('a field group hides the excerpt, permalink, tags and revisions of the editor', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  const suffix = Date.now().toString(36);
  const group = `hide-${suffix}`;
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'article',
    title: `Hidden parts ${suffix}`,
    document: { schema: 1, blocks: [] },
  });
  try {
    const settings = page.getByRole('complementary', { name: 'Settings' });
    // Without the group, every part is there.
    await page.goto(`/cl-admin/entries/${entry.id}`);
    await expect(settings.getByRole('heading', { name: 'Permalink' })).toBeVisible();
    await expect(settings.getByRole('heading', { name: 'Revisions' })).toBeVisible();

    await api(page, 'POST', '/field-groups', {
      id: group,
      title: `Hide ${suffix}`,
      location: [[{ param: 'contentType', operator: '==', value: 'article' }]],
      fields: [{ name: 'note', type: 'text', label: `Note ${suffix}` }],
      hideOnScreen: ['excerpt', 'slug', 'tags', 'revisions'],
    });
    await page.goto(`/cl-admin/entries/${entry.id}`);
    // The group's field shows, so the screen has its groups.
    await expect(settings.getByLabel(`Note ${suffix}`)).toBeVisible();
    await expect(settings.getByRole('heading', { name: 'Categories' })).toBeVisible();
    await expect(settings.getByRole('heading', { name: 'Author' })).toBeVisible();
    await expect(settings.getByLabel('Featured image')).toBeVisible();
    await expect(settings.getByLabel('Excerpt')).toHaveCount(0);
    await expect(settings.getByRole('heading', { name: 'Permalink' })).toHaveCount(0);
    await expect(settings.getByRole('heading', { name: 'Tags' })).toHaveCount(0);
    await expect(settings.getByRole('heading', { name: 'Revisions' })).toHaveCount(0);
    expect(appErrors(errors)).toEqual([]);
  } finally {
    await removeEntries(page, [entry.id]);
    await api(page, 'DELETE', `/field-groups/${group}`).catch(() => undefined);
  }
});
