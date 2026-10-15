import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createCoreRegistry } from '../src/core-blocks.js';
import {
  CXD_LIMITS,
  cxdDocumentSchema,
  documentText,
  emptyDocument,
  newBlockId,
  type CxdBlock,
  type CxdDocument,
} from '../src/cxd.js';
import { BlockRegistry, migrateDocument, validateBlocks } from '../src/registry.js';

const doc: CxdDocument = {
  schema: 1,
  blocks: [
    { id: 'b1', type: 'core/heading', v: 1, attrs: { level: 2 }, content: [{ text: 'Title' }] },
    {
      id: 'b2',
      type: 'core/columns',
      v: 1,
      attrs: {},
      children: [
        {
          id: 'b3',
          type: 'core/column',
          v: 1,
          attrs: {},
          children: [
            {
              id: 'b4',
              type: 'core/paragraph',
              v: 1,
              attrs: {},
              content: [{ text: 'Left', marks: ['bold'] }],
            },
          ],
        },
      ],
    },
    { id: 'b5', type: 'acme/unknown', v: 3, attrs: { anything: true } },
  ],
};

describe('cxdDocumentSchema', () => {
  it('accepts a valid document, including unknown block types', () => {
    expect(cxdDocumentSchema.safeParse(doc).success).toBe(true);
    expect(cxdDocumentSchema.safeParse(emptyDocument()).success).toBe(true);
  });

  it('rejects malformed blocks and unsafe links', () => {
    const bad = (blocks: unknown[]) => cxdDocumentSchema.safeParse({ schema: 1, blocks }).success;
    expect(bad([{ id: 'x', type: 'paragraph', v: 1, attrs: {} }])).toBe(false);
    expect(bad([{ id: 'x', type: 'core/p', v: 0, attrs: {} }])).toBe(false);
    expect(bad([{ id: 'x', type: 'core/p', v: 1, attrs: {}, extra: 1 }])).toBe(false);
    expect(
      bad([
        {
          id: 'x',
          type: 'core/p',
          v: 1,
          attrs: {},
          content: [{ type: 'link', href: 'javascript:alert(1)', children: [] }],
        },
      ]),
    ).toBe(false);
  });

  it('records the editor that made the document, with its page settings', () => {
    const made = { ...doc, editor: { id: 'fresco', data: { hideTitle: true } } };
    expect(cxdDocumentSchema.safeParse(made).success).toBe(true);
    expect(cxdDocumentSchema.safeParse({ ...doc, editor: { id: 'Fresco!' } }).success).toBe(false);
    expect(
      cxdDocumentSchema.safeParse({ ...doc, editor: { id: 'fresco', other: 1 } }).success,
    ).toBe(false);
  });

  it('enforces nesting limits', () => {
    let block: CxdBlock = { id: 'leaf', type: 'core/group', v: 1, attrs: {} };
    for (let i = 0; i < CXD_LIMITS.maxDepth + 1; i++) {
      block = { id: `g${i}`, type: 'core/group', v: 1, attrs: {}, children: [block] };
    }
    expect(cxdDocumentSchema.safeParse({ schema: 1, blocks: [block] }).success).toBe(false);
  });
});

describe('core registry', () => {
  const registry = createCoreRegistry();

  it('validates known blocks and preserves unknown ones', () => {
    expect(validateBlocks(doc, registry)).toEqual([]);
  });

  it('reports invalid attributes and misplaced children', () => {
    const issues = validateBlocks(
      {
        schema: 1,
        blocks: [
          { id: 'h', type: 'core/heading', v: 1, attrs: { level: 9 } },
          { id: 'p', type: 'core/paragraph', v: 1, attrs: {}, children: [] },
        ],
      },
      registry,
    );
    expect(issues.map((i) => i.blockId)).toEqual(['h', 'p']);
  });

  it('keeps unknown attributes set by the editor', () => {
    const result = registry
      .get('core/paragraph')!
      .attrs.parse({ style: { color: { text: 'red' } } });
    expect(result).toEqual({ style: { color: { text: 'red' } } });
  });
});

describe('migrations', () => {
  it('upgrades attributes step by step', () => {
    const registry = new BlockRegistry().register({
      type: 'acme/hero',
      version: 3,
      title: 'Hero',
      category: 'design',
      attrs: z.object({ align: z.string() }).loose(),
      migrate: {
        1: (a) => ({ ...a, centered: a.center === 'yes' }),
        2: ({ centered, ...a }) => ({ ...a, align: centered ? 'center' : 'left' }),
      },
    });
    const migrated = migrateDocument(
      { schema: 1, blocks: [{ id: 'h', type: 'acme/hero', v: 1, attrs: { center: 'yes' } }] },
      registry,
    );
    expect(migrated.blocks[0]).toMatchObject({ v: 3, attrs: { center: 'yes', align: 'center' } });
  });
});

describe('helpers', () => {
  it('extracts plain text', () => {
    expect(documentText(doc)).toBe('Title\nLeft');
  });

  it('generates distinct block ids', () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => newBlockId()));
    expect(ids.size).toBe(1_000);
  });
});
