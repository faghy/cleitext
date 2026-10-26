/** WordPress shortcodes during an import (`@cleitext/blocks/html`, plugin API 1.36). */
import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/index.js';
import { htmlToCxd, parseShortcodeAttrs, splitShortcodes, wholeShortcode } from '../src/html.js';

const shortcodeOf = (block: CxdBlock) => block.attrs.shortcode as { tag: string };

describe('parsing', () => {
  it('reads attributes as WordPress does: any order, either quotes, or none', () => {
    expect(parseShortcodeAttrs(` id="3" lang='it' url=https://x.test/b`)).toEqual({
      id: '3',
      lang: 'it',
      url: 'https://x.test/b',
    });
    expect(parseShortcodeAttrs(' LANG="en"  id = "0" ')).toEqual({ lang: 'en', id: '0' });
    expect(parseShortcodeAttrs(' first "two words"')).toEqual({ 0: 'first', 1: 'two words' });
    // Entities and curly quotes from a visual editor.
    expect(parseShortcodeAttrs(' id=&quot;7&quot; url=“https://x.test/?a=1&amp;b=2”')).toEqual({
      id: '7',
      url: 'https://x.test/?a=1&b=2',
    });
  });

  it('finds a shortcode alone, enclosing or not', () => {
    expect(wholeShortcode(' [kross-booking id="2"]&nbsp;')).toEqual({
      tag: 'kross-booking',
      attrs: { id: '2' },
      content: null,
      text: '[kross-booking id="2"]',
    });
    expect(wholeShortcode('[box title="A"]Inside[/box]')).toMatchObject({
      tag: 'box',
      content: 'Inside',
    });
    expect(wholeShortcode('[kross-booking/]')).toMatchObject({ tag: 'kross-booking' });
    expect(wholeShortcode('Book: [kross-booking]')).toBeNull();
    expect(wholeShortcode('[[kross-booking]]')).toBeNull();
    expect(wholeShortcode('[Read more]')).toBeNull();
    expect(wholeShortcode('[caption id="1"]<img src="a.jpg"> A[/caption]')).toBeNull();
  });
});

describe('shortcodes in HTML', () => {
  it('splits HTML around the ones standing alone', () => {
    const pieces = splitShortcodes(
      '<p>Book your stay.</p>\n<p>[kross-booking id="0" lang="it"]</p>\n<p>See you!</p>',
    );
    expect(pieces).toEqual([
      { html: '<p>Book your stay.</p>' },
      {
        shortcode: {
          tag: 'kross-booking',
          attrs: { id: '0', lang: 'it' },
          content: null,
          text: '[kross-booking id="0" lang="it"]',
        },
      },
      { html: '<p>See you!</p>' },
    ]);
    expect(splitShortcodes('[kross-booking]')).toEqual([
      { shortcode: { tag: 'kross-booking', attrs: {}, content: null, text: '[kross-booking]' } },
    ]);
    // Wrappers left empty go.
    expect(splitShortcodes('<div>\n[kross-booking url="/book"]\n</div>').map(Object.keys)).toEqual([
      ['shortcode'],
    ]);
  });

  it('leaves shortcodes inside a sentence', () => {
    const html = '<p>Call us or [kross-booking] online.</p>';
    expect(splitShortcodes(html)).toEqual([{ html }]);
  });
});

