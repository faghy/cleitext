import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { postCarousel } from '../src/blocks/post-carousel';
import type { PostsData } from '../src/blocks/post-grid/posts';
import { blockCss, withDefaults } from '../src/lib/css';
import { DEFAULT_GLOBALS } from '../src/lib/globals';
import type { Attrs } from '../src/lib/types';

function render(attrs: Attrs, data: unknown): string {
  return renderToStaticMarkup(
    createElement(postCarousel.View, {
      attrs: withDefaults(postCarousel, attrs),
      id: 'c1',
      editing: false,
      globals: DEFAULT_GLOBALS,
      data,
      text: () => null,
      inner: () => null,
      root: (tag, props, content) => createElement(tag, props, content),
    }),
  );
}

const post = (n: number) => ({
  id: `p${n}`,
  title: `Post ${n}`,
  url: `/p${n}`,
  date: '2026-10-18T10:00:00.000Z',
  author: null,
  excerpt: 'Text',
  content: [],
  image: null,
  comments: null,
  terms: [],
});
const DATA: PostsData = {
  page: 1,
  pages: 1,
  param: 'x',
  locale: 'en',
  posts: [1, 2, 3, 4, 5].map(post),
};

describe('post carousel', () => {
  it('draws the posts on a track with arrows, dots and its settings', () => {
    const html = render({}, DATA);
    expect(html).toContain('wp-block-prisma-post-carousel pr-post-grid pr-post-grid--image-top');
    expect(html).toContain('pr-post-grid--carousel');
    expect(html).toContain('pr-post-grid--arrows-outside pr-post-grid--slider');
    expect(html).toContain(
      'data-pr-post-carousel="{&quot;autoplay&quot;:2000,&quot;speed&quot;:500,&quot;loop&quot;:true,&quot;pauseOnHover&quot;:true,&quot;arrows&quot;:true,&quot;dots&quot;:true}"',
    );
    expect(html).toContain(
      '<div class="pr-post-carousel__viewport"><div class="pr-post-carousel__track"><article class="pr-post">',
    );
    expect(html).toContain('<h3 class="pr-post__title pr-post__text">');
    expect(html.match(/pr-post-carousel__arrow--/g)).toHaveLength(2);
    // 5 posts, 3 in view: 3 positions.
    expect(html.match(/pr-post-carousel__dot\b/g)).toHaveLength(3);
  });

  it('has no slider when every post is in view, and only dots if asked', () => {
    const few = render({}, { ...DATA, posts: DATA.posts.slice(0, 3) });
    expect(few).not.toContain('pr-post-grid--slider');
    expect(few).not.toContain('pr-post-carousel__arrow');
    const dots = render({ arrowDots: 'dots', autoplay: false }, DATA);
    expect(dots).not.toContain('pr-post-carousel__arrow');
    expect(dots).toContain('&quot;autoplay&quot;:0');
  });

  it('writes the CSS of the arrows, dots and posts', () => {
    const css = blockCss(
      postCarousel,
      { arrowDots: 'dots', arrowColor: '#123456', arrowDistanceTablet: 5 },
      'c1',
    );
    expect(css).toContain(
      '.pr-block-c1 .pr-post-carousel__arrow svg{fill:#123456;width:24px;height:24px}',
    );
    expect(css).toContain('.pr-block-c1 .pr-post-carousel__dot::before{color:#123456}');
    expect(css).toContain('.pr-block-c1.pr-post-grid--slider{padding:0 0 35px 0}');
    expect(css).toContain('.pr-block-c1 .pr-post-carousel__dots{margin-top:20px !important}');
    expect(css).toMatch(
      /max-width: ?976px\)\{[^@]*\.pr-block-c1\.pr-post-grid--arrows-outside \.pr-post-carousel__arrow--prev\{left:5px\}/,
    );
    expect(css).toContain(
      '.pr-block-c1:not(.pr-post-grid--grid) .pr-post{padding-right:10px;padding-left:10px;margin-bottom:20px}',
    );
    expect(css).toContain(
      '.pr-block-c1:not(.pr-post-grid--grid) .pr-post > .pr-post__text{margin-left:20px;margin-right:20px}',
    );
  });

  it('imports Spectra post carousel', () => {
    const out = postCarousel.spectra!['uagb/post-carousel']!(
      { postType: 'post', arrowDots: 'dots', post_type: 'carousel', blockName: 'post-carousel' },
      {
        html: '',
        children: [],
        block: (n, a) => ({ id: 'x', type: `prisma/${n}`, v: 1, attrs: a }),
        rich: (h) => [{ text: h }],
        inner: () => '',
        innerAny: () => '',
      },
    );
    expect(out[0]).toMatchObject({
      type: 'prisma/post-carousel',
      attrs: { postType: 'article', arrowDots: 'dots' },
    });
    expect(out[0]!.attrs).not.toHaveProperty('post_type');
  });
});
