import { describe, expect, it } from 'vitest';
import { tableOfContents } from '../src/blocks/table-of-contents';
import { renderList, slug, type Heading } from '../src/blocks/table-of-contents/build';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const source: SpectraSource = {
  html: '',
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
};

const part = (css: string, max: number | null) => {
  if (max === null) return css.split('@media')[0]!;
  const at = css.indexOf(`(max-width:${max}px)`);
  return at === -1 ? '' : css.slice(at).split('@media')[0]!;
};

const h = (level: number, t: string): Heading => ({ level, text: t, id: slug(t) });

describe('table of contents', () => {
  it('draws the box, the title, an empty list for the script and a hidden placeholder', () => {
    const { html } = renderBlock(tableOfContents, {});
    expect(html).toContain(
      'class="wp-block-prisma-table-of-contents pr-toc pr-toc--align-left pr-toc--columns-1 pr-block-test0001"',
    );
    expect(html).toContain('data-pr-table-of-contents="');
    expect(html).toContain(
      '<div class="pr-toc__title"><span class="pr-toc__title-text">Table Of Contents</span></div>',
    );
    expect(html).toContain('<div class="pr-toc__list-wrap"></div>');
    expect(html).toContain(
      '<p class="pr-toc__placeholder" hidden="">Add a header to begin generating the table of contents</p>',
    );
    expect(html).not.toContain('pr-toc__separator');
  });

  it('gives the script its settings', () => {
    const { html } = renderBlock(tableOfContents, {
      mappingHeaders: [false, true, true, false, false, false],
      smoothScrollOffset: 80,
      enableCollapsableList: true,
      collapsibleListDepth: 2,
    });
    const config = JSON.parse(
      /data-pr-table-of-contents="([^"]*)"/.exec(html)![1]!.replace(/&quot;/g, '"'),
    ) as Record<string, unknown>;
    expect(config).toEqual({
      mapping: [false, true, true, false, false, false],
      smooth: true,
      offset: 80,
      toTop: false,
      collapsible: false,
      list: true,
      depth: 2,
      listCollapsed: false,
    });
    expect(html).toContain('pr-toc--collapsible-list');
  });

  it('shows the collapse icon, the separator and the initial collapse', () => {
    const { html } = renderBlock(tableOfContents, {
      headingTitle: text('Index'),
      makeCollapsible: true,
      initialCollapse: true,
      separatorStyle: 'solid',
    });
    expect(html).toContain('pr-toc--collapsed');
    expect(html).toMatch(
      /<span class="pr-toc__title-text">Index<\/span><svg[^>]*class="pr-toc__icon"/,
    );
    expect(html).toContain('<div class="pr-toc__separator"></div>');
  });

  it('writes the defaults as Spectra does', () => {
    const { css } = renderBlock(tableOfContents, {});
    const desktop = part(css, null);
    expect(desktop).toContain(
      '.pr-block-test0001.pr-toc .pr-toc__wrap{border-style:solid;border-color:#333;border-top-width:1px;border-left-width:1px;border-right-width:1px;border-bottom-width:1px;width:100%;padding-left:30px;padding-right:30px;padding-top:30px;padding-bottom:30px;background:#fff}',
    );
    expect(desktop).toContain('.pr-toc__title{justify-content:left;font-size:20px}');
    expect(desktop).toContain('.pr-toc__list-wrap{column-count:1;overflow:hidden;text-align:left}');
    expect(desktop).toContain('.pr-toc__list-wrap ol li a{text-decoration:underline}');
    expect(desktop).toContain('.pr-toc__list-wrap li a{color:#54595F}');
    expect(desktop).toContain('.pr-block-test0001.pr-toc{text-align:left}');
    expect(desktop).toContain('svg{width:20px;height:20px}');
    expect(desktop).toContain(
      '.pr-toc__list .pr-toc__list, .pr-block-test0001.pr-toc .pr-toc__list .pr-toc__item{list-style-type:disc !important}',
    );
  });

  it('writes per-device widths, columns, gaps and the separator', () => {
    const { css } = renderBlock(tableOfContents, {
      tColumnsTablet: 2,
      widthMobile: 300,
      widthTypeMobile: 'px',
      contentPaddingDesktop: 10,
      separatorStyle: 'dashed',
      hPaddingMobile: 12,
      overallBorderStyle: 'default',
      disableBullets: true,
    });
    const desktop = part(css, null);
    expect(desktop).not.toContain('border-style');
    expect(desktop).toContain(
      'ol.pr-toc__list > li, .pr-block-test0001.pr-toc .pr-toc__list-wrap ul.pr-toc__list > li{padding-top:calc(10px / 2);padding-bottom:calc(10px / 2)}',
    );
    expect(desktop).toContain(
      '.pr-toc__separator{border-top-style:dashed;border-top-width:1px;width:calc(100% + 30px + 30px);margin-left:-30px;margin-bottom:15px}',
    );
    expect(desktop).toContain('list-style-type:none !important');
    expect(part(css, 976)).toContain('column-count:2');
    expect(part(css, 767)).toContain('width:300px;padding-left:12px;padding-right:12px');
    expect(part(css, 767)).toContain(
      '.pr-toc__separator{width:calc(100% + 12px + 12px);margin-left:-12px}',
    );
  });

  it('imports Spectra tables with their title', () => {
    const out = tableOfContents.spectra!['uagb/table-of-contents']!(
      { headingTitle: 'Contents', heading: 'Old', headerLinks: '[]', smoothScroll: false },
      source,
    );
    expect(out[0]!.attrs).toEqual({ headingTitle: 'Contents', smoothScroll: false });
  });
});