describe('htmlToCxd during an import', () => {
  it('keeps shortcodes alone in their paragraph as placeholders, with their text', () => {
    const doc = htmlToCxd('Welcome.\n\n[kross-booking id="5" lang="en"]\n\nBye.', {
      keepUnknown: true,
    });
    expect(doc.blocks.map((b) => b.type)).toEqual([
      'core/paragraph',
      'core/imported',
      'core/paragraph',
    ]);
    const placeholder = doc.blocks[1]!;
    expect(placeholder.attrs).toMatchObject({
      name: 'core/shortcode',
      html: '[kross-booking id="5" lang="en"]',
      shortcode: { tag: 'kross-booking', attrs: { id: '5', lang: 'en' }, content: null },
    });
    const fallback = placeholder.attrs.fallback as CxdBlock[];
    expect(fallback.map((b) => b.type)).toEqual(['core/paragraph']);
    expect(fallback[0]!.content).toEqual([{ text: '[kross-booking id="5" lang="en"]' }]);
  });

  it('in block markup: Shortcode blocks and paragraphs holding only shortcodes', () => {
    const doc = htmlToCxd(
      '<!-- wp:shortcode -->\n[kross-booking id="1"]\n<!-- /wp:shortcode -->' +
        '<!-- wp:paragraph --><p>[kross-booking id="2"]<br>[other]</p><!-- /wp:paragraph -->' +
        '<!-- wp:paragraph --><p>Text and [kross-booking]</p><!-- /wp:paragraph -->',
      { keepUnknown: true },
    );
    expect(doc.blocks.map((b) => b.type)).toEqual([
      'core/imported',
      'core/imported',
      'core/imported',
      'core/paragraph',
    ]);
    expect(doc.blocks.slice(0, 3).map((b) => shortcodeOf(b).tag)).toEqual([
      'kross-booking',
      'kross-booking',
      'other',
    ]);
  });

  it('enclosing shortcodes over several lines, with others inside', () => {
    const form =
      '[newsletter_form button_label="Go!"] [newsletter_field name="first_name" label="Your\nname"]\n' +
      '[newsletter_field name="email"\nlabel="Your email"]\n\n[/newsletter_form]';
    const tagsOf = (html: string) =>
      htmlToCxd(html, { keepUnknown: true }).blocks.map((b) =>
        b.type === 'core/imported' ? shortcodeOf(b).tag : b.type,
      );
    // A Shortcode block, a paragraph (lines as <br>) and classic content (a blank line inside).
    expect(tagsOf(`<!-- wp:shortcode -->\n${form}\n<!-- /wp:shortcode -->`)).toEqual([
      'newsletter_form',
    ]);
    expect(
      tagsOf(
        `<!-- wp:paragraph --><p>${form.replaceAll('\n', '<br>')}<br>[mc4wp_form id="3"]</p><!-- /wp:paragraph -->`,
      ),
    ).toEqual(['newsletter_form', 'mc4wp_form']);
    expect(tagsOf(`Sign up:\n\n${form}\n\nThanks.`)).toEqual([
      'core/paragraph',
      'newsletter_form',
      'core/paragraph',
    ]);
    const [block] = htmlToCxd(form, { keepUnknown: true }).blocks;
    const shortcode = block!.attrs.shortcode as { attrs: object; content: string };
    expect(shortcode.attrs).toEqual({ button_label: 'Go!' });
    expect(shortcode.content).toContain('[newsletter_field name="email"\nlabel="Your email"]');
    // Two on one line, text after the last one, an escaped one: not alone.
    expect(tagsOf('<!-- wp:shortcode -->[a] [b]<!-- /wp:shortcode -->')).toEqual([
      'core/paragraph',
    ]);
    expect(tagsOf('<!-- wp:shortcode -->[a]\n[b] and<!-- /wp:shortcode -->')).toEqual([
      'core/paragraph',
    ]);
    expect(tagsOf('<!-- wp:shortcode -->[a]\n[[b]]<!-- /wp:shortcode -->')).toEqual([
      'core/paragraph',
    ]);
    // A caption stays with its image, over several lines too.
    expect(
      tagsOf(
        '<!-- wp:shortcode -->[caption id="1"]\n<img src="a.jpg">\nA[/caption]<!-- /wp:shortcode -->',
      ),
    ).toEqual(['core/paragraph']);
  });

  it('an enclosing shortcode around text keeps its paragraphs', () => {
    const doc = htmlToCxd('[box]First paragraph.\n\nSecond paragraph.[/box]', {
      keepUnknown: true,
    });
    expect(doc.blocks.map((b) => b.type)).toEqual(['core/paragraph', 'core/paragraph']);
  });

  it('[embed] over several lines', () => {
    const types = (html: string) =>
      htmlToCxd(html, { keepUnknown: true }).blocks.map((b) => b.type);
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    expect(
      types(`<!-- wp:shortcode -->\n[embed]\n${url}\n[/embed]\n<!-- /wp:shortcode -->`),
    ).toEqual(['core/embed']);
    expect(
      types(
        `<!-- wp:paragraph --><p>[embed width="640"]<br>${url}<br>[/embed]</p><!-- /wp:paragraph -->`,
      ),
    ).toEqual(['core/embed']);
    expect(types(`Watch:\n\n[embed]\n${url}\n[/embed]`)).toEqual(['core/paragraph', 'core/embed']);
  });

  it('outside an import, shortcodes stay text', () => {
    const warnings: string[] = [];
    const doc = htmlToCxd('<!-- wp:shortcode -->[kross-booking]<!-- /wp:shortcode -->', {
      warn: (m) => warnings.push(m),
    });
    expect(doc.blocks.map((b) => b.type)).toEqual(['core/paragraph']);
    expect(warnings).toEqual(['Shortcode left as text: [kross-booking]']);
    expect(htmlToCxd('[kross-booking]').blocks.map((b) => b.type)).toEqual(['core/paragraph']);
  });

  it('galleries stay galleries', () => {
    const doc = htmlToCxd('[gallery ids="4,5"]', {
      keepUnknown: true,
      mediaRef: (id) => `att:${id}`,
    });
    expect(doc.blocks.map((b) => b.type)).toEqual(['core/gallery']);
  });
});
