/** Inline styles of classic HTML (text widgets, the classic editor) that blocks keep. */
import { describe, expect, it } from 'vitest';
import { htmlToCxd } from '../src/html.js';
import { htmlToInline } from '../src/inline.js';

describe('classic HTML with inline styles', () => {
  it('a plain HTML widget written in one size keeps it on the paragraph', () => {
    const html =
      '<div class="ast-builder-html-element"><p><a href="https://example.com/cookie-policy/">' +
      '<span style="font-size: 10pt">Cookie Policy</span></a><span style="font-size: 10pt"> - ' +
      '<a href="https://example.com/privacy-policy/">Privacy Policy</a></span></p>\n</div>';
    const [p] = htmlToCxd(html).blocks;
    expect(p).toMatchObject({
      type: 'core/paragraph',
      attrs: { style: { typography: { fontSize: '13.33px' } } },
    });
    expect(p!.content).toEqual([
      {
        type: 'link',
        href: 'https://example.com/cookie-policy/',
        children: [{ text: 'Cookie Policy' }],
      },
      { text: ' - ' },
      {
        type: 'link',
        href: 'https://example.com/privacy-policy/',
        children: [{ text: 'Privacy Policy' }],
      },
    ]);
  });

  it('the size of the paragraph itself, and none when sizes are mixed', () => {
    const [own] = htmlToCxd('<p style="font-size:18px">Big</p>').blocks;
    expect(own!.attrs).toEqual({ style: { typography: { fontSize: '18px' } } });
    const [mixed] = htmlToCxd('<p>A <span style="font-size:10pt">b</span></p>').blocks;
    expect(mixed!.attrs).toEqual({});
  });

  it('bold, italic, underline and strike written as styles are marks', () => {
    expect(
      htmlToInline(
        '<span style="font-weight: 700">a</span><span style="font-style:italic;text-decoration: underline">b</span>' +
          '<span style="text-decoration:line-through">c</span><span style="font-weight:normal">d</span>',
      ),
    ).toEqual([
      { text: 'a', marks: ['bold'] },
      { text: 'b', marks: ['italic', 'underline'] },
      { text: 'c', marks: ['strike'] },
      { text: 'd' },
    ]);
  });
});
