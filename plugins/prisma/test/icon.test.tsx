import { describe, expect, it } from 'vitest';
import { icon } from '../src/blocks/icon';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

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

describe('icon', () => {
  it('draws the icon with its accessible name, without a link by default', () => {
    const { html } = renderBlock(icon, {});
    expect(html).toContain('class="wp-block-prisma-icon pr-icon pr-block-test0001"');
    expect(html).toContain('<span class="pr-icon__wrap" aria-label="circle-check">');
    expect(html).toContain('role="graphics-symbol"');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('pr-icon__margin');
  });

  it('links the icon when the link is on, adding the scheme to a bare domain', () => {
    const { html } = renderBlock(icon, { disableLink: true, link: 'example.com', target: true });
    expect(html).toContain(
      '<a href="http://example.com" rel="noopener noreferrer" target="_blank">',
    );
    expect(
      renderBlock(icon, { disableLink: true, link: 'javascript:alert(1)' }).html,
    ).not.toContain('<a ');
  });

  it('hides a decorative icon from assistive technology', () => {
    const { html } = renderBlock(icon, { iconAccessabilityMode: 'presentation' });
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-label');
  });

  it('writes size, rotation, colors, padding and responsive values', () => {
    const { css } = renderBlock(icon, {
      iconSizeTablet: 30,
      rotation: 45,
      alignMobile: 'left',
      iconHoverColor: '#f00',
      iconBackgroundColorType: 'gradient',
      iconTopMargin: 10,
    });
    const B = '.pr-block-test0001.pr-icon';
    expect(css).toContain(
      `${B} svg{width:40px;height:40px;transform:rotate(45deg);box-sizing:content-box;fill:#333;filter:drop-shadow(0px 0px 0px #00000070)}`,
    );
    expect(css).toMatch(
      /@media \(max-width: ?976px\)\{[^@]*\.pr-icon svg\{width:30px;height:30px\}/,
    );
    expect(css).toMatch(/@media \(max-width: ?767px\)\{[^@]*\.pr-icon\{text-align:left\}/);
    expect(css).toContain('padding-top:5px');
    expect(css).toContain(
      'background:linear-gradient(90deg, rgb(155, 81, 224) 0%, rgb(6, 147, 227) 100%)',
    );
    expect(css).toContain(
      `${B} .pr-icon__wrap:hover svg, ${B} .pr-icon__wrap:has(:focus-visible) svg{fill:#f00}`,
    );
    expect(css).toContain(`${B}.pr-icon--has-margin .pr-icon__margin{margin-top:10px}`);
    expect(renderBlock(icon, { iconTopMargin: 10 }).html).toContain('pr-icon--has-margin');
  });

  it('imports Spectra icons from their attributes', () => {
    const a: Attrs = { icon: 'star', iconSize: 50, disableLink: true, link: '/x' };
    const [b] = icon.spectra!['uagb/icon']!(a, source());
    expect(b).toMatchObject({ type: 'prisma/icon', attrs: a });
  });
});
