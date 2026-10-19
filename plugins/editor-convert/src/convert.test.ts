import type { SiteEditor } from '@cleitext/admin-sdk';
import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { copyTitle, countNodes, documentWords, editorOf, planConversion } from './convert';

const block = (
  id: string,
  type: string,
  attrs: Record<string, unknown> = {},
  extra: Partial<CxdBlock> = {},
): CxdBlock => ({ id, type, v: 1, attrs, ...extra });

const asBlocks = (document: CxdDocument): CxdDocument => ({
  schema: document.schema,
  blocks: document.blocks,
});

/** A builder that wraps each block in a box, its texts in `text` elements. */
const builder: SiteEditor = {
  id: 'builder',
  title: 'Builder',
  plugin: 'builder',
  fromBlocks: (document) => ({
    schema: 1,
    editor: { id: 'builder', data: { layout: 'full' } },
    blocks: document.blocks.map((b, i) =>
      b.type === 'core/paragraph'
        ? block(`t${i}`, 'builder/text', {
            content: (b.content ?? []).map((c) => ('text' in c ? c.text : '')).join(''),
          })
        : block(`k${i}`, 'builder/block', {}, { children: [b] }),
    ),
  }),
  toBlocks: (document) => ({
    schema: 1,
    blocks: document.blocks.flatMap((b) =>
      b.type === 'builder/text'
        ? [block(b.id, 'core/paragraph', {}, { content: [{ text: String(b.attrs.content) }] })]
        : (b.children ?? []),
    ),
  }),
};

/** A builder that can open block content but not give it back. */
const oneWay: SiteEditor = {
  id: 'oneway',
  title: 'One way',
  plugin: 'oneway',
  types: ['page'],
  fromBlocks: () => ({ schema: 1, blocks: [] }),
};

const editors: SiteEditor[] = [
  { id: 'blocks', title: 'Block editor', plugin: null, fromBlocks: asBlocks, toBlocks: asBlocks },
  builder,
  oneWay,
];

const blocksDoc: CxdDocument = {
  schema: 1,
  editor: { id: 'blocks', data: { hideFeatured: true } },
  blocks: [
    block('p', 'core/paragraph', {}, { content: [{ text: 'Hello wonderful world' }] }),
    block('t', 'core/table', { caption: [{ text: 'Prices' }] }),
  ],
};

describe('editorOf', () => {
  it('names the block editor for documents without an editor, or with its own id', () => {
    expect(editorOf({ schema: 1, blocks: [] })).toBe('blocks');
    expect(editorOf(blocksDoc)).toBe('blocks');
    expect(editorOf(null)).toBe('blocks');
    expect(editorOf({ schema: 1, blocks: [], editor: { id: 'fresco' } })).toBe('fresco');
  });
});

