import type { CxdBlock } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { callToAction } from '../src/blocks/call-to-action';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const B = '.pr-block-test0001';
const R = `${B}.pr-call-to-action`;

const tablet = (css: string) =>
  css.slice(css.indexOf('@media (max-width:976px)'), css.indexOf('@media (max-width:767px)'));
const mobile = (css: string) => css.slice(css.indexOf('@media (max-width:767px)'));

function source(html: string, children: CxdBlock[] = []): SpectraSource {
  const inner = (tag: string, className: string) =>
    new RegExp(
      `<(${tag})\\b[^>]*class="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`,
    ).exec(html)?.[2] ?? '';
  return {
    html,
    children,
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

describe('call to action', () => {
  it('draws the text and the button', () => {
    const { html } = renderBlock(callToAction, {
      ctaTitle: text('Join us'),
      description: text('Today'),
      ctaLink: 'https://example.com',
      ctaTarget: true,
    });
    expect(html).toContain(
      '<div class="wp-block-prisma-call-to-action pr-call-to-action pr-block-test0001 wp-block-button">',
    );
    expect(html).toContain(
      '<div class="pr-call-to-action__wrap"><h3 class="pr-call-to-action__title">Join us</h3><p class="pr-call-to-action__desc">Today</p></div>',
    );
    expect(html).toContain(
      '<a href="https://example.com" class="pr-call-to-action__button wp-block-button__link" target="_blank" rel="noopener noreferrer"><span>Read More</span><svg',
    );
    expect(html).not.toContain('pr-call-to-action__second');
  });

  it('draws a text link, a second button and the whole-box link', () => {
    const text1 = renderBlock(callToAction, { ctaType: 'text', ctaIconPosition: 'before' }).html;
    expect(text1).toContain('class="pr-call-to-action__button" target="_self"');
    expect(text1).toMatch(/pr-call-to-action__button"[^>]*><svg/);
    expect(text1).not.toContain('wp-block-button"');
    const two = renderBlock(callToAction, {
      enabledSecondCtaButton: true,
      secondCtaLink: '/contact',
      showSecondIcon: false,
    }).html;
    expect(two).toContain(
      '<a href="/contact" class="pr-call-to-action__second wp-block-button__link" target="_self" rel="noopener noreferrer"><span>Click Here</span></a>',
    );
    const all = renderBlock(callToAction, {
      ctaType: 'all',
      ctaLink: '/go',
      htmlTag: 'section',
    }).html;
    expect(all).toMatch(/^<section class="wp-block-prisma-call-to-action/);
    expect(all).toContain('<a href="/go" class="pr-call-to-action__link-all" target=""');
    expect(all).toContain('<div class="pr-call-to-action__buttons"></div>');
  });

  it('writes the layout CSS of each device', () => {
    const { css } = renderBlock(callToAction, { overallBlockTopTabletPadding: 12 });
    expect(css).toContain(`${B} .pr-call-to-action__wrap{width:70%;text-align:left}`);
    expect(css).toContain(
      `${R}{text-align:left;display:flex;justify-content:space-between;flex-direction:row;align-items:center}`,
    );
    expect(css).toContain(
      `${R} a.pr-call-to-action__button{align-self:center;height:fit-content;margin-left:auto}`,
    );
    expect(css).toContain(`${B} .pr-call-to-action__buttons{column-gap:15px}`);
    expect(tablet(css)).toContain(`${B} .pr-call-to-action__wrap{text-align:center}`);
    expect(tablet(css)).toContain(
      `${R}{flex-direction:column;align-items:center;padding-top:12px}`,
    );
    expect(mobile(css)).toContain(`${B} .pr-call-to-action__buttons{justify-content:center}`);
  });

  it('keeps the text at full width without a button, and stacks buttons', () => {
    const none = renderBlock(callToAction, { ctaType: 'none' }).css;
    expect(none).toContain(`${B} .pr-call-to-action__wrap{width:100%}`);
    expect(none).not.toContain('display:flex');
    const stacked = renderBlock(callToAction, { stackBtn: 'tablet', gapBtnTablet: 8 }).css;
    expect(tablet(stacked)).toContain(
      `${B} .pr-call-to-action__buttons{flex-direction:column;row-gap:8px}`,
    );
    const stackNone = renderBlock(callToAction, { stack: 'none' }).css;
    expect(stackNone).toContain(`${R} .pr-call-to-action__buttons{margin-left:5px}`);
    expect(tablet(stackNone)).toContain(`${R}{flex-direction:row;align-items:center}`);
  });

  it('styles the buttons with the older border settings as a fallback', () => {
    const { css } = renderBlock(callToAction, {
      ctaBgColor: '#000',
      ctaBtnLinkColor: '#fff',
      ctaBtnVertPadding: 12,
      ctaLeftPadding: 30,
      ctaBorderWidth: 2,
      ctaBorderColor: '#f00',
      btnBorderHColor: '#0f0',
      ctaFontSize: 18,
    });
    const MAIN = `${R}.wp-block-button .pr-call-to-action__buttons a.pr-call-to-action__button.wp-block-button__link`;
    expect(css).toContain(
      `${MAIN}{color:#fff;background-color:#000;padding-top:12px;padding-bottom:12px;padding-left:30px;border-top-width:2px;border-left-width:2px;border-right-width:2px;border-bottom-width:2px;border-color:#f00;border-style:solid}`,
    );
    expect(css).toContain(`${MAIN}:hover, ${MAIN}:focus{border-color:#0f0}`);
    expect(css).toContain(
      `${R} a.pr-call-to-action__button > svg{margin-left:10px;font-size:18px;width:18px;height:18px;line-height:18px;fill:#fff}`,
    );
    expect(css).toContain(
      `${R} a.pr-call-to-action__button{align-self:center;height:fit-content;margin-left:auto;font-size:18px}`,
    );
    // Nothing of the button with the theme's style.
    expect(
      renderBlock(callToAction, { inheritFromTheme: true, ctaBgColor: '#000' }).css,
    ).not.toContain('#000');
  });

  it('imports a Spectra call to action with its texts', () => {
    const html =
      '<div class="wp-block-uagb-call-to-action uagb-block-1 wp-block-button"><div class="uagb-cta__wrap"><h2 class="uagb-cta__title">Book <em>now</em></h2><p class="uagb-cta__desc">Best rooms</p></div><div class="uagb-cta__buttons"><a href="/book" class="uagb-cta__button-link-wrapper wp-block-button__link">Go<svg></svg></a></div></div>';
    const [out] = callToAction.spectra!['uagb/call-to-action']!(
      { titleTag: 'h2', ctaText: '<strong>Go</strong>', ctaLink: '/book' },
      source(html),
    );
    expect(out!.type).toBe('prisma/call-to-action');
    expect(out!.attrs.ctaTitle).toBe('Book <em>now</em>');
    expect(out!.attrs.description).toBe('Best rooms');
    expect(out!.attrs.ctaText).toBe('Go');
    expect(out!.attrs.ctaLink).toBe('/book');
  });

  it('imports a description of several paragraphs as inner blocks', () => {
    const child: CxdBlock = { id: 'p', type: 'core/paragraph', v: 1, attrs: {} };
    const html =
      '<div class="wp-block-uagb-call-to-action"><div class="uagb-cta__wrap"><h3 class="uagb-cta__title">T</h3><div class="uagb-cta__desc"> <p>One</p><p>Two</p> </div></div></div>';
    const [out] = callToAction.spectra!['uagb/call-to-action']!(
      { enableMultilineParagraph: true },
      source(html, [child]),
    );
    expect(out!.attrs.description).toBeUndefined();
    expect(out!.children).toEqual([child]);
    const { html: drawn, css } = renderBlock(
      callToAction,
      { enableMultilineParagraph: true, descFontSize: 15 },
      { children: '<p>One</p>' },
    );
    expect(drawn).toContain('<div class="pr-call-to-action__desc"><div><p>One</p></div></div>');
    expect(css).toContain(`${B} .pr-call-to-action__desc p{font-size:15px}`);
  });
});
