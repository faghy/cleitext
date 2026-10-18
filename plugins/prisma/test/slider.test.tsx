import { describe, expect, it } from 'vitest';
import { slide, slider } from '../src/blocks/slider';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

const source = (html = '', children: SpectraSource['children'] = []): SpectraSource => ({
  html,
  children,
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

/** The CSS of a media query (or the desktop part with `null`). */
function part(css: string, max: number | null): string {
  if (max === null) return css.split('@media')[0]!;
  const at = css.indexOf(`(max-width:${max}px)`);
  return at === -1 ? '' : css.slice(at).split('@media')[0]!;
}

describe('slider', () => {
  it('draws the viewport, the track with the slides, arrows and dots', () => {
    const { html } = renderBlock(slider, {}, { children: '<div class="pr-slide">A</div>' });
    expect(html).toContain('class="wp-block-prisma-slider pr-slider pr-block-test0001"');
    expect(html).toContain('<div class="pr-slider__track"><div><div class="pr-slide">A</div>');
    expect(html).toContain('data-pr-slider="');
    expect(html).toContain('pr-slider__arrow pr-slider__arrow--prev');
    expect(html).toContain('pr-slider__arrow pr-slider__arrow--next');
    expect(html).toContain('class="pr-slider__dots"');
    expect(html).not.toContain('uagb');
  });

  it('gives the script its settings', () => {
    const { html } = renderBlock(slider, {
      transitionEffect: 'fade',
      autoplay: false,
      infiniteLoop: false,
      pauseOn: 'click',
      transitionSpeed: 500,
    });
    const config = JSON.parse(
      /data-pr-slider="([^"]*)"/.exec(html)![1]!.replace(/&quot;/g, '"'),
    ) as Record<string, unknown>;
    expect(config).toEqual({
      effect: 'fade',
      speed: 500,
      autoplay: 0,
      pauseOn: 'click',
      loop: false,
      arrows: true,
      dots: true,
    });
  });

  it('leaves out arrows and dots when turned off', () => {
    const { html } = renderBlock(slider, { displayArrows: false, displayDots: false });
    expect(html).not.toContain('pr-slider__arrow');
    expect(html).not.toContain('pr-slider__dots');
  });

  it('writes the defaults as Spectra does', () => {
    const { css } = renderBlock(slider, {});
    const desktop = part(css, null);
    expect(desktop).toContain('padding-top:10px');
    expect(desktop).toContain('border-color:#4B4F58');
    expect(desktop).toMatch(/\.pr-slider__arrow\{[^}]*border-top-left-radius:50px/);
    expect(desktop).toMatch(/\.pr-slider__arrow\{[^}]*color:#333333/);
    // Arrow box: padding × 2 + size.
    expect(desktop).toMatch(/\.pr-slider__arrow\{[^}]*width:46px;height:46px;line-height:46px/);
    expect(desktop).toContain('.pr-slider__arrow--prev{left:-20px}');
    expect(desktop).toContain('.pr-slider__arrow--next{right:-20px}');
    expect(desktop).toMatch(/\.pr-slider__track\{align-items:center;min-height:350px\}/);
    expect(desktop).toContain('.pr-slider__dots{bottom:20px}');
    expect(desktop).toContain('.pr-slider__dot{background-color:#333333}');
  });

  it('falls back between devices for arrows and spacing', () => {
    const { css } = renderBlock(slider, {
      arrowSize: 20,
      arrowSizeTablet: 30,
      arrowPadding: 5,
      topPaddingDesktop: 40,
      topPaddingTablet: '',
      topPaddingMobile: 0,
      minHeightMobile: 200,
    });
    const tablet = part(css, 976);
    const mobile = part(css, 767);
    expect(tablet).toMatch(/\.pr-slider__arrow\{width:40px;height:40px;line-height:40px\}/);
    expect(mobile).toMatch(/\.pr-slider__arrow\{width:40px/);
    expect(tablet).toContain('padding-top:40px');
    expect(mobile).toContain('padding-top:0');
    expect(mobile).toContain('min-height:200px');
  });

  it('layers an image with its overlay color', () => {
    const { css } = renderBlock(slider, {
      backgroundType: 'image',
      backgroundImageDesktop: { url: 'https://example.com/a.jpg' },
      overlayType: 'color',
      backgroundImageColor: '#00000080',
    });
    expect(css).toContain(
      'background-image:linear-gradient(to right, #00000080, #00000080), url("https://example.com/a.jpg")',
    );
    expect(css).toContain('background-position:50% 50%');
  });

  it('writes the separate hover shadow', () => {
    const { css } = renderBlock(slider, { boxShadowBlurHover: 10, boxShadowColorHover: '#111' });
    expect(css).toMatch(/\.pr-slider:hover\{[^}]*box-shadow:0px 0px 10px #111/);
  });

  it('imports Spectra sliders with their slides', () => {
    const children = [{ id: 'c', type: 'prisma/slide', v: 1, attrs: {} }];
    const out = slider.spectra!['uagb/slider']!({ autoplay: false }, source('', children));
    expect(out[0]).toMatchObject({
      type: 'prisma/slider',
      attrs: { autoplay: false },
      children,
    });
  });
});

describe('slide', () => {
  it('holds its blocks in the content box', () => {
    const { html } = renderBlock(slide, {}, { children: '<p>Hi</p>' });
    expect(html).toBe(
      '<div class="wp-block-prisma-slide pr-slide pr-block-test0001"><div class="pr-slide__content"><div><p>Hi</p></div></div></div>',
    );
  });

  it('pads the content by 20px on every device by default', () => {
    const { css } = renderBlock(slide, {});
    expect(part(css, null)).toContain(
      '.pr-block-test0001 > .pr-slide__content{padding-top:20px;padding-bottom:20px;padding-left:20px;padding-right:20px}',
    );
    expect(part(css, 767)).toContain('padding-top:20px');
  });

  it('draws a gradient background', () => {
    const { css } = renderBlock(slide, {
      backgroundType: 'gradient',
      gradientValue: 'linear-gradient(red, blue)',
    });
    expect(css).toContain('background:linear-gradient(red, blue)');
  });

  it('imports Spectra slides', () => {
    const out = slide.spectra!['uagb/slider-child']!({ backgroundType: 'color' }, source());
    expect(out[0]).toMatchObject({ type: 'prisma/slide', attrs: { backgroundType: 'color' } });
  });
});
