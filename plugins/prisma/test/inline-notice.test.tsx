import type { CxdBlock } from '@cleitext/plugin-sdk';
import { expect, it } from 'vitest';
import { inlineNotice } from '../src/blocks/inline-notice';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

const source = (html: string, children: CxdBlock[] = []): SpectraSource => ({
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
  inner: (tag: string, cls: string) =>
    new RegExp(`<${tag}\\b[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`).exec(
      html,
    )?.[1] ?? '',
  innerAny: (cls: string) =>
    new RegExp(`<(h[1-6]|p|div|span)\\b[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</\\1>`).exec(
      html,
    )?.[2] ?? '',
});

it('draws a notice with its title and inner blocks; no close button by default', () => {
  const { html, css } = renderBlock(
    inlineNotice,
    { noticeTitle: text('Attention') },
    { children: '<p>Body</p>' },
  );
  expect(html).toContain(
    '<div class="wp-block-prisma-inline-notice pr-inline-notice pr-block-test0001 pr-inline-notice--align-left"><h4 class="pr-inline-notice__title">Attention</h4><div class="pr-inline-notice__text"><div><p>Body</p></div></div></div>',
  );
  expect(css).toContain(
    '.pr-block-test0001 .pr-inline-notice__title{padding-left:15px;padding-right:15px;padding-top:15px;padding-bottom:15px;background-color:#FFD54F;border-top-right-radius:3px;border-top-left-radius:3px}',
  );
  expect(css).toContain('border:2px solid #FFD54F');
});

it('a dismissible notice that remembers waits hidden for its script', () => {
  const { html } = renderBlock(inlineNotice, {
    noticeDismiss: 'uagb-dismissable',
    cookies: true,
    c_id: '12-345',
    close_cookie_days: 3,
  });
  expect(html).toContain('pr-inline-notice--dismissible pr-inline-notice--hidden');
  expect(html).toContain(
    '<button class="pr-inline-notice__close" type="button" aria-label="Close" data-pr-inline-notice="{&quot;id&quot;:&quot;12-345&quot;,&quot;days&quot;:3}">',
  );
  const plain = renderBlock(inlineNotice, { noticeDismiss: 'dismissible' }).html;
  expect(plain).toContain('data-pr-inline-notice="{}"');
  expect(plain).not.toContain('--hidden');
});

it('uses the border layout and the device paddings', () => {
  const { css } = renderBlock(inlineNotice, {
    layout: 'simple',
    contentBgColor: '#fff',
    titleTopPadding: 30,
    titleTopPaddingMobile: 5,
  });
  expect(css).toContain('border-left:10px solid #FFD54F');
  expect(css).toContain('padding-top:30px');
  // Tablet falls back to the shared padding, not to desktop's.
  expect(css).toMatch(
    /976px\)\{[^@]*\.pr-inline-notice__title\{padding-left:15px;padding-right:15px;padding-top:15px/,
  );
  expect(css).toMatch(/767px\)\{[^@]*\.pr-inline-notice__title\{[^}]*padding-top:5px/);
});

it('imports a Spectra notice: title from the HTML, inner blocks kept, old text as paragraphs', () => {
  const child: CxdBlock = { id: 'c', type: 'core/paragraph', v: 1, attrs: {}, content: [] };
  const html =
    '<div class="wp-block-uagb-inline-notice uagb-dismissable uagb-inline_notice__align-left uagb-block-1"><button class="uagb-notice-close-button" type="button" aria-label="Close"></button><h4 class="uagb-notice-title">Avviso</h4><div class="uagb-notice-text"></div></div>';
  const [block] = inlineNotice.spectra!['uagb/inline-notice']!(
    { noticeDismiss: 'uagb-dismissable' },
    source(html, [child]),
  );
  expect(block).toMatchObject({
    type: 'prisma/inline-notice',
    attrs: { noticeTitle: 'Avviso', noticeDismiss: 'uagb-dismissable' },
    children: [child],
  });
  const old =
    '<div class="uagb-inline_notice__outer-wrap"><h4 class="uagb-notice-title">T</h4><div class="uagb-notice-text"><p>One</p><p>Two</p></div></div>';
  const [legacy] = inlineNotice.spectra!['uagb/inline-notice']!({}, source(old));
  expect(legacy!.children!.map((c) => c.content)).toEqual([[{ text: 'One' }], [{ text: 'Two' }]]);
});
