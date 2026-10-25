/**
 * Block bindings (plugin API 1.48): in the block editor, a paragraph is
 * bound to a field of the entry from the "Bind to field" panel, the canvas
 * shows the field's value at once, and so does the public page.
 */
import { expect, test } from '@playwright/test';
import { api, removeEntries, signIn, SITE } from './fixtures/api.js';
import { appErrors } from './fixtures/errors.js';

test('a paragraph bound to an entry field shows its value in the editor and on the site', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  const suffix = Date.now().toString(36);
  const group = `bind${suffix}`;
  const groupTitle = `Bindings ${suffix}`;
  await api(page, 'POST', '/field-groups', {
    id: group,
    title: groupTitle,
    location: [[{ param: 'contentType', operator: '==', value: 'page' }]],
    fields: [{ name: 'tagline', type: 'text', label: 'Tagline' }],
  });
  const entry = await api<{ id: string; slug: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Bound ${suffix}`,
    fields: { [group]: { tagline: `Fresh every morning ${suffix}` } },
    document: {
      schema: 1,
      blocks: [
        {
          id: 'p1',
          type: 'core/paragraph',
          v: 1,
          attrs: { className: `bound-${suffix}` },
          content: [{ text: 'Typed text' }],
        },
      ],
    },
  });
  try {
    await page.goto(`/cl-admin/entries/${entry.id}`);
    const canvas = page.frameLocator('iframe[name="editor-canvas"]');
    const paragraph = canvas.locator(`p.bound-${suffix}`);
    await paragraph.click();
    const settings = page.getByRole('complementary', { name: 'Settings' });
    await settings.getByRole('button', { name: 'Bind to field' }).click();
    const text = settings.getByRole('combobox', { name: 'Text' });
    // The sources are loaded from the site.
    await expect(text.locator('option', { hasText: `${groupTitle} → Tagline` })).toHaveCount(1);
    await text.selectOption({ label: `${groupTitle} → Tagline` });
    // The canvas shows the field's value, read-only, in place of the typed text.
    await expect(paragraph).toHaveText(`Fresh every morning ${suffix}`);

    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByRole('button', { name: 'Update' })).toBeVisible();
    const saved = await api<{
      revision: { document: { blocks: { attrs: Record<string, unknown>; content: unknown }[] } };
    }>(page, 'GET', `/entries/${entry.id}`);
    const block = saved.revision.document.blocks[0]!;
    expect(block.attrs.metadata).toEqual({
      bindings: {
        content: { source: 'cleitext/field', args: { key: `entry.field:${group}.tagline` } },
      },
    });
    // What was typed stays, as the text shown when the field is empty.
    expect(block.content).toEqual([{ text: 'Typed text' }]);

    const visitor = await context.browser()!.newContext();
    const site = await visitor.newPage();
    await site.goto(`${SITE}/${entry.slug}`);
    await expect(site.locator(`p.bound-${suffix}`)).toHaveText(`Fresh every morning ${suffix}`);
    await visitor.close();
    expect(appErrors(errors)).toEqual([]);
  } finally {
    await removeEntries(page, [entry.id]);
    await api(page, 'DELETE', `/field-groups/${group}`);
  }
});
