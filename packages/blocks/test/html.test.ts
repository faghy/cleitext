/** HTML and WordPress block markup to CXD (`@cleitext/blocks/html`), and the transfer document. */
import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/index.js';
import { htmlToCxd, parseBlocks } from '../src/html.js';
import { transferDocumentSchema } from '../src/transfer.js';

const types = (blocks: CxdBlock[]): string[] => blocks.map((b) => b.type);
const convert = (html: string, mediaRef?: (id: number) => string | undefined) => {
  const warnings: string[] = [];
  const doc = htmlToCxd(html, { warn: (m) => warnings.push(m), ...(mediaRef ? { mediaRef } : {}) });
  return { blocks: doc.blocks, warnings };
};

describe('classic content', () => {
  it('splits paragraphs like WordPress does', () => {
    const { blocks } = convert('One <em>two</em>.\n\nThree\nfour.\n\n<h2>Title</h2><hr>');
    expect(types(blocks)).toEqual([
      'core/paragraph',
      'core/paragraph',
      'core/heading',
      'core/separator',
    ]);
    expect(blocks[0]!.content).toEqual([
      { text: 'One ' },
      { text: 'two', marks: ['italic'] },
      { text: '.' },
    ]);
    expect(blocks[1]!.content).toEqual([{ text: 'Three\nfour.' }]);
  });

  it('turns lists, quotes, code and images into blocks', () => {
    const { blocks } = convert(
      '<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><ol><li>First</li></ol>' +
        '<blockquote><p>Said</p></blockquote><blockquote>Bare</blockquote><pre>a &lt; b &amp;&amp; c</pre>' +
        '<p><img class="wp-image-7" src="https://x.test/a.jpg" alt="A &amp; B"></p>' +
        '<a href="https://x.test/page"><img src="https://x.test/b.png" alt=""></a>' +
        '<figure><img src="https://x.test/c.png" alt="C"><figcaption>The <b>cap</b></figcaption></figure>',
      (id) => (id === 7 ? 'att:7' : undefined),
    );
    expect(types(blocks)).toEqual([
      'core/list',
      'core/list',
      'core/quote',
      'core/quote',
      'core/code',
      'core/image',
      'core/image',
      'core/image',
    ]);
    expect(blocks[0]!.children![0]!.children![0]!.type).toBe('core/list');
    expect(blocks[1]!.attrs).toEqual({ ordered: true });
    expect(blocks[3]!.children![0]!.content).toEqual([{ text: 'Bare' }]);
    expect(blocks[4]!.content).toEqual([{ text: 'a < b && c' }]);
    expect(blocks[5]!.attrs).toMatchObject({
      id: 'att:7',
      alt: 'A & B',
      url: 'https://x.test/a.jpg',
    });
    expect(blocks[6]!.attrs).toMatchObject({ href: 'https://x.test/page' });
    expect(blocks[7]!.attrs.caption).toEqual([{ text: 'The ' }, { text: 'cap', marks: ['bold'] }]);
  });

  it('reports what it cannot convert', () => {
    const { blocks, warnings } = convert(
      '<table><tr><th>A</th><td>B</td></tr><tr><td></td></tr></table><iframe src="https://v.test/1"></iframe>' +
        '<script>x()</script><div><p>Inside</p></div>',
    );
    expect(types(blocks)).toEqual(['core/table', 'core/paragraph', 'core/paragraph']);
    expect(blocks[0]!.attrs.body).toEqual([
      {
        cells: [
          { content: [{ text: 'A' }], tag: 'th' },
          { content: [{ text: 'B' }], tag: 'td' },
        ],
      },
      { cells: [{ content: [], tag: 'td' }] },
    ]);
    expect(blocks[1]!.content![0]).toMatchObject({ type: 'link', href: 'https://v.test/1' });
    expect(warnings.join('\n')).toMatch(/frame became a link[\s\S]*<script>/);
  });
});

