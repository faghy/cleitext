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
    expect(types(blocks)).toEqual(['core/paragraph', 'core/paragraph', 'core/paragraph']);
    expect(blocks[0]!.content).toEqual([{ text: 'A · B' }]);
    expect(blocks[1]!.content![0]).toMatchObject({ type: 'link', href: 'https://v.test/1' });
    expect(warnings.join('\n')).toMatch(
      /table became text[\s\S]*frame became a link[\s\S]*<script>/,
    );
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
      'core/group',
      'core/buttons',
      'core/columns',
      'core/group',
      'core/separator',
      'core/spacer',
      'core/code',
      'core/paragraph',
      'core/paragraph',
      'core/paragraph',
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
    expect(blocks[17]!.content).toEqual([{ text: '[gallery ids="1"]' }]);
    expect(blocks[18]!.content).toEqual([{ text: 'Kept' }]);
    expect(blocks[19]!.content).toEqual([{ text: 'Just text' }]);
    const all = warnings.join('\n');
    for (const expected of [
      'Pull quotes became quotes',
      'gallery became a group',
      'media-text block became a group',
      'embed block became a link',
      'Shortcode left as text',
      'acme/box has no equivalent: its content',
      'acme/note has no equivalent: its text',
    ]) {
      expect(all).toContain(expected);
    }
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
