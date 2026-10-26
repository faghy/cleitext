/**
 * CXD → real Gutenberg blocks → CXD must be lossless (RNF-18,
 * docs/SPECIFICATIONS.md §9.2).
 */
import {
  createCoreRegistry,
  MARKS,
  normalizeInline,
  type CxdDocument,
  type CxdInline,
} from '@cleitext/blocks';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { fromGutenberg, toGutenberg, UNAVAILABLE_BLOCK } from '../src/convert';
import { buildBlocks, defaultsOf, isRegistered } from '../src/gutenberg-tree';
import { registerCoreBlocks } from '../src/register-blocks';

const registry = createCoreRegistry();

beforeAll(() => {
  registerCoreBlocks();
});

/** CXD → Gutenberg (createBlock) → CXD, the way the adapter does it. */
function roundTrip(doc: CxdDocument): CxdDocument {
  const ids = new Map<string, string>();
  const blocks = buildBlocks(toGutenberg(doc, { registry, isKnown: isRegistered }), ids);
  return fromGutenberg(blocks, { registry, defaultsOf, idOf: (clientId) => ids.get(clientId) });
}

const sample: CxdDocument = {
  schema: 1,
  blocks: [
    { id: 'h1', type: 'core/heading', v: 1, attrs: { level: 3 }, content: [{ text: 'Welcome' }] },
    {
      id: 'p1',
      type: 'core/paragraph',
      v: 1,
      attrs: { align: 'center' },
      content: [
        { text: 'Hello ' },
        { text: 'bold', marks: ['bold'] },
        { text: ' and ' },
        {
          type: 'link',
          href: 'https://example.com',
          target: '_blank',
          children: [{ text: 'a link', marks: ['italic'] }],
        },
        { text: '\nnew line' },
      ],
    },
    {
      id: 'l1',
      type: 'core/list',
      v: 1,
      attrs: { ordered: true },
      children: [
        {
          id: 'li1',
          type: 'core/list-item',
          v: 1,
          attrs: {},
          content: [{ text: 'one' }],
          children: [],
        },
        {
          id: 'li2',
          type: 'core/list-item',
          v: 1,
          attrs: {},
          content: [{ text: 'two', marks: ['code'] }],
          children: [],
        },
      ],
    },
    {
      id: 'q1',
      type: 'core/quote',
      v: 1,
      attrs: { citation: [{ text: 'Someone' }] },
      children: [
        { id: 'qp', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'A quote.' }] },
      ],
    },
    {
      id: 'img',
      type: 'core/image',
      v: 1,
      attrs: {
        id: '0190f2c4-0000-7000-8000-000000000001',
        url: '/media/a.jpg',
        alt: 'A cat',
        caption: [{ text: 'Caption ', marks: ['italic'] }],
      },
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
          attrs: { width: '66.66%' },
          children: [
            { id: 'c1p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Left' }] },
          ],
        },
        {
          id: 'c2',
          type: 'core/column',
          v: 1,
          attrs: {},
          children: [
            {
              id: 'btns',
              type: 'core/buttons',
              v: 1,
              attrs: {},
              children: [
                {
                  id: 'btn',
                  type: 'core/button',
                  v: 1,
                  attrs: { url: '/contact' },
                  content: [{ text: 'Contact us' }],
                },
              ],
            },
          ],
        },
      ],
    },
    { id: 'grp', type: 'core/group', v: 1, attrs: { tagName: 'section' }, children: [] },
    { id: 'sep', type: 'core/separator', v: 1, attrs: {} },
    { id: 'spc', type: 'core/spacer', v: 1, attrs: { height: '40px' } },
    { id: 'code', type: 'core/code', v: 1, attrs: {}, content: [{ text: 'const x = 1 < 2;' }] },
    {
      id: 'emb',
      type: 'core/embed',
      v: 1,
      attrs: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        providerNameSlug: 'youtube',
        type: 'video',
        responsive: true,
        caption: [{ text: 'A video' }],
      },
    },
    {
      id: 'html',
      type: 'core/html',
      v: 1,
      attrs: { content: '<div class="note">Raw <b>HTML</b> &amp; <!-- comment --></div>' },
    },
    {
      id: 'pat',
      type: 'cleitext/pattern',
      v: 1,
      attrs: { ref: '0190f2c4-0000-7000-8000-000000000009' },
    },
    { id: 'ext', type: 'acme/map', v: 2, attrs: { lat: 45.4, lng: 9.2 }, children: [] },
  ],
};