describe('block markup', () => {
  it('parses nested, self-closing and unclosed blocks', () => {
    const parsed = parseBlocks(
      'intro<!-- wp:group {"tagName":"section"} --><!-- wp:spacer {"height":"8px"} /--><!-- wp:x/y {bad json} --><p>a</p><!-- /wp:group --><!-- wp:paragraph --><p>end</p>',
    );
    expect(parsed.map((b) => b.blockName)).toEqual([null, 'core/group', 'core/paragraph']);
    expect(parsed[1]!.attrs).toEqual({ tagName: 'section' });
    expect(parsed[1]!.innerBlocks.map((b) => b.blockName)).toEqual(['core/spacer', 'x/y']);
    expect(parsed[1]!.innerBlocks[1]!.attrs).toEqual({});
  });

  it('maps the core blocks', () => {
    const { blocks, warnings } = convert(
      [
        '<!-- wp:paragraph {"dropCap":true} --><p>Hi <strong>there</strong></p><!-- /wp:paragraph -->',
        '<!-- wp:paragraph --><p> </p><!-- /wp:paragraph -->',
        '<!-- wp:heading {"level":3} --><h3>Three</h3><!-- /wp:heading -->',
        '<!-- wp:heading --><h4>Four</h4><!-- /wp:heading -->',
        '<!-- wp:list {"ordered":true} --><ol><!-- wp:list-item --><li>A</li><!-- /wp:list-item --></ol><!-- /wp:list -->',
        '<!-- wp:list --><ul><li>B</li></ul><!-- /wp:list -->',
        '<!-- wp:quote --><blockquote><p>Q</p><cite>Who</cite></blockquote><!-- /wp:quote -->',
        '<!-- wp:pullquote --><figure><blockquote><p>P</p></blockquote></figure><!-- /wp:pullquote -->',
        '<!-- wp:image {"id":5,"sizeSlug":"large"} --><figure><img src="https://x.test/i.jpg" alt="I"></figure><!-- /wp:image -->',
        '<!-- wp:gallery --><figure><figure><img src="https://x.test/g1.jpg"></figure><figure><img src="https://x.test/g2.jpg"></figure></figure><!-- /wp:gallery -->',
        '<!-- wp:buttons --><!-- wp:button --><div><a href="/go">Go</a></div><!-- /wp:button --><!-- /wp:buttons -->',
        '<!-- wp:columns --><!-- wp:column {"width":"40%"} --><!-- wp:paragraph --><p>L</p><!-- /wp:paragraph --><!-- /wp:column --><!-- /wp:columns -->',
        '<!-- wp:media-text {"mediaId":9} --><div><figure><img src="https://x.test/m.jpg"></figure><!-- wp:paragraph --><p>M</p><!-- /wp:paragraph --></div><!-- /wp:media-text -->',
        '<!-- wp:separator --><hr><!-- /wp:separator -->',
        '<!-- wp:spacer {"height":"20px"} /-->',
        '<!-- wp:code --><pre><code>let a = 1 &gt; 0;</code></pre><!-- /wp:code -->',
        '<!-- wp:more --><!--more--><!-- /wp:more -->',
        '<!-- wp:embed {"url":"https://v.test/2"} --><figure>https://v.test/2</figure><!-- /wp:embed -->',
        '<!-- wp:video --><figure><video src="https://v.test/3.mp4"></video></figure><!-- /wp:video -->',
        '<!-- wp:shortcode -->[gallery ids="1"]<!-- /wp:shortcode -->',
        '<!-- wp:acme/box --><div><!-- wp:paragraph --><p>Kept</p><!-- /wp:paragraph --></div><!-- /wp:acme/box -->',
        '<!-- wp:acme/note --><div>Just text</div><!-- /wp:acme/note -->',
        '<p>Free HTML between blocks</p>',
      ].join(''),
      (id) => `att:${id}`,
    );
    expect(types(blocks)).toEqual([
      'core/paragraph',
      'core/heading',
      'core/heading',
      'core/list',
      'core/list',
      'core/quote',
      'core/quote',
      'core/image',
      'core/gallery',
      'core/buttons',
      'core/columns',
      'core/group',
      'core/separator',
      'core/spacer',
      'core/code',
      'core/paragraph',
      'core/paragraph',
      'core/gallery',
      'core/paragraph',
      'core/paragraph',
      'core/paragraph',
    ]);
    expect(blocks[0]!.attrs).toEqual({ dropCap: true });
    expect(blocks[1]!.attrs).toMatchObject({ level: 3 });
    expect(blocks[2]!.attrs).toMatchObject({ level: 4 });
    expect(blocks[3]!.attrs).toEqual({ ordered: true });
    expect(blocks[4]!.children).toHaveLength(1);
    expect(blocks[5]!.attrs.citation).toEqual([{ text: 'Who' }]);
    expect(blocks[7]!.attrs).toMatchObject({ id: 'att:5', sizeSlug: 'large', alt: 'I' });
    expect(blocks[8]!.children).toHaveLength(2);
    expect(blocks[9]!.children![0]!.attrs).toEqual({ url: '/go' });
    expect(blocks[10]!.children![0]!.attrs).toEqual({ width: '40%' });
    expect(blocks[11]!.children![0]!.attrs).toMatchObject({ id: 'att:9' });
    expect(blocks[13]!.attrs).toEqual({ height: '20px' });
    expect(blocks[14]!.content).toEqual([{ text: 'let a = 1 > 0;' }]);
    expect(blocks[15]!.content![0]).toMatchObject({ type: 'link', href: 'https://v.test/2' });
    expect(blocks[16]!.content![0]).toMatchObject({ href: 'https://v.test/3.mp4' });
    expect(blocks[17]!.children!.map((c) => c.attrs)).toEqual([{ id: 'att:1', alt: '' }]);
    expect(blocks[18]!.content).toEqual([{ text: 'Kept' }]);
    expect(blocks[19]!.content).toEqual([{ text: 'Just text' }]);
    const all = warnings.join('\n');
    for (const expected of [
      'Pull quotes became quotes',
      'media-text block became a group',
      'embed block became a link',
      'acme/box has no equivalent: its content',
      'acme/note has no equivalent: its text',
    ]) {
      expect(all).toContain(expected);
    }
  });
});

