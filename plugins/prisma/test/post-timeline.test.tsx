import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { alignments, postTimeline } from '../src/blocks/post-timeline';
import type { PostsData } from '../src/blocks/post-grid/posts';
import { blockCss, withDefaults } from '../src/lib/css';
import { DEFAULT_GLOBALS } from '../src/lib/globals';
import { setIconData, type IconData } from '../src/lib/icons';
import icons from '../src/public/icons.json';
import type { Attrs } from '../src/lib/types';

setIconData(icons as unknown as IconData);

function render(attrs: Attrs, data: unknown): string {
  return renderToStaticMarkup(
    createElement(postTimeline.View, {
      attrs: withDefaults(postTimeline, attrs),
      id: 't1',
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
  date: '2026-10-0' + n + 'T10:00:00.000Z',
  author: { name: 'Ada', url: '/author/ada' },
  excerpt: 'Some words of the post',
  content: [],
  image: { src: `/p${n}.jpg`, alt: '' },
  comments: null,
  terms: [],
});
const DATA: PostsData = { page: 1, pages: 1, param: 'x', locale: 'en', posts: [1, 2, 3].map(post) };

describe('post timeline', () => {
  it('alternates the posts on both sides of the connector', () => {
    const html = render({}, DATA);
    expect(html).toContain(
      'class="wp-block-prisma-post-timeline pr-post-timeline pr-post-timeline--center pr-post-timeline--arrow-center pr-post-timeline--cta pr-block-t1"',
    );
    expect(html).toContain(
      'data-pr-post-timeline="{&quot;desktop&quot;:&quot;center&quot;,&quot;tablet&quot;:&quot;center&quot;,&quot;mobile&quot;:&quot;center&quot;}"',
    );
    const items = html.match(/pr-post-timeline__item pr-post-timeline__item--(left|right)/g);
    expect(items).toEqual([
      'pr-post-timeline__item pr-post-timeline__item--right',
      'pr-post-timeline__item pr-post-timeline__item--left',
      'pr-post-timeline__item pr-post-timeline__item--right',
    ]);
    expect(html).toContain(
      '<h3 class="pr-post-timeline__heading"><a href="/p1" target="_self" rel="noopener noreferrer">Post 1</a></h3>',
    );
    expect(html).toContain('October 1, 2026');
    expect(html.match(/pr-post-timeline__date--outer/g)).toHaveLength(3);
    expect(html).toContain('<a class="pr-post-timeline__author" href="/author/ada">Ada</a>');
    expect(html).toContain(
      '<div class="pr-post-timeline__line"><div class="pr-post-timeline__line-inner"></div></div>',
    );
    expect(html).toContain('<svg');
  });

  it('puts all posts on one side, with its date format', () => {
    const html = render(
      { timelinAlignment: 'left', dateFormat: 'd/m/Y', displayPostLink: false },
      DATA,
    );
    expect(html).toContain('pr-post-timeline--left');
    expect(html).not.toContain('pr-post-timeline__item--right');
    expect(html).not.toContain('pr-post-timeline__date--outer');
    expect(html).not.toContain('pr-post-timeline__link');
    expect(html).toContain('01/10/2026');
    expect(
      alignments({
        timelinAlignment: 'left',
        timelinAlignmentTablet: '',
        timelinAlignmentMobile: 'center',
      }),
    ).toEqual({
      desktop: 'left',
      tablet: 'left',
      mobile: 'center',
    });
  });

  it('writes the CSS of the connector, cards and texts', () => {
    const css = blockCss(postTimeline, { headSpaceTablet: 8, leftPaddingMobile: 4 }, 't1');
    const S = '.pr-block-t1.pr-post-timeline';
    expect(css).toContain(
      `${S} .pr-post-timeline__marker{background-color:#eee;min-height:35px;min-width:35px;line-height:35px;border:0px solid #eee}`,
    );
    expect(css).toContain(`${S} .pr-post-timeline__line{background-color:#eee;width:3px}`);
    expect(css).toContain(`${S} .pr-post-timeline__card{background-color:#eee;border-radius:2px}`);
    expect(css).toContain(
      `${S} .pr-post-timeline__content{padding-left:20px;padding-right:20px;padding-top:20px;padding-bottom:20px}`,
    );
    expect(css).toContain(
      `${S}.pr-post-timeline--center .pr-post-timeline__marker{margin-left:10px;margin-right:10px}`,
    );
    expect(css).toContain(
      `${S} .pr-post-timeline__marker.is-in-view{background:#0693e3;border-color:#5cb85c}`,
    );
    expect(css).toContain(`${S} .pr-post-timeline__date--outer{color:#333;font-size:12px}`);
    expect(css).toMatch(
      /max-width: ?976px\)\{[^@]*\.pr-post-timeline__heading\{margin-bottom:8px\}/,
    );
    expect(css).toMatch(
      /max-width: ?767px\)\{[^@]*\.pr-post-timeline__content\{padding-left:4px;border-radius:0px\}/,
    );
  });

  it('imports Spectra post timeline', () => {
    const out = postTimeline.spectra!['uagb/post-timeline']!(
      { postType: 'post', timelinAlignment: 'right', categories: '7', blockName: 'post-timeline' },
      {
        html: '',
        children: [],
        block: (n, a) => ({ id: 'x', type: `prisma/${n}`, v: 1, attrs: a }),
        rich: (h) => [{ text: h }],
        inner: () => '',
        innerAny: () => '',
      },
    );
    expect(out[0]).toEqual({
      id: 'x',
      type: 'prisma/post-timeline',
      v: 1,
      attrs: { postType: 'article', timelinAlignment: 'right' },
    });
  });
});