describe('Gutenberg round trip', () => {
  it('preserves a document using every core block', () => {
    expect(roundTrip(sample)).toEqual(sample);
  });

  it('keeps unknown blocks intact behind a placeholder', () => {
    const seeds = toGutenberg(sample, { registry, isKnown: isRegistered });
    expect(seeds.at(-1)?.name).toBe(UNAVAILABLE_BLOCK);
    expect(roundTrip(sample).blocks.at(-1)).toEqual(sample.blocks.at(-1));
  });

  it('strips Gutenberg default attributes', () => {
    const doc: CxdDocument = {
      schema: 1,
      blocks: [{ id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [] }],
    };
    expect(roundTrip(doc).blocks[0]?.attrs).toEqual({});
  });

  it('is lossless for arbitrary rich text (property)', () => {
    const run = fc
      .record({
        text: fc.string({ minLength: 1, maxLength: 12 }).filter((t) => t.trim().length > 0),
        marks: fc.subarray([...MARKS], { maxLength: 3 }),
      })
      .map(({ text, marks }) => (marks.length ? { text, marks } : { text }));
    const link = fc
      .record({ href: fc.webUrl(), children: fc.array(run, { minLength: 1, maxLength: 2 }) })
      .map((l) => ({ type: 'link' as const, ...l }));

    fc.assert(
      fc.property(fc.array(fc.oneof(run, link), { minLength: 1, maxLength: 6 }), (nodes) => {
        const content = normalizeInline(nodes as CxdInline[]);
        const doc: CxdDocument = {
          schema: 1,
          blocks: [{ id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content }],
        };
        expect(roundTrip(doc)).toEqual(doc);
      }),
      { numRuns: 300 },
    );
  });
});

describe('tables and galleries', () => {
  it('keep cells with formatted text, headers, spans and the caption', () => {
    const doc: CxdDocument = {
      schema: 1,
      blocks: [
        {
          id: 't',
          type: 'core/table',
          v: 1,
          attrs: {
            head: [
              {
                cells: [
                  { content: [{ text: 'Day' }], tag: 'th' },
                  { content: [{ text: 'Hours' }], tag: 'th' },
                ],
              },
            ],
            body: [
              {
                cells: [
                  { content: [{ text: 'Mon', marks: ['bold'] }], tag: 'td' },
                  {
                    content: [{ type: 'link', href: '/hours', children: [{ text: '9–18' }] }],
                    tag: 'td',
                    align: 'right',
                  },
                ],
              },
              { cells: [{ content: [{ text: 'Sundays closed' }], tag: 'td', colspan: 2 }] },
            ],
            hasFixedLayout: false,
            caption: [{ text: 'Opening hours' }],
          },
        },
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('keep a gallery as images inside it', () => {
    const image = (id: string) => ({
      id,
      type: 'core/image',
      v: 1,
      attrs: { id: `m-${id}`, url: `/media/${id}.jpg`, alt: id },
    });
    const doc: CxdDocument = {
      schema: 1,
      blocks: [
        {
          id: 'g',
          type: 'core/gallery',
          v: 1,
          attrs: { columns: 2 },
          children: [image('a'), image('b')],
        },
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('keep a Media & Text with its layout, media and text', () => {
    const doc: CxdDocument = {
      schema: 1,
      blocks: [
        {
          id: 'mt',
          type: 'core/media-text',
          v: 1,
          attrs: {
            mediaId: 'm-1',
            mediaUrl: '/media/1.jpg',
            mediaAlt: 'Teacher',
            mediaType: 'image',
            mediaPosition: 'right',
            mediaWidth: 32,
            verticalAlignment: 'center',
            isStackedOnMobile: false,
            imageFill: true,
            focalPoint: { x: 0.4, y: 0.2 },
            mediaLink: 'https://old.test/?attachment_id=1',
            linkDestination: 'custom',
            href: 'https://example.com/',
            align: 'wide',
            className: 'own',
          },
          children: [
            {
              id: 'mtp',
              type: 'core/paragraph',
              v: 1,
              attrs: {},
              content: [{ text: 'Text' }],
            },
          ],
        },
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });
});

describe('block bindings (plugin API 1.48)', () => {
  it('keep the bindings of core blocks and the Field and Field rows blocks', () => {
    const binding = (key: string) => ({ source: 'cleitext/field', args: { key } });
    const doc: CxdDocument = {
      schema: 1,
      blocks: [
        {
          id: 'p',
          type: 'core/paragraph',
          v: 1,
          attrs: { metadata: { bindings: { content: binding('entry.field:subtitle') } } },
          content: [{ text: 'Fallback' }],
        },
        {
          id: 'rows',
          type: 'cleitext/field-rows',
          v: 1,
          attrs: { source: 'entry.field:team', limit: 4 },
          children: [
            {
              id: 'f',
              type: 'cleitext/field',
              v: 1,
              attrs: { source: 'row.field:name', label: 'Name:', tagName: 'h3' },
            },
            {
              id: 'i',
              type: 'core/image',
              v: 1,
              attrs: {
                url: '/x.png',
                metadata: {
                  bindings: { id: binding('row.field:photo'), url: binding('row.field:photo') },
                },
              },
            },
          ],
        },
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });
});
