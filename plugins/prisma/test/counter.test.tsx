import { describe, expect, it } from 'vitest';
import { counter, formatCount } from '../src/blocks/counter';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const source = (html = ''): SpectraSource => ({
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

describe('counter', () => {
  it('formats numbers with decimals and grouped thousands', () => {
    expect(formatCount(1234567.891, 2, ',')).toBe('1,234,567.89');
    expect(formatCount(1234567, 0, '')).toBe('1234567');
    expect(formatCount(-4500, 0, '.')).toBe('-4.500');
    expect(formatCount(12, 1, "'")).toBe('12.0');
  });

  it('shows the final number in the page, with prefix, suffix and title', () => {
    const { html } = renderBlock(counter, {
      endNumber: 12500,
      numberPrefix: '$',
      heading: text('Sold'),
      showIcon: false,
    });
    expect(html).toContain(
      '<div class="pr-counter__number"><span class="pr-counter__prefix">$</span><span class="pr-counter__value">12,500</span><span class="pr-counter__suffix">%</span></div><div class="pr-counter__title">Sold</div>',
    );
    expect(html).toContain(
      'class="wp-block-prisma-counter pr-counter pr-counter--number pr-block-test0001"',
    );
    expect(html).toContain(
      'data-pr-counter="{&quot;layout&quot;:&quot;number&quot;,&quot;start&quot;:0,&quot;end&quot;:12500',
    );
  });

  it('places the icon around the number', () => {
    const left = renderBlock(counter, { iconImgPosition: 'left-number' });
    expect(left.html).toContain(
      '<div class="pr-counter__number"><span class="pr-counter__icon"><svg',
    );
    expect(left.css).toContain(
      '.pr-block-test0001 .pr-counter__number{display:flex;align-items:center;justify-content:center}',
    );
    expect(renderBlock(counter, {}).html).toMatch(/^<div[^>]*><span class="pr-counter__icon">/);
  });

  it('draws a bar filled up to the end number, and its own shadow', () => {
    const { html, css } = renderBlock(counter, {
      layout: 'bars',
      endNumber: 30,
      totalNumber: 60,
      numberTopMargin: 8,
    });
    expect(html).toContain(
      '<div class="pr-counter__bar"><div class="pr-counter__number" style="width:50%"><span class="pr-counter__value">30</span>',
    );
    expect(html).toContain('</div></div><div class="pr-counter__title">');
    expect(css).toContain(
      '.pr-block-test0001.pr-counter--bars .pr-counter__bar .pr-counter__number{background:#007cba;padding-top:8px}',
    );
    expect(css).toContain(
      'margin-top:unset;margin-right:unset;margin-bottom:unset;margin-left:unset',
    );
    expect(css).toContain(
      '.pr-block-test0001.pr-counter .pr-counter__bar{box-shadow:0px 0px #00000070}',
    );
  });

  it('draws a circle closed up to the end number', () => {
    const { html, css } = renderBlock(counter, {
      layout: 'circle',
      circleSize: 200,
      circleStokeSize: 10,
      endNumber: 25,
    });
    expect(html).toContain('<svg preserveAspectRatio="xMinYMin meet" viewBox="0 0 200 200"');
    expect(html).toContain(
      '<circle class="pr-counter__progress" cx="100" cy="100" r="95"></circle>',
    );
    // 2π·95 = 596.9; three quarters left open.
    expect(css).toContain('stroke-dasharray:596.9px;stroke-dashoffset:447.67px');
    expect(css).toContain('r:95px;cx:100px;cy:100px');
  });

  it('writes typography and spacing by device', () => {
    const { css } = renderBlock(counter, {
      numberFontSize: 40,
      numberFontSizeTablet: 30,
      headingFontFamily: 'Lato',
      alignMobile: 'left',
      prefixRightDistance: 4,
    });
    expect(css).toContain(
      '.pr-block-test0001.pr-counter .pr-counter__number{font-style:normal;font-size:40px}',
    );
    expect(css).toContain('.pr-counter__title{font-family:"Lato"');
    expect(css).toMatch(
      /@media \(max-width: ?976px\)\{[^@]*\.pr-counter__number\{font-size:30px\}/,
    );
    expect(css).toMatch(
      /@media \(max-width: ?767px\)\{\.pr-block-test0001\.pr-counter\{text-align:left\}/,
    );
    expect(css).toMatch(
      /@media \(max-width: ?767px\)\{[^@]*\.pr-counter__prefix\{margin-right:4px\}/,
    );
  });

  it('imports Spectra counters with the title of the saved HTML', () => {
    const html =
      '<div class="wp-block-uagb-counter uagb-block-1 wp-block-uagb-counter--number"><div class="wp-block-uagb-counter__number"><span class="uagb-counter-block-number" data-to-value="50"></span></div><div class="wp-block-uagb-counter__title">Happy <strong>clients</strong></div></div>';
    const [b] = counter.spectra!['uagb/counter']!({ endNumber: 50 }, source(html));
    expect(b).toMatchObject({
      type: 'prisma/counter',
      attrs: { endNumber: 50, heading: 'Happy <strong>clients</strong>' },
    });
  });
});
