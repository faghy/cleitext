import { describe, expect, it } from 'vitest';
import { testimonial } from '../src/blocks/testimonial';
import { safeInline } from '../src/blocks/testimonial/rich';
import type { Attrs } from '../src/lib/types';
import { renderBlock } from './render';

const source = (html: string) => ({
  html,
  children: [],
  block: (n: string, a: Attrs, c?: unknown[]) => ({
    id: 'x',
    type: 'prisma/' + n,
    v: 1,
    attrs: a,
    ...(c ? { children: c } : {}),
  }),
  rich: (h: string) => [{ text: h.replace(/<[^>]+>/g, '') }],
  inner: () => '',
  innerAny: () => '',
});

/** The declarations of a selector in a stretch of CSS. */
const rule = (css: string, selector: string) =>
  new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`).exec(css)?.[1] ??
  '';

describe('testimonial', () => {
  it('draws the three default testimonials with the image below and the carousel settings', () => {
    const { html } = renderBlock(testimonial, {});
    expect(html.match(/class="pr-testimonial__wrap /g)).toHaveLength(3);
    expect(html).toContain('pr-testimonial__wrap--image-bottom');
    expect(html).toContain('pr-testimonial__wrap--style-circle');
    expect(html).toContain('pr-testimonial__wrap--bg-none');
    expect(html).toContain('<span class="pr-testimonial__author-name">John Doe </span>');
    expect(html).toContain('<span class="pr-testimonial__company">Company Name</span>');
    expect(html).toContain(
      'data-pr-testimonial="{&quot;autoplay&quot;:2000,&quot;infinite&quot;:true',
    );
    expect(html).toContain('--pr-columns-desktop:1');
    expect(html).toContain('pr-testimonial__arrow--prev');
    expect(html).not.toContain('uagb');
  });

  it('places the image by its position and picks the chosen size', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      alt: 'Anna',
      sizes: { thumbnail: { url: 'https://example.com/a-150x150.jpg' } },
    };
    const { html } = renderBlock(testimonial, {
      imagePosition: 'right',
      stack: 'mobile',
      test_block: [{ description: 'Great', name: 'Anna', company: 'ACME', image }],
    });
    expect(html).toContain('pr-testimonial__wrap--aligned-top');
    expect(html).toContain('pr-testimonial__wrap--stacked-mobile');
    expect(html).toContain('pr-testimonial__wrap--reverse-mobile');
    expect(html).toContain('src="https://example.com/a-150x150.jpg"');
    // The image comes after the text on the right.
    expect(html.indexOf('pr-testimonial__text-wrap')).toBeLessThan(
      html.indexOf('pr-testimonial__image-content'),
    );
  });

  it('keeps simple formatting of the texts and drops the rest', () => {
    expect(safeInline('<strong>Hi</strong> <script>x()</script><img src=x onerror=y>there')).toBe(
      '<strong>Hi</strong> there',
    );
    expect(safeInline('<a href="javascript:alert(1)">x</a>')).toBe('x');
    expect(safeInline('<a href="https://a.b" target="_blank">x</a>')).toBe(
      '<a href="https://a.b" target="_blank" rel="noopener">x</a>',
    );
    expect(safeInline('a < b & <em>c')).toBe('a &lt; b &amp; <em>c</em>');
  });

  it('writes the CSS of the defaults by device', () => {
    const { css } = renderBlock(testimonial, {});
    const B = '.pr-block-test0001';
    expect(rule(css, `${B} .pr-testimonial__wrap`)).toBe(
      'margin-bottom:10px;padding-left:5px;padding-right:5px',
    );
    expect(rule(css, `${B} .pr-testimonial__content`)).toBe(
      'text-align:center;padding-top:5px;padding-bottom:5px;padding-left:5px;padding-right:5px;align-content:flex-start',
    );
    expect(rule(css, `${B} .pr-testimonial__wrap .pr-testimonial__image-content`)).toContain(
      'padding-top:10px;padding-right:10px',
    );
    expect(rule(css, `${B} .pr-testimonial__image img`)).toBe('width:60px;max-width:60px');
    expect(rule(css, `${B} .pr-testimonial__author-name`)).toBe(
      'font-size:20px;line-height:2em;color:#333;margin-bottom:5px',
    );
    expect(rule(css, `${B} .pr-testimonial__desc`)).toContain(
      'font-weight:400;font-size:18px;line-height:1.6em;color:#333;margin-bottom:20px',
    );
    // Three testimonials, one column, arrows: room on the sides of the text on phones.
    expect(css).toContain('margin-left:20px;margin-right:20px');
    // The older single border: 1px wide, no style.
    expect(rule(css, `${B} .pr-testimonial__wrap .pr-testimonial__content`)).toContain(
      'border-style:none',
    );
    expect(css).toContain(
      `${B} .pr-testimonial__wrap--bg-color .pr-testimonial__content{background-color:#eeeeee}`,
    );
    expect(css).toContain(`${B} .pr-testimonial__arrow svg{fill:#333;width:20px;height:20px}`);
    expect(css).not.toContain('Default');
  });

  it('falls back by device and drops the padding with a gradient, as Spectra does', () => {
    const { css } = renderBlock(testimonial, {
      columnGap: 30,
      columnGapTablet: '',
      columnGapMobile: 4,
      backgroundType: 'gradient',
      paddingTop: 0,
      test_item_count: 1,
    });
    expect(css).toMatch(
      /@media \(max-width: ?976px\)\{[^@]*\.pr-testimonial__wrap\{[^}]*padding-left:15px/,
    );
    expect(css).toMatch(
      /@media \(max-width: ?767px\)\{[^@]*\.pr-testimonial__wrap\{[^}]*padding-left:2px/,
    );
    const content = rule(css, '.pr-block-test0001 .pr-testimonial__content');
    expect(content).toContain('background-color:transparent');
    expect(content).toContain('background-image:linear-gradient(90deg');
    expect(content).not.toContain('padding');
    // One testimonial in one column: no room for the dots.
    expect(css).toContain('.pr-block-test0001.pr-testimonial{padding:0}');
  });

  it('imports Spectra testimonials with their texts and images', () => {
    const [block] = testimonial.spectra!['uagb/testimonial']!(
      {
        columns: 2,
        test_block: [
          {
            description: 'Nice <b>work</b>',
            name: 'Ann',
            company: 'X',
            image: { url: 'https://e.com/i.png' },
          },
          { description: 'Good', name: 'Bob', company: 'Y', image: '' },
        ],
      },
      source('') as never,
    );
    expect(block!.type).toBe('prisma/testimonial');
    const attrs = block!.attrs as Attrs;
    expect(attrs.columns).toBe(2);
    expect((attrs.test_block as Attrs[])[0]).toEqual({
      description: 'Nice <b>work</b>',
      name: 'Ann',
      company: 'X',
      image: { url: 'https://e.com/i.png' },
    });
  });

  it('reads the texts from the saved HTML when the list is not saved', () => {
    const html =
      '<div class="uagb-tm__desc">Hello</div><span class="uagb-tm__author-name">Zoe</span><span class="uagb-tm__company">Q</span>';
    const [block] = testimonial.spectra!['uagb/testimonial']!({}, source(html) as never);
    expect((block!.attrs as Attrs).test_block).toEqual([
      { description: 'Hello', name: 'Zoe', company: 'Q', image: '' },
    ]);
  });
});
