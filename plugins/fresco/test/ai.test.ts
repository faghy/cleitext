/** Fresco for Cleitext's AI assistants: the guide, conversions and the check of native trees. */
import type { CxdDocument } from '@cleitext/blocks';
import { beforeAll, describe, expect, it } from 'vitest';
import { aiEditor, validateTree } from '../src/ai.js';
import { normalizeKit } from '../src/core/kit.js';
import { registerFreeElements } from '../src/elements/index.js';

const tree = (blocks: unknown[]): CxdDocument => ({
  schema: 1,
  blocks: blocks as CxdDocument['blocks'],
  editor: { id: 'fresco', data: { layout: 'canvas' } },
});

const context = { siteId: 's', userId: 'u', locale: 'en' };

beforeAll(() => registerFreeElements());

describe('Fresco for AI assistants', () => {
  it('accepts a valid tree, adds ids and cleans rich text', () => {
    const result = validateTree(
      tree([
        {
          type: 'fresco/container',
          attrs: { flex_direction: 'row', 'flex_direction@mobile': 'column' },
          children: [
            { type: 'fresco/heading', attrs: { title: 'Hi', tag: 'h2' } },
            {
              type: 'fresco/text',
              attrs: { content: '<p onclick="x()">Hello<script>alert(1)</script></p>' },
            },
          ],
        },
      ]),
    );
    expect('document' in result).toBe(true);
    if (!('document' in result)) return;
    const [section] = result.document.blocks as unknown as {
      id: string;
      children: { id: string; attrs: Record<string, unknown> }[];
    }[];
    expect(section!.id).toMatch(/^\w+$/);
    expect(section!.children[0]!.id).toMatch(/^\w+$/);
    expect(section!.children[1]!.attrs.content).toBe('<p>Hello</p>');
    // The page settings stay.
    expect(result.document.editor).toEqual({ id: 'fresco', data: { layout: 'canvas' } });
  });

  it('refuses unknown elements, widgets at the top level and children of widgets', () => {
    const result = validateTree(
      tree([
        { type: 'fresco/heading', attrs: { title: 'Loose' } },
        {
          type: 'fresco/container',
          attrs: {},
          children: [
            { type: 'fresco/marquee', attrs: {} },
            { type: 'fresco/button', attrs: {}, children: [{ type: 'fresco/text', attrs: {} }] },
          ],
        },
      ]),
    );
    expect('errors' in result).toBe(true);
    if (!('errors' in result)) return;
    expect(result.errors.join('\n')).toContain('top level holds only fresco/container');
    expect(result.errors.join('\n')).toContain('unknown element type "fresco/marquee"');
    expect(result.errors.join('\n')).toContain('"fresco/button" is a widget');
  });

  it('keeps blocks of other plugins inside a plugin block element', () => {
    const result = validateTree(
      tree([
        {
          type: 'fresco/container',
          attrs: {},
          children: [
            {
              type: 'fresco/block',
              attrs: {},
              children: [{ id: 'b1', type: 'shop/products', v: 1, attrs: { count: 4 } }],
            },
          ],
        },
      ]),
    );
    expect(JSON.stringify(result)).toContain('"shop/products"');
  });

  it('converts blocks to Fresco and back, and has a guide with the kit', async () => {
    const editor = aiEditor(async () => normalizeKit(null));
    const document = await editor.fromBlocks!(
      [{ id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Hello' }] }],
      context,
    );
    expect(document.editor?.id).toBe('fresco');
    expect((document.blocks[0] as { type: string }).type).toBe('fresco/container');
    const blocks = await editor.toBlocks!(document, context);
    expect(blocks.map((b) => b.type)).toEqual(['core/paragraph']);

    const guide = await (editor.guide as (c: typeof context) => Promise<string>)(context);
    expect(guide).toContain('fresco/container');
    expect(guide).toContain('`fresco/heading` — Heading');
    expect(guide).toContain('var(--fr-c-primary)');
    expect(guide).not.toContain('fresco/a-heading');
  });
});