describe('text alignment of WordPress 6.9 and later', () => {
  it('reads it from the block style of paragraphs and headings', () => {
    const { blocks } = convert(
      '<!-- wp:paragraph {"style":{"typography":{"textAlign":"center"}}} -->\n<p class="has-text-align-center">Middle</p>\n<!-- /wp:paragraph -->' +
        '<!-- wp:heading {"level":3,"style":{"typography":{"textAlign":"right"}}} -->\n<h3 class="wp-block-heading has-text-align-right">Side</h3>\n<!-- /wp:heading -->' +
        '<!-- wp:paragraph {"align":"left","style":{"typography":{"textAlign":"center"}}} -->\n<p>Older</p>\n<!-- /wp:paragraph -->',
    );
    expect(blocks.map((b) => [b.type, b.attrs.align ?? b.attrs.textAlign])).toEqual([
      ['core/paragraph', 'center'],
      ['core/heading', 'right'],
      ['core/paragraph', 'left'],
    ]);
  });
});

describe('covers', () => {
  const cover =
    '<!-- wp:cover {"url":"https://example.com/a.webp","dimRatio":20} -->\n<div class="wp-block-cover"><img class="wp-block-cover__image-background" src="https://example.com/a.webp" alt=""/><span class="wp-block-cover__background has-background-dim-20 has-background-dim"></span><div class="wp-block-cover__inner-container"><!-- wp:paragraph -->\n<p>On top</p>\n<!-- /wp:paragraph --></div></div>\n<!-- /wp:cover -->';
  it('become a group with the image, then the content', () => {
    const { blocks, warnings } = convert(cover);
    expect(types(blocks)).toEqual(['core/group']);
    expect(types(blocks[0]!.children!)).toEqual(['core/image', 'core/paragraph']);
    expect(warnings).toEqual(['A cover block became a group.']);
  });
  it('during an import, wait for a plugin with that group as the fallback', () => {
    const doc = htmlToCxd(cover, { keepUnknown: true });
    expect(doc.blocks[0]!.type).toBe('core/imported');
    expect(doc.blocks[0]!.attrs.name).toBe('core/cover');
    expect(types(doc.blocks[0]!.children!)).toEqual(['core/group']);
  });
});