describe('planConversion', () => {
  it('converts block editor content into a builder, naming the blocks it keeps as they are', () => {
    const plan = planConversion(blocksDoc, 'page', editors, 'builder');
    expect(plan.error).toBeUndefined();
    expect(plan.source).toBe('blocks');
    expect(plan.document?.editor).toEqual({ id: 'builder', data: { layout: 'full' } });
    expect(plan.document?.blocks.map((b) => b.type)).toEqual(['builder/text', 'builder/block']);
    expect(plan.before).toBe(2);
    expect(plan.after).toBe(3);
    expect(plan.keptAsBlocks).toEqual(['core/table']);
    expect(plan.textKept).toBe(1);
    expect(plan.missingWords).toEqual([]);
  });

  it('goes through the block editor between two builders, and back to blocks', () => {
    const page = planConversion(blocksDoc, 'page', editors, 'builder').document!;
    const back = planConversion(page, 'page', editors, 'blocks');
    expect(back.source).toBe('builder');
    expect(back.document).toEqual({
      schema: 1,
      blocks: [
        expect.objectContaining({ type: 'core/paragraph' }),
        expect.objectContaining({ type: 'core/table' }),
      ],
    });
    expect(back.document?.editor).toBeUndefined();
    const other = planConversion(page, 'page', editors, 'oneway');
    expect(other.error).toBeUndefined();
    expect(other.document?.editor).toEqual({ id: 'oneway' });
  });

  it('reports text that did not make it', () => {
    const plan = planConversion(blocksDoc, 'page', editors, 'oneway');
    expect(plan.after).toBe(0);
    expect(plan.missingWords).toEqual(['hello', 'wonderful', 'world', 'prices']);
    expect(plan.textKept).toBe(0);
  });

  it('does not change the original document', () => {
    const copy = structuredClone(blocksDoc);
    planConversion(blocksDoc, 'page', editors, 'builder');
    expect(blocksDoc).toEqual(copy);
  });

  it('refuses what it cannot do, with the reason', () => {
    const fresco: CxdDocument = { schema: 1, blocks: [], editor: { id: 'fresco' } };
    const oneWayPage: CxdDocument = { schema: 1, blocks: [], editor: { id: 'oneway' } };
    expect(planConversion(blocksDoc, 'page', editors, 'blocks').error).toBe('same-editor');
    expect(planConversion(fresco, 'page', editors, 'blocks').error).toBe('source-missing');
    expect(planConversion(oneWayPage, 'page', editors, 'builder').error).toBe('no-to-blocks');
    expect(planConversion(blocksDoc, 'article', editors, 'oneway').error).toBe(
      'type-not-supported',
    );
    expect(planConversion(blocksDoc, 'page', editors, 'missing').error).toBe('type-not-supported');
    const noFrom: SiteEditor = { id: 'view', title: 'View', plugin: 'view' };
    expect(planConversion(blocksDoc, 'page', [...editors, noFrom], 'view').error).toBe(
      'no-from-blocks',
    );
  });

  it('reports a converter that fails', () => {
    const broken: SiteEditor = {
      ...builder,
      id: 'broken',
      fromBlocks: () => {
        throw new Error('boom');
      },
    };
    const plan = planConversion(blocksDoc, 'page', [...editors, broken], 'broken');
    expect(plan.error).toBe('failed');
    expect(plan.detail).toBe('boom');
    expect(plan.document).toBeUndefined();
  });

  it('counts Custom HTML blocks and elements the target cannot show', () => {
    const leaky: SiteEditor = {
      ...builder,
      id: 'leaky',
      toBlocks: (document) => ({
        schema: 1,
        blocks: [
          block('h', 'core/html', { content: '<div>Box</div>' }),
          ...document.blocks.filter((b) => b.type === 'leaky/odd'),
        ],
      }),
    };
    const page: CxdDocument = {
      schema: 1,
      editor: { id: 'leaky' },
      blocks: [block('o', 'leaky/odd', { title: 'Box' })],
    };
    const plan = planConversion(page, 'page', [...editors, leaky], 'blocks');
    expect(plan.htmlBlocks).toBe(1);
    expect(plan.leftover).toEqual(['leaky/odd']);
    expect(plan.textKept).toBe(1);
  });
});

describe('documentWords', () => {
  it('reads rich text and the texts of settings, not styles, links or icons', () => {
    const words = documentWords({
      schema: 1,
      blocks: [
        block(
          'a',
          'x/box',
          {
            title: 'Our <strong>Services</strong>',
            color: 'magenta',
            link: { url: 'https://example.com/page' },
            icon: { set: 'solid', name: 'check' },
            items: [{ text: 'Delivery' }],
            flex_direction: 'row',
          },
          {
            children: [block('b', 'core/paragraph', {}, { content: [{ text: 'Città è bella' }] })],
          },
        ),
      ],
    });
    expect([...words].sort()).toEqual(['bella', 'città', 'delivery', 'our', 'services']);
  });

  it('counts nested elements', () => {
    expect(
      countNodes([block('a', 'x/a', {}, { children: [block('b', 'x/b'), block('c', 'x/c')] })]),
    ).toBe(3);
  });
});

describe('copyTitle', () => {
  it('adds the editor name, within the title limit', () => {
    expect(copyTitle('About us', 'Fresco')).toBe('About us (Fresco)');
    expect(copyTitle('  ', 'Fresco')).toBe('— (Fresco)');
    expect(copyTitle('x'.repeat(400), 'Fresco')).toHaveLength(300);
  });
});
