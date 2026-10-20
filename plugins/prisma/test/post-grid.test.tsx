import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { postGrid } from '../src/blocks/post-grid';
import {
  excerptOf,
  fieldList,
  fieldsOf,
  fieldText,
  paragraphs,
  phpDate,
  termSlugs,
  trimWords,
  type PostsData,
} from '../src/blocks/post-grid/posts';
import { partsOf } from '../src/blocks/post-grid/shared';
import { blockCss, withDefaults } from '../src/lib/css';
import { DEFAULT_GLOBALS } from '../src/lib/globals';
import type { Attrs, PrismaBlock, SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

/** A block drawn as on the site, with the data its `load` read. */
function renderWithData(block: PrismaBlock, attrs: Attrs, data: unknown): string {
  const all = withDefaults(block, attrs);
  return renderToStaticMarkup(
    createElement(block.View, {
      attrs: all,
      id: 'test0001',
      editing: false,
      globals: DEFAULT_GLOBALS,
      data,
      text: () => null,
      inner: () => null,
      root: (tag, props, content) => createElement(tag, props, content),
    }),
  );
}

const DATA: PostsData = {
  page: 1,
  pages: 1,
  param: 'pr-page-test0001',
  locale: 'en',
  posts: [
    {
      id: 'a1',
      title: 'First post',
      url: '/first',
      date: '2026-10-18T10:00:00.000Z',
      author: { name: 'Ada', url: '/author/ada' },
      excerpt:
        'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen',
      content: ['Para one.', 'Para two.'],
      image: { src: '/img/a.jpg', alt: 'A', width: 1024, height: 683 },
      comments: 2,
      terms: [
        { name: 'News', url: '/category/news' },
        { name: 'Life', url: '/category/life' },
      ],
    },
    {
      id: 'a2',
      title: 'Second post',
      url: '/second',
      date: '2026-10-17T10:00:00.000Z',
      author: null,
      excerpt: 'Short.',
      content: [],
      image: null,
      comments: null,
      terms: [],
    },
  ],
};

const fakeSource = (html = ''): SpectraSource => ({
  html,
  children: [],
  block: (n, a, c) => ({
    id: 'x',
    type: `prisma/${n}`,
    v: 1,
    attrs: a,
    ...(c ? { children: c } : {}),
  }),
  rich: (h) => [{ text: h.replace(/<[^>]+>/g, '') }],
  inner: () => '',
  innerAny: () => '',
});

describe('post grid', () => {
  it('draws each post with its parts in the default order', () => {
    const html = renderWithData(postGrid, { blockId: 'test0001' }, DATA);
    expect(html).toContain('class="wp-block-prisma-post-grid pr-post-grid pr-post-grid--image-top');
    expect(html).toContain(
      'pr-post-grid--grid pr-post-grid--cols-3 pr-post-grid--cols-tab-2 pr-post-grid--cols-mob-1',
    );
    expect(html).toContain('pr-post-grid--equal-height');
    expect(html.match(/<article class="pr-post">/g)).toHaveLength(2);
    // The second post has no image: no image part.
    expect(html.match(/pr-post__image/g)).toHaveLength(1);
    expect(html).toContain(
      '<h4 class="pr-post__title pr-post__text"><a href="/first" target="_self" rel="bookmark noopener noreferrer">First post</a></h4>',
    );
    expect(html).toContain('<time dateTime="2026-10-18T10:00:00.000Z" class="pr-post__date">');
    expect(html).toContain('October 18, 2026');
    expect(html).toContain('2 Comments');
    // Author hidden by default; 15 words then "...".
    expect(html).not.toContain('pr-post__author');
    expect(html).toContain(
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen...',
    );
    expect(html).toContain('<a class="wp-block-button__link pr-post__link" href="/first"');
    expect(html).toContain('Read More');
    const order = [
      'pr-post__image',
      'pr-post__title',
      'pr-post__meta',
      'pr-post__excerpt',
      'pr-post__cta',
    ];
    const first = html.slice(0, html.indexOf('</article>'));
    expect(order.map((c) => first.indexOf(c))).toEqual(
      [...order.map((c) => first.indexOf(c))].sort((x, y) => x - y),
    );
  });

  it('shows the taxonomy above the title, highlighted, and the author with icons', () => {
    const html = renderWithData(
      postGrid,
      {
        displayPostTaxonomy: true,
        displayPostTaxonomyAboveTitle: 'aboveTitle',
        taxStyle: 'highlighted',
        displayPostAuthor: true,
      },
      DATA,
    );
    expect(html).toContain('<span class="pr-post__taxonomy pr-post__taxonomy--highlighted">');
    expect(html).toContain('<a href="/category/life">Life</a>');
    expect(html.indexOf('pr-post__taxonomy--highlighted')).toBeLessThan(
      html.indexOf('pr-post__title'),
    );
    expect(html).toContain('<a href="/author/ada" rel="author">Ada</a>');
  });

  it('puts a background image last and keeps the order of layoutConfig', () => {
    const html = renderWithData(
      postGrid,
      { imgPosition: 'background', layoutConfig: ['title', 'image', 'excerpt'] },
      DATA,
    );
    expect(html).toContain('pr-post-grid--image-background');
    const first = html.slice(0, html.indexOf('</article>'));
    expect(first.indexOf('pr-post__title')).toBeLessThan(first.indexOf('pr-post__excerpt'));
    expect(first.indexOf('pr-post__excerpt')).toBeLessThan(first.indexOf('pr-post__image'));
    expect(first).not.toContain('pr-post__cta');
  });

  it('draws page links like WordPress', () => {
    const html = renderWithData(
      postGrid,
      { postPagination: true },
      { ...DATA, page: 2, pages: 12 },
    );
    expect(html).toContain('<div class="pr-post-grid__pagination">');
    expect(html).toContain('href="?pr-page-test0001=1">« Previous</a>');
    expect(html).toContain(
      '<span aria-current="page" class="pr-post-grid__page pr-post-grid__page--current">2</span>',
    );
    expect(html).toContain('>6</a>');
    expect(html).toContain('pr-post-grid__page--dots');
    expect(html).toContain('>9</a>');
    expect(html).toContain('Next »</a>');
    expect(html).not.toContain('>7</a>');
  });

  it('shows the message when there are no posts, nothing before loading', () => {
    expect(renderWithData(postGrid, {}, { ...DATA, posts: [] })).toContain('No post found!');
    expect(renderBlock(postGrid, {}).html).not.toContain('pr-post-grid__empty');
  });

  it('writes the CSS of Spectra per device', () => {
    const css = blockCss(
      postGrid,
      { columns: 4, tcolumns: 2, mcolumns: 1, rowGapTablet: 10 },
      'g1',
    );
    expect(css).toContain(
      '.pr-block-g1.wp-block-prisma-post-grid.pr-post-grid--grid{grid-template-columns:repeat(4 , minmax(0, 1fr))}',
    );
    expect(css).toContain(
      '.pr-block-g1.pr-post-grid--grid .pr-post{padding-top:20px;padding-bottom:20px;padding-left:20px;padding-right:20px}',
    );
    expect(css).toContain(
      '.pr-block-g1.pr-post-grid--grid .pr-post .pr-post__image:first-child{margin-left:-20px;margin-right:-20px;margin-top:-20px}',
    );
    expect(css).toContain('.pr-block-g1 .pr-post{background:#f6f6f6;text-align:left}');
    expect(css).toContain(
      '.pr-block-g1 .pr-post__image::before{background-color:#000000;opacity:0.5}',
    );
    expect(css).toContain('.pr-block-g1 .pr-post__excerpt{padding-bottom:25px}');
    expect(css).toMatch(
      /@media \(max-width: ?976px\)\{[^@]*\.pr-block-g1\.pr-post-grid--grid\{row-gap:10px;column-gap:20px\}/,
    );
    expect(css).toMatch(/@media \(max-width: ?767px\)\{[^@]*repeat\(1 , minmax\(0, 1fr\)\)/);
    // No shadow by default (all sizes 0).
    expect(css).not.toContain('box-shadow');
    // Buttons with their own colors unless they follow the theme.
    expect(blockCss(postGrid, { ctaBgColor: '#f00' }, 'g1')).toContain('background:#f00');
    expect(
      blockCss(postGrid, { ctaBgColor: '#f00', inheritFromThemeBtn: true }, 'g1'),
    ).not.toContain('#f00');
  });

  it('spaces the masonry posts with half the row gap', () => {
    const css = blockCss(postGrid, { post_type: 'masonry', rowGap: 30 }, 'm1');
    expect(css).toContain(
      '.pr-block-m1:not(.pr-post-grid--grid) .pr-post{padding-right:15px;padding-left:15px;margin-bottom:20px}',
    );
    expect(renderWithData(postGrid, { post_type: 'masonry' }, DATA)).toContain(
      'pr-post-grid--masonry',
    );
  });

  it('imports Spectra post grid and masonry', () => {
    const grid = postGrid.spectra!['uagb/post-grid']!(
      {
        postType: 'post',
        taxonomyType: 'post_tag',
        categories: '12',
        blockName: 'post-grid',
        layoutConfig: [['uagb/post-title'], ['uagb/post-image']],
        columns: 2,
      },
      fakeSource(),
    );
    expect(grid[0]!.type).toBe('prisma/post-grid');
    expect(grid[0]!.attrs).toEqual({
      postType: 'article',
      taxonomyType: 'tag',
      layoutConfig: ['title', 'image'],
      columns: 2,
    });
    const masonry = postGrid.spectra!['uagb/post-masonry']!(
      { paginationType: 'infinite' },
      fakeSource(),
    );
    expect(masonry[0]!.attrs).toMatchObject({
      post_type: 'masonry',
      titleTag: 'h3',
      postPagination: true,
    });
    expect(postGrid.spectra!['uagb/post-title']!({}, fakeSource())).toEqual([]);
  });
});

describe('post data', () => {
  it('reads paragraphs, excerpts, words and dates', () => {
    const doc = {
      blocks: [
        {
          type: 'core/paragraph',
          content: [{ text: 'Hello ' }, { type: 'link', children: [{ text: 'world' }] }],
        },
        {
          type: 'core/group',
          children: [{ type: 'core/paragraph', content: [{ text: 'Again.' }] }],
        },
        { type: 'core/image', attrs: {} },
      ],
    };
    expect(paragraphs(doc)).toEqual(['Hello world', 'Again.']);
    expect(excerptOf('Hello world Again…', ['Hello world', 'Again.'])).toBe('Hello world Again.');
    expect(excerptOf('My own words', ['Hello world'])).toBe('My own words');
    expect(trimWords('a b c d', 2)).toBe('a b...');
    expect(trimWords('a b', 2)).toBe('a b');
    expect(phpDate('2026-10-03T00:00:00Z', 'F jS, Y', 'en')).toBe('October 3rd, 2026');
    expect(phpDate('2026-10-03T00:00:00Z', 'd/m/Y', 'it')).toBe('03/10/2026');
    expect(termSlugs('news, 12,life')).toEqual(['news', 'life']);
    expect(partsOf([['uagb/post-button'], 'title', 'bogus'])).toEqual(['button', 'title']);
  });

  it('loads the posts of the site with the query', async () => {
    const calls: unknown[] = [];
    const context = {
      siteId: 's',
      locale: 'en',
      page: {
        route: 'entry',
        site: { title: '', tagline: '', home: '/' },
        params: { 'pr-page-g': '3' },
      },
      entry: { id: 'current', type: 'page' },
      tag: () => {},
      query: async (q: unknown) => {
        calls.push(q);
        return {
          total: 40,
          entries: [
            {
              id: 'e1',
              type: 'article',
              locale: 'en',
              slug: 'e1',
              title: 'E1',
              url: '/e1',
              publishedAt: '2026-01-01T00:00:00Z',
              excerpt: '',
              author: { displayName: 'Bo', url: '/author/bo' },
              image: null,
              featuredImage: {
                id: 'm',
                url: '/m.jpg',
                mime: 'image/jpeg',
                width: 2000,
                height: 1000,
                alt: 'M',
                variants: [
                  { variant: 'w640', format: 'webp', url: '/m-640.webp', width: 640, height: 320 },
                  {
                    variant: 'w1280',
                    format: 'webp',
                    url: '/m-1280.webp',
                    width: 1280,
                    height: 640,
                  },
                ],
              },
              document: {
                schema: 1,
                blocks: [{ type: 'core/paragraph', content: [{ text: 'Body text' }] }],
              },
              terms: { category: [{ name: 'News', slug: 'news', url: '/c/news' }] },
              translations: [],
              fields: {},
            },
          ],
        };
      },
    };
    const ctx = { comments: { find: async () => [{}, {}, {}] } };
    const data = (await postGrid.load!(
      withDefaults(postGrid, {
        blockId: 'g',
        postPagination: true,
        excludeCurrentPost: true,
        enableOffset: true,
        postsOffset: 2,
        categories: 'news',
        orderBy: 'rand',
      }),
      context as never,
      ctx as never,
    )) as PostsData;
    expect(calls[0]).toEqual({
      type: 'article',
      limit: 6,
      offset: 14,
      orderBy: 'random',
      order: 'desc',
      terms: { taxonomy: 'category', slugs: ['news'] },
      exclude: ['current'],
    });
    expect(data.page).toBe(3);
    expect(data.pages).toBe(7);
    expect(data.posts[0]).toMatchObject({
      excerpt: 'Body text',
      comments: 3,
      author: { name: 'Bo', url: '/author/bo' },
      terms: [{ name: 'News', url: '/c/news' }],
      image: { src: '/m-1280.webp', alt: 'M', width: 1280, height: 640 },
    });
  });
});

describe('entries of any type with their custom fields', () => {
  it('reads the chosen fields as text, with their labels', () => {
    expect(fieldList('dimensions: Size, technique ,bad key')).toEqual([
      { key: 'dimensions', label: 'Size' },
      { key: 'technique', label: '' },
    ]);
    expect(fieldText(['oil', { label: 'canvas' }, 3])).toBe('oil, canvas, 3');
    expect(
      fieldsOf(
        { dimensions: '50 x 70 cm', technique: '', other: 'x' },
        {
          customFields: 'dimensions: Size, technique',
        },
      ),
    ).toEqual([{ label: 'Size', value: '50 x 70 cm' }]);
  });

  it('shows them under the title, and mirrors every other post', () => {
    const data: PostsData = {
      ...DATA,
      posts: DATA.posts.map((p, i) => ({
        ...p,
        fields: i === 0 ? [{ label: 'Size', value: '50 x 70 cm' }] : [],
      })),
    };
    const html = renderWithData(postGrid, { isLeftToRightLayout: true, alternate: true }, data);
    expect(html).toContain(
      '<dl class="pr-post__text pr-post__fields"><div class="pr-post__field"><dt>Size</dt><dd>50 x 70 cm</dd></div></dl>',
    );
    expect(html.match(/class="pr-post pr-post--reverse"/g)).toHaveLength(1);
    expect(
      blockCss(
        postGrid,
        { isLeftToRightLayout: true, alternate: true },
        'test0001',
        DEFAULT_GLOBALS,
      ),
    ).toContain('.pr-post.pr-post--reverse{flex-direction:row-reverse}');
  });

  it('has its texts in the language of the page', () => {
    expect(withDefaults(postGrid, {}, 'it')).toMatchObject({
      ctaText: 'Leggi di più',
      paginationPrevText: '« Precedente',
      paginationNextText: 'Successivo »',
    });
  });
});
