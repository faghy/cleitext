import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import {
  countWords,
  cxdToHtml,
  decodeBlock,
  encodeBlock,
  fromBlocks,
  htmlToCxd,
  MORE_TAG,
  toBlocks,
} from '../src/convert.js';

const doc = (blocks: CxdBlock[]): CxdDocument => ({
  schema: 1,
  blocks,
  editor: { id: 'classic' },
});

const p = (id: string, text: string, attrs: Record<string, unknown> = {}): CxdBlock => ({
  id,
  type: 'core/paragraph',
  v: 1,
  attrs,
  content: [{ text }],
});

/** Both tabs give back the same document. */
function expectRoundTrip(document: CxdDocument) {
  const visual = htmlToCxd(cxdToHtml(document), document);
  expect(visual).toEqual(document);
  const text = htmlToCxd(cxdToHtml(document, { text: true }), document, { text: true });
  expect(text).toEqual(document);
}

/** Blocks without ids, to compare conversions of fresh HTML. */
function shape(blocks: CxdBlock[]): unknown[] {
  return blocks.map(({ id: _id, children, ...rest }) => ({
    ...rest,
    ...(children ? { children: shape(children) } : {}),
  }));
}

describe('paragraphs and inline marks', () => {
  const document = doc([
    {
      id: 'p1',
      type: 'core/paragraph',
      v: 1,
      attrs: {},
      content: [
        { text: 'Plain, ' },
        { text: 'bold', marks: ['bold'] },
        { text: ' and ' },
        { text: 'both', marks: ['bold', 'italic'] },
        { text: ' ' },
        { text: 'struck', marks: ['strike'] },
        { text: ' ' },
        { text: 'red', color: '#ff0000' },
        { text: ' ' },
        { type: 'link', href: 'https://example.com/?a=1&b=2', children: [{ text: 'a link' }] },
        { text: ' ' },
        {
          type: 'link',
          href: '/page',
          target: '_blank',
          rel: 'noopener',
          children: [{ text: 'new tab', marks: ['code'] }],
        },
        { text: '\nsecond line & <tags>' },
      ],
    },
    p('p2', 'Centered', { align: 'center' }),
    p('p3', 'With anchor', { anchor: 'intro', className: 'lead' }),
  ]);

  it('round trips', () => expectRoundTrip(document));

  it('writes classic HTML', () => {
    const html = cxdToHtml(document);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<p style="text-align: center;">Centered</p>');
    expect(html).toContain('<p id="intro" class="lead">With anchor</p>');
    expect(html).toContain('<br>second line &amp; &lt;tags&gt;');
  });

  it('writes plain paragraphs without <p> in the Text tab', () => {
    const text = cxdToHtml(
      doc([p('a', 'One'), p('b', 'Two'), p('c', 'Three', { align: 'right' })]),
      {
        text: true,
      },
    );
    expect(text).toBe('One\n\nTwo\n\n<p style="text-align: right;">Three</p>');
  });

  it('keeps ids of edited paragraphs and the attributes HTML does not show', () => {
    const previous = doc([
      p('a', 'Hello', { dropCap: true, style: { color: { text: '#123456' } } }),
      p('b', 'World'),
    ]);
    const next = htmlToCxd('<p>Hello there</p><p>World</p><p>New</p>', previous);
    expect(next.blocks.map((b) => b.id).slice(0, 2)).toEqual(['a', 'b']);
    expect(next.blocks[0]!.attrs).toEqual({
      dropCap: true,
      style: { color: { text: '#123456' } },
    });
    expect(next.blocks[2]!.id).toMatch(/^b_/);
  });

  it('keeps the id of a moved paragraph', () => {
    const previous = doc([p('a', 'First'), p('b', 'Second')]);
    const next = htmlToCxd('<p>Second</p><p>First</p>', previous);
    expect(next.blocks.map((b) => b.id)).toEqual(['b', 'a']);
  });

  it('reads the visual editor’s colors and line breaks', () => {
    const next = htmlToCxd('<p><span style="color: #e03e2d;">red</span> text<br>next</p>');
    expect(next.blocks[0]!.content).toEqual([
      { text: 'red', color: '#e03e2d' },
      { text: ' text\nnext' },
    ]);
  });
});

