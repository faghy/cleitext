import { MARKS, type CxdDocument, type CxdInline } from '@cleitext/blocks';
import fc from 'fast-check';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Blocks,
  collectMediaIds,
  collectPatternIds,
  documentExcerpt,
  firstImage,
  Inline,
  renderHtmlDocument,
  safeUrl,
  withCoreBlockCss,
  type RenderMedia,
} from '../src/index.js';

const html = (doc: CxdDocument, media: RenderMedia[] = []) =>
  renderToStaticMarkup(
    <Blocks
      document={doc}
      context={{ media: new Map(media.map((m) => [m.id, m])), locale: 'en' }}
    />,
  );

const doc = (...blocks: CxdDocument['blocks']): CxdDocument => ({ schema: 1, blocks });

describe('core blocks', () => {
  it('render Gutenberg-compatible markup', () => {
    const out = html(
      doc(
        {
          id: 'h',
          type: 'core/heading',
          v: 1,
          attrs: { level: 3, anchor: 'intro', textAlign: 'center' },
          content: [{ text: 'Title' }],
        },
        {
          id: 'p',
          type: 'core/paragraph',
          v: 1,
          attrs: { dropCap: true },
          content: [
            { text: 'Hello ' },
            { text: 'world', marks: ['bold', 'italic'] },
            { text: '\nnext' },
          ],
        },
        {
          id: 'l',
          type: 'core/list',
          v: 1,
          attrs: { ordered: true, start: 3 },
          children: [
            {
              id: 'li',
              type: 'core/list-item',
              v: 1,
              attrs: {},
              content: [{ text: 'one' }],
              children: [],
            },
          ],
        },
        {
          id: 'q',
          type: 'core/quote',
          v: 1,
          attrs: { citation: [{ text: 'Someone' }] },
          children: [
            { id: 'qp', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Quote' }] },
          ],
        },
        {
          id: 'c',
          type: 'core/columns',
          v: 1,
          attrs: {},
          children: [
            { id: 'c1', type: 'core/column', v: 1, attrs: { width: '66.66%' }, children: [] },
          ],
        },
        {
          id: 'b',
          type: 'core/buttons',
          v: 1,
          attrs: {},
          children: [
            {
              id: 'b1',
              type: 'core/button',
              v: 1,
              attrs: { url: '/contact', linkTarget: '_blank' },
              content: [{ text: 'Contact' }],
            },
          ],
        },
        { id: 'g', type: 'core/group', v: 1, attrs: { tagName: 'section' }, children: [] },
        { id: 's', type: 'core/separator', v: 1, attrs: {} },
        { id: 'sp', type: 'core/spacer', v: 1, attrs: { height: 40 } },
        { id: 'code', type: 'core/code', v: 1, attrs: {}, content: [{ text: 'a < b' }] },
      ),
    );
    expect(out).toContain(
      '<h3 id="intro" class="wp-block-heading has-text-align-center">Title</h3>',
    );
    expect(out).toContain(
      '<p class="has-drop-cap">Hello <em><strong>world</strong></em><br/>next</p>',
    );
    expect(out).toContain('<ol class="wp-block-list" start="3"><li>one</li></ol>');
    expect(out).toContain(
      '<blockquote class="wp-block-quote"><p>Quote</p><cite>Someone</cite></blockquote>',
    );
    expect(out).toContain(
      '<div class="wp-block-columns is-stacked-on-mobile"><div class="wp-block-column" style="flex-basis:66.66%"></div></div>',
    );
    expect(out).toContain(
      '<a class="wp-block-button__link wp-element-button" href="/contact" target="_blank" rel="noopener noreferrer">Contact</a>',
    );
    expect(out).toContain('<section class="wp-block-group"></section>');
    expect(out).toContain('<hr class="wp-block-separator has-alpha-channel-opacity"/>');
    expect(out).toContain(
      '<div class="wp-block-spacer" style="height:40px" aria-hidden="true"></div>',
    );
    expect(out).toContain('<pre class="wp-block-code"><code>a &lt; b</code></pre>');
  });

  it('skips empty paragraphs and unknown blocks', () => {
    expect(
      html(
        doc(
          { id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [] },
          { id: 'x', type: 'acme/map', v: 1, attrs: {} },
        ),
      ),
    ).toBe('');
  });
});

describe('embeds and HTML', () => {
  it('renders known embeds as lazy privacy-friendly iframes, others as links', () => {
    const out = html(
      doc(
        {
          id: 'e',
          type: 'core/embed',
          v: 1,
          attrs: { url: 'https://youtu.be/dQw4w9WgXcQ', caption: [{ text: 'Song' }] },
        },
        { id: 'o', type: 'core/embed', v: 1, attrs: { url: 'https://example.com/post' } },
        { id: 'x', type: 'core/embed', v: 1, attrs: { url: 'javascript:alert(1)' } },
      ),
    );
    expect(out).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('is-provider-youtube');
    expect(out).toContain('<figcaption class="wp-element-caption">Song</figcaption>');
    expect(out).toContain('<a href="https://example.com/post">https://example.com/post</a>');
    expect(out).not.toContain('javascript:');
  });

  it('outputs the HTML block as saved', () => {
    const out = html(
      doc({ id: 'h', type: 'core/html', v: 1, attrs: { content: '<p class="x">Hi</p>' } }),
    );
    expect(out).toBe('<div class="wp-block-html"><p class="x">Hi</p></div>');
  });
});

describe('images', () => {
  const media: RenderMedia = {
    id: 'm1',
    url: '/media/s/a.jpg',
    mime: 'image/jpeg',
    width: 1600,
    height: 900,
    alt: 'Library alt',
    variants: [
      { variant: 'md', format: 'webp', url: '/media/s/a-md.webp', width: 768, height: 432 },
      { variant: 'thumb', format: 'webp', url: '/media/s/a-thumb.webp', width: 300, height: 169 },
      { variant: 'md', format: 'avif', url: '/media/s/a-md.avif', width: 768, height: 432 },
    ],
  };

  it('uses AVIF/WebP sources, intrinsic size, and lazy-loads all but the first', () => {
    const image = (id: string) => ({
      id,
      type: 'core/image',
      v: 1,
      attrs: { id: 'm1', caption: [{ text: 'Cap' }] },
    });
    const out = html(doc(image('i1'), image('i2')), [media]);
    expect(out).toContain('<source type="image/avif" srcSet="/media/s/a-md.avif 768w"');
    expect(out).toContain('srcSet="/media/s/a-thumb.webp 300w, /media/s/a-md.webp 768w"');
    expect(out).toContain(
      '<img src="/media/s/a.jpg" alt="Library alt" width="1600" height="900" fetchPriority="high"/>',
    );
    expect(out).toContain('loading="lazy" decoding="async"');
    expect(out).toContain('<figcaption class="wp-element-caption">Cap</figcaption>');
  });

  it('falls back to the stored URL when the media is unknown', () => {
    const out = html(
      doc({
        id: 'i',
        type: 'core/image',
        v: 1,
        attrs: { url: 'https://cdn.example/x.png', alt: 'X' },
      }),
    );
    expect(out).toContain('<img src="https://cdn.example/x.png" alt="X"');
  });
});

describe('security', () => {
  it('escapes text and drops dangerous URLs everywhere', () => {
    const out = html(
      doc(
        {
          id: 'p',
          type: 'core/paragraph',
          v: 1,
          attrs: { className: '" onclick="x' },
          content: [
            { text: '<script>alert(1)</script>' },
            { type: 'link', href: 'javascript:alert(1)', children: [{ text: 'bad link' }] },
          ],
        },
        { id: 'i', type: 'core/image', v: 1, attrs: { url: 'javascript:alert(1)' } },
        {
          id: 'b',
          type: 'core/button',
          v: 1,
          attrs: { url: ' java\nscript:alert(1)' },
          content: [{ text: 'btn' }],
        },
        {
          id: 'h',
          type: 'core/heading',
          v: 1,
          attrs: { level: '1 onmouseover=x' },
          content: [{ text: 'h' }],
        },
        { id: 'g', type: 'core/group', v: 1, attrs: { tagName: 'script' }, children: [] },
      ),
    );
    expect(out).not.toMatch(/<script|javascript:|onclick="x|onmouseover/i);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('bad link');
    expect(out).toContain('<h2 class="wp-block-heading">h</h2>');
    expect(out).toContain('<div class="wp-block-group"></div>');
  });

  it('never outputs markup from arbitrary rich text (property)', () => {
    const text = fc.string({ maxLength: 30 });
    const node = fc.oneof(
      fc.record({ text, marks: fc.subarray([...MARKS]) }),
      fc.record({
        type: fc.constant('link' as const),
        href: fc.oneof(
          fc.webUrl(),
          fc.string(),
          fc.constantFrom('javascript:x', 'data:text/html,x', ' JAVASCRIPT:x'),
        ),
        children: fc.array(fc.record({ text }), { maxLength: 2 }),
      }),
    );
    fc.assert(
      fc.property(fc.array(node, { maxLength: 6 }), (nodes) => {
        const out = renderToStaticMarkup(
          <p>
            <Inline nodes={nodes as CxdInline[]} />
          </p>,
        );
        expect(out).not.toMatch(/<(?!\/?(p|strong|em|u|s|code|sup|sub|a|br)\b)/);
        expect(out).not.toMatch(/href="\s*(javascript|data|vbscript):/i);
      }),
      { numRuns: 1_000 },
    );
  }, 60_000);

  it('safeUrl keeps only safe schemes', () => {
    expect(safeUrl('https://a.test/x')).toBe('https://a.test/x');
    expect(safeUrl('/page')).toBe('/page');
    expect(safeUrl('#top')).toBe('#top');
    expect(safeUrl('mailto:a@b.test')).toBe('mailto:a@b.test');
    expect(safeUrl('page.html')).toBe('page.html');
    expect(safeUrl('javascript:x')).toBeUndefined();
    expect(safeUrl('data:text/html,x')).toBeUndefined();
    expect(safeUrl('\tjavascript:x')).toBeUndefined();
    expect(safeUrl(42)).toBeUndefined();
  });
});

describe('document helpers', () => {
  const sample = doc(
    {
      id: 'p1',
      type: 'core/paragraph',
      v: 1,
      attrs: {},
      content: [{ text: 'First paragraph with some words.' }],
    },
    {
      id: 'c',
      type: 'core/columns',
      v: 1,
      attrs: {},
      children: [{ id: 'i', type: 'core/image', v: 1, attrs: { id: 'm9', url: '/x.jpg' } }],
    },
  );

  it('collects media, finds the first image and builds an excerpt', () => {
    expect(collectMediaIds(sample)).toEqual(['m9']);
    expect(firstImage(sample)).toEqual({ id: 'm9', url: '/x.jpg' });
    expect(documentExcerpt(sample)).toBe('First paragraph with some words.');
    expect(
      documentExcerpt(
        doc({
          id: 'p',
          type: 'core/paragraph',
          v: 1,
          attrs: {},
          content: [{ text: 'word '.repeat(80) }],
        }),
        50,
      ),
    ).toMatch(/…$/);
  });
});

describe('patterns, templates and pages', () => {
  const para = (id: string, text: string) => ({
    id,
    type: 'core/paragraph',
    v: 1,
    attrs: {},
    content: [{ text }],
  });

  it('expands synced patterns one level deep', () => {
    const pattern = doc(para('pp', 'From the pattern'), {
      id: 'nested',
      type: 'cleitext/pattern',
      v: 1,
      attrs: { ref: 'p1' },
    });
    const page = doc(
      { id: 'a', type: 'cleitext/pattern', v: 1, attrs: { ref: 'p1' } },
      { id: 'b', type: 'cleitext/pattern', v: 1, attrs: { ref: 'missing' } },
    );
    expect(collectPatternIds(page)).toEqual(['p1', 'missing']);
    expect(collectPatternIds(null)).toEqual([]);
    const out = renderToStaticMarkup(
      <Blocks
        document={page}
        context={{ media: new Map(), locale: 'en', patterns: new Map([['p1', pattern]]) }}
      />,
    );
    expect(out).toBe('<p>From the pattern</p>');
  });

  it('shows the entry inside a template, never inside itself', () => {
    const entry = doc(para('e', 'Entry text'), {
      id: 'x',
      type: 'cleitext/entry-content',
      v: 1,
      attrs: {},
    });
    const template = doc(para('t', 'Before'), {
      id: 'c',
      type: 'cleitext/entry-content',
      v: 1,
      attrs: {},
    });
    const render = (withEntry: boolean) =>
      renderToStaticMarkup(
        <Blocks
          document={template}
          context={{
            media: new Map(),
            locale: 'en',
            ...(withEntry ? { entry: { document: entry } } : {}),
          }}
        />,
      );
    expect(render(true)).toBe('<p>Before</p><p>Entry text</p>');
    // In a visual editor's frame the editor draws the content there.
    expect(
      renderToStaticMarkup(
        <Blocks
          document={template}
          context={{
            media: new Map(),
            locale: 'en',
            entry: { document: entry },
            editorFrame: true,
          }}
        />,
      ),
    ).toBe('<p>Before</p><div data-cx-editor-canvas=""></div>');
    expect(render(false)).toBe('<p>Before</p>');
  });

  it('finds no image in documents without one, and renders whole pages', () => {
    expect(firstImage(doc(para('p', 'text')))).toBeNull();
    expect(firstImage(null)).toBeNull();
    expect(firstImage(doc({ id: 'i', type: 'core/image', v: 1, attrs: {} }))).toEqual({});
    expect(renderHtmlDocument(<html lang="en" />)).toMatch(/^<!doctype html><html lang="en">/);
  });

  describe('tables and galleries', () => {
    it('render a table with head, cells that span and align, and a caption', () => {
      const cell = (text: string, extra: object = {}) => ({ content: [{ text }], ...extra });
      const out = html(
        doc({
          id: 't',
          type: 'core/table',
          v: 1,
          attrs: {
            head: [
              { cells: [cell('Day', { tag: 'th', scope: 'col' }), cell('Hours', { tag: 'th' })] },
            ],
            body: [
              { cells: [cell('Mon'), cell('9–18', { align: 'right' })] },
              { cells: [cell('Closed on Sundays', { colspan: 2, align: 'javascript' })] },
            ],
            hasFixedLayout: false,
            caption: [{ text: 'Opening hours' }],
          },
        }),
      );
      expect(out).toBe(
        '<figure class="wp-block-table"><table><thead><tr><th scope="col">Day</th><th>Hours</th></tr></thead>' +
          '<tbody><tr><td>Mon</td><td class="has-text-align-right">9–18</td></tr><tr><td colSpan="2">Closed on Sundays</td></tr></tbody></table>' +
          '<figcaption class="wp-element-caption">Opening hours</figcaption></figure>',
      );
      expect(html(doc({ id: 'e', type: 'core/table', v: 1, attrs: {} }))).toBe('');
    });

    it('render a gallery of images in columns, cropped by default', () => {
      const image = (id: string) => ({
        id,
        type: 'core/image',
        v: 1,
        attrs: { url: `/m/${id}.jpg`, alt: id },
      });
      const out = html(
        doc({
          id: 'g',
          type: 'core/gallery',
          v: 1,
          attrs: { columns: 2 },
          children: [image('a'), image('b')],
        }),
      );
      expect(out).toContain(
        '<figure class="wp-block-gallery has-nested-images columns-2 is-cropped"><figure class="wp-block-image">',
      );
      expect(out.match(/<img/g)).toHaveLength(2);
      expect(html(doc({ id: 'x', type: 'core/gallery', v: 1, attrs: {}, children: [] }))).toBe('');
    });

    it('adds their base styles to pages that have one, before the theme’s', () => {
      const page =
        '<html><head><meta charset="utf-8"><style>theme</style></head><body><figure class="wp-block-table"></figure></body></html>';
      const out = withCoreBlockCss(page);
      expect(out.indexOf('data-cx-core-blocks')).toBeLessThan(out.indexOf('<style>theme'));
      expect(withCoreBlockCss('<html><head></head><body><p>x</p></body></html>')).not.toContain(
        'data-cx-core-blocks',
      );
    });
  });
});