describe('group layouts', () => {
  it('keeps rows and grids, not the default layouts', () => {
    const { blocks } = convert(
      '<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap","justifyContent":"center","bogus":1}} -->\n<div class="wp-block-group"></div>\n<!-- /wp:group -->' +
        '<!-- wp:group {"layout":{"type":"constrained"}} -->\n<div class="wp-block-group"></div>\n<!-- /wp:group -->',
    );
    expect(blocks.map((b) => b.attrs.layout)).toEqual([
      { type: 'flex', flexWrap: 'nowrap', justifyContent: 'center' },
      undefined,
    ]);
  });
});

describe('colors and custom HTML', () => {
  it('keeps preset text sizes and marks custom backgrounds as WordPress does', () => {
    const { blocks } = convert(
      '<!-- wp:paragraph {"fontSize":"x-large","style":{"color":{"background":"#3636367d","text":"#ffffff"}}} -->\n<p class="has-x-large-font-size">Band</p>\n<!-- /wp:paragraph -->',
    );
    expect(String(blocks[0]!.attrs.className).split(' ').sort()).toEqual([
      'has-background',
      'has-text-color',
      'has-x-large-font-size',
    ]);
  });

  it('keeps palette colors as WordPress classes, inline colors and custom HTML', () => {
    const doc = htmlToCxd(
      '<!-- wp:paragraph {"textColor":"ast-global-color-0","backgroundColor":"bad slug!","className":"lead","style":{"spacing":{"margin":{"top":"0","bottom":"0"}},"color":{"text":"expression(x)"}}} -->' +
        '<p class="lead has-ast-global-color-0-color has-text-color">Immerso <a style="color:#4A4A4A;" href="tel:+39">+39</a></p><!-- /wp:paragraph -->' +
        '<!-- wp:html --><iframe src="https://www.google.com/maps/embed?pb=1" width="600"></iframe><!-- /wp:html -->',
    );
    expect(doc.blocks[0]!.attrs.className).toBe('lead has-ast-global-color-0-color has-text-color');
    expect(doc.blocks[0]!.attrs.style).toEqual({ spacing: { margin: { top: '0', bottom: '0' } } });
    expect(doc.blocks[0]!.content).toEqual([
      { text: 'Immerso ' },
      { type: 'link', href: 'tel:+39', color: '#4A4A4A', children: [{ text: '+39' }] },
    ]);
    expect(doc.blocks[1]).toMatchObject({
      type: 'core/html',
      attrs: {
        content: '<iframe src="https://www.google.com/maps/embed?pb=1" width="600"></iframe>',
      },
    });
  });
});

describe('tables and galleries', () => {
  it('keeps WordPress tables, with head, formatted cells, alignment, spans and caption', () => {
    const { blocks } = convert(
      '<!-- wp:table {"hasFixedLayout":true} --><figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr><th>Day</th><th class="has-text-align-right" data-align="right">Hours</th></tr></thead>' +
        '<tbody><tr><td><strong>Mon</strong></td><td class="has-text-align-right" data-align="right">9–18</td></tr><tr><td colspan="2">Closed on <a href="/sundays">Sundays</a></td></tr></tbody></table>' +
        '<figcaption class="wp-element-caption">Opening hours</figcaption></figure><!-- /wp:table -->',
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.attrs).toEqual({
      head: [
        {
          cells: [
            { content: [{ text: 'Day' }], tag: 'th' },
            { content: [{ text: 'Hours' }], tag: 'th', align: 'right' },
          ],
        },
      ],
      body: [
        {
          cells: [
            { content: [{ text: 'Mon', marks: ['bold'] }], tag: 'td' },
            { content: [{ text: '9–18' }], tag: 'td', align: 'right' },
          ],
        },
        {
          cells: [
            {
              content: [
                { text: 'Closed on ' },
                { type: 'link', href: '/sundays', children: [{ text: 'Sundays' }] },
              ],
              tag: 'td',
              colspan: 2,
            },
          ],
        },
      ],
      hasFixedLayout: true,
      caption: [{ text: 'Opening hours' }],
    });
  });

  it('turns the [gallery] shortcode of classic posts into a gallery', () => {
    const { blocks } = convert(
      'Our trip:\n\n[gallery columns="2" ids="3,4,99"]\n\nThe end.',
      (id) => (id === 99 ? undefined : `att:${id}`),
    );
    expect(types(blocks)).toEqual(['core/paragraph', 'core/gallery', 'core/paragraph']);
    expect(blocks[1]!.attrs).toEqual({ columns: 2 });
    expect(blocks[1]!.children!.map((c) => c.attrs.id)).toEqual(['att:3', 'att:4']);
  });
});

