import type { CxdDocument } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { fromBlocks, inlineHtml, toBlocks } from '../src/editor/convert.js';

const doc: CxdDocument = {
  schema: 1,
  blocks: [
    { id: 'h', type: 'core/heading', v: 1, attrs: { level: 1 }, content: [{ text: 'Welcome' }] },
    {
      id: 'p',
      type: 'core/paragraph',
      v: 1,
      attrs: {},
      content: [
        { text: 'Hello ', marks: [] },
        { text: 'world', marks: ['bold'] },
        { type: 'link', href: '/about', children: [{ text: ' & more' }] },
      ],
    },
    {
      id: 'cols',
      type: 'core/columns',
      v: 1,
      attrs: {},
      children: [
        {
          id: 'c1',
          type: 'core/column',
          v: 1,
          attrs: {},
          children: [
            {
              id: 'i',
              type: 'core/image',
              v: 1,
              attrs: { id: 'm1', url: '/media/a.jpg', alt: 'A' },
            },
          ],
        },
        {
          id: 'c2',
          type: 'core/column',
          v: 1,
          attrs: {},
          children: [{ id: 's', type: 'core/separator', v: 1, attrs: {} }],
        },
      ],
    },
    {
      id: 'l',
      type: 'core/list',
      v: 1,
      attrs: { ordered: true },
      children: [{ id: 'li', type: 'core/list-item', v: 1, attrs: {}, content: [{ text: 'One' }] }],
    },
  ],
};

