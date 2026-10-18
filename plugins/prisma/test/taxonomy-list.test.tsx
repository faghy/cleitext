import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { taxonomyList, termTree, type TaxonomyData } from '../src/blocks/taxonomy-list';
import { blockCss, withDefaults } from '../src/lib/css';
import { DEFAULT_GLOBALS } from '../src/lib/globals';
import type { Attrs } from '../src/lib/types';

function render(attrs: Attrs, data: unknown): string {
  return renderToStaticMarkup(
    createElement(taxonomyList.View, {
      attrs: withDefaults(taxonomyList, attrs),
      id: 'x1',
      editing: false,
      globals: DEFAULT_GLOBALS,
      data,
      text: () => null,
      inner: () => null,
      root: (tag, props, content) => createElement(tag, props, content),
    }),
  );
}

const TERMS = [
  { id: '1', name: 'News', url: '/c/news', count: 3, parentId: null },
  { id: '2', name: 'Art', url: '/c/art', count: 1, parentId: null },
  { id: '3', name: 'Local', url: '/c/local', count: 2, parentId: '1' },
  { id: '4', name: 'Empty', url: '/c/empty', count: 0, parentId: null },
];
const DATA: TaxonomyData = { terms: termTree(TERMS, false), locale: 'en' };

describe('taxonomy list', () => {
  it('builds the tree of terms, by name, empty ones hidden', () => {
    expect(DATA.terms.map((t) => t.name)).toEqual(['Art', 'News']);
    expect(DATA.terms[1]!.children.map((t) => t.name)).toEqual(['Local']);
    expect(termTree(TERMS, true).map((t) => t.name)).toEqual(['Art', 'Empty', 'News']);
  });

  it('draws boxes with the counts', () => {
    const html = render({}, DATA);
    expect(html).toContain(
      'class="wp-block-prisma-taxonomy-list pr-taxonomy-list pr-taxonomy-list--grid pr-block-x1"',
    );
    expect(html).toContain(
      '<div class="pr-taxonomy-list__box"><a class="pr-taxonomy-list__link" href="/c/art"><h4 class="pr-taxonomy-list__title">Art</h4>1 Post</a></div>',
    );
    expect(html).toContain('3 Posts');
  });

  it('draws a list with hierarchy, or a dropdown', () => {
    const list = render({ layout: 'list', showhierarchy: true }, DATA);
    expect(list).toContain(
      '<li class="pr-taxonomy-list__item"><div class="pr-taxonomy-list__link-wrap"><a class="pr-taxonomy-list__link" href="/c/art">Art</a> (1) </div><div class="pr-taxonomy-list__separator"></div></li>',
    );
    expect(list).toContain('<ul class="pr-taxonomy-list__children">');
    const dropdown = render({ layout: 'list', listDisplayStyle: 'dropdown' }, DATA);
    expect(dropdown).toContain('data-pr-taxonomy-list=""');
    expect(dropdown).toContain('<option value="/c/news">News (3)</option>');
    expect(render({}, { terms: [], locale: 'en' })).toContain('Taxonomy Not Available.');
  });

  it('writes the CSS of Spectra per device', () => {
    const css = blockCss(taxonomyList, { columnGapMobile: 4 }, 'x1');
    expect(css).toContain(
      '.pr-block-x1.pr-taxonomy-list--grid{display:grid;grid-template-columns:repeat(3, 1fr);grid-column-gap:20px;grid-row-gap:20px}',
    );
    expect(css).toContain(
      '.pr-block-x1 .pr-taxonomy-list__box{border-top-width:1px;border-left-width:1px;border-right-width:1px;border-bottom-width:1px',
    );
    expect(css).toContain(
      'background-color:#f5f5f5;text-align:center;box-shadow:0px 0px #00000070',
    );
    expect(css).toMatch(/max-width: ?976px\)\{[^@]*\.pr-taxonomy-list__box\{padding-left:15px/);
    expect(css).toMatch(/max-width: ?767px\)\{[^@]*repeat\(1, 1fr\);grid-column-gap:4px\}/);
  });

  it('imports Spectra taxonomy list, with the older border', () => {
    const out = taxonomyList.spectra!['uagb/taxonomy-list']!(
      { taxonomyType: 'post_tag', borderStyle: 'dashed', borderThickness: 2 },
      {
        html: '',
        children: [],
        block: (n, a) => ({ id: 'x', type: `prisma/${n}`, v: 1, attrs: a }),
        rich: (h) => [{ text: h }],
        inner: () => '',
        innerAny: () => '',
      },
    );
    expect(out[0]!.attrs).toMatchObject({
      taxonomyType: 'tag',
      overallBorderStyle: 'dashed',
      overallBorderTopWidth: 2,
      overallBorderTopLeftRadius: 0,
    });
  });
});
