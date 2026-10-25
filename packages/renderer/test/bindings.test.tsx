/**
 * Block bindings (plugin API 1.48): core blocks showing dynamic sources, the
 * Field block with its formatter and Field rows repeating its blocks,
 * resolved before rendering as the server does.
 */
import {
  applyBindings,
  BINDING_SOURCE,
  BOUND,
  boundMediaIds,
  hasBindings,
  type BindingResolver,
  type BindingScope,
  type BoundValue,
  type CxdBlock,
  type CxdDocument,
} from '@cleitext/blocks';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Blocks, type RenderMedia } from '../src/index.js';

const doc = (...blocks: CxdBlock[]): CxdDocument => ({ schema: 1, blocks });
const bind = (bindings: Record<string, string>) => ({
  metadata: {
    bindings: Object.fromEntries(
      Object.entries(bindings).map(([attribute, key]) => [
        attribute,
        { source: BINDING_SOURCE, args: { key } },
      ]),
    ),
  },
});

const PHOTO: RenderMedia = {
  id: '44444444-4444-4444-8444-444444444444',
  url: '/media/photo.jpg',
  mime: 'image/jpeg',
  width: 800,
  height: 600,
  alt: 'Library alt',
  variants: [
    { variant: 'md', format: 'webp', url: '/media/photo-md.webp', width: 400, height: 300 },
  ],
};

/** The values a page could have, by source id; rows get theirs. */
const VALUES: Record<string, BoundValue> = {
  'entry.title': { value: 'Spring menu', kind: 'text' },
  'entry.field:subtitle': { value: 'Fresh <things>', kind: 'text' },
  'entry.field:bio': { value: '<p>One <strong>bold</strong></p><p>Two</p>', kind: 'richtext' },
  'entry.field:photo': {
    value: { id: PHOTO.id, url: PHOTO.url, alt: 'Field alt', width: 800, height: 600 },
    kind: 'media',
  },
  'entry.field:cta': {
    value: { url: '/book', label: 'Book a table', target: '_blank' },
    kind: 'link',
  },
  'entry.field:opens': { value: '2026-05-01', kind: 'date' },
  'entry.field:empty': { value: '', kind: 'text' },
  'option.field:contacts.phone': { value: '+39 010 123', kind: 'text' },
  'site.title': { value: 'Trattoria', kind: 'text' },
  'entry.field:team': {
    value: [
      { _id: 'r1', name: 'Ann', role: 'Chef' },
      { _id: 'r2', name: 'Bob', role: 'Waiter' },
    ],
    kind: 'list',
    rowKind: 'fields',
  },
  'entry.field:related': {
    value: [
      { id: 'e1', type: 'article', title: 'First', url: '/first' },
      { id: 'e2', type: 'article', title: 'Second', url: '/second' },
    ],
    kind: 'list',
    rowKind: 'entry',
  },
};

const calls: { key: string; scope: BindingScope }[] = [];
const resolve: BindingResolver = (key, scope) => {
  calls.push({ key, scope });
  if (key.startsWith('row.field:')) {
    const value = scope.row?.[key.slice('row.field:'.length)];
    return value === undefined ? undefined : { value, kind: 'text' };
  }
  if (key === 'entry.title' && scope.entry) {
    return { value: scope.entry.id === 'e1' ? 'First' : 'Second', kind: 'text' };
  }
  return VALUES[key];
};

async function render(document: CxdDocument, locale = 'en') {
  const resolved = await applyBindings(document, { resolve, locale });
  return renderToStaticMarkup(
    <Blocks document={resolved} context={{ media: new Map([[PHOTO.id, PHOTO]]), locale }} />,
  );
}