describe('Text tab (wpautop)', () => {
  it('splits paragraphs on blank lines and keeps single new lines as breaks', () => {
    const next = htmlToCxd('First line\nsame paragraph\n\nSecond <b>bold</b>\n\n\n\nThird', null, {
      text: true,
    });
    expect(shape(next.blocks)).toEqual([
      {
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: 'First line\nsame paragraph' }],
      },
      {
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: 'Second ' }, { text: 'bold', marks: ['bold'] }],
      },
      { type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Third' }] },
    ]);
    expect(next.editor).toEqual({ id: 'classic' });
  });

  it('mixes loose text and block elements', () => {
    const next = htmlToCxd('Intro\n<h2>Title</h2>\nAfter\n\n<ul>\n<li>one</li>\n</ul>', null, {
      text: true,
    });
    expect(next.blocks.map((b) => b.type)).toEqual([
      'core/paragraph',
      'core/heading',
      'core/paragraph',
      'core/list',
    ]);
  });

  it('collapses new lines in the Visual tab', () => {
    const next = htmlToCxd('<p>a\n  b</p>');
    expect(next.blocks[0]!.content).toEqual([{ text: 'a b' }]);
  });

  it('keeps several line breaks in a row', () => {
    const document = doc([p('a', 'one\n\ntwo')]);
    expect(cxdToHtml(document, { text: true })).toBe('one<br>\ntwo');
    expectRoundTrip(document);
  });

  it('drops empty paragraphs', () => {
    expect(htmlToCxd('<p>&nbsp;</p><p> </p><p>x</p>').blocks).toHaveLength(1);
  });
});

