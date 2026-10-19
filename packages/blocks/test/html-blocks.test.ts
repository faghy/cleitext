import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/cxd.js';
import { cxdDocumentSchema } from '../src/cxd.js';
import { htmlToBlocks } from '../src/html-blocks.js';

let n = 0;
const newId = () => `b${++n}`;

/** Blocks without their ids, to compare shapes. */
const shape = (blocks: CxdBlock[]): unknown[] =>
  blocks.map(({ id: _id, children, ...rest }) => ({
    ...rest,
    ...(children ? { children: shape(children) } : {}),
  }));

describe('htmlToBlocks', () => {
  it('turns paragraphs and headings into blocks, with their formatting', () => {
    const blocks = htmlToBlocks('<h2>Title</h2>\n<p>Hello <strong>world</strong></p>', { newId });
    expect(shape(blocks)).toEqual([
      { type: 'core/heading', v: 1, attrs: { level: 2 }, content: [{ text: 'Title' }] },
      {
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: 'Hello ' }, { text: 'world', marks: ['bold'] }],
      },
    ]);
  });

  it('collapses white space and keeps line breaks', () => {
    const [p] = htmlToBlocks('<p>\n  One\n  line<br>two  </p>', { newId });
    expect(p!.content).toEqual([{ text: 'One line\ntwo' }]);
  });

  it('splits loose text on blank lines, as WordPress does', () => {
    const blocks = htmlToBlocks('First <em>part</em>\n\nSecond', { newId });
    expect(blocks.map((b) => b.type)).toEqual(['core/paragraph', 'core/paragraph']);
    expect(blocks[0]!.content).toEqual([{ text: 'First ' }, { text: 'part', marks: ['italic'] }]);
  });

  it('keeps nested lists', () => {
    const [list] = htmlToBlocks('<ol><li>One<ul><li>Inner</li></ul></li><li>Two</li></ol>', {
      newId,
    });
    expect(shape([list!])).toEqual([
      {
        type: 'core/list',
        v: 1,
        attrs: { ordered: true },
        children: [
          {
            type: 'core/list-item',
            v: 1,
            attrs: {},
            content: [{ text: 'One' }],
            children: [
              {
                type: 'core/list',
                v: 1,
                attrs: {},
                children: [
                  { type: 'core/list-item', v: 1, attrs: {}, content: [{ text: 'Inner' }] },
                ],
              },
            ],
          },
          { type: 'core/list-item', v: 1, attrs: {}, content: [{ text: 'Two' }] },
        ],
      },
    ]);
  });

  it('opens boxes and converts quotes, code, images and separators', () => {
    const blocks = htmlToBlocks(
      '<div class="x"><blockquote><p>Said</p></blockquote><pre><code>a &lt; b</code></pre></div>' +
        '<hr><figure><img src="/a.jpg" alt="A"><figcaption>Cap</figcaption></figure>' +
        '<p><img src="https://x.test/b.png"></p>',
      { newId },
    );
    expect(blocks.map((b) => b.type)).toEqual([
      'core/quote',
      'core/code',
      'core/separator',
      'core/image',
      'core/image',
    ]);
    expect(blocks[0]!.children!.map((b) => b.type)).toEqual(['core/paragraph']);
    expect(blocks[1]!.content).toEqual([{ text: 'a < b' }]);
    expect(blocks[3]!.attrs).toEqual({ url: '/a.jpg', alt: 'A', caption: [{ text: 'Cap' }] });
    expect(blocks[4]!.attrs).toEqual({ url: 'https://x.test/b.png', alt: '' });
  });

  it('keeps what has no block as Custom HTML, and drops scripts', () => {
    const table = '<table><tr><td>1</td></tr></table>';
    const blocks = htmlToBlocks(`${table}<script>alert(1)</script><!-- note -->`, { newId });
    expect(shape(blocks)).toEqual([{ type: 'core/html', v: 1, attrs: { content: table } }]);
  });

  it('ignores images with unsafe addresses and empty paragraphs', () => {
    expect(htmlToBlocks('<img src="javascript:x"><p> </p><p><br></p>', { newId })).toEqual([]);
  });

  it('copes with unclosed and stray tags', () => {
    const blocks = htmlToBlocks('</div><p>Open', { newId });
    expect(shape(blocks)).toEqual([
      { type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Open' }] },
    ]);
  });

  it('makes valid documents with ids of its own by default', () => {
    const blocks = htmlToBlocks('<p>a</p><ul><li>b</li></ul>');
    expect(new Set(blocks.map((b) => b.id)).size).toBe(2);
    expect(cxdDocumentSchema.safeParse({ schema: 1, blocks }).success).toBe(true);
  });
});