describe('conversion', () => {
  it('turns blocks into Fresco elements, widgets wrapped in containers', () => {
    const fresco = fromBlocks(doc);
    expect(fresco.editor).toEqual({ id: 'fresco' });
    const blocks = fresco.blocks as unknown as {
      type: string;
      attrs: Record<string, unknown>;
      children?: { type: string; attrs: Record<string, unknown>; children?: unknown[] }[];
    }[];
    expect(blocks.map((b) => b.type)).toEqual([
      'fresco/container',
      'fresco/container',
      'fresco/container',
    ]);
    expect(blocks[0]!.children!.map((c) => c.type)).toEqual(['fresco/heading', 'fresco/text']);
    expect(blocks[0]!.children![0]!.attrs).toEqual({ title: 'Welcome', tag: 'h1' });
    expect(blocks[0]!.children![1]!.attrs.content).toBe(
      '<p>Hello <strong>world</strong><a href="/about"> &amp; more</a></p>',
    );
    expect(blocks[1]!.attrs.flex_direction).toBe('row');
    expect(blocks[1]!.children![0]!.children).toEqual([
      expect.objectContaining({
        type: 'fresco/image',
        attrs: { image: { id: 'm1', url: '/media/a.jpg', alt: 'A' } },
      }),
    ]);
    expect(blocks[2]!.children![0]!.attrs.content).toBe('<ol><li>One</li></ol>');
  });

  it('goes back to blocks: text as native blocks, rows of boxes as columns', () => {
    const back = toBlocks(fromBlocks(doc));
    expect(back.editor).toBeUndefined();
    expect(back.blocks.map((b) => b.type)).toEqual([
      'core/heading',
      'core/paragraph',
      'core/columns',
      'core/list',
    ]);
    expect(back.blocks[1]!.content).toEqual([
      { text: 'Hello ' },
      { text: 'world', marks: ['bold'] },
      { type: 'link', href: '/about', children: [{ text: ' & more' }] },
    ]);
    expect(back.blocks[2]!.children!.map((c) => c.children!.map((b) => b.type))).toEqual([
      ['core/image'],
      ['core/separator'],
    ]);
    expect(back.blocks[3]).toMatchObject({
      attrs: { ordered: true },
      children: [{ type: 'core/list-item', content: [{ text: 'One' }] }],
    });
  });

  it('keeps the text of widgets without a block of their own', () => {
    const node = (type: string, attrs: Record<string, unknown>, children?: unknown[]) => ({
      id: type,
      type,
      v: 1,
      attrs,
      ...(children ? { children } : {}),
    });
    const page = {
      schema: 1 as const,
      editor: { id: 'fresco' },
      blocks: [
        node('fresco/container', {}, [
          node('fresco/icon-box', { title: 'Fast', description: 'Very <em>fast</em>.' }),
          node('fresco/icon-list', { items: [{ text: 'One' }, { text: 'Two' }] }),
          node('fresco/testimonial', { content: 'Great.', name: 'Ann', job: 'CEO' }),
          node('fresco/button', { text: 'Go', link: { url: '/go', newTab: true } }),
          node('fresco/tabs', {}, [
            node('fresco/container', { _title: 'First' }, [node('fresco/text', { content: 'A' })]),
          ]),
        ]),
      ] as unknown as CxdDocument['blocks'],
    };
    const blocks = toBlocks(page).blocks;
    expect(blocks.map((b) => b.type)).toEqual([
      'core/heading',
      'core/paragraph',
      'core/list',
      'core/quote',
      'core/buttons',
      'core/heading',
      'core/paragraph',
    ]);
    expect(blocks[1]!.content).toEqual([
      { text: 'Very ' },
      { text: 'fast', marks: ['italic'] },
      { text: '.' },
    ]);
    expect(blocks[3]!.children!.map((b) => b.content)).toEqual([
      [{ text: 'Great.' }],
      [{ text: '— Ann, CEO' }],
    ]);
    expect(blocks[4]!.children![0]!.attrs).toEqual({ url: '/go', linkTarget: '_blank' });
    expect(blocks[5]!.content).toEqual([{ text: 'First' }]);
  });

  it('keeps blocks of other plugins, inside a plugin block element', () => {
    const products = { id: 'sp', type: 'shop/products', v: 1, attrs: { limit: 4 } };
    const fresco = fromBlocks({ schema: 1, blocks: [products] });
    const wrapper = (fresco.blocks[0]!.children ?? [])[0]!;
    expect(wrapper.type).toBe('fresco/block');
    expect(wrapper.children).toEqual([products]);
    expect(toBlocks(fresco).blocks).toEqual([products]);
  });

  it('turns galleries into Fresco galleries and tables into HTML, and back', () => {
    const gallery = {
      id: 'g',
      type: 'core/gallery',
      v: 1,
      attrs: { columns: 2 },
      children: [
        { id: 'i', type: 'core/image', v: 1, attrs: { id: 'm1', url: '/a.jpg', alt: 'A' } },
      ],
    };
    const table = {
      id: 't',
      type: 'core/table',
      v: 1,
      attrs: {
        body: [{ cells: [{ content: [{ text: 'x', marks: ['bold'] }], tag: 'td', colspan: 2 }] }],
      },
    };
    const fresco = fromBlocks({ schema: 1, blocks: [gallery, table] });
    const [g, t] = (fresco.blocks[0]!.children ?? []) as {
      type: string;
      attrs: Record<string, unknown>;
    }[];
    expect(g).toMatchObject({
      type: 'fresco/gallery',
      attrs: { images: [{ id: 'm1', url: '/a.jpg', alt: 'A' }], columns: 2 },
    });
    expect(t).toMatchObject({
      type: 'fresco/html',
      attrs: {
        code: '<table><tbody><tr><td colspan="2"><strong>x</strong></td></tr></tbody></table>',
      },
    });
    const back = toBlocks(fresco).blocks;
    expect(back[0]).toMatchObject({ type: 'core/gallery', attrs: { columns: 2 } });
    expect(back[0]!.children![0]!.attrs).toEqual({ id: 'm1', url: '/a.jpg', alt: 'A' });
  });

  it('escapes text', () => {
    expect(inlineHtml([{ text: '<script>' }])).toBe('&lt;script&gt;');
  });
});