describe('headings, lists, quotes and code', () => {
  const document = doc([
    {
      id: 'h1',
      type: 'core/heading',
      v: 1,
      attrs: { level: 1 },
      content: [{ text: 'Main title' }],
    },
    {
      id: 'h3',
      type: 'core/heading',
      v: 1,
      attrs: { level: 3, textAlign: 'right', anchor: 'details' },
      content: [{ text: 'Details', marks: ['italic'] }],
    },
    {
      id: 'l',
      type: 'core/list',
      v: 1,
      attrs: {},
      children: [
        { id: 'li1', type: 'core/list-item', v: 1, attrs: {}, content: [{ text: 'One' }] },
        {
          id: 'li2',
          type: 'core/list-item',
          v: 1,
          attrs: {},
          content: [{ text: 'Two' }],
          children: [
            {
              id: 'l2',
              type: 'core/list',
              v: 1,
              attrs: { ordered: true, start: 3 },
              children: [
                {
                  id: 'li3',
                  type: 'core/list-item',
                  v: 1,
                  attrs: {},
                  content: [{ text: 'Two.three', marks: ['bold'] }],
                  children: [
                    {
                      id: 'l3',
                      type: 'core/list',
                      v: 1,
                      attrs: {},
                      children: [
                        {
                          id: 'li4',
                          type: 'core/list-item',
                          v: 1,
                          attrs: {},
                          content: [{ text: 'Deep' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'q',
      type: 'core/quote',
      v: 1,
      attrs: { citation: [{ text: 'Someone', marks: ['italic'] }] },
      children: [p('qp1', 'To be'), p('qp2', 'or not to be')],
    },
    {
      id: 'q2',
      type: 'core/quote',
      v: 1,
      attrs: {},
      children: [p('qp3', 'No citation')],
    },
    {
      id: 'c',
      type: 'core/code',
      v: 1,
      attrs: {},
      content: [{ text: '\nconst a = 1 < 2;\n  return "<div>";\n' }],
    },
    { id: 'hr', type: 'core/separator', v: 1, attrs: {} },
  ]);

  it('round trips', () => expectRoundTrip(document));

  it('writes nested lists and quotes', () => {
    const html = cxdToHtml(document);
    expect(html).toContain(
      '<ul><li>One</li><li>Two<ol start="3"><li><strong>Two.three</strong><ul><li>Deep</li></ul></li></ol></li></ul>',
    );
    expect(html).toContain(
      '<blockquote><p>To be</p>\n<p>or not to be</p><cite><em>Someone</em></cite></blockquote>',
    );
    expect(html).toContain('<h3 id="details" style="text-align: right;"><em>Details</em></h3>');
    expect(html).toContain('<pre>\n\nconst a = 1 &lt; 2;');
  });

  it('reads code with <br> line breaks', () => {
    const next = htmlToCxd('<pre>line 1<br>line &amp; 2</pre>');
    expect(next.blocks[0]!.content).toEqual([{ text: 'line 1\nline & 2' }]);
  });

  it('reads a list nested right inside a list', () => {
    const next = htmlToCxd('<ul><li>a</li><ul><li>b</li></ul></ul>');
    const items = next.blocks[0]!.children!;
    expect(items).toHaveLength(1);
    expect(items[0]!.children![0]!.type).toBe('core/list');
  });
});

describe('images', () => {
  const document = doc([
    {
      id: 'i1',
      type: 'core/image',
      v: 1,
      attrs: { id: 'm1', url: '/media/a.jpg', alt: 'A "cat"', align: 'left', sizeSlug: 'large' },
    },
    {
      id: 'i2',
      type: 'core/image',
      v: 1,
      attrs: {
        id: 42,
        url: '/media/b.jpg',
        alt: '',
        align: 'center',
        width: 300,
        height: 200,
        href: 'https://example.com',
        linkTarget: '_blank',
        caption: [{ text: 'A ' }, { text: 'caption', marks: ['bold'] }],
      },
    },
    {
      id: 'i3',
      type: 'core/image',
      v: 1,
      attrs: {
        id: 'm3',
        url: '/media/c.jpg',
        alt: 'C',
        width: '50%',
        style: { border: { radius: '8px' } },
        className: 'is-style-rounded',
      },
    },
  ]);

  it('round trips', () => expectRoundTrip(document));

  it('writes alignment classes, the media id and captions', () => {
    const html = cxdToHtml(document);
    expect(html).toContain(
      '<p><img src="/media/a.jpg" alt="A &quot;cat&quot;" class="alignleft size-large" data-id="m1"></p>',
    );
    expect(html).toContain(
      '<figure class="ce-image aligncenter"><a href="https://example.com" target="_blank"><img src="/media/b.jpg" alt="" width="300" height="200" data-id="42"></a><figcaption>A <strong>caption</strong></figcaption></figure>',
    );
    expect(cxdToHtml(document, { text: true })).toContain(
      '<img src="/media/a.jpg" alt="A &quot;cat&quot;" class="alignleft size-large" data-id="m1">\n\n',
    );
  });

  it('reads an image among text as its own block', () => {
    const next = htmlToCxd('<p>Before <img src="/x.png" alt="x" class="alignright"> after</p>');
    expect(shape(next.blocks)).toEqual([
      { type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Before' }] },
      { type: 'core/image', v: 1, attrs: { url: '/x.png', alt: 'x', align: 'right' } },
      { type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'after' }] },
    ]);
  });
});

describe('tables', () => {
  const document = doc([
    {
      id: 't',
      type: 'core/table',
      v: 1,
      attrs: {
        head: [
          {
            cells: [
              { content: [{ text: 'Name' }], tag: 'th', scope: 'col' },
              { content: [{ text: 'Price' }], tag: 'th', align: 'right' },
            ],
          },
        ],
        body: [
          {
            cells: [
              { content: [{ text: 'Tea', marks: ['bold'] }], tag: 'td' },
              { content: [{ text: '3 €' }], tag: 'td', align: 'right' },
            ],
          },
          { cells: [{ content: [{ text: 'Merged' }], tag: 'td', colspan: 2 }] },
        ],
        foot: [
          {
            cells: [
              { content: [], tag: 'td' },
              { content: [{ text: '3' }], tag: 'td' },
            ],
          },
        ],
        hasFixedLayout: true,
        caption: [{ text: 'Prices' }],
      },
    },
  ]);

  it('round trips', () => expectRoundTrip(document));

  it('writes a table with sections and a caption', () => {
    const html = cxdToHtml(document);
    expect(html).toContain('<table class="has-fixed-layout">\n<caption>Prices</caption>');
    expect(html).toContain('<td colspan="2">Merged</td>');
    expect(html).toContain('<th style="text-align: right;">Price</th>');
  });
});

describe('embeds, custom HTML and placeholders', () => {
  const gallery: CxdBlock = {
    id: 'g',
    type: 'core/gallery',
    v: 1,
    attrs: { columns: 3, caption: [{ text: 'Città & mare ☀' }] },
    children: [
      { id: 'gi1', type: 'core/image', v: 1, attrs: { id: 'm1', url: '/a.jpg', alt: '' } },
    ],
  };
  const columns: CxdBlock = {
    id: 'cols',
    type: 'core/columns',
    v: 1,
    attrs: {},
    children: [{ id: 'c1', type: 'core/column', v: 1, attrs: {}, children: [p('cp', 'Inside')] }],
  };
  const plugin: CxdBlock = {
    id: 'pl',
    type: 'click-to-chat/button',
    v: 2,
    attrs: { text: 'Chat "now"', nested: { a: [1, 2, { b: null }] } },
  };
  const document = doc([
    {
      id: 'e',
      type: 'core/embed',
      v: 1,
      attrs: {
        url: 'https://www.youtube.com/watch?v=abc123',
        type: 'video',
        providerNameSlug: 'youtube',
        responsive: true,
        caption: [{ text: 'A video' }],
      },
    },
    {
      id: 'h',
      type: 'core/html',
      v: 1,
      attrs: { content: '<div class="box">\n<b>Hi</b>\n</div>' },
    },
    { id: 'm', type: 'core/html', v: 1, attrs: { content: MORE_TAG } },
    {
      id: 's',
      type: 'core/html',
      v: 1,
      attrs: { content: '<script>alert(1)</script><p>two parts</p>' },
    },
    gallery,
    columns,
    plugin,
    {
      id: 'pat',
      type: 'cleitext/pattern',
      v: 1,
      attrs: { ref: '0b0f8f5e-3c3e-4c38-9d9f-111111111111' },
    },
  ]);

  it('round trips', () => expectRoundTrip(document));

  it('writes an embed as its address alone on a line', () => {
    expect(cxdToHtml(document)).toContain('<p>https://www.youtube.com/watch?v=abc123</p>');
    expect(cxdToHtml(document, { text: true })).toMatch(
      /^https:\/\/www\.youtube\.com\/watch\?v=abc123\n\n/,
    );
  });

  it('turns an address of a known provider alone on a line into an embed', () => {
    const next = htmlToCxd('<p>https://vimeo.com/12345</p><p>https://example.com/page</p>');
    expect(shape(next.blocks)).toEqual([
      {
        type: 'core/embed',
        v: 1,
        attrs: {
          url: 'https://vimeo.com/12345',
          type: 'video',
          providerNameSlug: 'vimeo',
          responsive: true,
        },
      },
      { type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'https://example.com/page' }] },
    ]);
  });

  it('writes the More tag', () => {
    expect(cxdToHtml(document)).toContain('class="ce-more mceNonEditable"');
    expect(cxdToHtml(document, { text: true })).toContain('\n\n<!--more-->\n\n');
  });

  it('keeps placeholders byte-identical', () => {
    const html = cxdToHtml(document, { placeholderLabel: (title) => `Blocco: ${title}` });
    expect(html).toContain('>Blocco: Gallery</div>');
    expect(html).toContain('>Blocco: Columns</div>');
    expect(html).toContain('>Blocco: Button</div>');
    expect(html).toContain('>Blocco: Custom HTML</div>');
    const next = htmlToCxd(`<p>Added</p>${html}`, document);
    for (const block of [gallery, columns, plugin]) {
      const found = next.blocks.find((b) => b.id === block.id);
      expect(JSON.stringify(found)).toBe(JSON.stringify(block));
    }
  });

  it('gives a pasted copy of a placeholder new ids', () => {
    const html = cxdToHtml(doc([columns]));
    const next = htmlToCxd(html + html, doc([columns]));
    expect(next.blocks[0]!.id).toBe('cols');
    expect(next.blocks[1]!.id).not.toBe('cols');
    expect(next.blocks[1]!.children![0]!.id).not.toBe('c1');
  });

  it('encodes blocks as base64 UTF-8 JSON', () => {
    expect(decodeBlock(encodeBlock(gallery))).toEqual(gallery);
    expect(decodeBlock('not base64!')).toBeNull();
  });

  it('keeps unknown elements as custom HTML', () => {
    const next = htmlToCxd(
      '<section class="x"><p>a</p></section><iframe src="https://x.test"></iframe>',
    );
    expect(next.blocks.map((b) => [b.type, b.attrs.content])).toEqual([
      ['core/html', '<section class="x"><p>a</p></section>'],
      ['core/html', '<iframe src="https://x.test"></iframe>'],
    ]);
  });
});

describe('switching editors', () => {
  const blocks = [p('a', 'x')];

  it('adds and removes the editor id', () => {
    const classic = fromBlocks({ schema: 1, blocks });
    expect(classic).toEqual({ schema: 1, blocks, editor: { id: 'classic' } });
    expect(toBlocks(classic)).toEqual({ schema: 1, blocks });
  });

  it('keeps the editor data of the previous document', () => {
    const previous: CxdDocument = { schema: 1, blocks, editor: { id: 'classic', data: { a: 1 } } };
    expect(htmlToCxd('<p>x</p>', previous).editor).toEqual({ id: 'classic', data: { a: 1 } });
  });
});

describe('word count', () => {
  it('counts words of HTML', () => {
    expect(countWords('<p>Hello, <b>world</b>!</p>\n\nNumber 3 — ok')).toBe(5);
  });
});