describe('table of contents list', () => {
  it('makes anchors from the headings', () => {
    expect(slug('Hello, World! – Città & “Co”')).toBe('hello-world-città-co');
    expect(slug('  Many   spaces__here ')).toBe('many-spaces-here');
  });

  it('nests deeper headings in sub-lists and closes them going back up', () => {
    const html = renderList([h(2, 'A'), h(3, 'A1'), h(3, 'A2'), h(2, 'B'), h(4, 'B1')], {
      collapsible: false,
      depth: 5,
    });
    expect(html).toBe(
      '<ol class="pr-toc__list">' +
        '<li class="pr-toc__item"><a href="#a" class="pr-toc__link">A</a>' +
        '<ul class="pr-toc__list"><li class="pr-toc__item"><a href="#a1" class="pr-toc__link">A1</a>' +
        '<li class="pr-toc__item"><a href="#a2" class="pr-toc__link">A2</a>' +
        '</li></ul></li>' +
        '<li class="pr-toc__item"><a href="#b" class="pr-toc__link">B</a>' +
        '<ul class="pr-toc__list"><li class="pr-toc__item"><a href="#b1" class="pr-toc__link">B1</a>' +
        '</ul></ol>',
    );
  });

  it('leaves out headings above the first one’s level', () => {
    const html = renderList([h(3, 'Intro'), h(2, 'Up'), h(3, 'Next')], {
      collapsible: false,
      depth: 5,
    });
    expect(html).not.toContain('Up');
    expect(html).toContain('Next');
  });

  it('adds toggles to items with sub-lists, down to the chosen depth', () => {
    const html = renderList([h(2, 'A'), h(3, 'A1'), h(4, 'A1a'), h(2, 'B')], {
      collapsible: true,
      depth: 1,
    });
    expect(html).toContain(
      '<li class="pr-toc__item pr-toc__item--expandable"><span class="pr-toc__toggle" role="button" tabindex="0" aria-expanded="true" aria-label="Toggle"></span><a href="#a"',
    );
    expect(html).toContain('<li class="pr-toc__item"><a href="#a1"');
    expect(html).toContain('<li class="pr-toc__item"><a href="#b"');
  });

  it('escapes the headings’ text', () => {
    expect(
      renderList([{ level: 2, text: '<b>&', id: 'x"y' }], { collapsible: false, depth: 5 }),
    ).toContain('<a href="#x&quot;y" class="pr-toc__link">&lt;b&gt;&amp;</a>');
  });
});
