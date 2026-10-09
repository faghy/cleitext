import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MARKS, cxdInlineSchema, type CxdInline } from '../src/cxd.js';
import { htmlToInline, inlineToHtml, normalizeInline } from '../src/inline.js';

describe('htmlToInline', () => {
  it('parses marks, nesting and line breaks', () => {
    expect(htmlToInline('Hello <strong>bold <em>both</em></strong><br>next')).toEqual([
      { text: 'Hello ' },
      { text: 'bold ', marks: ['bold'] },
      { text: 'both', marks: ['bold', 'italic'] },
      { text: '\nnext' },
    ]);
  });

  it('maps equivalent tags to the same mark', () => {
    expect(htmlToInline('<b>a</b><strong>b</strong><i>c</i><del>d</del>')).toEqual([
      { text: 'ab', marks: ['bold'] },
      { text: 'c', marks: ['italic'] },
      { text: 'd', marks: ['strike'] },
    ]);
  });

  it('parses links with safe attributes only', () => {
    expect(
      htmlToInline(
        '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener" onclick="x()">go <em>now</em></a>',
      ),
    ).toEqual([
      {
        type: 'link',
        href: 'https://example.com/?a=1&b=2',
        target: '_blank',
        rel: 'noopener',
        children: [{ text: 'go ' }, { text: 'now', marks: ['italic'] }],
      },
    ]);
  });

  it('drops dangerous links but keeps their text', () => {
    expect(htmlToInline('<a href="javascript:alert(1)">click</a>')).toEqual([{ text: 'click' }]);
    expect(htmlToInline('<a href=" JaVaScRiPt:x">x</a>')).toEqual([{ text: 'x' }]);
  });

  it('drops scripts, styles and comments with their content', () => {
    expect(htmlToInline('a<script>alert(1)</script>b<style>p{}</style>c<!-- note -->d')).toEqual([
      { text: 'abcd' },
    ]);
  });

  it('keeps the text of unknown tags and decodes entities', () => {
    expect(
      htmlToInline('<span class="x" style="color:red">1 &lt; 2 &amp;&nbsp;&#x1F600;</span>'),
    ).toEqual([{ text: '1 < 2 & 😀' }]);
  });

  it('survives malformed input', () => {
    expect(htmlToInline('<strong>open <em>never closed')).toEqual([
      { text: 'open ', marks: ['bold'] },
      { text: 'never closed', marks: ['bold', 'italic'] },
    ]);
    expect(htmlToInline('a < b > c')).toEqual([{ text: 'a < b > c' }]);
    expect(htmlToInline('</em>stray')).toEqual([{ text: 'stray' }]);
  });
});

describe('inlineToHtml', () => {
  it('escapes text and attributes', () => {
    expect(
      inlineToHtml([
        { text: '<script>"&"', marks: ['bold'] },
        { type: 'link', href: 'https://x.test/?q="1"', children: [{ text: 'l' }] },
      ]),
    ).toBe(
      '<strong>&lt;script&gt;&quot;&amp;&quot;</strong><a href="https://x.test/?q=&quot;1&quot;">l</a>',
    );
  });
});

// ---- Property-based round trip --------------------------------------------

const textArb = fc.string({ unit: 'binary', minLength: 1, maxLength: 20 });
const marksArb = fc.subarray([...MARKS], { maxLength: 3 });
const runArb = fc
  .record({ text: textArb, marks: marksArb })
  .map(({ text, marks }) => (marks.length ? { text, marks } : { text }));
const hrefArb = fc.oneof(
  fc.webUrl(),
  fc.constantFrom('/about', '#top', 'mailto:a@example.com', '?page=2'),
);
const linkArb = fc
  .record({
    href: hrefArb,
    target: fc.option(fc.constant('_blank' as const), { nil: undefined }),
    rel: fc.option(fc.constantFrom('noopener', 'nofollow ugc'), { nil: undefined }),
    children: fc.array(runArb, { minLength: 1, maxLength: 3 }),
  })
  .map(({ target, rel, ...link }) => ({
    type: 'link' as const,
    ...link,
    ...(target ? { target } : {}),
    ...(rel ? { rel } : {}),
  }));
const inlineArb = fc.array(fc.oneof(runArb, linkArb), { maxLength: 8 });

describe('round trip (property)', () => {
  it('htmlToInline(inlineToHtml(x)) equals the normalized x', () => {
    fc.assert(
      fc.property(inlineArb, (nodes) => {
        const normalized = normalizeInline(nodes as CxdInline[]);
        expect(htmlToInline(inlineToHtml(normalized))).toEqual(normalized);
      }),
      { numRuns: 2_000 },
    );
  });

  it('always produces schema-valid nodes, whatever the HTML', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (html) => {
        for (const node of htmlToInline(html)) {
          expect(cxdInlineSchema.safeParse(node).success).toBe(true);
        }
      }),
      { numRuns: 2_000 },
    );
  });
});