describe('core blocks bound to fields', () => {
  it('paragraphs, headings and list items show the value as text, escaped', async () => {
    const out = await render(
      doc(
        {
          id: 'h',
          type: 'core/heading',
          v: 1,
          attrs: { level: 2, ...bind({ content: 'entry.title' }) },
          content: [{ text: 'Typed title' }],
        },
        {
          id: 'p',
          type: 'core/paragraph',
          v: 1,
          attrs: bind({ content: 'entry.field:subtitle' }),
          content: [{ text: 'fallback' }],
        },
        {
          id: 'l',
          type: 'core/list',
          v: 1,
          attrs: {},
          children: [
            {
              id: 'li',
              type: 'core/list-item',
              v: 1,
              attrs: bind({ content: 'option.field:contacts.phone' }),
              content: [{ text: 'phone' }],
            },
          ],
        },
      ),
    );
    expect(out).toContain('<h2 class="wp-block-heading">Spring menu</h2>');
    expect(out).toContain('<p>Fresh &lt;things&gt;</p>');
    expect(out).toContain('<li>+39 010 123</li>');
    expect(out).not.toContain('Typed title');
  });

  it('rich text keeps its marks, with paragraphs as line breaks', async () => {
    const out = await render(
      doc({
        id: 'p',
        type: 'core/paragraph',
        v: 1,
        attrs: bind({ content: 'entry.field:bio' }),
        content: [],
      }),
    );
    expect(out).toContain('<p>One <strong>bold</strong><br/>Two</p>');
  });

  it('dates show in the page language', async () => {
    const out = await render(
      doc({
        id: 'p',
        type: 'core/paragraph',
        v: 1,
        attrs: bind({ content: 'entry.field:opens' }),
        content: [],
      }),
      'it',
    );
    expect(out).toContain('<p>1 maggio 2026</p>');
  });

  it('what was typed stays when the source has no value', async () => {
    const out = await render(
      doc(
        {
          id: 'p',
          type: 'core/paragraph',
          v: 1,
          attrs: bind({ content: 'entry.field:empty' }),
          content: [{ text: 'Typed text' }],
        },
        {
          id: 'q',
          type: 'core/paragraph',
          v: 1,
          attrs: bind({ content: 'entry.field:unknown' }),
          content: [{ text: 'Also typed' }],
        },
      ),
    );
    expect(out).toContain('<p>Typed text</p>');
    expect(out).toContain('<p>Also typed</p>');
  });

  it('buttons take the text and the address of a link, with its new tab', async () => {
    const out = await render(
      doc({
        id: 'b',
        type: 'core/button',
        v: 1,
        attrs: { url: '/old', ...bind({ url: 'entry.field:cta', text: 'entry.field:cta' }) },
        content: [{ text: 'Old' }],
      }),
    );
    expect(out).toContain('href="/book"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('>Book a table</a>');
  });

  it('images take a media field, with the library variants', async () => {
    const document = doc({
      id: 'i',
      type: 'core/image',
      v: 1,
      attrs: {
        url: '/placeholder.png',
        ...bind({ id: 'entry.field:photo', url: 'entry.field:photo' }),
      },
    });
    const out = await render(document);
    expect(out).toContain('src="/media/photo.jpg"');
    expect(out).toContain('alt="Field alt"');
    expect(out).toContain('/media/photo-md.webp');
    expect(out).not.toContain('placeholder');
  });

  it('only the core source with a key counts', async () => {
    const document = doc({
      id: 'p',
      type: 'core/paragraph',
      v: 1,
      attrs: {
        metadata: { bindings: { content: { source: 'core/post-meta', args: { key: 'x' } } } },
      },
      content: [{ text: 'Static' }],
    });
    expect(hasBindings(document)).toBe(false);
    expect(await render(document)).toBe('<p>Static</p>');
  });
});

describe('the Field block', () => {
  const field = (source: string, attrs: Record<string, unknown> = {}): CxdBlock => ({
    id: `f-${source}`,
    type: 'cleitext/field',
    v: 1,
    attrs: { source, ...attrs },
  });

  it('shows each kind of value with its format', async () => {
    const out = await render(
      doc(
        field('entry.field:subtitle', { label: 'Today:', tagName: 'h3' }),
        field('entry.field:cta'),
        field('entry.field:photo'),
        field('entry.field:bio'),
        field('entry.field:related'),
        field('entry.field:opens'),
      ),
    );
    expect(out).toContain(
      '<h3 class="wp-block-cleitext-field is-text"><span class="wp-block-cleitext-field__label">Today: </span>Fresh &lt;things&gt;</h3>',
    );
    expect(out).toContain(
      '<a href="/book" target="_blank" rel="noopener noreferrer">Book a table</a>',
    );
    expect(out).toMatch(/<div class="wp-block-cleitext-field is-media"><picture>/);
    expect(out).toContain(
      '<div class="wp-block-cleitext-field__text"><p>One <strong>bold</strong></p><p>Two</p></div>',
    );
    expect(out).toContain(
      '<li><a href="/first">First</a></li><li><a href="/second">Second</a></li>',
    );
    expect(out).toContain('May 1, 2026');
  });

  it('shows its fallback text, or nothing, without a value', async () => {
    const out = await render(
      doc(field('entry.field:empty', { fallback: 'Coming soon' }), field('entry.field:unknown')),
    );
    expect(out).toBe('<p class="wp-block-cleitext-field is-text is-empty">Coming soon</p>');
  });

  it('shows nothing when it was not resolved, nor values stored in its attributes', async () => {
    const forged = doc({
      id: 'f',
      type: 'cleitext/field',
      v: 1,
      attrs: { source: 'entry.title', boundValue: '<script>x</script>' },
    });
    expect(
      renderToStaticMarkup(
        <Blocks document={forged} context={{ media: new Map(), locale: 'en' }} />,
      ),
    ).toBe('');
  });
});

describe('Field rows', () => {
  it('repeats its blocks for each row of a list, bindings reading the row', async () => {
    const out = await render(
      doc({
        id: 'rows',
        type: 'cleitext/field-rows',
        v: 1,
        attrs: { source: 'entry.field:team', layout: 'grid', columns: 2 },
        children: [
          {
            id: 'name',
            type: 'core/heading',
            v: 1,
            attrs: { level: 3, ...bind({ content: 'row.field:name' }) },
            content: [{ text: 'Name' }],
          },
          { id: 'role', type: 'cleitext/field', v: 1, attrs: { source: 'row.field:role' } },
        ],
      }),
    );
    expect(out).toContain('grid-template-columns:repeat(2, minmax(0, 1fr))');
    expect(out.match(/wp-block-cleitext-field-row"/g)).toHaveLength(2);
    expect(out).toContain('<h3 class="wp-block-heading">Ann</h3>');
    expect(out).toContain('<h3 class="wp-block-heading">Bob</h3>');
    expect(out).toContain('>Waiter</p>');
  });

  it('repeats them for related entries, whose sources are read for each', async () => {
    calls.length = 0;
    const out = await render(
      doc({
        id: 'rows',
        type: 'cleitext/field-rows',
        v: 1,
        attrs: { source: 'entry.field:related', limit: 1 },
        children: [
          {
            id: 't',
            type: 'core/paragraph',
            v: 1,
            attrs: bind({ content: 'entry.title' }),
            content: [],
          },
        ],
      }),
    );
    expect(out).toContain('<p>First</p>');
    expect(out).not.toContain('Second');
    expect(calls.find((c) => c.key === 'entry.title')?.scope.entry).toEqual({ id: 'e1' });
  });

  it('shows its empty text without rows', async () => {
    const out = await render(
      doc({
        id: 'rows',
        type: 'cleitext/field-rows',
        v: 1,
        attrs: { source: 'entry.field:nothing', emptyText: 'No one yet' },
        children: [],
      }),
    );
    expect(out).toBe('<p class="wp-block-cleitext-field-rows is-empty">No one yet</p>');
  });

  it('names the images it shows, to load them first', async () => {
    const resolved = await applyBindings(
      doc({ id: 'f', type: 'cleitext/field', v: 1, attrs: { source: 'entry.field:photo' } }),
      { resolve, locale: 'en' },
    );
    expect(boundMediaIds(resolved)).toEqual([PHOTO.id]);
    expect((resolved.blocks[0] as unknown as Record<symbol, unknown>)[BOUND]).toBeDefined();
  });
});