describe('layout tables', () => {
  it('turns tables of pictures side by side into rows of columns', () => {
    const { blocks, warnings } = convert(
      '<!-- wp:table --><figure class="wp-block-table"><table><tbody><tr>' +
        '<td><figure><a href="/a"><img src="https://old.example/a.jpg" alt="A"></a></figure></td>' +
        '<td><a href="/b"><img src="https://old.example/b.jpg" alt="B"></a><br>Caption B</td>' +
        '</tr></tbody></table></figure><!-- /wp:table -->' +
        '<table><tr><td>Plain</td><td>data</td></tr></table>',
    );
    expect(types(blocks)).toEqual(['core/columns', 'core/table']);
    const columns = blocks[0]!.children!;
    expect(columns.map((c) => c.type)).toEqual(['core/column', 'core/column']);
    const inside = columns.flatMap((c) => c.children ?? []);
    expect(inside.filter((b) => b.type === 'core/image').map((b) => b.attrs.alt)).toEqual([
      'A',
      'B',
    ]);
    expect(JSON.stringify(inside)).toContain('Caption B');
    expect(warnings).toContain('A table with pictures became rows of columns.');
  });
});

describe('blocks of other plugins', () => {
  it('keeps them as placeholders for the import, with attributes, HTML and text', () => {
    const warnings: string[] = [];
    const doc = htmlToCxd(
      '<!-- wp:uagb/container {"block_id":"a1","topPaddingDesktop":40} --><div class="wp-block-uagb-container">' +
        '<!-- wp:paragraph --><p>Inside</p><!-- /wp:paragraph --></div><!-- /wp:uagb/container -->' +
        '<!-- wp:uagb/advanced-heading {"headingTitle":"Hi"} --><div class="uagb-heading"><h2>Hi</h2></div><!-- /wp:uagb/advanced-heading -->',
      { keepUnknown: true, warn: (m) => warnings.push(m) },
    );
    expect(doc.blocks.map((b) => b.type)).toEqual(['core/imported', 'core/imported']);
    expect(doc.blocks[0]!.attrs).toMatchObject({
      name: 'uagb/container',
      attrs: { block_id: 'a1', topPaddingDesktop: 40 },
      fallback: [],
    });
    expect(doc.blocks[0]!.children!.map((b) => b.type)).toEqual(['core/paragraph']);
    expect(doc.blocks[1]!.attrs.html).toContain('<h2>Hi</h2>');
    expect((doc.blocks[1]!.attrs.fallback as { type: string }[]).map((b) => b.type)).toEqual([
      'core/heading',
    ]);
    // Without the option, their text as before.
    expect(htmlToCxd('<!-- wp:x/y --><p>T</p><!-- /wp:x/y -->').blocks[0]!.type).toBe(
      'core/paragraph',
    );
    expect(warnings).toEqual([]);
  });
});

