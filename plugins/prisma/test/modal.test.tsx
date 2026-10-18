import { describe, expect, it } from 'vitest';
import { modal } from '../src/blocks/modal';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const B = '.pr-block-test0001';

describe('modal', () => {
  it('draws a button trigger and the popup with its settings', () => {
    const { html } = renderBlock(
      modal,
      {
        buttonText: text('Open'),
        showBtnIcon: true,
        buttonIconPosition: 'before',
        overlayClick: true,
      },
      { children: '<p>Inside</p>' },
    );
    expect(html).toMatch(
      /^<div class="wp-block-prisma-modal pr-modal pr-block-test0001"><div class="pr-modal__button-wrap wp-block-button"><a class="pr-modal__button wp-block-button__link pr-modal__trigger" href="#" role="button"><span class="pr-modal__button-content"><svg[^]*<\/svg><span class="pr-modal__button-text">Open<\/span><\/span><\/a><\/div>/,
    );
    expect(html).toContain(
      '<div class="pr-modal__popup pr-modal__popup--effect-default pr-block-test0001" data-pr-modal="',
    );
    expect(html).toContain('&quot;overlay&quot;:true');
    expect(html).toContain(
      '<div class="pr-modal__wrap" role="dialog" aria-modal="true"><div class="pr-modal__content"><div><p>Inside</p></div></div><button type="button" class="pr-modal__close" aria-label="Close"><svg',
    );
  });

  it('draws text, icon and image triggers, none when automatic, and window close buttons', () => {
    expect(renderBlock(modal, { modalTrigger: 'text', triggerText: text('Read') }).html).toContain(
      '<span class="pr-modal__text pr-modal__trigger">Read</span>',
    );
    expect(renderBlock(modal, { modalTrigger: 'icon' }).html).toMatch(
      /<div class="pr-modal__trigger" aria-label="Open"><svg/,
    );
    expect(
      renderBlock(modal, {
        modalTrigger: 'image',
        iconImage: { url: '/a.jpg', alt: 'A' },
        imgTagWidth: 50,
      }).html,
    ).toContain('<img src="/a.jpg" alt="A" class="pr-modal__trigger" width="50" loading="lazy"/>');
    const auto = renderBlock(modal, {
      modalTrigger: 'automatic',
      showAfterSeconds: true,
      noOfSecondsToShow: 5,
      exitIntent: true,
      enableCookies: true,
      hideForDays: 7,
      closeIconPosition: 'window-top-left',
    }).html;
    expect(auto).not.toContain('pr-modal__trigger');
    expect(auto).toContain('&quot;delay&quot;:5,&quot;exitIntent&quot;:true');
    expect(auto).toContain(
      '&quot;cookie&quot;:{&quot;days&quot;:7,&quot;on&quot;:&quot;close&quot;}',
    );
    expect(auto).toContain('data-pr-modal="{&quot;trigger&quot;:&quot;automatic&quot;');
    expect(auto).toMatch(
      /aria-hidden="true"><button type="button" class="pr-modal__close pr-modal__close--window-top-left"/,
    );
    const byClass = renderBlock(modal, {
      modalTrigger: 'custom-class',
      triggerClass: 'open-me"><x',
    }).html;
    expect(byClass).toContain('&quot;selector&quot;:&quot;&quot;');
    expect(
      renderBlock(modal, { modalTrigger: 'custom-class', triggerClass: 'open-me' }).html,
    ).toContain('&quot;selector&quot;:&quot;.open-me&quot;');
  });

  it('writes the popup size, overlay, close button and button CSS per device', () => {
    const { css } = renderBlock(modal, {
      modalWidthTablet: 80,
      modalWidthTypeTablet: '%',
      btnBgColor: '#123456',
      btnLinkHoverColor: '#fff',
      modalAlignMobile: 'full',
      paddingModalTop: 20,
    });
    expect(css).toContain(
      `${B}.pr-modal__popup .pr-modal__wrap{height:auto;width:600px;max-height:90vh;border-style:none;border-color:none;border-top-left-radius:3px`,
    );
    expect(css).toMatch(/976px\)\{[^@]*\.pr-modal__wrap\{height:auto;width:80%;/);
    expect(css).toContain(
      `${B}.pr-modal__popup.is-active{background:rgba(0,0,0,0.75);z-index:99999}`,
    );
    expect(css).toContain(`${B}.pr-modal__popup.is-active .pr-modal__close{top:-25px;right:-25px}`);
    expect(css).toContain('padding-top:14px;padding-bottom:14px;background-color:#123456');
    expect(css).toContain(':hover{color:#fff}');
    expect(css).toContain(`${B} .pr-modal__content{padding-top:20px`);
    expect(css).toMatch(
      /767px\)\{[^@]*\.wp-block-button__link\.pr-modal__trigger\{width:100%;justify-content:center\}/,
    );
  });

  it('keeps a fixed height when custom, and draws the popup background', () => {
    const { css } = renderBlock(modal, {
      modalBoxHeight: 'custom',
      backgroundType: 'image',
      backgroundImageDesktop: { url: 'https://x.test/bg.jpg' },
      overlayType: 'color',
      backgroundImageColor: '#0008',
    });
    expect(css).toContain('height:350px;border-style:none');
    expect(css).toContain('z-index:99999');
    expect(css).toContain(
      'background-repeat:no-repeat;background-position:50% 50%;background-size:cover;background-attachment:scroll;background-image:linear-gradient(to right, #0008, #0008), url("https://x.test/bg.jpg");background-clip:padding-box',
    );
  });

  it('imports Spectra modals with their texts from the saved HTML', () => {
    const found: Record<string, string> = {
      'span uagb-modal-text': 'Hello',
      'span uagb-inline-editing': 'Go <strong>now</strong>',
    };
    const src: SpectraSource = {
      html: '',
      children: [{ id: 'c', type: 'prisma/heading', v: 1, attrs: {} }],
      block: (n, a, c) => ({
        id: 'x',
        type: `prisma/${n}`,
        v: 1,
        attrs: a,
        ...(c ? { children: c } : {}),
      }),
      rich: (h) => [{ text: h.replace(/<[^>]+>/g, '') }],
      inner: (tag, className) => found[`${tag} ${className}`] ?? '',
      innerAny: () => '',
    };
    const [out] = modal.spectra!['uagb/modal']!(
      { appearEffect: 'uagb-effect-default', modalTrigger: 'text' },
      src,
    );
    expect(out!.attrs).toEqual({
      appearEffect: 'default',
      modalTrigger: 'text',
      triggerText: 'Hello',
      buttonText: 'Go <strong>now</strong>',
    });
    expect(out!.children).toHaveLength(1);
  });
});
