/**
 * A plugin block whose settings use the admin's fields form (media and
 * relation fields, which read data with TanStack Query): selected in the
 * block editor, its sidebar works instead of failing with "No QueryClient set".
 */
import { expect, test } from '@playwright/test';
import { api, removeEntries, signIn } from './fixtures/api.js';
import { appErrors } from './fixtures/errors.js';

test('the sidebar of a plugin block with media and relation fields opens without errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await signIn(page);
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'article',
    title: `Plugin block fields ${Date.now().toString(36)}`,
    document: {
      schema: 1,
      blocks: [{ id: 'p1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Hello' }] }],
    },
  });
  try {
    await page.goto(`/cl-admin/entries/${entry.id}`);
    const canvas = page.frameLocator('iframe[name="editor-canvas"]');
    await expect(canvas.getByText('Hello')).toBeVisible();

    // Like a plugin's block editor entry: a block whose settings are a fields
    // form, built with the modules the admin shares with plugins.
    await page.evaluate(() => {
      type Fn = (...args: unknown[]) => unknown;
      const shared = (
        globalThis as unknown as {
          __cleitextShared: {
            react: Record<'createElement' | 'useState', Fn>;
            '@cleitext/admin-sdk': Record<'FieldsForm', Fn>;
            '@wordpress/block-editor': Record<'InspectorControls' | 'useBlockProps', Fn>;
            '@wordpress/blocks': Record<'createBlock' | 'registerBlockType', Fn>;
            '@wordpress/data': Record<'dispatch', Fn>;
          };
        }
      ).__cleitextShared;
      const { createElement: h, useState } = shared.react;
      const { FieldsForm } = shared['@cleitext/admin-sdk'];
      const { InspectorControls, useBlockProps } = shared['@wordpress/block-editor'];
      const { createBlock, registerBlockType } = shared['@wordpress/blocks'];
      const { dispatch } = shared['@wordpress/data'];
      registerBlockType('e2e/media-fields', {
        apiVersion: 3,
        title: 'E2E media fields',
        category: 'media',
        attributes: {},
        edit: function Edit() {
          const [values, setValues] = useState({}) as [unknown, Fn];
          return h(
            'div',
            useBlockProps(),
            'E2E media block',
            h(
              InspectorControls,
              null,
              h(FieldsForm, {
                fields: [
                  { name: 'photo', type: 'media', label: 'Photo' },
                  { name: 'related', type: 'entry', label: 'Related entry' },
                ],
                values,
                onChange: setValues,
              }),
            ),
          );
        },
        save: () => null,
      });
      const editor = dispatch('core/block-editor') as { insertBlock: Fn };
      void editor.insertBlock(createBlock('e2e/media-fields'));
    });

    await canvas.getByText('E2E media block').click();
    const photo = page.getByRole('button', { name: 'Photo' });
    await expect(photo).toHaveText('Choose image');
    await expect(page.getByText('Choose an entry')).toBeVisible();
    await photo.click();
    await expect(photo).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('This block has encountered an error')).toHaveCount(0);
    expect(appErrors(errors).filter((e) => /QueryClient/.test(e))).toEqual([]);
  } finally {
    await removeEntries(page, [entry.id]);
  }
});