describe('blog widgets', () => {
  it('turns WordPress latest posts, comments, tag cloud, categories and search into widgets', () => {
    const { blocks, warnings } = convert(
      '<!-- wp:latest-posts {"postsToShow":3,"displayPostDate":true,"postLayout":"grid","columns":2,"displayFeaturedImage":true} /-->' +
        '<!-- wp:latest-comments {"commentsToShow":4,"displayAvatar":false} /-->' +
        '<!-- wp:tag-cloud {"numberOfTags":20,"showTagCounts":true} /-->' +
        '<!-- wp:categories {"showPostCounts":true,"showHierarchy":true} /-->' +
        '<!-- wp:search {"label":"Cerca","buttonText":"Vai","placeholder":"Parole…"} /-->',
    );
    expect(blocks.map((b) => [b.type, b.attrs])).toEqual([
      [
        'widgets/recent-posts',
        {
          title: '-',
          showTitle: false,
          layout: 'grid',
          count: 3,
          columns: 2,
          orderBy: 'date',
          image: true,
          date: true,
          author: false,
          excerpt: false,
          excludeCurrent: false,
        },
      ],
      [
        'widgets/recent-comments',
        { title: '-', showTitle: false, count: 4, excerpt: true, date: true },
      ],
      [
        'widgets/tag-cloud',
        { title: '-', showTitle: false, taxonomy: 'tag', count: 20, counts: true },
      ],
      [
        'widgets/categories',
        {
          title: '-',
          showTitle: false,
          taxonomy: 'category',
          counts: true,
          hierarchy: true,
          hideEmpty: true,
        },
      ],
      [
        'widgets/search',
        { label: 'Cerca', showLabel: true, placeholder: 'Parole…', button: 'Vai' },
      ],
    ]);
    expect(warnings).toHaveLength(5);
    expect(warnings[0]).toContain('Widgets plugin');
  });
});

describe('transfer document', () => {
  it('fills the defaults and refuses invalid records', () => {
    const minimal = {
      format: 'cleitext-transfer',
      version: 1,
      source: { kind: 'wordpress', exportedAt: '2026-10-11T10:00:00Z' },
    };
    const parsed = transferDocumentSchema.parse(minimal);
    expect(parsed).toMatchObject({ entries: [], media: [], menus: [], redirects: [], site: {} });
    const nested = transferDocumentSchema.parse({
      ...minimal,
      menus: [
        {
          name: 'Main',
          locale: 'en',
          items: [{ kind: 'url', url: '/', children: [{ kind: 'custom' }] }],
        },
      ],
      redirects: [{ from: '/old', to: '/new' }],
    });
    expect(nested.redirects[0]!.status).toBe(301);
    expect(
      transferDocumentSchema.safeParse({ ...minimal, entries: [{ ref: 'x', locale: 'English' }] })
        .success,
    ).toBe(false);
  });
});

describe('code in <pre>', () => {
  it('keeps HTML and PHP written unescaped, without the markup of highlighters', () => {
    const doc = htmlToCxd(
      '<pre class="lang:php">&lt;?php echo "a"; ?&gt;\n<?php if ($a > 1) { ?>\n<div class="box">Hi</div>\n<?php } ?></pre>' +
        '<pre><code class="language-js"><span class="kw">const</span> a = 1;<br>a &lt; 2;</code></pre>' +
        '<pre>&lt;div&gt;ciao&lt;/div&gt; &lt;span&gt;x&lt;/span&gt; it&#8217;s &#x27;q&#x27;</pre>' +
        '<!-- wp:code --><pre class="wp-block-code"><code>&lt;?php echo &quot;b&quot;; ?&gt;</code></pre><!-- /wp:code -->',
    );
    expect(
      doc.blocks.map((b) => (b.content?.[0] && 'text' in b.content[0] ? b.content[0].text : '')),
    ).toEqual([
      '<?php echo "a"; ?>\n<?php if ($a > 1) { ?>\n<div class="box">Hi</div>\n<?php } ?>',
      'const a = 1;\na < 2;',
      "<div>ciao</div> <span>x</span> it’s 'q'",
      '<?php echo "b"; ?>',
    ]);
  });
});
