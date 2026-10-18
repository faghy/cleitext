import type { CxdBlock } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { hexToRgba, marketingButton } from '../src/blocks/marketing-button';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const B = '.pr-block-test0001';
const LINK = `${B} .pr-marketing-button__link`;

const tablet = (css: string) =>
  css.slice(css.indexOf('@media (max-width:976px)'), css.indexOf('@media (max-width:767px)'));
const mobile = (css: string) => css.slice(css.indexOf('@media (max-width:767px)'));

function source(html: string): SpectraSource {
  const inner = (tag: string, className: string) =>
    new RegExp(
      `<(${tag})\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`,
    ).exec(html)?.[2] ?? '';
  return {
    html,
    children: [],
    block: (n: string, a: Attrs, c?: CxdBlock[]) => ({
      id: 'x',
      type: `prisma/${n}`,
      v: 1,
      attrs: a,
      ...(c ? { children: c } : {}),
    }),
    rich: (h: string) => [{ text: h.replace(/<[^>]+>/g, '') }],
    inner,
    innerAny: (className: string) => inner('h[1-6]|p|div|span', className),
  };
}

describe('marketing button', () => {
  it('draws the heading, the icon and the description in the link', () => {
    const { html } = renderBlock(marketingButton, {
      heading: text('Buy'),
      prefix: text('Now with 20% off'),
      link: 'https://shop.test',
      linkTarget: true,
    });
    expect(html).toContain(
      '<div class="wp-block-prisma-marketing-button pr-marketing-button pr-marketing-button--align-center pr-marketing-button--text-center pr-marketing-button--icon-after pr-block-test0001 wp-block-button">',
    );
    expect(html).toContain(
      '<a href="https://shop.test" class="pr-marketing-button__link wp-block-button__link" target="_blank" rel="noopener noreferrer"><span class="pr-marketing-button__title">Buy</span><svg',
    );
    expect(html).toContain('</svg><p class="pr-marketing-button__prefix">Now with 20% off</p></a>');
  });

  it('puts the icon first and hides the description', () => {
    const { html } = renderBlock(marketingButton, {
      iconPosition: 'before',
      showDescription: false,
      titleTag: 'h4',
    });
    expect(html).toMatch(
      /__link wp-block-button__link"[^>]*><svg[^]*<\/svg><h4 class="pr-marketing-button__title">/,
    );
    expect(html).not.toContain('__prefix');
  });

  it('writes the default CSS with the older border as a fallback', () => {
    const { css } = renderBlock(marketingButton, {});
    expect(css).toContain(
      `${B} .pr-marketing-button__prefix{margin-top:0px;font-size:14px;line-height:2em}`,
    );
    expect(css).toContain(
      `${B}.pr-marketing-button--icon-after .pr-marketing-button__link svg{margin-left:10px}`,
    );
    expect(css).toContain(`${B} svg{width:20px;height:20px}`);
    expect(css).toContain(
      `${LINK}.wp-block-button__link{border-top-width:1px;border-left-width:1px;border-right-width:1px;border-bottom-width:1px;border-style:solid}`,
    );
    expect(css).toContain(`${B} .pr-marketing-button__title{font-size:20px}`);
    // Tablets swap the icon's spacing side, as the pages it replaces.
    const t = renderBlock(marketingButton, { iconSpaceTablet: 4 }).css;
    expect(tablet(t)).toContain(
      `${B}.pr-marketing-button--icon-after .pr-marketing-button__link svg{margin-right:4px}`,
    );
  });

  it('writes the colors, the paddings by device and the opacity', () => {
    const { css } = renderBlock(marketingButton, {
      backgroundColor: '#ff0000',
      backgroundOpacity: 50,
      backgroundHoverColor: '#00f',
      titleColor: '#111',
      vPadding: 10,
      paddingBtnLeft: 24,
      hPadding: 5,
      paddingBtnTopMobile: 3,
      btnBorderStyle: 'none',
    });
    expect(css).toContain(
      `${B}.pr-marketing-button.wp-block-button .wp-block-button__link.pr-marketing-button__link{background:rgba(255,0,0,0.5)}`,
    );
    expect(css).toContain(
      `${B}.pr-marketing-button.wp-block-button:not(.is-style-outline) .wp-block-button__link.pr-marketing-button__link:hover{background:rgb(0,0,255)}`,
    );
    expect(css).toContain(
      `${LINK}.wp-block-button__link{padding-left:24px;padding-right:5px;padding-top:10px;padding-bottom:10px;border-top-width:1px;border-left-width:1px;border-right-width:1px;border-bottom-width:1px;border-style:none}`,
    );
    expect(css).toContain(`${LINK} svg{fill:#111}`);
    expect(css).toContain(`${LINK} .pr-marketing-button__title{color:#111}`);
    expect(mobile(css)).toContain(
      `${B}.pr-marketing-button.wp-block-button .pr-marketing-button__link{padding-top:3px;border-style:none}`,
    );
  });

  it('writes a gradient by device', () => {
    const { css } = renderBlock(marketingButton, {
      backgroundType: 'gradient',
      gradientAngle: 90,
      gradientLocationTablet2: 80,
      gradientAngleTablet: 45,
    });
    expect(css).toContain(
      `${LINK}{background-color:transparent;background-image:linear-gradient(90deg, rgb(6,85,138) 0%, rgb(0,99,161) 100%)}`,
    );
    expect(tablet(css)).toContain(
      `${LINK}{background-image:linear-gradient(45deg, rgb(6,85,138) 0%, rgb(0,99,161) 80%)}`,
    );
    expect(mobile(css)).not.toContain('background-image');
  });

  it('converts hex colors', () => {
    expect(hexToRgba('#abc')).toBe('rgb(170,187,204)');
    expect(hexToRgba('#000000', 0.3)).toBe('rgba(0,0,0,0.3)');
    expect(hexToRgba('var(--x)', 40)).toBe('var(--x)');
    expect(hexToRgba('')).toBe('');
  });

  it('imports a Spectra marketing button with its texts', () => {
    const html =
      '<div class="wp-block-uagb-marketing-button uagb-block-1 wp-block-button"><a href="/x" class="uagb-marketing-btn__link wp-block-button__link"><span class="uagb-marketing-btn__title">Get <b>it</b></span><svg></svg><p class="uagb-marketing-btn__prefix"></p></a></div>';
    const [out] = marketingButton.spectra!['uagb/marketing-button']!({ link: '/x' }, source(html));
    expect(out!.type).toBe('prisma/marketing-button');
    expect(out!.attrs.heading).toBe('Get <b>it</b>');
    expect(out!.attrs.prefix).toBe('');
    expect(out!.attrs.link).toBe('/x');
  });
});
